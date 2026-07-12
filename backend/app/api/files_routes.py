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
files_bp=Blueprint("files",__name__)

from app.services import duplicate_service, file_service
config=get_config()

from app.api.file_helpers import (_adjust_blacks, _adjust_clarity, _adjust_dehaze, _adjust_exposure, _adjust_highlights_shadows, _adjust_tint, _adjust_vibrance, _adjust_warmth, _adjust_whites, _apply_colorize, _apply_filter_preset, _apply_grain, _apply_vignette)

@files_bp.route("/files/<int:file_id>/metadata", methods=["GET"])
def get_file_metadata(file_id):
    file_record = db.session.get(ImportedFile, file_id)
    if not file_record:
        return jsonify({"error": "File not found"}), 404
    meta = FileMetadata.query.filter_by(file_id=file_id).first()
    if not meta:
        return jsonify({"error": "Metadata not yet available"}), 404
    return jsonify(meta.to_dict()), 200

@files_bp.route("/files/<int:file_id>/metadata", methods=["PATCH"])
def update_file_metadata(file_id):
    file_record = db.session.get(ImportedFile, file_id)
    if not file_record:
        return jsonify({"error": "File not found"}), 404
    meta = FileMetadata.query.filter_by(file_id=file_id).first()
    if not meta:
        return jsonify({"error": "Metadata not yet available"}), 404
    data = request.get_json(silent=True) or {}
    if "date_taken" in data:
        val = data["date_taken"]
        if val is None:
            meta.date_taken = None
        else:
            try:
                meta.date_taken = datetime.fromisoformat(val)
            except (ValueError, TypeError):
                return jsonify({"error": "Invalid date_taken format"}), 400
    db.session.commit()
    return jsonify(meta.to_dict()), 200

@files_bp.route("/files/<int:file_id>/tags", methods=["PATCH"])
def update_file_tags(file_id):
    file_record = db.session.get(ImportedFile, file_id)
    if not file_record:
        return jsonify({"error": "File not found"}), 404
    data = request.get_json(silent=True) or {}
    tags = data.get("tags", [])
    if not isinstance(tags, list):
        return jsonify({"error": "tags must be a list"}), 400
    meta = FileMetadata.query.filter_by(file_id=file_id).first()
    if not meta:
        return jsonify({"error": "Metadata not yet available"}), 404
    meta.tags = tags
    db.session.commit()
    return jsonify({"tags": meta.tags}), 200

@files_bp.route("/files/batch-metadata", methods=["POST"])
def batch_update_metadata():
    data = request.get_json(silent=True) or {}
    file_ids = data.get("file_ids", [])
    if not file_ids or not isinstance(file_ids, list):
        return jsonify({"error": "file_ids list is required"}), 400
    updated = 0
    for fid in file_ids:
        meta = FileMetadata.query.filter_by(file_id=fid).first()
        if not meta:
            continue
        if "date_taken" in data:
            val = data["date_taken"]
            if val is None:
                meta.date_taken = None
            else:
                try:
                    meta.date_taken = datetime.fromisoformat(val)
                except (ValueError, TypeError):
                    pass
        updated += 1
    db.session.commit()
    return jsonify({"updated": updated}), 200

@files_bp.route("/files/batch-memories", methods=["POST"])
def batch_create_memories():
    from app.models.user_memory import UserMemory
    data = request.get_json(silent=True) or {}
    file_ids = data.get("file_ids", [])
    content = (data.get("content") or "").strip()
    if not file_ids or not isinstance(file_ids, list):
        return jsonify({"error": "file_ids list is required"}), 400
    if not content:
        return jsonify({"error": "content is required"}), 400
    tags = data.get("tags") or []
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(",") if t.strip()]
    created = 0
    for fid in file_ids:
        f = db.session.get(ImportedFile, fid)
        if not f:
            continue
        memory = UserMemory(file_id=fid, content=content, tags=tags)
        db.session.add(memory)
        created += 1
    db.session.commit()
    return jsonify({"created": created}), 201

@files_bp.route("/files/<int:file_id>/favorite", methods=["PATCH"])
def toggle_favorite(file_id):
    return file_service.toggle_favorite(file_id)

@files_bp.route("/files/<int:file_id>/primary", methods=["PATCH"])
def toggle_primary(file_id):
    return file_service.toggle_primary(file_id)

