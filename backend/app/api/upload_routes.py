import io
import os
import shutil
import random
import math
import json
import time
import uuid
import threading
import urllib.parse
import urllib.request
from datetime import datetime

from PIL import Image, ImageEnhance
import pillow_heif
pillow_heif.register_heif_opener()

from sqlalchemy import func

from flask import current_app, jsonify, request, send_file, Response
from werkzeug.utils import secure_filename

from app import db
from app.config import get_config
from app.models.file_metadata import FileMetadata, DHashBand
from app.models.import_session import ImportSession
from app.models.imported_directory import ImportedDirectory
from app.models.imported_file import ImportedFile
from app.models.favorite_folder import FavoriteFolder
from app.models.location import SavedLocation
from app.models.filter_preset import FilterPreset
from app.models.detected_face import DetectedFace
from app.tasks import extract_file_metadata, generate_ai_metadata, generate_thumbnail, process_import_folder, detect_faces
import requests as http_requests
from bs4 import BeautifulSoup
from app.utility.file_system import traverse_directory
from app.utility.hash_utility import hamming_distance
from app.utility.mime_utility import guess_mime
import ollama
import tempfile

from app.metrics import (
    files_deleted_total, files_served_total, files_downloaded_total,
    files_edited_total, files_exported_total, uploads_total, upload_bytes_total,
    explorer_operations_total, geocode_requests_total,
)
from flask import Blueprint
upload_bp=Blueprint("upload",__name__)
config=get_config()

ALLOWED_UPLOAD_MIMES = {
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "image/bmp", "image/tiff", "image/avif", "image/heic", "image/heif",
    "video/mp4", "video/x-matroska", "video/webm",
    "video/x-msvideo", "video/quicktime", "video/x-flv",
    "video/x-ms-wmv", "video/ogg",
}
from app.api.file_helpers import (_ensure_upload_subdir)

def _get_or_create_upload_session(upload_dir):
    session = ImportSession.query.filter_by(root_path=upload_dir).first()
    if session:
        root_dir = ImportedDirectory.query.filter_by(
            session_id=session.id, path=""
        ).first()
        return session, root_dir
    session = ImportSession(root_path=upload_dir, mime_groups=["image", "video"])
    db.session.add(session)
    db.session.flush()
    root_dir = ImportedDirectory(
        session_id=session.id, path="", name="", parent_path=None,
    )
    db.session.add(root_dir)
    db.session.flush()
    return session, root_dir

@upload_bp.route("/upload/directories", methods=["GET"])
def list_upload_dirs():
    upload_dir = current_app.config["UPLOAD_DIR"]
    prefix = request.args.get("prefix", "").strip().strip("/")
    scan_dir = os.path.join(upload_dir, prefix) if prefix else upload_dir
    if not os.path.isdir(scan_dir):
        return jsonify({"directories": [], "prefix": prefix}), 200
    dirs = []
    for entry in sorted(os.listdir(scan_dir)):
        full = os.path.join(scan_dir, entry)
        if os.path.isdir(full):
            dirs.append({"name": entry, "path": os.path.join(prefix, entry) if prefix else entry})
    return jsonify({"directories": dirs, "prefix": prefix}), 200

@upload_bp.route("/upload/directories", methods=["POST"])
def create_upload_dir():
    upload_dir = current_app.config["UPLOAD_DIR"]
    data = request.get_json(silent=True) or {}
    path = data.get("path", "").strip().strip("/")
    if not path:
        return jsonify({"error": "Path is required"}), 400

    # Figure out which session this path belongs to by looking up the parent
    parent_path = path.rsplit("/", 1)[0] if "/" in path else ""
    parent_dir = ImportedDirectory.query.filter(
        ImportedDirectory.deleted != True,
        ImportedDirectory.path == parent_path,
    ).first() if parent_path else None

    if parent_dir:
        session = db.session.get(ImportSession, parent_dir.session_id)
        root_path = session.root_path
    else:
        session, _ = _get_or_create_upload_session(upload_dir)
        root_path = upload_dir

    full = os.path.join(root_path, path)
    try:
        os.makedirs(full, exist_ok=True)
    except OSError as e:
        return jsonify({"error": str(e)}), 500
    _ensure_upload_subdir(session, path)
    db.session.commit()
    return jsonify({"path": path, "message": "Directory created"}), 201

