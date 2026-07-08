import os
from datetime import datetime

import ollama

from app import db
from app.celery_app import celery
from app.models import ImportedDirectory, ImportedFile
from app.models.ai_metadata import AiMetadataModel
from app.utility.database_utility import get_or_create_metadata, get_or_create_session
from app.utility.image_utility import extract_image_metadata, generate_image_thumbnail
from app.utility.llm_utility import parse_ai_response
from app.utility.mime_utility import expand_mime_groups, guess_mime
from app.utility.tags_utility import extract_folder_tags
from app.utility.hash_utility import compute_file_hash, compute_dhash, dhash_to_bands
from app.utility.video_utility import extract_video_metadata, extract_video_frames, generate_video_thumbnail
from app.metrics import (
    files_imported_total, metadata_extracted_total, metadata_failed_total,
    thumbnails_generated_total, ai_descriptions_total, ai_failed_total,
    faces_detected_total,
)
import logging

logger = logging.getLogger(__name__)
AI_METADATA_SCHEMA = AiMetadataModel.model_json_schema()

@celery.task(bind=True, max_retries=3)
def process_import_folder(self, folder_path, groups):
    allowed_mimes = expand_mime_groups(groups)
    root_dir, seen_dirs, seen_files, session = get_or_create_session(folder_path, groups)

    dir_map = {"": root_dir.id if root_dir else None}
    file_count = 0
    new_file_count = 0
    file_infos = []

    for root, dirs, filenames in os.walk(folder_path):
        rel_root = os.path.relpath(root, folder_path)
        if rel_root == ".":
            rel_root = ""

        for d in dirs:
            child_rel = os.path.join(rel_root, d) if rel_root else d
            parent_rel = rel_root
            dir_entry = ImportedDirectory.query.filter_by(
                session_id=session.id, path=child_rel
            ).first()
            if dir_entry:
                dir_entry.name = d
                dir_entry.parent_path = parent_rel
            else:
                dir_entry = ImportedDirectory(
                    session_id=session.id,
                    path=child_rel,
                    name=d,
                    parent_path=parent_rel,
                )
                db.session.add(dir_entry)
            db.session.flush()
            dir_map[child_rel] = dir_entry.id
            if seen_dirs is not None:
                seen_dirs.add(child_rel)

        for filename in filenames:
            full_path = os.path.join(root, filename)
            mime = guess_mime(full_path)
            if mime not in allowed_mimes:
                print(f"Mime type mismatch | Import skipped: {full_path}")
                continue

            rel_path = os.path.join(rel_root, filename) if rel_root else filename
            stat = os.stat(full_path)

            f = ImportedFile.query.filter_by(
                session_id=session.id, file_path=full_path
            ).first()
            # if f:
            #     f.directory_id = dir_map.get(rel_root, root_dir.id)
            #     f.filename = filename
            #     f.relative_path = rel_path
            #     f.mime_type = mime
            #     f.size = stat.st_size
            #     f.modified = datetime.fromtimestamp(stat.st_mtime)
            if not f:
                f = ImportedFile(
                    session_id=session.id,
                    directory_id=dir_map.get(rel_root, root_dir.id),
                    filename=filename,
                    file_path=full_path,
                    relative_path=rel_path,
                    mime_type=mime,
                    size=stat.st_size,
                    modified=datetime.fromtimestamp(stat.st_mtime),
                )
                db.session.add(f)
                new_file_count += 1
            file_count += 1
            if seen_files is not None:
                seen_files.add(full_path)

            db.session.flush()
            file_infos.append({
                "id": f.id,
                "session_id": f.session_id,
                "directory_id": f.directory_id,
                "filename": f.filename,
                "file_path": f.file_path,
                "relative_path": f.relative_path,
                "mime_type": f.mime_type,
                "size": f.size,
                "modified": f.modified.isoformat(),
            })

    session.mime_groups = groups
    session.total_files = file_count
    if seen_dirs is not None and seen_files is not None:
        ImportedDirectory.query.filter(
            ImportedDirectory.session_id == session.id,
            ImportedDirectory.path != "",
            ~ImportedDirectory.path.in_(seen_dirs),
        ).delete(synchronize_session="fetch")
        ImportedFile.query.filter(
            ImportedFile.session_id == session.id,
            ~ImportedFile.file_path.in_(seen_files),
        ).delete(synchronize_session="fetch")
    db.session.commit()

    files_imported_total.inc(new_file_count)

    if new_file_count:
        from app.metrics import update_library_stats
        update_library_stats()

    from app.config import Config
    face_batch = []
    for file_info in file_infos:
        extract_file_metadata.delay(file_info)
        generate_thumbnail.delay(file_info)
        generate_ai_metadata.delay(file_info)
        if file_info.get("mime_type", "").startswith("image/"):
            face_batch.append(file_info)
            if len(face_batch) >= Config.FACE_BATCH_SIZE:
                detect_faces.delay(face_batch)
                face_batch = []
    if face_batch:
        detect_faces.delay(face_batch)
    print(f"Total file imported: {new_file_count} out of {file_count} files.")


