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
tools_bp=Blueprint("tools",__name__)
config=get_config()

_ai_tasks = {}
_ai_tasks_lock = threading.Lock()
_AI_TASK_TTL = 600  # 10 minutes
_ai_image_tasks = {}
_ai_image_tasks_lock = threading.Lock()

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

@tools_bp.route("/tools/ingredient-scanner/analyze", methods=["POST"])
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

@tools_bp.route("/tools/ingredient-scanner/result/<task_id>", methods=["GET"])
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

@tools_bp.route("/tools/barcode-scanner/stats", methods=["POST"])
def barcode_scanner_stats():
    data = request.get_json(silent=True) or {}
    value = data.get("value", "")
    fmt = data.get("format", "")
    current_app.logger.info(
        "BarcodeScanner scan: value=%s format=%s", value, fmt
    )
    return jsonify({"message": "ok"}), 200

@tools_bp.route("/tools/barcode-scanner/sync", methods=["POST"])
def barcode_scanner_sync():
    data = request.get_json(silent=True) or {}
    cart = data.get("cart", {})
    history = data.get("history", [])
    current_app.logger.info(
        "BarcodeScanner sync: cart_items=%d history_items=%d",
        len(cart.get("items", [])), len(history),
    )
    return jsonify({"message": "synced"}), 200

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

@tools_bp.route("/tools/ingredient-scanner-ai/analyze", methods=["POST"])
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

@tools_bp.route("/tools/ingredient-scanner-ai/result/<task_id>", methods=["GET"])
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