@files_bp.route("/files", methods=["GET"])
def list_files():
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 50, type=int)
    per_page = min(per_page, 200)
    mime_group = request.args.get("mime_group")
    q = request.args.get("q", "").strip()
    directory_id = request.args.get("directory_id", type=int)
    min_width = request.args.get("min_width", type=int)
    min_height = request.args.get("min_height", type=int)
    sort_by = request.args.get("sort_by", "created_at")
    sort_dir = request.args.get("sort_dir", "desc")

    query = db.session.query(
        ImportedFile, FileMetadata.thumbnail, FileMetadata.thumbnail_status,
        FileMetadata.width, FileMetadata.height, FileMetadata.tags
    ).outerjoin(
        FileMetadata, ImportedFile.id == FileMetadata.file_id
    ).filter(ImportedFile.deleted != True, ImportedFile.is_hidden != True)

    if directory_id is not None and directory_id > 0:
        dir_record = db.session.get(ImportedDirectory, directory_id)
        if dir_record:
            dir_path = dir_record.path
            base = ImportedDirectory.query.filter(
                ImportedDirectory.session_id == dir_record.session_id,
            )
            if dir_path:
                descendants = base.filter(
                    db.or_(
                        ImportedDirectory.path == dir_path,
                        ImportedDirectory.path.like(f"{dir_path}/%"),
                    )
                )
            else:
                descendants = base
            dir_ids = [d.id for d in descendants.all()]
            query = query.filter(ImportedFile.directory_id.in_(dir_ids))

    if mime_group == "image":
        query = query.filter(ImportedFile.mime_type.like("image/%"))
    elif mime_group == "video":
        query = query.filter(ImportedFile.mime_type.like("video/%"))

    if q:
        from app.models.detected_face import DetectedFace
        from app.models.person import Person
        from app.models.user_memory import UserMemory
        words = q.split()
        word_conditions = []
        for word in words:
            like = f"%{word}%"
            person_file_ids = db.session.query(DetectedFace.file_id).join(
                Person, Person.id == DetectedFace.person_id
            ).filter(Person.name.ilike(like)).distinct().subquery()
            memory_file_ids = db.session.query(UserMemory.file_id).filter(
                UserMemory.content.ilike(like)
            ).distinct().subquery()
            word_conditions.append(
                db.or_(
                    db.cast(FileMetadata.tags, db.String).ilike(like),
                    FileMetadata.description.ilike(like),
                    FileMetadata.search_words.ilike(like),
                    ImportedFile.filename.ilike(like),
                    ImportedFile.id.in_(db.session.query(person_file_ids.c.file_id)),
                    ImportedFile.id.in_(db.session.query(memory_file_ids.c.file_id)),
                )
            )
        query = query.filter(db.and_(*word_conditions))

    tag = request.args.get("tag", "").strip().lower()
    if tag:
        query = query.filter(FileMetadata.tags.cast(db.String).contains(f'"{tag}"'))

    has_ai = request.args.get("has_ai", type=bool)
    if has_ai:
        query = query.filter(
            db.or_(
                FileMetadata.tags.isnot(None),
                FileMetadata.description.isnot(None),
                FileMetadata.search_words.isnot(None),
            )
        )

    if min_width is not None:
        query = query.filter(
            db.or_(FileMetadata.width.is_(None), FileMetadata.width >= min_width)
        )
    if min_height is not None:
        query = query.filter(
            db.or_(FileMetadata.height.is_(None), FileMetadata.height >= min_height)
        )

    sort_map = {
        "created_at": ImportedFile.created_at,
        "filename": ImportedFile.filename,
        "size": ImportedFile.size,
    }
    sort_col = sort_map.get(sort_by, ImportedFile.created_at)
    sort_fn = sort_col.desc if sort_dir == "desc" else sort_col.asc

    pagination = query.order_by(
        sort_fn()
    ).paginate(
        page=page, per_page=per_page, error_out=False
    )

    files = []
    for f, thumb, thumb_status, w, h, tags in pagination.items:
        d = f.to_dict()
        d["thumbnail"] = thumb
        d["thumbnail_status"] = thumb_status or "pending"
        d["width"] = w
        d["height"] = h
        d["tags"] = tags
        d["created_at"] = f.created_at.isoformat() if f.created_at else None
        files.append(d)

    return jsonify({
        "files": files,
        "page": page,
        "per_page": per_page,
        "total": pagination.total,
        "pages": pagination.pages,
    }), 200

