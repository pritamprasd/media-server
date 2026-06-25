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
from app.utility.video_utility import extract_video_metadata, extract_video_frames, generate_video_thumbnail
import logging

logger = logging.getLogger(__name__)
AI_METADATA_SCHEMA = AiMetadataModel.model_json_schema()

@celery.task(bind=True, max_retries=3)
def process_import_folder(self, folder_path, groups):
    allowed_mimes = expand_mime_groups(groups)
    root_dir, seen_dirs, seen_files, session = get_or_create_session(folder_path, groups)

    dir_map = {"": root_dir.id if root_dir else None}
    file_count = 0
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
            mime = guess_mime(filename)
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

    for file_info in file_infos:
        extract_file_metadata.delay(file_info)
        generate_thumbnail.delay(file_info)
        generate_ai_metadata.delay(file_info)


@celery.task(bind=True, max_retries=3)
def extract_file_metadata(self, file_info):
    file_id = file_info["id"]
    file_path = file_info["file_path"]
    mime = file_info.get("mime_type", "")
    # logger.info("extract_file_metadata: file_id=%s path=%s mime=%s", file_id, file_path, mime)
    # logger.info("DB URL: %s", current_app.config.get("SQLALCHEMY_DATABASE_URI", "not set"))
    meta = get_or_create_metadata(file_id)
    meta.metadata_status = "extracting"
    db.session.commit()

    try:
        if mime.startswith("image/"):
            extract_image_metadata(file_path, meta)
        elif mime.startswith("video/"):
            extract_video_metadata(file_path, meta)

        meta.metadata_status = "extracted"
    except Exception as exc:
        meta.metadata_status = "failed"
        db.session.commit()
        raise self.retry(exc=exc, countdown=60)

    db.session.commit()
    return {"file_id": file_id, "status": meta.metadata_status}

@celery.task(bind=True, max_retries=3)
def generate_ai_metadata(self, file_info):
    from flask import current_app

    file_id = file_info["id"]
    file_path = file_info["file_path"]
    mime = file_info.get("mime_type", "")
    filename = file_info.get("filename", "")

    # logger.info("generate_ai_metadata: file_id=%s path=%s mime=%s", file_id, file_path, mime)
    # logger.info("DB URL: %s", current_app.config.get("SQLALCHEMY_DATABASE_URI", "not set"))

    meta = get_or_create_metadata(file_id)
    meta.metadata_status = "processing_ai"
    db.session.commit()

    host = current_app.config.get("OLLAMA_BASE_URL", "http://localhost:11434")
    vision_model = current_app.config.get("OLLAMA_MODEL", "llava")
    text_model = current_app.config.get("OLLAMA_TEXT_MODEL", "llama3.2")
    client = ollama.Client(host=host)

    system_prompt = (
        "Describe the provided image/video in 1-2 sentences, "
        "then list 5-10 relevant tags, "
        "then list 5-10 short search keywords. "
        "Respond with valid JSON matching the provided schema."
    )

    try:
        if mime.startswith("image/"):
            response = client.chat(
                model=vision_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": "Describe this image.", "images": [file_path]},
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
                response = client.chat(
                    model=text_model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"Filename: {filename}\n\nDescribe this file."},
                    ],
                    format=AI_METADATA_SCHEMA,
                    options={"temperature": 0.3},
                )
                used_model = text_model

        raw = response["message"]["content"]

        if not raw or not raw.strip():
            logger.error(
                "Ollama returned empty response for file_id=%s model=%s",
                file_id, used_model,
            )
            raise Exception("Ollama returned empty response")

        metadata = parse_ai_response(raw)
        meta.description = metadata.description or raw.strip()[:500]
        meta.tags = metadata.tags or []
        meta.search_words = ", ".join(metadata.search_words) if metadata.search_words else ""
        meta.metadata_status = "completed"

    except Exception as exc:
        meta.metadata_status = "failed"
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
    except Exception as exc:
        meta.thumbnail_status = "failed"
        db.session.commit()
        raise self.retry(exc=exc, countdown=60)

    db.session.commit()
    return {"file_id": file_id, "thumbnail_status": meta.thumbnail_status}



