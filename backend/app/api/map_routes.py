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
map_bp=Blueprint("map",__name__)
config=get_config()

_geocode_last_call = 0
_redis_client = None
from app.api.file_helpers import (_adjust_blacks, _adjust_clarity, _adjust_dehaze, _adjust_exposure, _adjust_highlights_shadows, _adjust_tint, _adjust_vibrance, _adjust_warmth, _adjust_whites, _apply_colorize, _apply_filter_preset, _apply_grain, _apply_vignette)

@map_bp.route("/files/with-gps", methods=["GET"])
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

@map_bp.route("/locations", methods=["GET"])
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

@map_bp.route("/locations", methods=["POST"])
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

@map_bp.route("/locations/<int:loc_id>", methods=["PUT"])
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

@map_bp.route("/locations/<int:loc_id>", methods=["DELETE"])
def delete_location(loc_id):
    loc = db.session.get(SavedLocation, loc_id)
    if not loc:
        return jsonify({"error": "Location not found"}), 404
    db.session.delete(loc)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200

@map_bp.route("/files/<int:file_id>/export", methods=["POST"])
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

def _get_redis():
    global _redis_client
    if _redis_client is None:
        import redis as _redis_mod
        _redis_client = _redis_mod.from_url(config.CELERY_BROKER_URL)
    return _redis_client

@map_bp.route("/geocode/reverse", methods=["GET"])
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
            cached_data = json.loads(cached)
            geocode_requests_total.labels(cache="hit").inc()
            return jsonify(cached_data)
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

    if "display_name" in result:
        try:
            r = _get_redis()
            r.set(cache_key, json.dumps(result))
        except Exception:
            pass

    return jsonify(result)

@map_bp.route("/files/<int:file_id>/export-video", methods=["POST"])
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
