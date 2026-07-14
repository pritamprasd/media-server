import os
import shutil

from flask import current_app
from sqlalchemy import func

from app import db
from app.models.import_session import ImportSession
from app.models.imported_directory import ImportedDirectory
from app.models.imported_file import ImportedFile
from app.models.file_metadata import FileMetadata, DHashBand
from app.models.detected_face import DetectedFace
from app.models.favorite_folder import FavoriteFolder
from app.api.file_helpers import _ensure_upload_subdir


def _root_dir_id(upload_session, upload_dir):
    root = ImportedDirectory.query.filter_by(
        session_id=upload_session.id, path=""
    ).first()
    return root.id if root else None


def browse_explorer(prefix, page=1, per_page=100):
    prefix = (prefix or "").strip().strip("/")
    per_page = min(per_page, 500)
    upload_dir = current_app.config["UPLOAD_DIR"]

    upload_session = ImportSession.query.filter_by(root_path=upload_dir).first()
    upload_session_id = upload_session.id if upload_session else -1

    synthetic_session_id = None
    browse_prefix = prefix
    if prefix.startswith("__session_"):
        try:
            synthetic_session_id = int(prefix.split("_")[2])
            browse_prefix = ""
        except (ValueError, IndexError):
            pass

    db_dirs = ImportedDirectory.query.filter(
        ImportedDirectory.deleted != True,
    )
    if synthetic_session_id is not None:
        db_dirs = db_dirs.filter(
            ImportedDirectory.parent_path == browse_prefix,
            ImportedDirectory.session_id == synthetic_session_id,
        )
    elif browse_prefix:
        db_dirs = db_dirs.filter(ImportedDirectory.parent_path == browse_prefix)
    else:
        db_dirs = db_dirs.filter(
            db.or_(ImportedDirectory.parent_path == "", ImportedDirectory.parent_path.is_(None)),
            ImportedDirectory.path != "",
        )
    db_dirs = db_dirs.order_by(ImportedDirectory.name).all()

    base_q = ImportedFile.query.filter(ImportedFile.deleted != True, ImportedFile.is_hidden != True)
    if synthetic_session_id is not None:
        root_dir = ImportedDirectory.query.filter(
            ImportedDirectory.deleted != True,
            ImportedDirectory.path == browse_prefix,
            ImportedDirectory.session_id == synthetic_session_id,
        ).first()
        if root_dir:
            base_q = base_q.filter(ImportedFile.directory_id == root_dir.id)
        else:
            base_q = base_q.filter(False)
    elif browse_prefix:
        dir_records = ImportedDirectory.query.filter(
            ImportedDirectory.deleted != True,
            ImportedDirectory.path == browse_prefix,
        ).all()
        if dir_records:
            base_q = base_q.filter(ImportedFile.directory_id.in_([d.id for d in dir_records]))
        else:
            base_q = base_q.filter(False)
    else:
        base_q = base_q.filter(False)

    pagination = base_q.order_by(ImportedFile.filename).paginate(
        page=page, per_page=per_page, error_out=False
    )
    files = pagination.items

    upload_dirs = []
    if synthetic_session_id is None:
        scan_dir = os.path.join(upload_dir, browse_prefix) if browse_prefix else upload_dir
        if os.path.isdir(scan_dir):
            for entry in sorted(os.listdir(scan_dir)):
                full = os.path.join(scan_dir, entry)
                if os.path.isdir(full):
                    try:
                        entries = os.listdir(full)
                        udir_count = sum(1 for e in entries if os.path.isdir(os.path.join(full, e)))
                        ufile_count = len(entries) - udir_count
                    except OSError:
                        udir_count = 0
                        ufile_count = 0
                    upload_dirs.append({
                        "name": entry,
                        "path": os.path.join(browse_prefix, entry) if browse_prefix else entry,
                        "session_id": upload_session_id,
                        "is_upload": True,
                        "file_count": ufile_count,
                        "dir_count": udir_count,
                    })

    dir_result = []
    seen_paths = set()
    dir_ids = [d.id for d in db_dirs]
    file_counts = {}
    child_dir_counts = {}
    if dir_ids:
        fc_rows = db.session.query(
            ImportedFile.directory_id, func.count(ImportedFile.id)
        ).filter(
            ImportedFile.directory_id.in_(dir_ids),
            ImportedFile.deleted != True,
            ImportedFile.is_hidden != True,
        ).group_by(ImportedFile.directory_id).all()
        file_counts = {r[0]: r[1] for r in fc_rows}

        dc_rows = db.session.query(
            ImportedDirectory.parent_path, func.count(ImportedDirectory.id)
        ).filter(
            ImportedDirectory.parent_path.in_([d.path for d in db_dirs]),
            ImportedDirectory.deleted != True,
        ).group_by(ImportedDirectory.parent_path).all()
        child_dir_counts = {r[0]: r[1] for r in dc_rows}

    for d in db_dirs:
        if d.path not in seen_paths:
            seen_paths.add(d.path)
            dir_result.append({
                "name": d.name,
                "path": d.path,
                "session_id": d.session_id,
                "is_upload": False,
                "file_count": file_counts.get(d.id, 0),
                "dir_count": child_dir_counts.get(d.path, 0),
            })

    if not browse_prefix and synthetic_session_id is None:
        edited_dir = current_app.config.get("EDITED_IMAGES_DIR", "")
        edited_session = ImportSession.query.filter_by(root_path=edited_dir).first() if edited_dir else None

        all_sessions = ImportSession.query.filter(
            ImportSession.id != upload_session_id,
        ).all()
        for s in all_sessions:
            if edited_session and s.id == edited_session.id:
                continue
            root_dir = ImportedDirectory.query.filter_by(
                session_id=s.id, path=""
            ).first()
            if not root_dir:
                continue
            file_count = ImportedFile.query.filter(
                ImportedFile.directory_id == root_dir.id,
                ImportedFile.deleted != True,
            ).count()
            if file_count == 0:
                continue
            dir_basename = os.path.basename(s.root_path.rstrip("/"))
            if dir_basename and dir_basename not in seen_paths:
                seen_paths.add(dir_basename)
                sub_dir_count = ImportedDirectory.query.filter(
                    ImportedDirectory.session_id == s.id,
                    ImportedDirectory.parent_path == "",
                    ImportedDirectory.deleted != True,
                ).count()
                dir_result.append({
                    "name": dir_basename,
                    "path": f"__session_{s.id}__",
                    "session_id": s.id,
                    "is_upload": False,
                    "file_count": file_count,
                    "dir_count": sub_dir_count,
                })

        if edited_session:
            edited_name = os.path.basename(edited_dir.rstrip("/"))
            edited_key = f"__session_{edited_session.id}__"
            if edited_key not in seen_paths and edited_name not in seen_paths:
                seen_paths.add(edited_key)
                edited_file_count = ImportedFile.query.filter(
                    ImportedFile.directory_id == _root_dir_id(edited_session, edited_dir),
                    ImportedFile.deleted != True,
                ).count() if _root_dir_id(edited_session, edited_dir) else 0
                edited_dir_count = ImportedDirectory.query.filter(
                    ImportedDirectory.session_id == edited_session.id,
                    ImportedDirectory.parent_path == "",
                    ImportedDirectory.deleted != True,
                ).count()
                dir_result.insert(0, {
                    "name": edited_name,
                    "path": edited_key,
                    "session_id": edited_session.id,
                    "is_upload": False,
                    "file_count": edited_file_count,
                    "dir_count": edited_dir_count,
                })

    for ud in upload_dirs:
        if ud["path"] not in seen_paths:
            seen_paths.add(ud["path"])
            dir_result.append(ud)

    file_ids = [f.id for f in files]
    metas = {}
    if file_ids:
        for m in FileMetadata.query.filter(FileMetadata.file_id.in_(file_ids)).all():
            metas[m.file_id] = m

    file_result = []
    for f in files:
        d = f.to_dict()
        meta = metas.get(f.id)
        d["thumbnail"] = meta.thumbnail if meta else None
        d["thumbnail_status"] = meta.thumbnail_status if meta else "pending"
        d["session_id"] = f.session_id
        d["created_at"] = f.created_at.isoformat() if f.created_at else None
        file_result.append(d)

    return {
        "directories": dir_result,
        "files": file_result,
        "page": pagination.page,
        "per_page": pagination.per_page,
        "total": pagination.total,
        "total_pages": pagination.pages,
    }