@celery.task(bind=True, max_retries=3)
def extract_file_metadata(self, file_info):
    file_id = file_info["id"]
    file_path = file_info["file_path"]
    mime = file_info.get("mime_type", "")
    relative_path = file_info.get("relative_path", "")
    meta = get_or_create_metadata(file_id)
    meta.metadata_status = "extracting"

    folder_tags = extract_folder_tags(file_path)
    if folder_tags:
        existing = meta.tags or []
        merged = list(dict.fromkeys(folder_tags + existing))
        meta.tags = merged
    db.session.commit()

    try:
        file_hash = compute_file_hash(file_path)
        meta.file_hash = file_hash
        if mime.startswith("image/"):
            extract_image_metadata(file_path, meta)
            dhash = compute_dhash(file_path)
            meta.dhash = dhash
            bands = dhash_to_bands(dhash)
            from app.models.file_metadata import DHashBand
            DHashBand.query.filter_by(metadata_id=meta.id).delete()
            for bi, bv in enumerate(bands):
                db.session.add(DHashBand(metadata_id=meta.id, band_index=bi, band_value=bv))
        elif mime.startswith("video/"):
            extract_video_metadata(file_path, meta)
        meta.metadata_status = "extracted"
        metadata_extracted_total.inc()
    except Exception as exc:
        meta.metadata_status = "failed"
        metadata_failed_total.inc()
        db.session.commit()
        raise self.retry(exc=exc, countdown=60)

    db.session.commit()
    return {"file_id": file_id, "status": meta.metadata_status}

def _heic_to_jpeg_base64(path):
    import base64
    import subprocess as sp
    for cmd in (["magick", "convert"], ["convert"]):
        try:
            result = sp.run([*cmd, "-define", "jpeg:preserve-exif=true", path, "jpeg:-"], capture_output=True, timeout=30)
            if result.returncode == 0 and result.stdout:
                return base64.b64encode(result.stdout).decode("utf-8")
        except Exception:
            pass
    return None


@celery.task(bind=True, max_retries=3)
def generate_ai_metadata(self, file_info):
    from flask import current_app
    file_id = file_info["id"]
    file_path = file_info["file_path"]
    mime = file_info.get("mime_type", "")
    filename = file_info.get("filename", "")

    meta = get_or_create_metadata(file_id)
    meta.metadata_status = "processing_ai"
    db.session.commit()

    host = current_app.config.get("OLLAMA_BASE_URL", "http://localhost:11434")
    vision_model = current_app.config.get("OLLAMA_MODEL", "llava")
    client = ollama.Client(host=host)

    system_prompt = (
        "Describe the provided image/video in 1-2 sentences, "
        "then list 5-10 relevant tags, "
        "then list 5-10 short search keywords. "
        "Respond with valid JSON matching the provided schema."
    )

    try:
        if mime.startswith("image/"):
            images = [file_path]
            if mime in ("image/heic", "image/heif"):
                b64 = _heic_to_jpeg_base64(file_path)
                if b64:
                    images = [b64]
                else:
                    current_app.logger.warning("AI metadata: could not convert HEIC to JPEG for file %d", file_id)
            response = client.chat(
                model=vision_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": "Describe this image.", "images": images},
                ],
                format=AI_METADATA_SCHEMA,
                options={"temperature": 0.3},
            )
            used_model = vision_model
        else:
            frames = extract_video_frames(file_path)
            if frames:
                response = client.chat(
                    model=vision_model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": "These are frames from a video. Describe the video scene.", "images": frames},
                    ],
                    format=AI_METADATA_SCHEMA,
                    options={"temperature": 0.3},
                )
                used_model = vision_model
            else:
                raise Exception("No frames extracted from video")

        raw = response["message"]["content"]

        if not raw or not raw.strip():
            logger.error(
                "Ollama returned empty response for file_id=%s model=%s",
                file_id, used_model,
            )
            raise Exception("Ollama returned empty response")

        metadata = parse_ai_response(raw)
        meta.description = metadata.description or raw.strip()[:500]
        ai_tags = metadata.tags or []
        folder_tags = extract_folder_tags(file_info.get("relative_path", ""))
        merged = list(dict.fromkeys(folder_tags + ai_tags))
        meta.tags = merged
        meta.search_words = ", ".join(metadata.search_words) if metadata.search_words else ""
        meta.metadata_status = "completed"
        ai_descriptions_total.inc()

    except Exception as exc:
        meta.metadata_status = "failed"
        ai_failed_total.inc()
        db.session.commit()
        raise self.retry(exc=exc, countdown=60)

    db.session.commit()
    return {"file_id": file_id, "status": meta.metadata_status}


