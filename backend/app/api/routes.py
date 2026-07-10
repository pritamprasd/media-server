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

from flask import current_app, jsonify, request, send_file
from werkzeug.utils import secure_filename

from app import db
from app.api import api_bp
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

config = get_config()

@api_bp.route("/status", methods=["GET"])
def status():
    return jsonify({"message": "API is running"}), 200


@api_bp.route("/stats/refresh", methods=["POST"])
def refresh_stats():
    from app.metrics import update_library_stats
    update_library_stats()
    return jsonify({"message": "Library stats refreshed"}), 200


@api_bp.route("/directories", methods=["GET"])
def list_directories():
    dirs = ImportedDirectory.query.filter(
        ImportedDirectory.deleted != True
    ).order_by(
        ImportedDirectory.session_id, ImportedDirectory.path
    ).all()
    session_cache = {}
    result = []
    for d in dirs:
        entry = d.to_dict()
        if d.session_id not in session_cache:
            session = db.session.get(ImportSession, d.session_id)
            session_cache[d.session_id] = session.root_path if session else ""
        entry["session_root_path"] = session_cache[d.session_id]
        result.append(entry)
    return jsonify(result)


@api_bp.route("/browse-fs", methods=["GET"])
def browse_fs():
    path = request.args.get("path", "").strip()
    if not path:
        path = os.path.expanduser(config.IMPORT_DEFAULT_PATH)
    path = os.path.normpath(path)
    if not os.path.isdir(path):
        return jsonify({"error": "Directory not found"}), 404
    dirs, files, parent = traverse_directory(path)
    return jsonify({
        "path": path,
        "parent": parent,
        "directories": dirs,
        "files": files,
    })


@api_bp.route("/import", methods=["POST"])
def import_folder():
    data = request.get_json(silent=True) or {}
    folder_path = data.get("path", "").strip()
    groups = data.get("groups", [])

    if not folder_path:
        return jsonify({"error": "Path is required"}), 400
    if not groups:
        return jsonify({"error": "At least one MIME group (image/video) is required"}), 400
    if not os.path.isdir(folder_path):
        return jsonify({"error": f"Directory not found: {folder_path}"}), 404

    process_import_folder.delay(folder_path, groups)
    return jsonify({
        "session": "",
        "message": f"Import initiated"
    }), 201


@api_bp.route("/sessions", methods=["GET"])
def list_sessions():
    sessions = ImportSession.query.order_by(ImportSession.created_at.desc()).all()
    return jsonify([s.to_dict() for s in sessions]), 200