@files_bp.route("/files/hidden", methods=["GET"])
def list_hidden_files():
    pin = request.headers.get("X-Hidden-Pin", "")
    if pin != current_app.config["HIDDEN_FILES_PIN"]:
        return jsonify({"error": "Invalid PIN"}), 403

    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 50, type=int)
    per_page = min(per_page, 200)
    mime_group = request.args.get("mime_group")
    q = request.args.get("q", "").strip()
    sort_by = request.args.get("sort_by", "created_at")
    sort_dir = request.args.get("sort_dir", "desc")

    query = db.session.query(
        ImportedFile, FileMetadata.thumbnail, FileMetadata.thumbnail_status,
        FileMetadata.width, FileMetadata.height, FileMetadata.tags
    ).outerjoin(
        FileMetadata, ImportedFile.id == FileMetadata.file_id
    ).filter(ImportedFile.deleted != True, ImportedFile.is_hidden == True)

    if mime_group == "image":
        query = query.filter(ImportedFile.mime_type.like("image/%"))
    elif mime_group == "video":
        query = query.filter(ImportedFile.mime_type.like("video/%"))

    if q:
        from app.models.detected_face import DetectedFace
        from app.models.person import Person
        from app.models.user_memory import UserMemory
        words = q.split()
        word_conditions = []
        for word in words:
            like = f"%{word}%"
            person_file_ids = db.session.query(DetectedFace.file_id).join(
                Person, Person.id == DetectedFace.person_id
            ).filter(Person.name.ilike(like)).distinct().subquery()
            memory_file_ids = db.session.query(UserMemory.file_id).filter(
                UserMemory.content.ilike(like)
            ).distinct().subquery()
            word_conditions.append(
                db.or_(
                    db.cast(FileMetadata.tags, db.String).ilike(like),
                    FileMetadata.description.ilike(like),
                    FileMetadata.search_words.ilike(like),
                    ImportedFile.filename.ilike(like),
                    ImportedFile.id.in_(db.session.query(person_file_ids.c.file_id)),
                    ImportedFile.id.in_(db.session.query(memory_file_ids.c.file_id)),
                )
            )
        query = query.filter(db.and_(*word_conditions))

    tag = request.args.get("tag", "").strip().lower()
    if tag:
        query = query.filter(FileMetadata.tags.cast(db.String).contains(f'"{tag}"'))

    sort_map = {
        "created_at": ImportedFile.created_at,
        "filename": ImportedFile.filename,
        "size": ImportedFile.size,
    }
    sort_col = sort_map.get(sort_by, ImportedFile.created_at)
    sort_fn = sort_col.desc if sort_dir == "desc" else sort_col.asc

    pagination = query.order_by(
        sort_fn()
    ).paginate(
        page=page, per_page=per_page, error_out=False
    )

    files = []
    for f, thumb, thumb_status, w, h, tags in pagination.items:
        d = f.to_dict()
        d["thumbnail"] = thumb
        d["thumbnail_status"] = thumb_status or "pending"
        d["width"] = w
        d["height"] = h
        d["tags"] = tags
        d["created_at"] = f.created_at.isoformat() if f.created_at else None
        files.append(d)

    return jsonify({
        "files": files,
        "page": page,
        "per_page": per_page,
        "total": pagination.total,
        "pages": pagination.pages,
    }), 200

@files_bp.route("/files/<int:file_id>/toggle-hidden", methods=["PATCH"])
def toggle_hidden(file_id):
    f = db.session.get(ImportedFile, file_id)
    if not f or f.deleted:
        return jsonify({"error": "File not found"}), 404

    f.is_hidden = not f.is_hidden
    db.session.commit()
    return jsonify({"is_hidden": f.is_hidden, "id": f.id}), 200

@files_bp.route("/files/verify-hidden-pin", methods=["POST"])
def verify_hidden_pin():
    pin = request.headers.get("X-Hidden-Pin", "")
    if pin != current_app.config["HIDDEN_FILES_PIN"]:
        return jsonify({"error": "Invalid PIN"}), 403
    return jsonify({"valid": True}), 200