@upload_bp.route("/upload", methods=["POST"])
def upload_files():
    upload_dir = current_app.config["UPLOAD_DIR"]
    subdir = request.form.get("directory", "").strip().strip("/")
    nickname = request.form.get("nickname", "").strip()
    if not nickname:
        return jsonify({"error": "nickname is required"}), 400

    files = request.files.getlist("files")
    if not files:
        return jsonify({"error": "No files provided"}), 400

    target_dir = os.path.join(upload_dir, subdir) if subdir else upload_dir
    os.makedirs(target_dir, exist_ok=True)

    session, root_dir = _get_or_create_upload_session(upload_dir)
    parent_dir = _ensure_upload_subdir(session, subdir) if subdir else root_dir

    saved = []
    skipped = []
    errors = []
    face_batch = []

    existing_names_sizes = set()
    if parent_dir.id:
        existing = ImportedFile.query.filter(
            ImportedFile.directory_id == parent_dir.id,
            ImportedFile.deleted != True,
        ).with_entities(ImportedFile.filename, ImportedFile.size).all()
        existing_names_sizes = {(e.filename, e.size) for e in existing}

    for f in files:
        if not f.filename:
            continue
        safe = secure_filename(f.filename)
        if not safe:
            safe = f.filename

        save_path = os.path.join(target_dir, safe)
        f.save(save_path)

        mime = guess_mime(save_path)
        if mime not in ALLOWED_UPLOAD_MIMES:
            try:
                os.remove(save_path)
            except OSError:
                pass
            errors.append({"filename": safe, "error": f"Unsupported mime type: {mime}"})
            continue

        stat = os.stat(save_path)
        file_size = stat.st_size

        if (safe, file_size) in existing_names_sizes:
            try:
                os.remove(save_path)
            except OSError:
                pass
            skipped.append(safe)
            continue

        uploads_total.inc()
        upload_bytes_total.inc(file_size)
        rel_path = os.path.join(subdir, safe) if subdir else safe

        file_record = ImportedFile(
            session_id=session.id,
            directory_id=parent_dir.id,
            filename=safe,
            file_path=save_path,
            relative_path=rel_path,
            mime_type=mime,
            nickname=nickname,
            size=file_size,
            modified=datetime.fromtimestamp(stat.st_mtime),
        )
        db.session.add(file_record)
        db.session.flush()

        session.total_files = (session.total_files or 0) + 1
        db.session.commit()

        file_info = {
            "id": file_record.id,
            "session_id": file_record.session_id,
            "directory_id": file_record.directory_id,
            "filename": file_record.filename,
            "file_path": file_record.file_path,
            "relative_path": file_record.relative_path,
            "mime_type": file_record.mime_type,
            "size": file_record.size,
            "modified": file_record.modified.isoformat(),
        }

        extract_file_metadata.delay(file_info)
        generate_ai_metadata.delay(file_info)
        generate_thumbnail.delay(file_info)
        if mime.startswith("image/"):
            face_batch.append(file_info)
            if len(face_batch) >= get_config().FACE_BATCH_SIZE:
                detect_faces.delay(face_batch)
                face_batch = []

        saved.append(file_record.to_dict())
        existing_names_sizes.add((safe, file_size))

    if face_batch:
        detect_faces.delay(face_batch)

    if saved:
        from app.metrics import update_library_stats
        update_library_stats()

    return jsonify({"saved": saved, "skipped": skipped, "errors": errors}), 201

@upload_bp.route("/upload/files/delete", methods=["POST"])
def soft_delete_upload_files():
    data = request.get_json(silent=True) or {}
    file_ids = data.get("file_ids", [])
    paths = data.get("paths", [])
    if not file_ids and not paths:
        return jsonify({"error": "Provide file_ids or paths"}), 400

    query = ImportedFile.query
    if file_ids:
        query = query.filter(ImportedFile.id.in_(file_ids))
    if paths:
        query = query.filter(ImportedFile.file_path.in_(paths))

    count = query.update({ImportedFile.deleted: True}, synchronize_session="fetch")
    db.session.commit()
    return jsonify({"deleted": count}), 200

