import base64
import io
import os
from datetime import datetime

from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS

from app.utility.location_utility import dms_to_decimal

THUMB_SIZE = (400, 400)

HEIC_EXTS = {".heic", ".heif", ".heics", ".heifs"}


def _open_image(path):
    ext = os.path.splitext(path)[1].lower()
    if ext in HEIC_EXTS:
        buf = _convert_heic_to_jpeg_pipe(path)
        if buf is not None:
            return Image.open(buf)
        return None
    return Image.open(path)


def _convert_heic_to_jpeg_pipe(path):
    import subprocess as sp

    for cmd in (["magick", "convert"], ["convert"]):
        try:
            result = sp.run(
                [*cmd, "-define", "jpeg:preserve-exif=true", path, "jpeg:-"],
                capture_output=True, timeout=30,
            )
            if result.returncode == 0 and result.stdout:
                return io.BytesIO(result.stdout)
        except Exception:
            pass
    return None


def extract_image_metadata(path, meta):
    if not os.path.isfile(path):
        return

    img = _open_image(path)
    if img is None:
        return
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
        lat = dms_to_decimal(gps.get("GPSLatitude"), gps.get("GPSLatitudeRef"))
        lon = dms_to_decimal(gps.get("GPSLongitude"), gps.get("GPSLongitudeRef"))
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


def _apply_exif_orientation(img):
    try:
        exif = img._getexif()
        if exif is None:
            return img
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
    return img


def generate_image_thumbnail(path, meta):
    if not os.path.isfile(path):
        return

    img = _open_image(path)
    if img is None:
        return
    img = _apply_exif_orientation(img)
    img = img.convert("RGB")
    img.thumbnail(THUMB_SIZE, Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    meta.thumbnail = f"data:image/jpeg;base64,{b64}"
    buf.close()
    img.close()
