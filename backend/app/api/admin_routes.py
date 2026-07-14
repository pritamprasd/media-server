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
                        WHEN elem = to_jsonb(:old_tag::text)
                        THEN to_jsonb(:new_tag::text)
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
                WHERE elem != to_jsonb(:tag::text)
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
    """Paginated, searchable tag list for admin management."""
    q = request.args.get("q", "").strip().lower()
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 50, type=int)
    per_page = min(per_page, 200)

    base_q = text("""
        SELECT elem AS tag, count(*) AS cnt
        FROM file_metadata, jsonb_array_elements_text(tags) AS elem
        WHERE file_metadata.tags IS NOT NULL
          AND file_metadata.tags != 'null'::jsonb
          AND file_metadata.file_id IN (
              SELECT id FROM imported_files WHERE deleted = false
          )
        GROUP BY elem
    """)

    if q:
        rows = db.session.execute(
            text(str(base_q) + " HAVING lower(elem) LIKE :q ORDER BY cnt DESC, tag ASC LIMIT :lim OFFSET :off"),
            {"q": f"%{q}%", "lim": per_page, "off": (page - 1) * per_page},
        ).fetchall()
        count_rows = db.session.execute(
            text("SELECT count(*) FROM (SELECT 1 FROM file_metadata, jsonb_array_elements_text(tags) AS elem WHERE file_metadata.tags IS NOT NULL AND file_metadata.tags != 'null'::jsonb AND file_metadata.file_id IN (SELECT id FROM imported_files WHERE deleted = false) GROUP BY elem HAVING lower(elem) LIKE :q) sub"),
            {"q": f"%{q}%"},
        ).fetchone()
    else:
        rows = db.session.execute(
            text(str(base_q) + " ORDER BY cnt DESC, tag ASC LIMIT :lim OFFSET :off"),
            {"lim": per_page, "off": (page - 1) * per_page},
        ).fetchall()
        count_rows = db.session.execute(
            text("SELECT count(*) FROM (SELECT 1 FROM file_metadata, jsonb_array_elements_text(tags) AS elem WHERE file_metadata.tags IS NOT NULL AND file_metadata.tags != 'null'::jsonb AND file_metadata.file_id IN (SELECT id FROM imported_files WHERE deleted = false) GROUP BY elem) sub"),
            {},
        ).fetchone()

    total = count_rows[0] if count_rows else 0
    return jsonify({
        "tags": [{"tag": r[0], "count": r[1]} for r in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
        "has_more": page * per_page < total,
    }), 200