@upload_bp.route("/upload/directories/delete", methods=["POST"])
def soft_delete_upload_dir():
    data = request.get_json(silent=True) or {}
    path = data.get("path", "").strip().strip("/")
    if not path:
        return jsonify({"error": "path is required"}), 400

    upload_dir = current_app.config["UPLOAD_DIR"]
    full_path = os.path.join(upload_dir, path)

    dirs = ImportedDirectory.query.filter(
        ImportedDirectory.path == path
    ).all()
    for d in dirs:
        d.deleted = True
        ImportedFile.query.filter_by(directory_id=d.id).update(
            {ImportedFile.deleted: True}, synchronize_session="fetch"
        )

    subdirs = ImportedDirectory.query.filter(
        ImportedDirectory.path.like(f"{path}/%")
    ).all()
    sub_ids = [sd.id for sd in subdirs]
    if sub_ids:
        ImportedDirectory.query.filter(ImportedDirectory.id.in_(sub_ids)).update(
            {ImportedDirectory.deleted: True}, synchronize_session="fetch"
        )
        ImportedFile.query.filter(ImportedFile.directory_id.in_(sub_ids)).update(
            {ImportedFile.deleted: True}, synchronize_session="fetch"
        )

    db.session.commit()

    # Remove from filesystem so the Upload tab (which scans FS) stops showing it
    try:
        if os.path.isdir(full_path):
            import shutil
            shutil.rmtree(full_path)
    except OSError as e:
        current_app.logger.warning(f"Failed to remove directory {full_path}: {e}")

    return jsonify({"message": f"Deleted path '{path}'", "deleted_dirs": len(dirs) + len(subdirs)}), 200

@upload_bp.route("/upload/move", methods=["POST"])
def move_upload_items():
    data = request.get_json(silent=True) or {}
    paths = data.get("paths", [])
    target = data.get("target", "").strip().strip("/")
    if not paths:
        return jsonify({"error": "paths is required"}), 400

    upload_dir = current_app.config["UPLOAD_DIR"]
    session, _root_dir = _get_or_create_upload_session(upload_dir)
    target_dir = _ensure_upload_subdir(session, target) if target else _root_dir
    target_fs = os.path.join(upload_dir, target) if target else upload_dir
    os.makedirs(target_fs, exist_ok=True)

    moved_files = []
    moved_dirs = []

    for src_path in paths:
        src_path = src_path.strip().strip("/")
        src_fs = os.path.join(upload_dir, src_path)
        name = os.path.basename(src_path)
        dst_fs = os.path.join(target_fs, name)

        if os.path.isdir(src_fs):
            os.renames(src_fs, dst_fs)
            moved_dirs.append(src_path)
        elif os.path.isfile(src_fs):
            os.renames(src_fs, dst_fs)
            moved_files.append(src_path)

    rel_target = target + "/" if target else ""

    for src_path in moved_dirs:
        old_prefix = src_path + "/"
        new_prefix = rel_target + os.path.basename(src_path) + "/"
        dirs = ImportedDirectory.query.filter(
            ImportedDirectory.session_id == session.id,
            db.or_(ImportedDirectory.path == src_path, ImportedDirectory.path.like(f"{old_prefix}%")),
        ).all()
        for d in dirs:
            if d.path == src_path:
                d.path = rel_target + os.path.basename(src_path)
                d.parent_path = target
            else:
                suffix = d.path[len(old_prefix):]
                d.path = new_prefix + suffix
                d.parent_path = "/".join(d.path.split("/")[:-1])
        files = ImportedFile.query.filter(
            ImportedFile.session_id == session.id,
            db.or_(ImportedFile.relative_path == src_path, ImportedFile.relative_path.like(f"{old_prefix}%")),
        ).all()
        for f in files:
            if f.relative_path == src_path:
                f.relative_path = rel_target + os.path.basename(src_path)
            else:
                suffix = f.relative_path[len(old_prefix):]
                f.relative_path = new_prefix + suffix
            dir_name = os.path.dirname(f.relative_path)
            dir_entry = _ensure_upload_subdir(session, dir_name) if dir_name else _root_dir
            f.directory_id = dir_entry.id

    for src_path in moved_files:
        file_entry = ImportedFile.query.filter_by(
            session_id=session.id, relative_path=src_path
        ).first()
        if file_entry:
            new_rel = rel_target + os.path.basename(src_path)
            file_entry.relative_path = new_rel
            file_entry.file_path = os.path.join(upload_dir, new_rel)
            dir_name = os.path.dirname(new_rel)
            new_dir = _ensure_upload_subdir(session, dir_name) if dir_name else _root_dir
            file_entry.directory_id = new_dir.id

    db.session.commit()
    return jsonify({"message": "Items moved"}), 200