@api_bp.route("/sessions/<int:session_id>/browse", methods=["GET"])
def browse_session(session_id):
    session = db.session.get(ImportSession, session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404

    path = request.args.get("path", "")

    directories = ImportedDirectory.query.filter(
        ImportedDirectory.deleted != True,
        ImportedDirectory.session_id == session_id,
        ImportedDirectory.parent_path == path,
    ).order_by(ImportedDirectory.name).all()

    if path == "":
        root_dir = ImportedDirectory.query.filter_by(
            session_id=session_id, path=""
        ).first()
        files = ImportedFile.query.filter(
            ImportedFile.deleted != True,
            ImportedFile.session_id == session_id,
            ImportedFile.directory_id == (root_dir.id if root_dir else -1),
        ).order_by(ImportedFile.filename).all()
    else:
        parent_dir = ImportedDirectory.query.filter(
            ImportedDirectory.deleted != True,
            ImportedDirectory.session_id == session_id,
            ImportedDirectory.path == path,
        ).first()
        if not parent_dir:
            return jsonify({"directories": [], "files": []}), 200
        files = ImportedFile.query.filter(
            ImportedFile.deleted != True,
            ImportedFile.directory_id == parent_dir.id,
        ).order_by(ImportedFile.filename).all()

    return jsonify({
        "directories": [d.to_dict() for d in directories],
        "files": [f.to_dict() for f in files],
    }), 200


@api_bp.route("/files/<int:file_id>/metadata", methods=["GET"])
def get_file_metadata(file_id):
    file_record = db.session.get(ImportedFile, file_id)
    if not file_record:
        return jsonify({"error": "File not found"}), 404
    meta = FileMetadata.query.filter_by(file_id=file_id).first()
    if not meta:
        return jsonify({"error": "Metadata not yet available"}), 404
    return jsonify(meta.to_dict()), 200


@api_bp.route("/files/<int:file_id>/metadata", methods=["PATCH"])
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


@api_bp.route("/files/<int:file_id>/tags", methods=["PATCH"])
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


@api_bp.route("/files/<int:file_id>/favorite", methods=["PATCH"])
def toggle_favorite(file_id):
    file_record = db.session.get(ImportedFile, file_id)
    if not file_record:
        return jsonify({"error": "File not found"}), 404
    file_record.is_favorite = not file_record.is_favorite
    db.session.commit()
    return jsonify(file_record.to_dict()), 200


@api_bp.route("/files", methods=["GET"])
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


@api_bp.route("/files/hidden", methods=["GET"])
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


@api_bp.route("/files/<int:file_id>/toggle-hidden", methods=["PATCH"])
def toggle_hidden(file_id):
    f = db.session.get(ImportedFile, file_id)
    if not f or f.deleted:
        return jsonify({"error": "File not found"}), 404

    f.is_hidden = not f.is_hidden
    db.session.commit()
    return jsonify({"is_hidden": f.is_hidden, "id": f.id}), 200


@api_bp.route("/files/verify-hidden-pin", methods=["POST"])
def verify_hidden_pin():
    pin = request.headers.get("X-Hidden-Pin", "")
    if pin != current_app.config["HIDDEN_FILES_PIN"]:
        return jsonify({"error": "Invalid PIN"}), 403
    return jsonify({"valid": True}), 200


@api_bp.route("/files/unhide", methods=["POST"])
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


@api_bp.route("/duplicates", methods=["GET"])
def list_duplicates():
    type_ = request.args.get("type", "exact")
    if type_ == "exact":
        hashes = (
            db.session.query(FileMetadata.file_hash, db.func.count(FileMetadata.id))
            .join(ImportedFile, FileMetadata.file_id == ImportedFile.id)
            .filter(
                ImportedFile.deleted != True,
                FileMetadata.file_hash.isnot(None),
            )
            .group_by(FileMetadata.file_hash)
            .having(db.func.count(FileMetadata.id) > 1)
            .all()
        )
        groups = []
        for h, cnt in hashes:
            metas = (
                FileMetadata.query.filter_by(file_hash=h)
                .join(ImportedFile)
                .filter(ImportedFile.deleted != True, ImportedFile.is_hidden != True)
                .order_by(ImportedFile.filename)
                .all()
            )
            group = []
            for m in metas:
                f = m.file
                if f.deleted or f.is_hidden:
                    continue
                group.append({
                    "file_id": f.id,
                    "filename": f.filename,
                    "relative_path": f.relative_path,
                    "size": f.size,
                    "mime_type": f.mime_type,
                    "file_hash": m.file_hash,
                    "thumbnail": m.thumbnail,
                })
            groups.append({"hash": h, "count": cnt, "files": group})
        return jsonify({"groups": groups}), 200

    if type_ == "near":
        THRESHOLD = 10
        near_meta = FileMetadata.query.join(
            ImportedFile, FileMetadata.file_id == ImportedFile.id
        ).filter(
            ImportedFile.deleted != True,
            ImportedFile.is_hidden != True,
            FileMetadata.dhash.isnot(None),
        ).all()
        pairs = []
        seen = set()
        for i, m1 in enumerate(near_meta):
            bands1 = {b.band_index: b.band_value for b in m1.dhash_bands}
            for j, m2 in enumerate(near_meta):
                if i >= j:
                    continue
                key = tuple(sorted([m1.file_id, m2.file_id]))
                if key in seen:
                    continue
                bands2 = {b.band_index: b.band_value for b in m2.dhash_bands}
                matches = sum(
                    1 for bi in range(4)
                    if bands1.get(bi) == bands2.get(bi)
                )
                if matches >= 3:
                    dist = hamming_distance(m1.dhash, m2.dhash)
                    if dist <= THRESHOLD:
                        seen.add(key)
                        pairs.append({
                            "distance": dist,
                            "file_a": {
                                "file_id": m1.file_id,
                                "filename": m1.file.filename,
                                "relative_path": m1.file.relative_path,
                                "size": m1.file.size,
                                "mime_type": m1.file.mime_type,
                                "thumbnail": m1.thumbnail,
                            },
                            "file_b": {
                                "file_id": m2.file_id,
                                "filename": m2.file.filename,
                                "relative_path": m2.file.relative_path,
                                "size": m2.file.size,
                                "mime_type": m2.file.mime_type,
                                "thumbnail": m2.thumbnail,
                            },
                        })
        pairs.sort(key=lambda p: p["distance"])
        return jsonify({"pairs": pairs}), 200

    return jsonify({"error": "Invalid type"}), 400


@api_bp.route("/files/<int:file_id>/near-duplicates", methods=["GET"])
def get_near_duplicates(file_id):
    meta = FileMetadata.query.filter_by(file_id=file_id).first()
    if not meta or not meta.dhash:
        return jsonify({"error": "No dhash available"}), 404

    THRESHOLD = 10
    bands = {b.band_index: b.band_value for b in meta.dhash_bands}

    candidate_ids = set()
    for bi in range(4):
        matching = DHashBand.query.filter_by(
            band_index=bi, band_value=bands[bi]
        ).all()
        for m in matching:
            if m.metadata_id != meta.id:
                candidate_ids.add(m.metadata_id)

    results = []
    for mid in candidate_ids:
        other = db.session.get(FileMetadata, mid)
        if not other or not other.dhash:
            continue
        dist = hamming_distance(meta.dhash, other.dhash)
        if dist <= THRESHOLD:
            results.append({
                "distance": dist,
                "file_id": other.file_id,
                "filename": other.file.filename,
                "thumbnail": other.thumbnail,
            })

    results.sort(key=lambda r: r["distance"])
    return jsonify({"duplicates": results}), 200


@api_bp.route("/favorites", methods=["GET"])
def list_favorites():
    files = ImportedFile.query.filter(
        ImportedFile.deleted != True,
        ImportedFile.is_hidden != True,
        ImportedFile.is_favorite == True,
    ).order_by(ImportedFile.filename).all()
    return jsonify([f.to_dict() for f in files]), 200


@api_bp.route("/files/<int:file_id>/thumbnail", methods=["GET"])
def get_file_thumbnail(file_id):
    meta = FileMetadata.query.filter_by(file_id=file_id).first()
    if not meta or not meta.thumbnail:
        return jsonify({"error": "Thumbnail not available"}), 404
    header, _, b64data = meta.thumbnail.partition(",")
    return jsonify({
        "thumbnail": meta.thumbnail,
        "thumbnail_status": meta.thumbnail_status,
    }), 200


@api_bp.route("/files/<int:file_id>/regenerate-ai", methods=["POST"])
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


@api_bp.route("/files/<int:file_id>/regenerate-exif", methods=["POST"])
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


@api_bp.route("/files/<int:file_id>/regenerate-thumbnail", methods=["POST"])
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


def _adjust_highlights_shadows(img, mode, amount):
    if amount == 0:
        return img
    img = img.convert("RGB")
    r, g, b = img.split()
    factor = amount / 100.0
    def curve(v):
        if mode == "highlights":
            return min(255, max(0, int(v + (255 - v) * factor)))
        return min(255, max(0, int(v - v * factor)))
    lut = [curve(i) for i in range(256)]
    r = r.point(lut)
    g = g.point(lut)
    b = b.point(lut)
    return Image.merge("RGB", (r, g, b))

def _adjust_warmth(img, amount):
    if amount == 0:
        return img
    img = img.convert("RGB")
    r, g, b = img.split()
    f = amount / 100.0
    r_lut = [min(255, max(0, int(i + i * f * 0.15))) for i in range(256)]
    b_lut = [min(255, max(0, int(i - i * f * 0.15))) for i in range(256)]
    r = r.point(r_lut)
    b = b.point(b_lut)
    return Image.merge("RGB", (r, g, b))

def _apply_vignette(img, amount):
    if amount <= 0:
        return img
    w, h = img.size
    cx, cy = w // 2, h // 2
    max_dist = ((cx ** 2 + cy ** 2) ** 0.5) or 1
    intensity = amount / 100.0 * 0.6
    r, g, b = img.split()
    def vignette_px(dist):
        fac = 1.0 - (dist / max_dist) * intensity
        if fac < 0: fac = 0
        return fac
    r_vals = []
    g_vals = []
    b_vals = []
    r_data = list(r.getdata())
    g_data = list(g.getdata())
    b_data = list(b.getdata())
    idx = 0
    for y in range(h):
        for x in range(w):
            dist = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            fac = vignette_px(dist)
            r_vals.append(min(255, max(0, int(r_data[idx] * fac))))
            g_vals.append(min(255, max(0, int(g_data[idx] * fac))))
            b_vals.append(min(255, max(0, int(b_data[idx] * fac))))
            idx += 1
    r.putdata(r_vals)
    g.putdata(g_vals)
    b.putdata(b_vals)
    return Image.merge("RGB", (r, g, b))

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


def _apply_filter_preset(img, name):
    presets = {
        "vivid": lambda i: ImageEnhance.Contrast(ImageEnhance.Color(i).enhance(1.4)).enhance(1.25),
        "dramatic": lambda i: ImageEnhance.Contrast(i).enhance(1.6),
        "vintage": lambda i: _adjust_warmth(ImageEnhance.Color(i).enhance(0.7), 25),
        "noir": lambda i: ImageEnhance.Contrast(i.convert("L").convert("RGB")).enhance(1.3),
        "soft": lambda i: ImageEnhance.Brightness(i).enhance(1.1),
        "clarity": lambda i: ImageEnhance.Sharpness(ImageEnhance.Contrast(i).enhance(1.15)).enhance(1.3),
        "warm": lambda i: _adjust_warmth(i, 40),
        "cool": lambda i: _adjust_warmth(i, -40),
    }
    fn = presets.get(name)
    if fn:
        return fn(img)
    return img


def _adjust_tint(img, amount):
    if amount == 0:
        return img
    img = img.convert("RGB")
    r, g, b = img.split()
    f = amount / 100.0
    g_lut = [min(255, max(0, int(i - i * f * 0.08))) for i in range(256)]
    b_lut = [min(255, max(0, int(i + i * f * 0.12))) for i in range(256)]
    g = g.point(g_lut)
    b = b.point(b_lut)
    return Image.merge("RGB", (r, g, b))

def _adjust_vibrance(img, amount):
    if amount == 1.0:
        return img
    img = img.convert("RGB")
    r, g, b = img.split()
    r_data = list(r.getdata())
    g_data = list(g.getdata())
    b_data = list(b.getdata())
    out_r, out_g, out_b = [], [], []
    for i in range(len(r_data)):
        max_c = max(r_data[i], g_data[i], b_data[i])
        min_c = min(r_data[i], g_data[i], b_data[i])
        sat = (max_c - min_c) / 255.0
        boost = 1.0 + (amount - 1.0) * (1.0 - sat)
        out_r.append(min(255, max(0, int(r_data[i] * boost))))
        out_g.append(min(255, max(0, int(g_data[i] * boost))))
        out_b.append(min(255, max(0, int(b_data[i] * boost))))
    r.putdata(out_r)
    g.putdata(out_g)
    b.putdata(out_b)
    return Image.merge("RGB", (r, g, b))

def _adjust_clarity(img, amount):
    if amount == 1.0:
        return img
    img = img.convert("RGB")
    r, g, b = img.split()
    fac = (amount - 1.0) * 0.5 + 1.0
    lut = [min(255, max(0, int(128 + (i - 128) * fac))) for i in range(256)]
    r = r.point(lut)
    g = g.point(lut)
    b = b.point(lut)
    return Image.merge("RGB", (r, g, b))

def _adjust_dehaze(img, amount):
    if amount == 0:
        return img
    img = img.convert("RGB")
    f = amount / 100.0 * 0.5
    enh = ImageEnhance.Contrast(img)
    img = enh.enhance(1.0 + f)
    r, g, b = img.split()
    lut = [min(255, max(0, int(i + (255 - i) * f * 0.3))) for i in range(256)]
    r = r.point(lut)
    g = g.point(lut)
    b = b.point(lut)
    return Image.merge("RGB", (r, g, b))

def _adjust_exposure(img, amount):
    if amount == 0:
        return img
    f = (100.0 + amount) / 100.0
    return ImageEnhance.Brightness(img).enhance(f)

def _adjust_blacks(img, amount):
    if amount == 0:
        return img
    img = img.convert("RGB")
    r, g, b = img.split()
    f = amount / 100.0
    def blacks_curve(v):
        return min(255, max(0, int(v - v * f * 0.5)))
    lut = [blacks_curve(i) for i in range(256)]
    r = r.point(lut)
    g = g.point(lut)
    b = b.point(lut)
    return Image.merge("RGB", (r, g, b))

def _adjust_whites(img, amount):
    if amount == 0:
        return img
    img = img.convert("RGB")
    r, g, b = img.split()
    f = amount / 100.0
    def whites_curve(v):
        return min(255, max(0, int(v + (255 - v) * f * 0.5)))
    lut = [whites_curve(i) for i in range(256)]
    r = r.point(lut)
    g = g.point(lut)
    b = b.point(lut)
    return Image.merge("RGB", (r, g, b))

def _apply_grain(img, amount):
    if amount <= 0:
        return img
    img = img.convert("RGB")
    w, h = img.size
    intensity = amount / 100.0 * 30
    pixels = img.load()
    for y in range(h):
        for x in range(w):
            noise = random.randint(-intensity, intensity)
            r = min(255, max(0, pixels[x, y][0] + noise))
            g = min(255, max(0, pixels[x, y][1] + noise))
            b = min(255, max(0, pixels[x, y][2] + noise))
            pixels[x, y] = (r, g, b)
    return img

def _apply_colorize(img, amount):
    if amount <= 0:
        return img
    img = img.convert("RGB")
    r, g, b = img.split()
    f = amount / 100.0 * 0.4
    r_lut = [min(255, max(0, int(i + (255 - i) * f))) for i in range(256)]
    b_lut = [min(255, max(0, int(i + i * f))) for i in range(256)]
    r = r.point(r_lut)
    b = b.point(b_lut)
    return Image.merge("RGB", (r, g, b))

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


@api_bp.route("/files/<int:file_id>/edit", methods=["POST"])
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


@api_bp.route("/files/<int:file_id>", methods=["GET"])
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


@api_bp.route("/files/<int:file_id>/serve", methods=["GET"])
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

    return send_file(
        file_record.file_path,
        mimetype=file_record.mime_type,
        as_attachment=False,
        conditional=True,
    )


@api_bp.route("/files/<int:file_id>/download", methods=["GET"])
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


@api_bp.route("/files/<int:file_id>", methods=["DELETE"])
def delete_file(file_id):
    data = request.get_json(silent=True) or {}
    delete_storage = data.get("delete_storage", False)

    file_record = db.session.get(ImportedFile, file_id)
    if not file_record:
        return jsonify({"error": "File not found"}), 404

    file_path = file_record.file_path

    meta = FileMetadata.query.filter_by(file_id=file_id).first()
    if meta:
        DHashBand.query.filter_by(metadata_id=meta.id).delete()
        db.session.delete(meta)

    DetectedFace.query.filter_by(file_id=file_id).delete()
    files_deleted_total.inc()
    session = ImportSession.query.get(file_record.session_id)
    db.session.delete(file_record)
    if session:
        session.total_files = max(0, (session.total_files or 0) - 1)

    db.session.commit()

    if delete_storage and os.path.isfile(file_path):
        try:
            os.remove(file_path)
        except OSError:
            pass

    from app.metrics import update_library_stats
    update_library_stats()

    return jsonify({"message": "File deleted"}), 200


ALLOWED_UPLOAD_MIMES = {
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "image/bmp", "image/tiff", "image/avif", "image/heic", "image/heif",
    "video/mp4", "video/x-matroska", "video/webm",
    "video/x-msvideo", "video/quicktime", "video/x-flv",
    "video/x-ms-wmv", "video/ogg",
}


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


def _ensure_upload_subdir(session, subdir_path):
    if not subdir_path:
        return ImportedDirectory.query.filter_by(
            session_id=session.id, path=""
        ).first()
    parts = subdir_path.strip("/").split("/")
    parent_path = ""
    parent_dir = None
    for i, part in enumerate(parts):
        current_path = "/".join(parts[:i+1])
        dir_entry = ImportedDirectory.query.filter_by(
            session_id=session.id, path=current_path
        ).first()
        if not dir_entry:
            dir_entry = ImportedDirectory(
                session_id=session.id,
                path=current_path,
                name=part,
                parent_path=parent_path,
            )
            db.session.add(dir_entry)
            db.session.flush()
        parent_path = current_path
        parent_dir = dir_entry
    return parent_dir


@api_bp.route("/upload/directories", methods=["GET"])
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


@api_bp.route("/upload/directories", methods=["POST"])
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


@api_bp.route("/upload", methods=["POST"])
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
    errors = []
    face_batch = []

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
        uploads_total.inc()
        upload_bytes_total.inc(stat.st_size)
        rel_path = os.path.join(subdir, safe) if subdir else safe

        file_record = ImportedFile(
            session_id=session.id,
            directory_id=parent_dir.id,
            filename=safe,
            file_path=save_path,
            relative_path=rel_path,
            mime_type=mime,
            nickname=nickname,
            size=stat.st_size,
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

    if face_batch:
        detect_faces.delay(face_batch)

    if saved:
        from app.metrics import update_library_stats
        update_library_stats()

    return jsonify({"saved": saved, "errors": errors}), 201


@api_bp.route("/upload/files/delete", methods=["POST"])
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


@api_bp.route("/upload/directories/delete", methods=["POST"])
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


@api_bp.route("/upload/move", methods=["POST"])
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


@api_bp.route("/upload/copy", methods=["POST"])
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


@api_bp.route("/upload/rename", methods=["POST"])
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


@api_bp.route("/upload/files/recent", methods=["GET"])
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


@api_bp.route("/upload/nicknames", methods=["GET"])
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


@api_bp.route("/tags", methods=["GET"])
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


@api_bp.route("/stats", methods=["GET"])
def get_statistics():
    total_files = ImportedFile.query.filter(ImportedFile.deleted != True, ImportedFile.is_hidden != True).count()
    total_favorites = ImportedFile.query.filter(
        ImportedFile.deleted != True, ImportedFile.is_favorite == True
    ).count()
    total_metadata = FileMetadata.query.count()

    image_count = ImportedFile.query.filter(
        ImportedFile.deleted != True,
        ImportedFile.mime_type.like("image/%"),
    ).count()
    video_count = ImportedFile.query.filter(
        ImportedFile.deleted != True,
        ImportedFile.mime_type.like("video/%"),
    ).count()
    audio_count = ImportedFile.query.filter(
        ImportedFile.deleted != True,
        ImportedFile.mime_type.like("audio/%"),
    ).count()
    document_count = ImportedFile.query.filter(
        ImportedFile.deleted != True,
        ImportedFile.mime_type.notlike("image/%"),
        ImportedFile.mime_type.notlike("video/%"),
        ImportedFile.mime_type.notlike("audio/%"),
    ).count()

    total_size = db.session.query(db.func.sum(ImportedFile.size)).filter(
        ImportedFile.deleted != True
    ).scalar() or 0

    statuses = (
        db.session.query(
            FileMetadata.metadata_status, db.func.count(FileMetadata.id)
        )
        .group_by(FileMetadata.metadata_status)
        .all()
    )

    thumbnail_statuses = (
        db.session.query(
            FileMetadata.thumbnail_status, db.func.count(FileMetadata.id)
        )
        .group_by(FileMetadata.thumbnail_status)
        .all()
    )

    date_counts = (
        db.session.query(
            db.func.date(ImportedFile.created_at).label("date"),
            ImportedFile.mime_type,
            db.func.count(ImportedFile.id),
        )
        .filter(ImportedFile.created_at.isnot(None), ImportedFile.deleted != True)
        .group_by(db.func.date(ImportedFile.created_at), ImportedFile.mime_type)
        .order_by(db.func.date(ImportedFile.created_at).desc())
        .all()
    )

    date_rows = {}
    for d, mt, cnt in date_counts:
        d_str = str(d)
        if d_str not in date_rows:
            date_rows[d_str] = {"date": d_str, "image": 0, "video": 0}
        if mt and mt.startswith("image/"):
            date_rows[d_str]["image"] += cnt
        elif mt and mt.startswith("video/"):
            date_rows[d_str]["video"] += cnt
        else:
            date_rows[d_str]["other"] = date_rows[d_str].get("other", 0) + cnt
    files_by_date = list(date_rows.values())
    files_by_date.sort(key=lambda x: x["date"])

    tags_raw = []
    all_metas = FileMetadata.query.filter(
        FileMetadata.tags.isnot(None)
    ).with_entities(FileMetadata.tags).all()
    for (tags,) in all_metas:
        if tags and isinstance(tags, list):
            tags_raw.extend(tags)

    tag_freq = {}
    for t in tags_raw:
        t = t.strip().lower()
        if t:
            tag_freq[t] = tag_freq.get(t, 0) + 1
    top_tags = sorted(tag_freq.items(), key=lambda x: -x[1])[:20]

    files_with_gps = FileMetadata.query.filter(
        FileMetadata.latitude.isnot(None),
        FileMetadata.longitude.isnot(None),
    ).count()

    files_with_exif = FileMetadata.query.filter(
        FileMetadata.exif.isnot(None),
    ).count()

    files_with_description = FileMetadata.query.filter(
        FileMetadata.description.isnot(None),
        FileMetadata.description != "",
    ).count()

    files_with_nickname = ImportedFile.query.filter(
        ImportedFile.deleted != True,
        ImportedFile.nickname.isnot(None),
        ImportedFile.nickname != "",
    ).count()

    mime_detail = (
        db.session.query(
            ImportedFile.mime_type, db.func.count(ImportedFile.id)
        )
        .filter(ImportedFile.deleted != True)
        .group_by(ImportedFile.mime_type)
        .order_by(db.func.count(ImportedFile.id).desc())
        .all()
    )

    tag_count_dist = {}
    for (tags,) in all_metas:
        cnt = len(tags) if tags else 0
        tag_count_dist[cnt] = tag_count_dist.get(cnt, 0) + 1
    tag_count_buckets = sorted(tag_count_dist.items())

    dim_ranges = {"< 1 MP": 0, "1-5 MP": 0, "5-10 MP": 0, "10+ MP": 0, "unknown": 0}
    dim_metas = FileMetadata.query.with_entities(
        FileMetadata.width, FileMetadata.height
    ).all()
    for w, h in dim_metas:
        if w and h:
            mp = (w * h) / 1_000_000
            if mp < 1:
                dim_ranges["< 1 MP"] += 1
            elif mp < 5:
                dim_ranges["1-5 MP"] += 1
            elif mp < 10:
                dim_ranges["5-10 MP"] += 1
            else:
                dim_ranges["10+ MP"] += 1
        else:
            dim_ranges["unknown"] += 1

    size_dist = {"< 1 MB": 0, "1-10 MB": 0, "10-100 MB": 0, "100 MB+": 0}
    size_data = ImportedFile.query.filter(
        ImportedFile.deleted != True
    ).with_entities(ImportedFile.size).all()
    for (s,) in size_data:
        if s is None:
            continue
        mb = s / 1_048_576
        if mb < 1:
            size_dist["< 1 MB"] += 1
        elif mb < 10:
            size_dist["1-10 MB"] += 1
        elif mb < 100:
            size_dist["10-100 MB"] += 1
        else:
            size_dist["100 MB+"] += 1

    total_sessions = ImportSession.query.count()
    session_dates = (
        db.session.query(
            db.func.date(ImportSession.created_at).label("date"),
            db.func.count(ImportSession.id),
        )
        .group_by(db.func.date(ImportSession.created_at))
        .order_by(db.func.date(ImportSession.created_at).desc())
        .all()
    )

    from app.models.detected_face import DetectedFace
    from app.models.person import Person
    total_persons = Person.query.count()
    total_faces = DetectedFace.query.count()
    named_persons = Person.query.filter(Person.name.isnot(None)).count()
    files_with_faces = db.session.query(DetectedFace.file_id).distinct().count()
    age_data = DetectedFace.query.with_entities(DetectedFace.age).filter(
        DetectedFace.age.isnot(None)
    ).all()
    ages = [r[0] for r in age_data]
    avg_age = round(sum(ages) / len(ages), 1) if ages else None
    gender_data = db.session.query(
        DetectedFace.gender, db.func.count(DetectedFace.id)
    ).filter(DetectedFace.gender.isnot(None)).group_by(DetectedFace.gender).all()
    gender_map = {}
    for g, c in gender_data:
        gender_map["female" if g == 0 else "male"] = c

    def fmt(s):
        if s < 1024:
            return f"{s} B"
        if s < 1048576:
            return f"{s / 1024:.1f} KB"
        if s < 1073741824:
            return f"{s / 1048576:.1f} MB"
        return f"{s / 1073741824:.2f} GB"

    return jsonify({
        "overview": {
            "total_files": total_files,
            "total_favorites": total_favorites,
            "total_metadata": total_metadata,
            "total_size": total_size,
            "total_size_formatted": fmt(total_size),
        },
        "mime_breakdown": {
            "image": image_count,
            "video": video_count,
            "audio": audio_count,
            "document": document_count,
        },
        "mime_detail": [
            {"mime": m, "count": c} for m, c in mime_detail
        ],
        "metadata_status": [
            {"status": s, "count": c} for s, c in statuses
        ],
        "thumbnail_status": [
            {"status": s, "count": c} for s, c in thumbnail_statuses
        ],
        "files_by_date": files_by_date,
        "top_tags": [
            {"tag": t, "count": c} for t, c in top_tags
        ],
        "tag_count_distribution": [
            {"tag_count": k, "file_count": v} for k, v in tag_count_buckets
        ],
        "dimension_ranges": dim_ranges,
        "size_distribution": [
            {"range": k, "count": v} for k, v in size_dist.items()
        ],
        "coverage": {
            "files_with_gps": files_with_gps,
            "files_with_exif": files_with_exif,
            "files_with_description": files_with_description,
            "files_with_nickname": files_with_nickname,
        },
        "sessions": {
            "total_sessions": total_sessions,
            "sessions_by_date": [
                {"date": str(d), "count": c} for d, c in session_dates
            ],
        },
        "faces": {
            "total_persons": total_persons,
            "total_faces": total_faces,
            "named_persons": named_persons,
            "files_with_faces": files_with_faces,
            "average_age": avg_age,
            "gender_breakdown": gender_map,
        },
    })


@api_bp.route("/filters", methods=["GET"])
def list_filters():
    presets = FilterPreset.query.order_by(FilterPreset.name).all()
    return jsonify([p.to_dict() for p in presets]), 200


@api_bp.route("/filters", methods=["POST"])
def create_filter():
    data = request.get_json(silent=True) or {}
    name = data.get("name", "").strip()
    operations = data.get("operations", [])
    file_id = data.get("file_id")

    if not name:
        return jsonify({"error": "Name is required"}), 400
    if not operations:
        return jsonify({"error": "At least one operation is required"}), 400

    existing = FilterPreset.query.filter_by(name=name).first()
    if existing:
        existing.operations = operations
        existing.file_id = file_id
        db.session.commit()
        return jsonify(existing.to_dict()), 200

    preset = FilterPreset(name=name, operations=operations, file_id=file_id)
    db.session.add(preset)
    db.session.commit()
    return jsonify(preset.to_dict()), 201


@api_bp.route("/filters/<int:filter_id>", methods=["DELETE"])
def delete_filter(filter_id):
    preset = db.session.get(FilterPreset, filter_id)
    if not preset:
        return jsonify({"error": "Filter not found"}), 404
    db.session.delete(preset)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200


@api_bp.route("/files/with-gps", methods=["GET"])
def list_files_with_gps():
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 200, type=int)
    per_page = min(per_page, 1000)

    query = ImportedFile.query.join(
        FileMetadata, ImportedFile.id == FileMetadata.file_id
    ).options(
        db.contains_eager(ImportedFile.metadata)
    ).filter(
        ImportedFile.deleted != True,
        ImportedFile.is_hidden != True,
        FileMetadata.latitude.isnot(None),
        FileMetadata.longitude.isnot(None),
    ).order_by(ImportedFile.created_at.desc())

    pag = query.paginate(page=page, per_page=per_page, error_out=False)
    items = []
    for f in pag.items:
        items.append({
            "id": f.id,
            "filename": f.filename,
            "latitude": f.metadata.latitude,
            "longitude": f.metadata.longitude,
            "thumbnail": f.metadata.thumbnail if f.metadata else None,
            "thumbnail_status": f.metadata.thumbnail_status if f.metadata else None,
            "mime_type": f.mime_type,
            "created_at": f.created_at.isoformat() if f.created_at else None,
        })
    return jsonify({
        "files": items,
        "total": pag.total,
        "page": pag.page,
        "per_page": pag.per_page,
        "pages": pag.pages,
    }), 200


@api_bp.route("/locations", methods=["GET"])
def list_locations():
    locations = SavedLocation.query.order_by(SavedLocation.name).all()
    result = []
    for loc in locations:
        d = loc.to_dict()
        d["file_count"] = FileMetadata.query.filter(
            FileMetadata.latitude.isnot(None),
            FileMetadata.longitude.isnot(None),
            FileMetadata.latitude.between(loc.latitude - loc.radius, loc.latitude + loc.radius),
            FileMetadata.longitude.between(loc.longitude - loc.radius, loc.longitude + loc.radius),
        ).count()
        result.append(d)
    return jsonify(result), 200


@api_bp.route("/locations", methods=["POST"])
def create_location():
    data = request.get_json()
    if not data or not data.get("name"):
        return jsonify({"error": "Name is required"}), 400
    loc = SavedLocation(
        name=data["name"],
        latitude=data.get("latitude"),
        longitude=data.get("longitude"),
        radius=data.get("radius", 0.09),
    )
    if loc.latitude is None or loc.longitude is None:
        return jsonify({"error": "Latitude and longitude are required"}), 400
    db.session.add(loc)
    db.session.commit()
    return jsonify(loc.to_dict()), 201


@api_bp.route("/locations/<int:loc_id>", methods=["PUT"])
def update_location(loc_id):
    loc = db.session.get(SavedLocation, loc_id)
    if not loc:
        return jsonify({"error": "Location not found"}), 404
    data = request.get_json()
    if data.get("name") is not None:
        loc.name = data["name"]
    if data.get("latitude") is not None:
        loc.latitude = data["latitude"]
    if data.get("longitude") is not None:
        loc.longitude = data["longitude"]
    if data.get("radius") is not None:
        loc.radius = data["radius"]
    db.session.commit()
    return jsonify(loc.to_dict()), 200


@api_bp.route("/locations/<int:loc_id>", methods=["DELETE"])
def delete_location(loc_id):
    loc = db.session.get(SavedLocation, loc_id)
    if not loc:
        return jsonify({"error": "Location not found"}), 404
    db.session.delete(loc)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200


@api_bp.route("/files/<int:file_id>/export", methods=["POST"])
def export_file(file_id):
    data = request.get_json(silent=True) or {}
    operations = data.get("operations", [])
    fmt = data.get("format", "jpeg")
    quality = data.get("quality", 95)

    file_record = db.session.get(ImportedFile, file_id)
    if not file_record:
        return jsonify({"error": "File not found"}), 404
    if not os.path.isfile(file_record.file_path):
        return jsonify({"error": "Original file no longer exists"}), 404

    img = Image.open(file_record.file_path)

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
            img = ImageEnhance.Brightness(img).enhance(op.get("value", 1.0))
        elif op_type == "contrast":
            img = ImageEnhance.Contrast(img).enhance(op.get("value", 1.0))
        elif op_type == "saturation":
            img = ImageEnhance.Color(img).enhance(op.get("value", 1.0))
        elif op_type == "sharpness":
            img = ImageEnhance.Sharpness(img).enhance(op.get("value", 1.0))
        elif op_type == "highlights":
            img = _adjust_highlights_shadows(img, "highlights", op.get("value", 0))
        elif op_type == "shadows":
            img = _adjust_highlights_shadows(img, "shadows", op.get("value", 0))
        elif op_type == "warmth":
            img = _adjust_warmth(img, op.get("value", 0))
        elif op_type == "vignette":
            img = _apply_vignette(img, op.get("value", 0))
        elif op_type == "tint":
            img = _adjust_tint(img, op.get("value", 0))
        elif op_type == "vibrance":
            img = _adjust_vibrance(img, op.get("value", 1.0))
        elif op_type == "clarity":
            img = _adjust_clarity(img, op.get("value", 1.0))
        elif op_type == "dehaze":
            img = _adjust_dehaze(img, op.get("value", 0))
        elif op_type == "exposure":
            img = _adjust_exposure(img, op.get("value", 0))
        elif op_type == "blacks":
            img = _adjust_blacks(img, op.get("value", 0))
        elif op_type == "whites":
            img = _adjust_whites(img, op.get("value", 0))
        elif op_type == "grain":
            img = _apply_grain(img, op.get("value", 0))
        elif op_type == "colorize":
            img = _apply_colorize(img, op.get("value", 0))
        elif op_type == "filter":
            img = _apply_filter_preset(img, op.get("name", ""))
        elif op_type == "crop":
            x = int(op.get("x", 0) * img.width)
            y = int(op.get("y", 0) * img.height)
            w = int(op.get("width", 1) * img.width)
            h = int(op.get("height", 1) * img.height)
            img = img.crop((x, y, x + w, y + h))

    if fmt == "ascii":
        chars = data.get("ascii_chars", "@%#*+=-:. ")
        w_out = int(data.get("ascii_width", 120))
        img_small = img.convert("L").resize((w_out, int(w_out * img.height / img.width * 0.55)))
        pixels = list(img_small.getdata())
        ascii_str = "\n".join(
            "".join(chars[min(p // (256 // len(chars)), len(chars) - 1)] for p in pixels[i:i + w_out])
            for i in range(0, len(pixels), w_out)
        )
        buf = io.BytesIO(ascii_str.encode("utf-8"))
        buf.seek(0)
        return send_file(buf, mimetype="text/plain", as_attachment=True, download_name=f"{os.path.splitext(file_record.filename)[0]}_ascii.txt")

    fmt_map = {"jpeg": "JPEG", "png": "PNG", "webp": "WebP", "heic": "HEIF", "pdf": "PDF"}
    pil_fmt = fmt_map.get(fmt, "JPEG")

    if pil_fmt == "JPEG":
        img = img.convert("RGB")

    files_exported_total.labels(format=fmt).inc()

    save_kwargs = {"format": pil_fmt}
    if pil_fmt in ("JPEG", "WebP"):
        save_kwargs["quality"] = quality

    buf = io.BytesIO()
    img.save(buf, **save_kwargs)
    buf.seek(0)

    ext_map = {"jpeg": ".jpg", "png": ".png", "webp": ".webp", "heic": ".heic", "pdf": ".pdf"}
    ext = ext_map.get(fmt, ".jpg")

    return send_file(buf, mimetype=f"image/{fmt}" if fmt != "pdf" else "application/pdf",
                     as_attachment=True, download_name=f"{os.path.splitext(file_record.filename)[0]}_export{ext}")


_geocode_last_call = 0

_redis_client = None
def _get_redis():
    global _redis_client
    if _redis_client is None:
        import redis as _redis_mod
        _redis_client = _redis_mod.from_url(config.CELERY_BROKER_URL)
    return _redis_client

@api_bp.route("/geocode/reverse", methods=["GET"])
def reverse_geocode():
    if request.headers.get("X-Airplane-Mode") == "1":
        return jsonify({"error": "Airplane mode is enabled, external calls blocked"}), 503
    lat = request.args.get("lat")
    lng = request.args.get("lng")
    if not lat or not lng:
        return jsonify({"error": "lat and lng parameters are required"}), 400

    cache_key = f"geocode:{float(lat):.4f},{float(lng):.4f}"
    try:
        r = _get_redis()
        cached = r.get(cache_key)
        if cached:
            geocode_requests_total.labels(cache="hit").inc()
            return jsonify(json.loads(cached))
    except Exception:
        pass
    geocode_requests_total.labels(cache="miss").inc()

    global _geocode_last_call
    now = time.time()
    elapsed = now - _geocode_last_call
    if elapsed < 1.0:
        time.sleep(1.0 - elapsed)
    _geocode_last_call = time.time()

    url = f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lng}&format=json&zoom=12&accept-language=en"
    req = urllib.request.Request(url, headers={"User-Agent": "MediaServer/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            display_name = data.get("display_name") or data.get("name") or ""
            if display_name:
                result = {"display_name": display_name}
            else:
                result = {"error": "No location found"}
    except Exception as e:
        result = {"error": str(e)}

    try:
        r = _get_redis()
        r.set(cache_key, json.dumps(result))
    except Exception:
        pass

    return jsonify(result)


@api_bp.route("/files/<int:file_id>/export-video", methods=["POST"])
def export_video(file_id):
    from app.utility.video_utility import edit_video

    data = request.get_json(silent=True) or {}
    operations = data.get("operations", [])
    fmt = data.get("format", "mp4")

    file_record = db.session.get(ImportedFile, file_id)
    if not file_record:
        return jsonify({"error": "File not found"}), 404
    if not os.path.isfile(file_record.file_path):
        return jsonify({"error": "Original file no longer exists"}), 404

    import tempfile
    import mimetypes

    fmt_map = {
        "mp4": (".mp4", "video/mp4", ["-c:v", "libx264", "-preset", "medium", "-crf", "23", "-c:a", "aac"]),
        "webm": (".webm", "video/webm", ["-c:v", "libvpx", "-crf", "10", "-b:v", "1M", "-c:a", "libvorbis"]),
        "avi": (".avi", "video/x-msvideo", ["-c:v", "libx264", "-preset", "medium", "-crf", "23", "-c:a", "aac"]),
        "mkv": (".mkv", "video/x-matroska", ["-c:v", "libx264", "-preset", "medium", "-crf", "23", "-c:a", "aac"]),
        "mov": (".mov", "video/quicktime", ["-c:v", "libx264", "-preset", "medium", "-crf", "23", "-c:a", "aac"]),
    }
    if fmt not in fmt_map:
        return jsonify({"error": f"Unsupported format: {fmt}"}), 400

    files_exported_total.labels(format=fmt).inc()

    ext, mime, codec_args = fmt_map[fmt]
    tmp = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
    try:
        tmp.close()
        edit_video(file_record.file_path, tmp.name, operations, codec_args=codec_args)
        return send_file(tmp.name, mimetype=mime, as_attachment=True,
                         download_name=f"{os.path.splitext(file_record.filename)[0]}_export{ext}")
    finally:
        try:
            os.unlink(tmp.name)
        except Exception:
            pass


# ──────────────────────────────────────────────
# Media Explorer endpoints (unified browse + ops)
# ──────────────────────────────────────────────

@api_bp.route("/explorer/browse", methods=["GET"])
def explorer_browse():
    prefix = request.args.get("prefix", "").strip().strip("/")
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 100, type=int)
    per_page = min(per_page, 500)
    upload_dir = current_app.config["UPLOAD_DIR"]

    upload_session = ImportSession.query.filter_by(root_path=upload_dir).first()
    upload_session_id = upload_session.id if upload_session else -1

    # Detect if browsing a synthetic session directory (e.g. edited-images)
    synthetic_session_id = None
    browse_prefix = prefix
    if prefix.startswith("__session_"):
        try:
            synthetic_session_id = int(prefix.split("_")[2])
            browse_prefix = ""
        except (ValueError, IndexError):
            pass

    # Directories — use parent_path for strict hierarchy
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

    # Files — use directory_id FK for strict hierarchy
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

    # Filesystem upload dirs (not yet imported) — only when browsing normally
    upload_dirs = []
    if synthetic_session_id is None:
        scan_dir = os.path.join(upload_dir, browse_prefix) if browse_prefix else upload_dir
        if os.path.isdir(scan_dir):
            for entry in sorted(os.listdir(scan_dir)):
                full = os.path.join(scan_dir, entry)
                if os.path.isdir(full):
                    upload_dirs.append({
                        "name": entry,
                        "path": os.path.join(browse_prefix, entry) if browse_prefix else entry,
                        "session_id": upload_session_id,
                        "is_upload": True,
                    })

    # Build directory result
    dir_result = []
    seen_paths = set()
    for d in db_dirs:
        if d.path not in seen_paths:
            seen_paths.add(d.path)
            dir_result.append({
                "name": d.name,
                "path": d.path,
                "session_id": d.session_id,
                "is_upload": False,
            })

    # Synthetic directories at root level for sessions with root-only files
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
                dir_result.append({
                    "name": dir_basename,
                    "path": f"__session_{s.id}__",
                    "session_id": s.id,
                    "is_upload": False,
                })

        # Edited-images folder
        if edited_session:
            edited_name = os.path.basename(edited_dir.rstrip("/"))
            edited_key = f"__session_{edited_session.id}__"
            if edited_key not in seen_paths and edited_name not in seen_paths:
                seen_paths.add(edited_key)
                dir_result.insert(0, {
                    "name": edited_name,
                    "path": edited_key,
                    "session_id": edited_session.id,
                    "is_upload": False,
                })

    for ud in upload_dirs:
        if ud["path"] not in seen_paths:
            seen_paths.add(ud["path"])
            dir_result.append(ud)

    # Batch-load metadata to avoid N+1
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

    return jsonify({
        "directories": dir_result,
        "files": file_result,
        "page": pagination.page,
        "per_page": pagination.per_page,
        "total": pagination.total,
        "total_pages": pagination.pages,
    }), 200


@api_bp.route("/explorer/rename", methods=["POST"])
def explorer_rename():
    explorer_operations_total.labels(operation="rename").inc()
    data = request.get_json(silent=True) or {}
    path = data.get("path", "").strip().strip("/")
    new_name = data.get("new_name", "").strip().strip("/")
    item_type = data.get("type", "file")
    if not path or not new_name:
        return jsonify({"error": "path and new_name are required"}), 400
    upload_dir = current_app.config["UPLOAD_DIR"]

    if item_type == "dir":
        entries = ImportedDirectory.query.filter(
            ImportedDirectory.deleted != True, ImportedDirectory.path == path
        ).all()
        if not entries:
            return jsonify({"error": "Directory not found"}), 404
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
            return jsonify({"error": "File not found"}), 404
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
    return jsonify({"message": "Renamed"}), 200


@api_bp.route("/explorer/move", methods=["POST"])
def explorer_move():
    explorer_operations_total.labels(operation="move").inc()
    data = request.get_json(silent=True) or {}
    paths = data.get("paths", [])
    target = data.get("target", "").strip().strip("/")
    upload_dir = current_app.config["UPLOAD_DIR"]
    if not paths:
        return jsonify({"error": "paths is required"}), 400
    upload_session = ImportSession.query.filter_by(root_path=upload_dir).first()
    if not upload_session:
        return jsonify({"error": "Upload session not found"}), 400
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
    return jsonify({"message": msg}), 200 if moved_count else 404


@api_bp.route("/explorer/copy", methods=["POST"])
def explorer_copy():
    explorer_operations_total.labels(operation="copy").inc()
    data = request.get_json(silent=True) or {}
    paths = data.get("paths", [])
    target = data.get("target", "").strip().strip("/")
    upload_dir = current_app.config["UPLOAD_DIR"]
    if not paths:
        return jsonify({"error": "paths is required"}), 400
    upload_session = ImportSession.query.filter_by(root_path=upload_dir).first()
    if not upload_session:
        return jsonify({"error": "Upload session not found"}), 400
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
    return jsonify({"message": "Items copied"}), 200


@api_bp.route("/explorer/delete", methods=["POST"])
def explorer_delete():
    explorer_operations_total.labels(operation="delete").inc()
    data = request.get_json(silent=True) or {}
    paths = data.get("paths", [])
    if not paths:
        return jsonify({"error": "paths is required"}), 400
    deleted_count = 0
    for src_path in paths:
        src_path = src_path.strip().strip("/")
        files = ImportedFile.query.filter(
            ImportedFile.deleted != True, ImportedFile.relative_path == src_path,
        ).all()
        for f in files:
            DetectedFace.query.filter_by(file_id=f.id).delete()
            meta = FileMetadata.query.filter_by(file_id=f.id).first()
            if meta:
                DHashBand.query.filter_by(metadata_id=meta.id).delete()
                db.session.delete(meta)
            db.session.delete(f)
            deleted_count += 1
            session = ImportSession.query.get(f.session_id)
            if session:
                session.total_files = max(0, (session.total_files or 0) - 1)
        dirs = ImportedDirectory.query.filter(
            ImportedDirectory.deleted != True, ImportedDirectory.path == src_path,
        ).all()
        for d in dirs:
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
                    session = ImportSession.query.get(cf.session_id)
                    if session:
                        session.total_files = max(0, (session.total_files or 0) - 1)
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
                session = ImportSession.query.get(cf.session_id)
                if session:
                    session.total_files = max(0, (session.total_files or 0) - 1)
                meta = FileMetadata.query.filter_by(file_id=cf.id).first()
                if meta:
                    DHashBand.query.filter_by(metadata_id=meta.id).delete()
                    db.session.delete(meta)
                db.session.delete(cf)
            db.session.delete(d)
    db.session.commit()
    if deleted_count:
        files_deleted_total.inc(deleted_count)
        from app.metrics import update_library_stats
        update_library_stats()
    return jsonify({"message": "Items deleted"}), 200


# ──────────────────────────────────────────────
# Folder favorites
# ──────────────────────────────────────────────


@api_bp.route("/explorer/favorites", methods=["GET"])
def explorer_list_favorites():
    favorites = FavoriteFolder.query.order_by(FavoriteFolder.name).all()
    return jsonify({
        "favorites": [{"path": f.path, "name": f.name, "created_at": f.created_at.isoformat() if f.created_at else None} for f in favorites],
    }), 200


@api_bp.route("/explorer/favorites", methods=["POST"])
def explorer_add_favorite():
    data = request.get_json(silent=True) or {}
    path = data.get("path", "").strip()
    name = data.get("name", "").strip()
    if not path or not name:
        return jsonify({"error": "path and name are required"}), 400
    existing = FavoriteFolder.query.filter_by(path=path).first()
    if existing:
        return jsonify({"message": "Already favorited", "favorite": {"path": existing.path, "name": existing.name}}), 200
    fav = FavoriteFolder(path=path, name=name)
    db.session.add(fav)
    db.session.commit()
    return jsonify({"message": "Folder favorited", "favorite": {"path": fav.path, "name": fav.name}}), 201


@api_bp.route("/explorer/favorites", methods=["DELETE"])
def explorer_remove_favorite():
    path = request.args.get("path", "").strip()
    if not path:
        return jsonify({"error": "path query parameter is required"}), 400
    fav = FavoriteFolder.query.filter_by(path=path).first()
    if fav:
        db.session.delete(fav)
        db.session.commit()
    return jsonify({"message": "Favorite removed"}), 200


# ──────────────────────────────────────────────
# Ingredient Scanner — async AI task store
# ──────────────────────────────────────────────

_ai_tasks = {}
_ai_tasks_lock = threading.Lock()
_AI_TASK_TTL = 600  # 10 minutes

def _cleanup_ai_tasks():
    now = time.time()
    with _ai_tasks_lock:
        stale = [tid for tid, t in list(_ai_tasks.items()) if now - t.get("created_at", 0) > _AI_TASK_TTL]
        for tid in stale:
            del _ai_tasks[tid]

def _run_ollama_task(task_id, text, host, text_model, schema, system_prompt):
    try:
        client = ollama.Client(host=host, timeout=60)
        response = client.chat(
            model=text_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Ingredient list: {text}"},
            ],
            format=schema,
            options={"temperature": 0.2},
        )
        result = json.loads(response.message.content)
        with _ai_tasks_lock:
            _ai_tasks[task_id] = {"status": "done", "result": result, "created_at": time.time()}
    except Exception as e:
        with _ai_tasks_lock:
            _ai_tasks[task_id] = {"status": "error", "error": str(e), "created_at": time.time()}

@api_bp.route("/tools/ingredient-scanner/analyze", methods=["POST"])
def ingredient_scanner_analyze():
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "No ingredient text provided"}), 400

    _cleanup_ai_tasks()

    host = current_app.config.get("OLLAMA_BASE_URL", "http://localhost:11434")
    text_model = current_app.config.get("OLLAMA_TEXT_MODEL", "llama3.2")

    analysis_schema = {
        "type": "object",
        "properties": {
            "ingredients": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "category": {"type": "string"},
                        "function": {"type": "string"},
                        "is_whole_food": {"type": "boolean"},
                        "is_recognizable": {"type": "boolean"},
                        "is_additive": {"type": "boolean"},
                        "e_number": {"type": "string"},
                    },
                    "required": ["name", "category", "function"],
                },
            },
            "total_ingredients": {"type": "integer"},
        },
        "required": ["ingredients", "total_ingredients"],
    }

    system_prompt = (
        "You are a food science expert. Given a product's ingredient list, "
        "parse each ingredient and categorize it. Respond with valid JSON "
        "matching the provided schema. Categories: sweetener, preservative, "
        "emulsifier, thickener, stabilizer, gelling_agent, artificial_color, "
        "artificial_flavor, artificial_sweetener, fat_oil, grain, fruit_vegetable, "
        "nut_seed, dairy, protein, salt_sodium, leavening_agent, acidity_regulator, "
        "fortification_nutrient, allergen, whole_food, water, spice, other. "
        "For each ingredient, set is_whole_food=true if it's a single minimally-processed "
        "food item, is_recognizable=true if a typical consumer would know it from home cooking, "
        "is_additive=true if it's a food additive (E-number or chemical name), "
        "and e_number to the E-number if applicable."
    )

    task_id = str(uuid.uuid4())
    with _ai_tasks_lock:
        _ai_tasks[task_id] = {"status": "processing", "created_at": time.time()}

    thread = threading.Thread(
        target=_run_ollama_task,
        args=(task_id, text, host, text_model, analysis_schema, system_prompt),
        daemon=True,
    )
    thread.start()

    return jsonify({"task_id": task_id, "status": "processing"}), 202