def rename_item(path, new_name, item_type="file"):
    path = (path or "").strip().strip("/")
    new_name = (new_name or "").strip().strip("/")
    if not path or not new_name:
        return {"error": "path and new_name are required"}, 400
    upload_dir = current_app.config["UPLOAD_DIR"]

    if item_type == "dir":
        entries = ImportedDirectory.query.filter(
            ImportedDirectory.deleted != True, ImportedDirectory.path == path
        ).all()
        if not entries:
            return {"error": "Directory not found"}, 404
        parent = os.path.dirname(path)
        new_path = os.path.join(parent, new_name) if parent else new_name
        for entry in entries:
            old_prefix = entry.path + "/"
            new_prefix = new_path + "/"
            children = ImportedDirectory.query.filter(
                ImportedDirectory.session_id == entry.session_id,
                ImportedDirectory.path.like(f"{old_prefix}%"),
            ).all()
            child_files = ImportedFile.query.filter(
                ImportedFile.session_id == entry.session_id,
                ImportedFile.relative_path.like(f"{old_prefix}%"),
            ).all()
            entry.path = new_path
            entry.name = new_name
            entry.parent_path = parent
            for child in children:
                suffix = child.path[len(old_prefix):]
                child.path = new_prefix + suffix
                child.parent_path = "/".join(child.path.split("/")[:-1])
            for cf in child_files:
                suffix = cf.relative_path[len(old_prefix):]
                cf.relative_path = new_prefix + suffix
                dir_name = os.path.dirname(cf.relative_path)
                dir_entry = ImportedDirectory.query.filter_by(
                    session_id=cf.session_id, path=dir_name
                ).first()
                if dir_entry:
                    cf.directory_id = dir_entry.id
        src_fs = os.path.join(upload_dir, path)
        dst_fs = os.path.join(upload_dir, parent, new_name) if parent else os.path.join(upload_dir, new_name)
        if os.path.exists(src_fs):
            os.renames(src_fs, dst_fs)
    else:
        entries = ImportedFile.query.filter(
            ImportedFile.deleted != True, ImportedFile.relative_path == path
        ).all()
        if not entries:
            return {"error": "File not found"}, 404
        for entry in entries:
            old_name = entry.filename
            entry.filename = new_name
            parent = os.path.dirname(entry.relative_path)
            entry.relative_path = os.path.join(parent, new_name) if parent else new_name
            meta = FileMetadata.query.filter_by(file_id=entry.id).first()
            if meta and meta.search_words:
                meta.search_words = meta.search_words.replace(old_name, new_name)
            session = db.session.get(ImportSession, entry.session_id)
            if session and session.root_path == upload_dir:
                src_fs = os.path.join(upload_dir, path)
                dst_fs = os.path.join(upload_dir, entry.relative_path)
                if os.path.exists(src_fs):
                    os.renames(src_fs, dst_fs)
    db.session.commit()
    return {"message": "Renamed"}, 200