@files_bp.route("/files/unhide", methods=["POST"])
def unhide_files():
    pin = request.headers.get("X-Hidden-Pin", "")
    if pin != current_app.config["HIDDEN_FILES_PIN"]:
        return jsonify({"error": "Invalid PIN"}), 403

    data = request.get_json(silent=True) or {}
    file_ids = data.get("file_ids", [])
    if not file_ids:
        return jsonify({"error": "No file IDs provided"}), 400

    ImportedFile.query.filter(
        ImportedFile.id.in_(file_ids),
        ImportedFile.deleted != True,
    ).update({"is_hidden": False}, synchronize_session="fetch")

    db.session.commit()
    return jsonify({"unhidden": len(file_ids)}), 200

@files_bp.route("/duplicates", methods=["GET"])
def list_duplicates():
    type_ = request.args.get("type", "exact")
    if type_ == "exact":
        return jsonify(duplicate_service.find_exact_duplicates()), 200
    if type_ == "near":
        return jsonify(duplicate_service.find_near_duplicates()), 200
    return jsonify({"error": "Invalid type"}), 400

@files_bp.route("/files/<int:file_id>/near-duplicates", methods=["GET"])
def get_near_duplicates(file_id):
    result = duplicate_service.find_near_duplicates_for_file(file_id)
    if result is None:
        return jsonify({"error": "No dhash available"}), 404
    return jsonify(result), 200

@files_bp.route("/favorites", methods=["GET"])
def list_favorites():
    return jsonify(file_service.list_favorites()), 200

@files_bp.route("/files/<int:file_id>/thumbnail", methods=["GET"])
def get_file_thumbnail(file_id):
    meta = FileMetadata.query.filter_by(file_id=file_id).first()
    if not meta or not meta.thumbnail:
        return jsonify({"error": "Thumbnail not available"}), 404
    header, _, b64data = meta.thumbnail.partition(",")
    return jsonify({
        "thumbnail": meta.thumbnail,
        "thumbnail_status": meta.thumbnail_status,
    }), 200

@files_bp.route("/files/<int:file_id>/regenerate-ai", methods=["POST"])
def regenerate_ai_metadata(file_id):
    if request.headers.get("X-Airplane-Mode") == "1":
        return jsonify({"error": "Airplane mode is enabled, external calls blocked"}), 503
    file_record = db.session.get(ImportedFile, file_id)
    if not file_record:
        return jsonify({"error": "File not found"}), 404

    meta = FileMetadata.query.filter_by(file_id=file_id).first()
    if not meta:
        meta = FileMetadata(file_id=file_id)
        db.session.add(meta)

    meta.description = None
    meta.tags = None
    meta.search_words = None
    meta.metadata_status = "pending"
    db.session.commit()

    file_info = _make_file_info(file_record)
    generate_ai_metadata.delay(file_info)
    return jsonify({"message": "AI metadata regeneration initiated"}), 202

@files_bp.route("/files/<int:file_id>/regenerate-exif", methods=["POST"])
def regenerate_exif(file_id):
    file_record = db.session.get(ImportedFile, file_id)
    if not file_record:
        return jsonify({"error": "File not found"}), 404

    meta = FileMetadata.query.filter_by(file_id=file_id).first()
    if not meta:
        meta = FileMetadata(file_id=file_id)
        db.session.add(meta)

    DHashBand.query.filter_by(metadata_id=meta.id).delete()
    meta.metadata_status = "pending"
    meta.exif = None
    meta.latitude = None
    meta.longitude = None
    meta.date_taken = None
    meta.width = None
    meta.height = None
    meta.duration = None
    meta.file_hash = None
    meta.dhash = None
    db.session.commit()

    file_info = _make_file_info(file_record)
    extract_file_metadata.delay(file_info)
    return jsonify({"message": "EXIF regeneration initiated"}), 202