@api_bp.route("/tools/ingredient-scanner/result/<task_id>", methods=["GET"])
def ingredient_scanner_result(task_id):
    _cleanup_ai_tasks()
    with _ai_tasks_lock:
        task = _ai_tasks.get(task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404
    if task["status"] == "done":
        return jsonify({"status": "done", "result": task["result"]}), 200
    elif task["status"] == "error":
        return jsonify({"status": "error", "error": task["error"]}), 200
    else:
        return jsonify({"status": "processing"}), 200


@api_bp.route("/tools/barcode-scanner/stats", methods=["POST"])
def barcode_scanner_stats():
    data = request.get_json(silent=True) or {}
    value = data.get("value", "")
    fmt = data.get("format", "")
    current_app.logger.info(
        "BarcodeScanner scan: value=%s format=%s", value, fmt
    )
    return jsonify({"message": "ok"}), 200


@api_bp.route("/tools/barcode-scanner/sync", methods=["POST"])
def barcode_scanner_sync():
    data = request.get_json(silent=True) or {}
    cart = data.get("cart", {})
    history = data.get("history", [])
    current_app.logger.info(
        "BarcodeScanner sync: cart_items=%d history_items=%d",
        len(cart.get("items", [])), len(history),
    )
    return jsonify({"message": "synced"}), 200


# ──────────────────────────────────────────────
# AI Ingredient Scanner — full image analysis via Ollama vision + text
# ──────────────────────────────────────────────

_ai_image_tasks = {}
_ai_image_tasks_lock = threading.Lock()

def _cleanup_ai_image_tasks():
    now = time.time()
    with _ai_image_tasks_lock:
        stale = [tid for tid, t in list(_ai_image_tasks.items()) if now - t.get("created_at", 0) > _AI_TASK_TTL]
        for tid in stale:
            del _ai_image_tasks[tid]

def _run_image_ollama_task(task_id, image_path, host, vision_model, text_model):
    try:
        # Step 1: Vision model extracts all text from the label image
        client = ollama.Client(host=host, timeout=120)
        vision_response = client.chat(
            model=vision_model,
            messages=[
                {
                    "role": "system",
                    "content": "You are a product label reader. Extract ALL visible text exactly as written on the food label. Include ingredient lists, nutrition facts tables, serving sizes, and any other text. Be thorough and preserve exact wording.",
                },
                {
                    "role": "user",
                    "content": "Read this food label completely and return every piece of text you can see.",
                    "images": [image_path],
                },
            ],
            options={"temperature": 0.1},
        )
        raw_text = vision_response["message"]["content"].strip()

        with _ai_image_tasks_lock:
            _ai_image_tasks[task_id] = {"status": "text_processing", "raw_text": raw_text, "created_at": time.time()}

        # Step 2: Text model parses structured data from the extracted text
        analysis_schema = {
            "type": "object",
            "properties": {
                "ingredients": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "quantity": {"type": "string"},
                            "category": {"type": "string"},
                            "function": {"type": "string"},
                            "is_whole_food": {"type": "boolean"},
                            "is_recognizable": {"type": "boolean"},
                            "is_additive": {"type": "boolean"},
                            "e_number": {"type": "string"},
                        },
                        "required": ["name", "category"],
                    },
                },
                "nutrition": {
                    "type": "object",
                    "properties": {
                        "serving_size": {"type": "string"},
                        "servings_per_pack": {"type": "string"},
                        "per_serving": {
                            "type": "object",
                            "properties": {
                                "energy_kcal": {"type": "number"},
                                "protein_g": {"type": "number"},
                                "carbohydrate_g": {"type": "number"},
                                "sugars_g": {"type": "number"},
                                "total_fat_g": {"type": "number"},
                                "saturated_fat_g": {"type": "number"},
                                "trans_fat_g": {"type": "number"},
                                "cholesterol_mg": {"type": "number"},
                                "sodium_mg": {"type": "number"},
                                "dietary_fiber_g": {"type": "number"},
                            },
                        },
                        "per_100g": {"type": "object"},
                    },
                },
                "total_ingredients": {"type": "integer"},
            },
            "required": ["ingredients", "total_ingredients"],
        }

        system_prompt = (
            "You are a food science expert. Given a product label's OCR text, "
            "parse the ingredient list and nutrition facts table. "
            "Categories for ingredients: sweetener, preservative, emulsifier, thickener, "
            "stabilizer, gelling_agent, artificial_color, artificial_flavor, "
            "artificial_sweetener, fat_oil, grain, fruit_vegetable, nut_seed, dairy, "
            "protein, salt_sodium, leavening_agent, acidity_regulator, "
            "fortification_nutrient, allergen, whole_food, water, spice, other. "
            "For each ingredient set is_whole_food=true if it is a single minimally-processed "
            "food item, is_recognizable=true if a typical consumer would recognize it from "
            "home cooking, is_additive=true if it is a food additive with an E-number or "
            "chemical name, and e_number to the E-number if applicable. "
            "Extract all nutrition values from the label."
        )

        text_response = client.chat(
            model=text_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Label OCR text:\n{raw_text}"},
            ],
            format=analysis_schema,
            options={"temperature": 0.2},
        )
        result = json.loads(text_response.message.content)
        result["raw_label_text"] = raw_text

        with _ai_image_tasks_lock:
            _ai_image_tasks[task_id] = {"status": "done", "result": result, "created_at": time.time()}
    except Exception as e:
        with _ai_image_tasks_lock:
            _ai_image_tasks[task_id] = {"status": "error", "error": str(e), "created_at": time.time()}
    finally:
        if os.path.exists(image_path):
            os.unlink(image_path)