def move_items(paths, target):
    if not paths:
        return {"error": "paths is required"}, 400
    upload_dir = current_app.config["UPLOAD_DIR"]
    upload_session = ImportSession.query.filter_by(root_path=upload_dir).first()
    if not upload_session:
        return {"error": "Upload session not found"}, 400
    target = (target or "").strip().strip("/")
    target_fs = os.path.join(upload_dir, target) if target else upload_dir
    os.makedirs(target_fs, exist_ok=True)
    moved_count = 0
    not_found = []
    for src_path in paths:
        src_path = src_path.strip().strip("/")
        name = os.path.basename(src_path)
        dst_rel = os.path.join(target, name) if target else name
        entries = ImportedFile.query.filter(
            ImportedFile.deleted != True, ImportedFile.relative_path == src_path,
        ).all()
        if not entries:
            not_found.append(src_path)
            continue
        for entry in entries:
            session = db.session.get(ImportSession, entry.session_id)
            if session and session.root_path == upload_dir:
                src_fs = os.path.join(upload_dir, src_path)
                dst_fs = os.path.join(target_fs, name)
                if os.path.exists(src_fs):
                    os.renames(src_fs, dst_fs)
                entry.relative_path = dst_rel
                entry.file_path = dst_fs
                dir_name = os.path.dirname(dst_rel)
                if dir_name:
                    dir_entry = _ensure_upload_subdir(upload_session, dir_name)
                    entry.directory_id = dir_entry.id
                else:
                    entry.directory_id = _root_dir_id(upload_session, upload_dir)
                moved_count += 1
            else:
                src_fs = os.path.join(session.root_path, src_path) if session else ""
                dst_fs = os.path.join(target_fs, name)
                if os.path.isfile(src_fs):
                    os.makedirs(os.path.dirname(dst_fs), exist_ok=True)
                    shutil.copy2(src_fs, dst_fs)
                dir_name = os.path.dirname(dst_rel)
                if dir_name:
                    new_dir_entry = _ensure_upload_subdir(upload_session, dir_name)
                    new_directory_id = new_dir_entry.id
                else:
                    new_directory_id = _root_dir_id(upload_session, upload_dir)
                new_entry = ImportedFile(
                    session_id=upload_session.id, filename=name,
                    file_path=dst_fs, relative_path=dst_rel,
                    mime_type=entry.mime_type, size=entry.size,
                    modified=entry.modified, nickname=entry.nickname,
                    is_favorite=entry.is_favorite,
                    directory_id=new_directory_id,
                )
                db.session.add(new_entry)
                db.session.flush()
                orig_meta = FileMetadata.query.filter_by(file_id=entry.id).first()
                if orig_meta:
                    new_meta = FileMetadata(file_id=new_entry.id, exif=orig_meta.exif,
                        description=orig_meta.description, tags=orig_meta.tags,
                        search_words=orig_meta.search_words, thumbnail=orig_meta.thumbnail,
                        thumbnail_status=orig_meta.thumbnail_status,
                        metadata_status=orig_meta.metadata_status)
                    db.session.add(new_meta)
                entry.deleted = True
                moved_count += 1
    db.session.commit()
    msg = f"Moved {moved_count} item(s)"
    if not_found:
        msg += f"; {len(not_found)} path(s) not found"
    return {"message": msg}, 200 if moved_count else 404