@upload_bp.route("/upload/copy", methods=["POST"])
def copy_upload_items():
    data = request.get_json(silent=True) or {}
    paths = data.get("paths", [])
    target = data.get("target", "").strip().strip("/")
    if not paths:
        return jsonify({"error": "paths is required"}), 400

    upload_dir = current_app.config["UPLOAD_DIR"]
    session, root_dir = _get_or_create_upload_session(upload_dir)
    target_dir = _ensure_upload_subdir(session, target) if target else root_dir
    target_fs = os.path.join(upload_dir, target) if target else upload_dir
    os.makedirs(target_fs, exist_ok=True)

    for src_path in paths:
        src_path = src_path.strip().strip("/")
        src_fs = os.path.join(upload_dir, src_path)
        name = os.path.basename(src_path)
        dst_fs = os.path.join(target_fs, name)

        if os.path.isdir(src_fs):
            _copy_directory_tree(upload_dir, src_path, target, session, root_dir)
        elif os.path.isfile(src_fs):
            _copy_single_file(upload_dir, src_path, target, session, root_dir)

    db.session.commit()
    return jsonify({"message": "Items copied"}), 200

def _copy_single_file(upload_dir, src_path, target, session, root_dir):
    name = os.path.basename(src_path)
    dst_path = os.path.join(target, name) if target else name
    dst_fs = os.path.join(upload_dir, dst_path)

    os.makedirs(os.path.dirname(dst_fs), exist_ok=True)
    shutil.copy2(os.path.join(upload_dir, src_path), dst_fs)

    src_entry = ImportedFile.query.filter_by(
        session_id=session.id, relative_path=src_path
    ).first()
    if src_entry:
        new_entry = ImportedFile(
            session_id=session.id,
            filename=src_entry.filename,
            relative_path=dst_path,
            directory_id=_ensure_upload_subdir(session, target or "").id if target else root_dir.id,
            file_hash=src_entry.file_hash,
            mime_type=src_entry.mime_type,
            file_size=src_entry.file_size,
            nickname=src_entry.nickname,
            width=src_entry.width,
            height=src_entry.height,
            duration=src_entry.duration,
            latitude=src_entry.latitude,
            longitude=src_entry.longitude,
            date_taken=src_entry.date_taken,
        )
        db.session.add(new_entry)
        db.session.flush()
        orig_meta = FileMetadata.query.filter_by(file_id=src_entry.id).first()
        if orig_meta:
            new_meta = FileMetadata(
                file_id=new_entry.id,
                exif=orig_meta.exif,
                description=orig_meta.description,
                tags=orig_meta.tags,
                search_words=orig_meta.search_words,
                thumbnail=orig_meta.thumbnail,
                thumbnail_status=orig_meta.thumbnail_status,
                metadata_status=orig_meta.metadata_status,
                date_added=orig_meta.date_added,
            )
            db.session.add(new_meta)

def _copy_directory_tree(upload_dir, src_path, target, session, root_dir):
    name = os.path.basename(src_path)
    dst_base = os.path.join(target, name) if target else name
    dst_fs = os.path.join(upload_dir, dst_base)

    shutil.copytree(os.path.join(upload_dir, src_path), dst_fs, dirs_exist_ok=True)

    old_prefix = src_path + "/"
    for root, _dirs, files in os.walk(os.path.join(upload_dir, src_path)):
        rel_root = os.path.relpath(root, upload_dir)
        if rel_root == src_path:
            dir_rel = dst_base
        elif rel_root.startswith(old_prefix):
            suffix = rel_root[len(old_prefix):]
            dir_rel = os.path.join(dst_base, suffix)
        else:
            continue
        _ensure_upload_subdir(session, dir_rel)
        for fname in files:
            file_rel = os.path.join(rel_root, fname)
            dst_file_rel = os.path.join(dir_rel, fname)
            src_entry = ImportedFile.query.filter_by(
                session_id=session.id, relative_path=file_rel
            ).first()
            if src_entry:
                new_entry = ImportedFile(
                    session_id=session.id,
                    filename=src_entry.filename,
                    relative_path=dst_file_rel,
                    directory_id=_ensure_upload_subdir(session, dir_rel).id,
                    file_hash=src_entry.file_hash,
                    mime_type=src_entry.mime_type,
                    file_size=src_entry.file_size,
                    nickname=src_entry.nickname,
                    width=src_entry.width,
                    height=src_entry.height,
                    duration=src_entry.duration,
                    latitude=src_entry.latitude,
                    longitude=src_entry.longitude,
                    date_taken=src_entry.date_taken,
                )
                db.session.add(new_entry)
                db.session.flush()
                orig_meta = FileMetadata.query.filter_by(file_id=src_entry.id).first()
                if orig_meta:
                    new_meta = FileMetadata(
                        file_id=new_entry.id,
                        exif=orig_meta.exif,
                        description=orig_meta.description,
                        tags=orig_meta.tags,
                        search_words=orig_meta.search_words,
                        thumbnail=orig_meta.thumbnail,
                        thumbnail_status=orig_meta.thumbnail_status,
                        metadata_status=orig_meta.metadata_status,
                        date_added=orig_meta.date_added,
                    )
                    db.session.add(new_meta)

