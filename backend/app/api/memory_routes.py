from flask import Blueprint, jsonify, request

from app import db
memory_bp = Blueprint("memory", __name__)
from app.models.imported_file import ImportedFile
from app.models.user_memory import UserMemory


@memory_bp.route("/files/<int:file_id>/memories", methods=["GET"])
def list_memories(file_id):
    file = db.session.get(ImportedFile, file_id)
    if not file:
        return jsonify({"error": "File not found"}), 404
    memories = UserMemory.query.filter_by(file_id=file_id).order_by(UserMemory.created_at.desc()).all()
    return jsonify([m.to_dict() for m in memories])


@memory_bp.route("/files/<int:file_id>/memories", methods=["POST"])
def create_memory(file_id):
    file = db.session.get(ImportedFile, file_id)
    if not file:
        return jsonify({"error": "File not found"}), 404
    data = request.get_json(silent=True) or {}
    content = (data.get("content") or "").strip()
    if not content:
        return jsonify({"error": "Content is required"}), 400
    tags = data.get("tags") or []
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(",") if t.strip()]
    memory = UserMemory(file_id=file_id, content=content, tags=tags)
    db.session.add(memory)
    db.session.commit()
    return jsonify(memory.to_dict()), 201


@memory_bp.route("/memories/<int:memory_id>", methods=["PUT"])
def update_memory(memory_id):
    memory = db.session.get(UserMemory, memory_id)
    if not memory:
        return jsonify({"error": "Memory not found"}), 404
    data = request.get_json(silent=True) or {}
    if "content" in data:
        content = (data["content"] or "").strip()
        if not content:
            return jsonify({"error": "Content cannot be empty"}), 400
        memory.content = content
    if "tags" in data:
        tags = data["tags"] or []
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(",") if t.strip()]
        memory.tags = tags
    db.session.commit()
    return jsonify(memory.to_dict())


@memory_bp.route("/memories/<int:memory_id>", methods=["DELETE"])
def delete_memory(memory_id):
    memory = db.session.get(UserMemory, memory_id)
    if not memory:
        return jsonify({"error": "Memory not found"}), 404
    db.session.delete(memory)
    db.session.commit()
    return jsonify({"ok": True})
