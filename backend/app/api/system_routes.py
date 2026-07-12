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
system_bp=Blueprint("system",__name__)
config=get_config()

OPENAPI_SPEC_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "openapi.yaml")

@system_bp.route("/openapi.yaml", methods=["GET"])
def openapi_spec_yaml():
    if not os.path.exists(OPENAPI_SPEC_PATH):
        return jsonify({"error": "OpenAPI spec not found"}), 404
    return send_file(OPENAPI_SPEC_PATH, mimetype="application/x-yaml")

@system_bp.route("/openapi.json", methods=["GET"])
def openapi_spec_json():
    import yaml

    if not os.path.exists(OPENAPI_SPEC_PATH):
        return jsonify({"error": "OpenAPI spec not found"}), 404
    with open(OPENAPI_SPEC_PATH, "r") as f:
        spec = yaml.safe_load(f)
    return jsonify(spec)

@system_bp.route("/docs", methods=["GET"])
def api_docs():
    html = """<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Media Server API - Swagger UI</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" charset="UTF-8"></script>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js" charset="UTF-8"></script>
    <script>
      window.onload = function () {
        window.ui = SwaggerUIBundle({
          url: "/api/openapi.yaml",
          dom_id: "#swagger-ui",
          deepLinking: true,
          presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
          layout: "StandaloneLayout",
        });
      };
    </script>
  </body>
</html>
"""
    return Response(html, mimetype="text/html")
