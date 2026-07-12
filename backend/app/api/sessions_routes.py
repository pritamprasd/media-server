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
sessions_bp=Blueprint("sessions",__name__)
config=get_config()


@sessions_bp.route("/status", methods=["GET"])
def status():
    return jsonify({"message": "API is running"}), 200

@sessions_bp.route("/stats/refresh", methods=["POST"])
def refresh_stats():
    from app.metrics import update_library_stats
    update_library_stats()
    return jsonify({"message": "Library stats refreshed"}), 200

@sessions_bp.route("/directories", methods=["GET"])
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

@sessions_bp.route("/browse-fs", methods=["GET"])
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

@sessions_bp.route("/import", methods=["POST"])
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

@sessions_bp.route("/sessions", methods=["GET"])
def list_sessions():
    sessions = ImportSession.query.order_by(ImportSession.created_at.desc()).all()
    return jsonify([s.to_dict() for s in sessions]), 200

@sessions_bp.route("/sessions/<int:session_id>/browse", methods=["GET"])
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

@sessions_bp.route("/stats", methods=["GET"])
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
