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
filters_bp=Blueprint("filters",__name__)
config=get_config()


@filters_bp.route("/filters", methods=["GET"])
def list_filters():
    presets = FilterPreset.query.order_by(FilterPreset.name).all()
    return jsonify([p.to_dict() for p in presets]), 200

@filters_bp.route("/filters", methods=["POST"])
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

@filters_bp.route("/filters/<int:filter_id>", methods=["DELETE"])
def delete_filter(filter_id):
    preset = db.session.get(FilterPreset, filter_id)
    if not preset:
        return jsonify({"error": "Filter not found"}), 404
    db.session.delete(preset)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200