@api_bp.route("/tools/ingredient-scanner-ai/analyze", methods=["POST"])
def ingredient_scanner_ai_analyze():
    file = request.files.get("image")
    if not file:
        return jsonify({"error": "No image provided"}), 400

    _cleanup_ai_image_tasks()

    ext = os.path.splitext(file.filename or "image.jpg")[1] or ".jpg"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    file.save(tmp.name)
    tmp.close()

    host = current_app.config.get("OLLAMA_BASE_URL", "http://localhost:11434")
    vision_model = current_app.config.get("OLLAMA_MODEL", "llava")
    text_model = current_app.config.get("OLLAMA_TEXT_MODEL", "llama3.2")

    task_id = str(uuid.uuid4())
    with _ai_image_tasks_lock:
        _ai_image_tasks[task_id] = {"status": "vision_processing", "created_at": time.time()}

    thread = threading.Thread(
        target=_run_image_ollama_task,
        args=(task_id, tmp.name, host, vision_model, text_model),
        daemon=True,
    )
    thread.start()

    return jsonify({"task_id": task_id, "status": "vision_processing"}), 202


@api_bp.route("/tools/ingredient-scanner-ai/result/<task_id>", methods=["GET"])
def ingredient_scanner_ai_result(task_id):
    _cleanup_ai_image_tasks()
    with _ai_image_tasks_lock:
        task = _ai_image_tasks.get(task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404
    if task["status"] == "done":
        return jsonify({"status": "done", "result": task["result"]}), 200
    elif task["status"] == "error":
        return jsonify({"status": "error", "error": task["error"]}), 200
    else:
        return jsonify({"status": task["status"], "raw_text": task.get("raw_text", "")}), 200


def _root_dir_id(upload_session, upload_dir):
    root = ImportedDirectory.query.filter_by(
        session_id=upload_session.id, path=""
    ).first()
    return root.id if root else None