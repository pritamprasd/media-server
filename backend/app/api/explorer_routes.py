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
explorer_bp=Blueprint("explorer",__name__)
config=get_config()

config = get_config()
from app.api.file_helpers import (_ensure_upload_subdir)
from app.services import explorer_service

@explorer_bp.route("/explorer/browse", methods=["GET"])
def explorer_browse():
    prefix = request.args.get("prefix", "").strip().strip("/")
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 100, type=int)
    payload = explorer_service.browse_explorer(prefix, page, per_page)
    return jsonify(payload), 200

@explorer_bp.route("/explorer/rename", methods=["POST"])
def explorer_rename():
    explorer_operations_total.labels(operation="rename").inc()
    data = request.get_json(silent=True) or {}
    return explorer_service.rename_item(
        data.get("path"), data.get("new_name"), data.get("type", "file")
    )

@explorer_bp.route("/explorer/move", methods=["POST"])
def explorer_move():
    explorer_operations_total.labels(operation="move").inc()
    data = request.get_json(silent=True) or {}
    return explorer_service.move_items(data.get("paths", []), data.get("target"))

@explorer_bp.route("/explorer/copy", methods=["POST"])
def explorer_copy():
    explorer_operations_total.labels(operation="copy").inc()
    data = request.get_json(silent=True) or {}
    return explorer_service.copy_items(data.get("paths", []), data.get("target"))

@explorer_bp.route("/explorer/delete", methods=["POST"])
def explorer_delete():
    explorer_operations_total.labels(operation="delete").inc()
    data = request.get_json(silent=True) or {}
    return explorer_service.delete_items(data.get("paths", []))

@explorer_bp.route("/explorer/favorites", methods=["GET"])
def explorer_list_favorites():
    return jsonify(explorer_service.list_favorite_folders()), 200

@explorer_bp.route("/explorer/favorites", methods=["POST"])
def explorer_add_favorite():
    data = request.get_json(silent=True) or {}
    return explorer_service.add_favorite_folder(data.get("path"), data.get("name"))

@explorer_bp.route("/explorer/favorites", methods=["DELETE"])
def explorer_remove_favorite():
    return explorer_service.remove_favorite_folder(request.args.get("path", "").strip())
