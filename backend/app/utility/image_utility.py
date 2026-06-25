import base64
import io
import os
from datetime import datetime

from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS

from app.utility.location_utility import dms_to_decimal

THUMB_SIZE = (400, 400)

def extract_image_metadata(path, meta):
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


def generate_image_thumbnail(path, meta):
    if not os.path.isfile(path):
        return

    img = Image.open(path)
    img = img.convert("RGB")
    img.thumbnail(THUMB_SIZE, Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    meta.thumbnail = f"data:image/jpeg;base64,{b64}"
    buf.close()
    img.close()