def copy_items(paths, target):
    if not paths:
        return {"error": "paths is required"}, 400
    upload_dir = current_app.config["UPLOAD_DIR"]
    upload_session = ImportSession.query.filter_by(root_path=upload_dir).first()
    if not upload_session:
        return {"error": "Upload session not found"}, 400
    target = (target or "").strip().strip("/")
    target_fs = os.path.join(upload_dir, target) if target else upload_dir
    os.makedirs(target_fs, exist_ok=True)
    for src_path in paths:
        src_path = src_path.strip().strip("/")
        name = os.path.basename(src_path)
        dst_rel = os.path.join(target, name) if target else name
        dst_fs = os.path.join(target_fs, name)
        entries = ImportedFile.query.filter(
            ImportedFile.deleted != True, ImportedFile.relative_path == src_path,
        ).all()
        for entry in entries:
            session = db.session.get(ImportSession, entry.session_id)
            src_fs = os.path.join(session.root_path, src_path) if session else ""
            if os.path.isfile(src_fs):
                os.makedirs(os.path.dirname(dst_fs), exist_ok=True)
                shutil.copy2(src_fs, dst_fs)
            new_entry = ImportedFile(
                session_id=upload_session.id, filename=name,
                file_path=dst_fs, relative_path=dst_rel,
                mime_type=entry.mime_type, size=entry.size,
                modified=entry.modified, nickname=entry.nickname,
                directory_id=_root_dir_id(upload_session, upload_dir),
            )
            db.session.add(new_entry)
            db.session.flush()
            orig_meta = FileMetadata.query.filter_by(file_id=entry.id).first()
            if orig_meta:
                new_meta = FileMetadata(file_id=new_entry.id, exif=orig_meta.exif,
                    description=orig_meta.description, tags=orig_meta.tags,
                    search_words=orig_meta.search_words, thumbnail=orig_meta.thumbnail,
                    thumbnail_status=orig_meta.thumbnail_status,
                    metadata_status=orig_meta.metadata_status)
                db.session.add(new_meta)
    db.session.commit()
    return {"message": "Items copied"}, 200


