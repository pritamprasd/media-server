from functools import wraps

from flask import Blueprint, jsonify, request, current_app
from sqlalchemy import text

from app import db
from app.models.detected_face import DetectedFace
from app.models.file_metadata import FileMetadata
from app.models.imported_file import ImportedFile
from app.tasks import generate_ai_metadata
from app.tasks.admin_tasks import (
    bulk_generate_exif,
    bulk_generate_thumbnails,
    bulk_detect_faces,
)

admin_bp = Blueprint("admin", __name__)


def _check_admin_pin(pin):
    return pin == current_app.config.get("ADMIN_PIN", "000000")


def require_admin_pin(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        pin = request.headers.get("X-Admin-Pin", "")
        if not _check_admin_pin(pin):
            return jsonify({"error": "Invalid admin PIN"}), 403
        return f(*args, **kwargs)
    return decorated


@admin_bp.route("/admin/verify-pin", methods=["POST"])
def admin_verify_pin():
    pin = request.headers.get("X-Admin-Pin", "")
    if not _check_admin_pin(pin):
        return jsonify({"error": "Invalid PIN"}), 403
    return jsonify({"valid": True}), 200


@admin_bp.route("/admin/change-pin", methods=["POST"])
def admin_change_pin():
    data = request.get_json(force=True)
    old_pin = data.get("old_pin", "")
    new_pin = data.get("new_pin", "")
    if not _check_admin_pin(old_pin):
        return jsonify({"error": "Current PIN is incorrect"}), 403
    if len(new_pin) != 6 or not new_pin.isdigit():
        return jsonify({"error": "New PIN must be exactly 6 digits"}), 400
    current_app.config["ADMIN_PIN"] = new_pin
    return jsonify({"success": True}), 200


def _make_file_info(f):
    return {
        "id": f.id,
        "session_id": f.session_id,
        "directory_id": f.directory_id,
        "filename": f.filename,
        "file_path": f.file_path,
        "relative_path": f.relative_path,
        "mime_type": f.mime_type,
        "size": f.size,
        "modified": f.modified.isoformat() if f.modified else None,
    }


@admin_bp.route("/admin/bulk-ai", methods=["POST"])
@require_admin_pin
def admin_bulk_ai():
    """Queue one AI description task per file missing a description."""
    if request.headers.get("X-Airplane-Mode") == "1":
        return jsonify({"error": "Airplane mode is enabled, external calls blocked"}), 503
    files = (
        db.session.query(ImportedFile)
        .join(FileMetadata, FileMetadata.file_id == ImportedFile.id, isouter=True)
        .filter(FileMetadata.description.is_(None))
        .all()
    )
    queued = 0
    for f in files:
        generate_ai_metadata.delay(_make_file_info(f))
        queued += 1
    return jsonify({"queued": queued}), 202


@admin_bp.route("/admin/bulk-exif", methods=["POST"])
@require_admin_pin
def admin_bulk_exif():
    """Queue EXIF/metadata extraction for all files missing it."""
    files = (
        db.session.query(ImportedFile.id)
        .join(FileMetadata, FileMetadata.file_id == ImportedFile.id, isouter=True)
        .filter(FileMetadata.exif.is_(None))
        .all()
    )
    file_ids = [r[0] for r in files]
    if file_ids:
        bulk_generate_exif.delay(file_ids)
    return jsonify({"queued": len(file_ids)}), 202


@admin_bp.route("/admin/bulk-thumbnails", methods=["POST"])
@require_admin_pin
def admin_bulk_thumbnails():
    """Queue thumbnail generation for all files missing one."""
    files = (
        db.session.query(ImportedFile.id)
        .join(FileMetadata, FileMetadata.file_id == ImportedFile.id, isouter=True)
        .filter(FileMetadata.thumbnail.is_(None))
        .all()
    )
    file_ids = [r[0] for r in files]
    if file_ids:
        bulk_generate_thumbnails.delay(file_ids)
    return jsonify({"queued": len(file_ids)}), 202


@admin_bp.route("/admin/bulk-faces", methods=["POST"])
@require_admin_pin
def admin_bulk_faces():
    """Queue face detection for all image files not yet scanned."""
    scanned = db.session.query(DetectedFace.file_id).distinct().subquery()
    files = (
        db.session.query(ImportedFile.id)
        .filter(ImportedFile.mime_type.like("image/%"))
        .filter(~ImportedFile.id.in_(db.session.query(scanned.c.file_id)))
        .all()
    )
    file_ids = [r[0] for r in files]
    if file_ids:
        bulk_detect_faces.delay(file_ids)
    return jsonify({"queued": len(file_ids)}), 202


@admin_bp.route("/admin/tags/rename", methods=["POST"])
@require_admin_pin
def admin_rename_tag():
    """Rename a tag across all files that have it."""
    data = request.get_json(force=True)
    old_tag = (data.get("old_tag") or "").strip()
    new_tag = (data.get("new_tag") or "").strip()
    if not old_tag or not new_tag:
        return jsonify({"error": "old_tag and new_tag are required"}), 400
    if old_tag == new_tag:
        return jsonify({"error": "old_tag and new_tag must differ"}), 400
    result = db.session.execute(
        text("""
            UPDATE file_metadata
            SET tags = (
                SELECT jsonb_agg(DISTINCT elem)
                FROM (
                    SELECT CASE
                        WHEN elem = to_jsonb(CAST(:old_tag AS text))
                        THEN to_jsonb(CAST(:new_tag AS text))
                        ELSE elem
                    END AS elem
                    FROM jsonb_array_elements(tags) AS t
                ) AS sub
            )
            WHERE tags ? :old_tag
        """),
        {"old_tag": old_tag, "new_tag": new_tag},
    )
    db.session.commit()
    return jsonify({"renamed": result.rowcount, "from": old_tag, "to": new_tag})


@admin_bp.route("/admin/tags/delete", methods=["POST"])
@require_admin_pin
def admin_delete_tag():
    """Remove a tag from all files that have it."""
    data = request.get_json(force=True)
    tag = (data.get("tag") or "").strip()
    if not tag:
        return jsonify({"error": "tag is required"}), 400
    result = db.session.execute(
        text("""
            UPDATE file_metadata
            SET tags = (
                SELECT CASE
                    WHEN count(*) = 0 THEN NULL
                    ELSE jsonb_agg(elem)
                END
                FROM jsonb_array_elements(tags) AS elem
                WHERE elem != to_jsonb(CAST(:tag AS text))
            )
            WHERE tags ? :tag
        """),
        {"tag": tag},
    )
    db.session.commit()
    return jsonify({"deleted": result.rowcount, "tag": tag})


@admin_bp.route("/admin/tags", methods=["GET"])
@require_admin_pin
def admin_list_tags():
    """Return all tags with frequency counts for admin management."""
    metas = FileMetadata.query.join(
        ImportedFile, FileMetadata.file_id == ImportedFile.id
    ).filter(
        ImportedFile.deleted != True,
        FileMetadata.tags.isnot(None),
        db.cast(FileMetadata.tags, db.String) != "[]",
    ).with_entities(FileMetadata.tags).all()
    freq = {}
    for (tags,) in metas:
        if tags and isinstance(tags, list):
            seen = set()
            for t in tags:
                t = t.strip().lower()
                if t and t not in seen:
                    seen.add(t)
                    freq[t] = freq.get(t, 0) + 1
    sorted_tags = sorted(freq.items(), key=lambda x: (-x[1], x[0]))
    return jsonify({"tags": [{"tag": t, "count": c} for t, c in sorted_tags]}), 200