@files_bp.route("/files/<int:file_id>/regenerate-thumbnail", methods=["POST"])
def regenerate_thumbnail(file_id):
    file_record = db.session.get(ImportedFile, file_id)
    if not file_record:
        return jsonify({"error": "File not found"}), 404

    meta = FileMetadata.query.filter_by(file_id=file_id).first()
    if not meta:
        meta = FileMetadata(file_id=file_id)
        db.session.add(meta)

    meta.thumbnail = None
    meta.thumbnail_status = "pending"
    db.session.commit()

    file_info = _make_file_info(file_record)
    generate_thumbnail.delay(file_info)
    return jsonify({"message": "Thumbnail regeneration initiated"}), 202

def _make_file_info(file_record):
    return {
        "id": file_record.id,
        "session_id": file_record.session_id,
        "directory_id": file_record.directory_id,
        "filename": file_record.filename,
        "file_path": file_record.file_path,
        "relative_path": file_record.relative_path,
        "mime_type": file_record.mime_type,
        "size": file_record.size,
        "modified": file_record.modified.isoformat() if file_record.modified else None,
    }

def _apply_selective_color(img, colors, tolerance=30):
    img = img.convert("RGB")
    pixels = img.load()
    w, h = img.size
    if isinstance(colors[0], (list, tuple)):
        targets = colors
    else:
        targets = [colors]
    tol_sq = tolerance * tolerance
    gray_img = img.convert("L").convert("RGB")
    gray_pixels = gray_img.load()
    for y in range(h):
        for x in range(w):
            r, g, b = pixels[x, y]
            keep = False
            for tr, tg, tb in targets:
                dr, dg, db = r - tr, g - tg, b - tb
                if dr * dr + dg * dg + db * db <= tol_sq:
                    keep = True
                    break
            if not keep:
                pixels[x, y] = gray_pixels[x, y]
    return img

def _edit_video_file(file_record, operations):
    from app.utility.video_utility import edit_video

    edited_dir = current_app.config["EDITED_IMAGES_DIR"]
    os.makedirs(edited_dir, exist_ok=True)

    stem, ext = os.path.splitext(file_record.filename)
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    save_name = f"{stem}_edited_{ts}.mp4"
    save_path = os.path.join(edited_dir, save_name)

    edit_video(file_record.file_path, save_path, operations)

    session = ImportSession.query.filter_by(root_path=edited_dir).first()
    if not session:
        session = ImportSession(root_path=edited_dir, mime_groups=["image", "video"])
        db.session.add(session)
        db.session.flush()
        root_dir = ImportedDirectory(
            session_id=session.id, path="", name="", parent_path=None,
        )
        db.session.add(root_dir)
        db.session.flush()
    else:
        root_dir = ImportedDirectory.query.filter_by(
            session_id=session.id, path=""
        ).first()

    stat = os.stat(save_path)
    f = ImportedFile(
        session_id=session.id,
        directory_id=root_dir.id,
        filename=save_name,
        file_path=save_path,
        relative_path=save_name,
        mime_type="video/mp4",
        size=stat.st_size,
        modified=datetime.fromtimestamp(stat.st_mtime),
    )
    db.session.add(f)
    db.session.flush()

    session.total_files = (session.total_files or 0) + 1
    db.session.commit()

    file_info = _make_file_info(f)

    extract_file_metadata.delay(file_info)
    generate_thumbnail.delay(file_info)
    generate_ai_metadata.delay(file_info)

    return jsonify(f.to_dict()), 201

