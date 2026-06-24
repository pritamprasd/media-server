import base64
import io
import json
import os
import subprocess
from datetime import datetime

import ollama
from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS
from sqlalchemy.exc import IntegrityError

from app import db
from app.celery_app import celery
from app.models.file_metadata import FileMetadata


@celery.task(bind=True, max_retries=3)
def extract_file_metadata(self, file_info):
    import logging
    logger = logging.getLogger(__name__)
    from flask import current_app
    file_id = file_info["id"]
    file_path = file_info["file_path"]
    mime = file_info.get("mime_type", "")

    # logger.info("extract_file_metadata: file_id=%s path=%s mime=%s", file_id, file_path, mime)
    # logger.info("DB URL: %s", current_app.config.get("SQLALCHEMY_DATABASE_URI", "not set"))

    meta = FileMetadata.query.filter_by(file_id=file_id).first()
    if not meta:
        try:
            meta = FileMetadata(file_id=file_id)
            db.session.add(meta)
            db.session.flush()
        except IntegrityError:
            db.session.rollback()
            meta = FileMetadata.query.filter_by(file_id=file_id).first()

    meta.metadata_status = "extracting"
    db.session.commit()

    try:
        if mime.startswith("image/"):
            _extract_image_metadata(file_path, meta)
        elif mime.startswith("video/"):
            _extract_video_metadata(file_path, meta)

        meta.metadata_status = "extracted"
    except Exception as exc:
        meta.metadata_status = "failed"
        db.session.commit()
        raise self.retry(exc=exc, countdown=60)

    db.session.commit()
    return {"file_id": file_id, "status": meta.metadata_status}


def _extract_image_metadata(path, meta):
    if not os.path.isfile(path):
        return

    img = Image.open(path)
    meta.width, meta.height = img.size

    exif_data = img._getexif()
    if not exif_data:
        img.close()
        return

    decoded = {}
    gps = {}
    for tag_id, value in exif_data.items():
        tag_name = TAGS.get(tag_id, tag_id)
        decoded[tag_name] = str(value)
        if tag_name == "GPSInfo":
            for gps_tag_id, gps_value in value.items():
                gps_tag_name = GPSTAGS.get(gps_tag_id, gps_tag_id)
                gps[gps_tag_name] = gps_value

    meta.exif = decoded

    if gps:
        lat = _dms_to_decimal(gps.get("GPSLatitude"), gps.get("GPSLatitudeRef"))
        lon = _dms_to_decimal(gps.get("GPSLongitude"), gps.get("GPSLongitudeRef"))
        if lat is not None:
            meta.latitude = lat
        if lon is not None:
            meta.longitude = lon

    date_str = decoded.get("DateTimeOriginal") or decoded.get("DateTimeDigitized") or decoded.get("DateTime")
    if date_str:
        try:
            meta.date_taken = datetime.strptime(date_str, "%Y:%m:%d %H:%M:%S")
        except (ValueError, TypeError):
            pass

    img.close()


def _extract_video_metadata(path, meta):
    if not os.path.isfile(path):
        return

    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "quiet",
                "-print_format", "json",
                "-show_format", "-show_streams",
                path,
            ],
            capture_output=True, text=True, timeout=30,
        )
        data = json.loads(result.stdout)
    except Exception:
        return

    streams = data.get("streams", [])
    video_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
    if video_stream:
        meta.width = _safe_int(video_stream.get("width"))
        meta.height = _safe_int(video_stream.get("height"))

    fmt = data.get("format", {})
    duration_str = fmt.get("duration") or (video_stream or {}).get("duration")
    if duration_str:
        try:
            meta.duration = float(duration_str)
        except (ValueError, TypeError):
            pass


def _dms_to_decimal(dms, ref):
    if not dms or len(dms) != 3:
        return None
    try:
        degrees = float(dms[0])
        minutes = float(dms[1])
        seconds = float(dms[2])
        decimal = degrees + minutes / 60.0 + seconds / 3600.0
        if ref and ref.upper() in ("S", "W"):
            decimal = -decimal
        return round(decimal, 6)
    except (ValueError, TypeError, IndexError):
        return None


def _safe_int(val):
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


