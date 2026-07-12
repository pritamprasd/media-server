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
config=get_config()

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