@upload_bp.route("/upload/rename", methods=["POST"])
def rename_upload_item():
    data = request.get_json(silent=True) or {}
    path = data.get("path", "").strip().strip("/")
    new_name = data.get("new_name", "").strip()
    if not path or not new_name:
        return jsonify({"error": "path and new_name are required"}), 400

    upload_dir = current_app.config["UPLOAD_DIR"]
    session, _root_dir = _get_or_create_upload_session(upload_dir)
    src_fs = os.path.join(upload_dir, path)
    parent = os.path.dirname(path)
    new_path = os.path.join(parent, new_name) if parent else new_name
    dst_fs = os.path.join(upload_dir, new_path)

    os.renames(src_fs, dst_fs)

    if os.path.isdir(dst_fs):
        old_prefix = path + "/"
        new_prefix = new_path + "/"
        dirs = ImportedDirectory.query.filter(
            ImportedDirectory.session_id == session.id,
            db.or_(ImportedDirectory.path == path, ImportedDirectory.path.like(f"{old_prefix}%")),
        ).all()
        for d in dirs:
            if d.path == path:
                d.path = new_path
                d.name = new_name
            else:
                suffix = d.path[len(old_prefix):]
                d.path = new_prefix + suffix
        files = ImportedFile.query.filter(
            ImportedFile.session_id == session.id,
            db.or_(ImportedFile.relative_path == path, ImportedFile.relative_path.like(f"{old_prefix}%")),
        ).all()
        for f in files:
            if f.relative_path == path:
                f.relative_path = new_path
            else:
                suffix = f.relative_path[len(old_prefix):]
                f.relative_path = new_prefix + suffix
            dir_name = os.path.dirname(f.relative_path)
            if dir_name:
                _ensure_upload_subdir(session, dir_name)
    else:
        file_entry = ImportedFile.query.filter_by(
            session_id=session.id, relative_path=path
        ).first()
        if file_entry:
            file_entry.filename = new_name
            file_entry.relative_path = new_path

    db.session.commit()
    return jsonify({"message": "Renamed"}), 200

@upload_bp.route("/upload/files/recent", methods=["GET"])
def list_recent_upload_files():
    upload_dir = current_app.config["UPLOAD_DIR"]
    session, _root_dir = _get_or_create_upload_session(upload_dir)
    prefix = request.args.get("prefix", "").strip().strip("/")
    query = ImportedFile.query.filter(
        ImportedFile.deleted != True,
        ImportedFile.session_id == session.id,
    )
    if prefix:
        like = f"{prefix}/%"
        no_sub = f"{prefix}/%/%"
        query = query.filter(
            db.or_(
                ImportedFile.relative_path == prefix,
                db.and_(
                    ImportedFile.relative_path.like(like),
                    ~ImportedFile.relative_path.like(no_sub),
                ),
            )
        )
    else:
        query = query.filter(~ImportedFile.relative_path.like("%/%"))
    files = query.order_by(ImportedFile.created_at.desc()).limit(100).all()
    result = []
    for f in files:
        d = f.to_dict()
        meta = FileMetadata.query.filter_by(file_id=f.id).first()
        d["thumbnail"] = meta.thumbnail if meta else None
        d["thumbnail_status"] = meta.thumbnail_status if meta else "pending"
        result.append(d)
    return jsonify({"files": result}), 200

@upload_bp.route("/upload/nicknames", methods=["GET"])
def list_nicknames():
    upload_dir = current_app.config["UPLOAD_DIR"]
    session, _root_dir = _get_or_create_upload_session(upload_dir)
    rows = (
        db.session.query(ImportedFile.nickname)
        .filter(
            ImportedFile.nickname.isnot(None),
            ImportedFile.nickname != "",
            ImportedFile.session_id == session.id,
        )
        .distinct()
        .order_by(ImportedFile.nickname)
        .all()
    )
    return jsonify({"nicknames": [r[0] for r in rows]}), 200