@files_bp.route("/files/<int:file_id>/edit", methods=["POST"])
def edit_file(file_id):
    data = request.get_json(silent=True) or {}
    operations = data.get("operations", [])

    file_record = db.session.get(ImportedFile, file_id)
    if not file_record:
        return jsonify({"error": "File not found"}), 404
    if not os.path.isfile(file_record.file_path):
        return jsonify({"error": "Original file no longer exists"}), 404

    if file_record.mime_type and file_record.mime_type.startswith("video/"):
        return _edit_video_file(file_record, operations)

    img = Image.open(file_record.file_path)
    img = img.convert("RGB")

    for op in operations:
        op_type = op.get("type")
        if op_type == "rotate":
            img = img.rotate(op.get("degrees", 0), expand=True, resample=Image.BICUBIC)
        elif op_type == "flip":
            d = op.get("direction")
            if d == "horizontal":
                img = img.transpose(Image.FLIP_LEFT_RIGHT)
            elif d == "vertical":
                img = img.transpose(Image.FLIP_TOP_BOTTOM)
        elif op_type == "grayscale":
            img = img.convert("L").convert("RGB")
        elif op_type == "brightness":
            v = op.get("value", 1.0)
            img = ImageEnhance.Brightness(img).enhance(v)
        elif op_type == "contrast":
            v = op.get("value", 1.0)
            img = ImageEnhance.Contrast(img).enhance(v)
        elif op_type == "saturation":
            v = op.get("value", 1.0)
            img = ImageEnhance.Color(img).enhance(v)
        elif op_type == "sharpness":
            v = op.get("value", 1.0)
            img = ImageEnhance.Sharpness(img).enhance(v)
        elif op_type == "highlights":
            img = _adjust_highlights_shadows(img, "highlights", op.get("value", 0))
        elif op_type == "shadows":
            img = _adjust_highlights_shadows(img, "shadows", op.get("value", 0))
        elif op_type == "warmth":
            img = _adjust_warmth(img, op.get("value", 0))
        elif op_type == "vignette":
            img = _apply_vignette(img, op.get("value", 0))
        elif op_type == "filter":
            img = _apply_filter_preset(img, op.get("name", ""))
        elif op_type == "crop":
            x = int(op.get("x", 0) * img.width)
            y = int(op.get("y", 0) * img.height)
            w = int(op.get("width", 1) * img.width)
            h = int(op.get("height", 1) * img.height)
            img = img.crop((x, y, x + w, y + h))
        elif op_type == "tint":
            v = op.get("value", 0)
            img = _adjust_tint(img, v)
        elif op_type == "vibrance":
            v = op.get("value", 1.0)
            img = _adjust_vibrance(img, v)
        elif op_type == "clarity":
            v = op.get("value", 1.0)
            img = _adjust_clarity(img, v)
        elif op_type == "dehaze":
            v = op.get("value", 0)
            img = _adjust_dehaze(img, v)
        elif op_type == "exposure":
            v = op.get("value", 0)
            img = _adjust_exposure(img, v)
        elif op_type == "blacks":
            v = op.get("value", 0)
            img = _adjust_blacks(img, v)
        elif op_type == "whites":
            v = op.get("value", 0)
            img = _adjust_whites(img, v)
        elif op_type == "grain":
            v = op.get("value", 0)
            img = _apply_grain(img, v)
        elif op_type == "grayscale":
            img = img.convert("L").convert("RGB")
        elif op_type == "selective_color":
            colors = op.get("colors", [op.get("color", [128, 128, 128])])
            tol = op.get("tolerance", 30)
            img = _apply_selective_color(img, colors, tol)
        elif op_type == "colorize":
            v = op.get("value", 0)
            img = _apply_colorize(img, v)

    edited_dir = current_app.config["EDITED_IMAGES_DIR"]
    os.makedirs(edited_dir, exist_ok=True)

    stem, _ = os.path.splitext(file_record.filename)
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    save_name = f"{stem}_edited_{ts}.jpg"
    save_path = os.path.join(edited_dir, save_name)

    img.save(save_path, format="JPEG", quality=95)
    img.close()

    session = ImportSession.query.filter_by(root_path=edited_dir).first()
    if not session:
        session = ImportSession(root_path=edited_dir, mime_groups=["image"])
        db.session.add(session)
        db.session.flush()
        root_dir = ImportedDirectory(
            session_id=session.id, path="", name="", parent_path=None,
        )
        db.session.add(root_dir)
        db.session.flush()
    else:
        root_dir = ImportedDirectory.query.filter_by(
            session_id=session.id, path=""
        ).first()

    stat = os.stat(save_path)
    f = ImportedFile(
        session_id=session.id,
        directory_id=root_dir.id,
        filename=save_name,
        file_path=save_path,
        relative_path=save_name,
        mime_type="image/jpeg",
        size=stat.st_size,
        modified=datetime.fromtimestamp(stat.st_mtime),
    )
    db.session.add(f)
    db.session.flush()

    session.total_files = (session.total_files or 0) + 1
    db.session.commit()

    file_info = {
        "id": f.id,
        "session_id": f.session_id,
        "directory_id": f.directory_id,
        "filename": f.filename,
        "file_path": f.file_path,
        "relative_path": f.relative_path,
        "mime_type": f.mime_type,
        "size": f.size,
        "modified": f.modified.isoformat(),
    }

    files_edited_total.inc()

    extract_file_metadata.delay(file_info)
    generate_ai_metadata.delay(file_info)
    generate_thumbnail.delay(file_info)
    if f.mime_type.startswith("image/"):
        detect_faces.delay(file_info)

    return jsonify(f.to_dict()), 201