def delete_items(paths):
    if not paths:
        return {"error": "paths is required"}, 400
    deleted_count = 0
    for src_path in paths:
        src_path = src_path.strip().strip("/")
        files = ImportedFile.query.filter(
            ImportedFile.deleted != True, ImportedFile.relative_path == src_path,
        ).all()
        for f in files:
            session = ImportSession.query.get(f.session_id)
            if session:
                full_path = os.path.join(session.root_path, src_path)
                try:
                    if os.path.isfile(full_path):
                        os.remove(full_path)
                except OSError:
                    pass
                session.total_files = max(0, (session.total_files or 0) - 1)
            DetectedFace.query.filter_by(file_id=f.id).delete()
            meta = FileMetadata.query.filter_by(file_id=f.id).first()
            if meta:
                DHashBand.query.filter_by(metadata_id=meta.id).delete()
                db.session.delete(meta)
            db.session.delete(f)
            deleted_count += 1
        dirs = ImportedDirectory.query.filter(
            ImportedDirectory.deleted != True, ImportedDirectory.path == src_path,
        ).all()
        for d in dirs:
            session = db.session.get(ImportSession, d.session_id)
            if session:
                dir_fs = os.path.join(session.root_path, src_path)
                try:
                    if os.path.isdir(dir_fs):
                        shutil.rmtree(dir_fs)
                except OSError:
                    pass
            old_prefix = d.path + "/"
            children = ImportedDirectory.query.filter(
                ImportedDirectory.session_id == d.session_id,
                ImportedDirectory.path.like(f"{old_prefix}%"),
            ).all()
            for child in children:
                child_files = ImportedFile.query.filter(
                    ImportedFile.session_id == child.session_id,
                    ImportedFile.directory_id == child.id,
                ).all()
                for cf in child_files:
                    DetectedFace.query.filter_by(file_id=cf.id).delete()
                    deleted_count += 1
                    sess = ImportSession.query.get(cf.session_id)
                    if sess:
                        sess.total_files = max(0, (sess.total_files or 0) - 1)
                    meta = FileMetadata.query.filter_by(file_id=cf.id).first()
                    if meta:
                        DHashBand.query.filter_by(metadata_id=meta.id).delete()
                        db.session.delete(meta)
                    db.session.delete(cf)
                db.session.delete(child)
            child_files = ImportedFile.query.filter(
                ImportedFile.session_id == d.session_id,
                ImportedFile.directory_id == d.id,
            ).all()
            for cf in child_files:
                DetectedFace.query.filter_by(file_id=cf.id).delete()
                deleted_count += 1
                sess = ImportSession.query.get(cf.session_id)
                if sess:
                    sess.total_files = max(0, (sess.total_files or 0) - 1)
                meta = FileMetadata.query.filter_by(file_id=cf.id).first()
                if meta:
                    DHashBand.query.filter_by(metadata_id=meta.id).delete()
                    db.session.delete(meta)
                db.session.delete(cf)
            db.session.delete(d)
    db.session.commit()
    if deleted_count:
        from app.metrics import files_deleted_total, update_library_stats
        files_deleted_total.inc(deleted_count)
        update_library_stats()
    return {"message": "Items deleted"}, 200


def list_favorite_folders():
    favorites = FavoriteFolder.query.order_by(FavoriteFolder.name).all()
    return {
        "favorites": [{
            "path": f.path, "name": f.name,
            "created_at": f.created_at.isoformat() if f.created_at else None,
        } for f in favorites],
    }


def add_favorite_folder(path, name):
    path = (path or "").strip()
    name = (name or "").strip()
    if not path or not name:
        return {"error": "path and name are required"}, 400
    existing = FavoriteFolder.query.filter_by(path=path).first()
    if existing:
        return {"message": "Already favorited", "favorite": {"path": existing.path, "name": existing.name}}, 200
    fav = FavoriteFolder(path=path, name=name)
    db.session.add(fav)
    db.session.commit()
    return {"message": "Folder favorited", "favorite": {"path": fav.path, "name": fav.name}}, 201


def remove_favorite_folder(path):
    path = (path or "").strip()
    if not path:
        return {"error": "path query parameter is required"}, 400
    fav = FavoriteFolder.query.filter_by(path=path).first()
    if fav:
        db.session.delete(fav)
        db.session.commit()
    return {"message": "Favorite removed"}, 200
