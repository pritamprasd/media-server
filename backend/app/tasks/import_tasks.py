import os
from datetime import datetime

from app import db
from app.celery_app import celery
from app.models import ImportedDirectory, ImportedFile
from app.utility.database_utility import get_or_create_session
from app.utility.mime_utility import expand_mime_groups, guess_mime
from app.metrics import files_imported_total
from app.config import Config

from app.tasks.metadata_tasks import extract_file_metadata
from app.tasks.thumbnail_tasks import generate_thumbnail
from app.tasks.ai_tasks import generate_ai_metadata
from app.tasks.face_tasks import detect_faces


@celery.task(bind=True, max_retries=3, name="app.tasks.process_import_folder")
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