def _convert_heic_to_jpeg(path):
    import subprocess as sp

    for cmd in (["magick", "convert"], ["convert"]):
        try:
            result = sp.run(
                [*cmd, "-define", "jpeg:preserve-exif=true", path, "jpeg:-"],
                capture_output=True, timeout=30,
            )
            if result.returncode == 0 and result.stdout:
                return result.stdout
        except Exception:
            pass
    return None

@files_bp.route("/files/<int:file_id>", methods=["GET"])
def get_file(file_id):
    file_record = db.session.get(ImportedFile, file_id)
    if not file_record:
        return jsonify({"error": "File not found"}), 404
    return jsonify(file_record.to_dict()), 200

def _resize_image_bytes(data, source_size=None):
    MAX_SERVE_SIZE = 1 * 1024 * 1024
    size = source_size or len(data)
    if size <= MAX_SERVE_SIZE:
        return None
    try:
        img = Image.open(io.BytesIO(data))
        try:
            exif = img._getexif()
            if exif:
                orientation = exif.get(0x0112)
                if orientation == 2:
                    img = img.transpose(Image.FLIP_LEFT_RIGHT)
                elif orientation == 3:
                    img = img.rotate(180, expand=True)
                elif orientation == 4:
                    img = img.transpose(Image.FLIP_TOP_BOTTOM)
                elif orientation == 5:
                    img = img.transpose(Image.FLIP_LEFT_RIGHT).rotate(270, expand=True)
                elif orientation == 6:
                    img = img.rotate(270, expand=True)
                elif orientation == 7:
                    img = img.transpose(Image.FLIP_LEFT_RIGHT).rotate(90, expand=True)
                elif orientation == 8:
                    img = img.rotate(90, expand=True)
        except Exception:
            pass
        img = img.convert("RGB")
        scale = math.sqrt(MAX_SERVE_SIZE / size)
        new_size = (max(1, int(img.width * scale)), max(1, int(img.height * scale)))
        img.thumbnail(new_size, Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        return buf.getvalue()
    except Exception:
        return None

def _serve_with_range(file_path, mime_type, file_size):
    range_header = request.headers.get("Range")

    if range_header:
        try:
            ranges = range_header.replace("bytes=", "").split("-")
            start = int(ranges[0]) if ranges[0] else 0
            end = int(ranges[1]) if ranges[1] else file_size - 1
            if start >= file_size or end >= file_size or start > end:
                resp = Response(status=416)
                resp.headers["Content-Range"] = f"bytes */{file_size}"
                return resp
        except (ValueError, IndexError):
            start = 0
            end = file_size - 1
    else:
        start = 0
        end = file_size - 1

    content_length = end - start + 1

    def generate():
        with open(file_path, "rb") as f:
            f.seek(start)
            remaining = content_length
            chunk_size = 64 * 1024
            while remaining > 0:
                read_size = min(chunk_size, remaining)
                data = f.read(read_size)
                if not data:
                    break
                remaining -= len(data)
                yield data

    if range_header:
        resp = Response(generate(), status=206, mimetype=mime_type)
        resp.headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
    else:
        resp = Response(generate(), status=200, mimetype=mime_type)

    resp.headers["Accept-Ranges"] = "bytes"
    resp.headers["Content-Length"] = content_length
    resp.headers["Cache-Control"] = "private, max-age=60"
    return resp

@files_bp.route("/files/<int:file_id>/serve", methods=["GET"])
def serve_file(file_id):
    file_record = db.session.get(ImportedFile, file_id)
    if not file_record:
        current_app.logger.warning("serve_file id=%s not found in DB", file_id)
        return jsonify({"error": "File not found"}), 404
    if not os.path.isfile(file_record.file_path):
        current_app.logger.warning(
            "serve_file id=%s file_path=%s deleted=%s is_hidden=%s is_favorite=%s session_id=%s filename=%s — not on disk",
            file_id, file_record.file_path, file_record.deleted, file_record.is_hidden,
            file_record.is_favorite, file_record.session_id, file_record.filename,
        )
        return jsonify({"error": "File no longer exists on disk"}), 404

    files_served_total.inc()
    current_app.logger.info(
        "serve_file id=%s file_path=%s deleted=%s is_hidden=%s filename=%s session_id=%s — serving",
        file_id, file_record.file_path, file_record.deleted, file_record.is_hidden,
        file_record.filename, file_record.session_id,
    )

    if file_record.mime_type in ("image/heic", "image/heif"):
        jpeg_data = _convert_heic_to_jpeg(file_record.file_path)
        if not jpeg_data:
            return jsonify({"error": "Could not decode HEIC image"}), 500
        resized = _resize_image_bytes(jpeg_data, source_size=len(jpeg_data))
        if resized:
            current_app.logger.info("serve_file id=%s heic resized %d -> %d bytes", file_id, len(jpeg_data), len(resized))
            resp = send_file(io.BytesIO(resized), mimetype="image/jpeg", as_attachment=False)
            resp.headers["Cache-Control"] = "private, max-age=60"
            return resp
        return send_file(io.BytesIO(jpeg_data), mimetype="image/jpeg", as_attachment=False)

    file_size = os.path.getsize(file_record.file_path)
    if file_size > 1 * 1024 * 1024 and file_record.mime_type and file_record.mime_type.startswith("image/"):
        try:
            with open(file_record.file_path, "rb") as f:
                src_data = f.read()
            resized = _resize_image_bytes(src_data, source_size=file_size)
            if resized:
                current_app.logger.info("serve_file id=%s resized %d -> %d bytes", file_id, file_size, len(resized))
                resp = send_file(io.BytesIO(resized), mimetype="image/jpeg", as_attachment=False)
                resp.headers["Cache-Control"] = "private, max-age=60"
                return resp
        except Exception as e:
            current_app.logger.warning("serve_file resize failed for id=%s: %s", file_id, e)

    if file_record.mime_type and file_record.mime_type.startswith("video/"):
        return _serve_with_range(file_record.file_path, file_record.mime_type, file_size)

    return send_file(
        file_record.file_path,
        mimetype=file_record.mime_type,
        as_attachment=False,
        conditional=True,
    )

@files_bp.route("/files/<int:file_id>/download", methods=["GET"])
def download_file(file_id):
    file_record = db.session.get(ImportedFile, file_id)
    if not file_record:
        return jsonify({"error": "File not found"}), 404
    if not os.path.isfile(file_record.file_path):
        return jsonify({"error": "File no longer exists on disk"}), 404

    files_downloaded_total.inc()

    if file_record.mime_type in ("image/heic", "image/heif"):
        jpeg_data = _convert_heic_to_jpeg(file_record.file_path)
        if not jpeg_data:
            return jsonify({"error": "Could not decode HEIC image"}), 500
        return send_file(
            io.BytesIO(jpeg_data), mimetype="image/jpeg",
            as_attachment=True, download_name=f"{file_record.filename}.jpg",
        )

    return send_file(
        file_record.file_path,
        mimetype=file_record.mime_type,
        as_attachment=True,
        download_name=file_record.filename,
    )

@files_bp.route("/files/<int:file_id>", methods=["DELETE"])
def delete_file(file_id):
    data = request.get_json(silent=True) or {}
    return file_service.delete_file(file_id, data.get("delete_storage", False))

@files_bp.route("/tags", methods=["GET"])
def list_all_tags():
    metas = FileMetadata.query.join(
        ImportedFile, FileMetadata.file_id == ImportedFile.id
    ).filter(
        ImportedFile.deleted != True,
        FileMetadata.tags.isnot(None),
        db.cast(FileMetadata.tags, db.String) != "[]",
    ).with_entities(FileMetadata.tags).all()
    freq = {}
    for (tags,) in metas:
        if tags and isinstance(tags, list):
            seen = set()
            for t in tags:
                t = t.strip().lower()
                if t and t not in seen:
                    seen.add(t)
                    freq[t] = freq.get(t, 0) + 1
    sorted_tags = sorted(freq.items(), key=lambda x: (-x[1], x[0]))
    return jsonify({"tags": [{"tag": t, "count": c} for t, c in sorted_tags]}), 200