@celery.task(bind=True, max_retries=3)
def generate_ai_metadata(self, file_info):
    import logging
    logger = logging.getLogger(__name__)
    from flask import current_app

    file_id = file_info["id"]
    file_path = file_info["file_path"]
    mime = file_info.get("mime_type", "")
    filename = file_info.get("filename", "")

    # logger.info("generate_ai_metadata: file_id=%s path=%s mime=%s", file_id, file_path, mime)
    # logger.info("DB URL: %s", current_app.config.get("SQLALCHEMY_DATABASE_URI", "not set"))

    meta = FileMetadata.query.filter_by(file_id=file_id).first()
    if not meta:
        try:
            meta = FileMetadata(file_id=file_id)
            db.session.add(meta)
            db.session.flush()
        except IntegrityError:
            db.session.rollback()
            meta = FileMetadata.query.filter_by(file_id=file_id).first()

    meta.metadata_status = "processing_ai"
    db.session.commit()

    host = current_app.config.get("OLLAMA_BASE_URL", "http://localhost:11434")
    model = current_app.config.get("OLLAMA_MODEL", "llava")
    client = ollama.Client(host=host)

    try:
        prompt = (
            "Describe this image or video in 1-2 sentences, then list 5-10 relevant tags "
            "(comma separated), then list 5-10 short search keywords (comma separated). "
            "Respond ONLY in JSON format with keys: description, tags (array), search_words (array). "
            "No other text."
        )

        if mime.startswith("image/"):
            result = client.generate(
                model=model,
                prompt=prompt,
                images=[file_path],
            )
        else:
            text_model = model.replace("llava", "gemma4:12b").replace("bakllava", "llama3.2")
            result = client.generate(
                model=text_model,
                prompt=f"Filename: {filename}\n\n{prompt}",
            )

        response_text = result.response

        cleaned = response_text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[-1]
            cleaned = cleaned.rsplit("```", 1)[0]
        cleaned = cleaned.strip()

        parsed = json.loads(cleaned)
        meta.description = parsed.get("description", "")
        meta.tags = parsed.get("tags", [])
        sw = parsed.get("search_words", [])
        meta.search_words = ", ".join(sw) if isinstance(sw, list) else sw
        meta.metadata_status = "completed"

    except Exception as exc:
        meta.metadata_status = "failed"
        db.session.commit()
        raise self.retry(exc=exc, countdown=60)

    db.session.commit()
    return {"file_id": file_id, "status": meta.metadata_status}


@celery.task(bind=True, max_retries=3)
def generate_thumbnail(self, file_info):
    import logging
    logger = logging.getLogger(__name__)

    file_id = file_info["id"]
    file_path = file_info["file_path"]
    mime = file_info.get("mime_type", "")

    meta = FileMetadata.query.filter_by(file_id=file_id).first()
    if not meta:
        try:
            meta = FileMetadata(file_id=file_id)
            db.session.add(meta)
            db.session.flush()
        except IntegrityError:
            db.session.rollback()
            meta = FileMetadata.query.filter_by(file_id=file_id).first()

    meta.thumbnail_status = "generating"
    db.session.commit()

    try:
        if mime.startswith("image/"):
            _generate_image_thumbnail(file_path, meta)
        elif mime.startswith("video/"):
            _generate_video_thumbnail(file_path, meta)

        meta.thumbnail_status = "completed" if meta.thumbnail else "failed"
    except Exception as exc:
        meta.thumbnail_status = "failed"
        db.session.commit()
        raise self.retry(exc=exc, countdown=60)

    db.session.commit()
    return {"file_id": file_id, "thumbnail_status": meta.thumbnail_status}


THUMB_SIZE = (400, 400)


def _generate_image_thumbnail(path, meta):
    if not os.path.isfile(path):
        return

    img = Image.open(path)
    img.thumbnail(THUMB_SIZE, Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    meta.thumbnail = f"data:image/jpeg;base64,{b64}"
    buf.close()
    img.close()


def _generate_video_thumbnail(path, meta):
    if not os.path.isfile(path):
        return

    result = subprocess.run(
        [
            "ffprobe", "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            path,
        ],
        capture_output=True, text=True, timeout=15,
    )
    data = json.loads(result.stdout)
    duration_str = data.get("format", {}).get("duration", "0")
    try:
        duration = float(duration_str)
    except (ValueError, TypeError):
        duration = 0

    seek = max(1.0, duration * 0.3) if duration > 0 else 1.0

    pipe = subprocess.run(
        [
            "ffmpeg", "-y", "-v", "quiet",
            "-ss", str(seek),
            "-i", path,
            "-vframes", "1",
            "-f", "image2pipe",
            "-vcodec", "mjpeg",
            "-q:v", "5",
            "-s", "400x400",
            "-",
        ],
        capture_output=True, timeout=30,
    )
    if pipe.returncode != 0 or not pipe.stdout:
        return

    b64 = base64.b64encode(pipe.stdout).decode("utf-8")
    meta.thumbnail = f"data:image/jpeg;base64,{b64}"