@celery.task(bind=True, max_retries=3)
def generate_thumbnail(self, file_info):
    file_id = file_info["id"]
    file_path = file_info["file_path"]
    mime = file_info.get("mime_type", "")

    meta = get_or_create_metadata(file_id)
    meta.thumbnail_status = "generating"
    db.session.commit()

    try:
        if mime.startswith("image/"):
            generate_image_thumbnail(file_path, meta)
        elif mime.startswith("video/"):
            generate_video_thumbnail(file_path, meta)
        meta.thumbnail_status = "completed" if meta.thumbnail else "failed"
        if meta.thumbnail_status == "completed":
            thumbnails_generated_total.inc()
    except Exception as exc:
        meta.thumbnail_status = "failed"
        db.session.commit()
        raise self.retry(exc=exc, countdown=60)

    db.session.commit()
    return {"file_id": file_id, "thumbnail_status": meta.thumbnail_status}


@celery.task(bind=True, max_retries=2)
def detect_faces(self, file_infos):
    if not isinstance(file_infos, list):
        file_infos = [file_infos]

    from app.models.detected_face import DetectedFace
    from app.models.imported_file import ImportedFile
    from app.models.person import Person
    from app.utility.face_utility import detect_faces as run_detection, find_best_person_match, compute_average_encoding

    persons = Person.query.all()
    batch_results = []

    for file_info in file_infos:
        file_id = file_info["id"]
        file_path = file_info["file_path"]
        mime = file_info.get("mime_type", "")

        if not mime.startswith("image/"):
            batch_results.append({"file_id": file_id, "faces": 0, "error": "Not an image"})
            continue

        with db.session.no_autoflush:
            file_exists = ImportedFile.query.get(file_id)
            if not file_exists:
                batch_results.append({"file_id": file_id, "faces": 0, "error": "File not found"})
                continue

            existing = DetectedFace.query.filter_by(file_id=file_id).first()
            if existing:
                batch_results.append({"file_id": file_id, "faces": 0, "error": "Already detected"})
                continue

        try:
            results = run_detection(file_path)
        except Exception as exc:
            logger.warning("Face detection failed for file %d: %s", file_id, exc)
            batch_results.append({"file_id": file_id, "faces": 0, "error": str(exc)})
            continue

        person_encodings = {}
        new_persons_count = 0

        for face_data in results:
            encoding = face_data.get("encoding", [])
            if not encoding:
                continue

            best_person, _ = find_best_person_match(encoding, persons)

            if best_person is None:
                new_persons_count += 1
                person = Person(
                    thumbnail=face_data.get("thumbnail"),
                    face_count=1,
                    avg_encoding=encoding,
                )
                db.session.add(person)
                db.session.flush([person])
                persons.append(person)
                person_encodings[person.id] = [encoding]
            else:
                person = best_person
                person.face_count = (person.face_count or 0) + 1
                if person.id not in person_encodings:
                    person_encodings[person.id] = []
                person_encodings[person.id].append(encoding)

            face = DetectedFace(
                file_id=file_id,
                person_id=person.id,
                encoding=encoding,
                bounding_box=face_data.get("bounding_box", {}),
                confidence=face_data.get("confidence"),
                thumbnail=face_data.get("thumbnail"),
                age=face_data.get("age"),
                gender=face_data.get("gender"),
                face_status="detected",
            )
            db.session.add(face)

        for pid, encs in person_encodings.items():
            p = next((p for p in persons if p.id == pid), None)
            if p and p.avg_encoding:
                all_encs = [p.avg_encoding] + encs
            elif p:
                all_encs = encs
            else:
                continue
            p.avg_encoding = compute_average_encoding(all_encs)

        faces_detected_total.inc(len(results))
        if new_persons_count:
            from app.metrics import persons_created_total
            persons_created_total.inc(new_persons_count)

        batch_results.append({"file_id": file_id, "faces": len(results)})

    # Flush person updates in ID order to prevent PostgreSQL deadlocks
    # when multiple concurrent tasks update overlapping persons
    dirty_persons = [p for p in db.session.dirty if isinstance(p, Person)]
    dirty_persons.sort(key=lambda p: p.id)
    for p in dirty_persons:
        db.session.flush([p])

    db.session.commit()
    return batch_results



