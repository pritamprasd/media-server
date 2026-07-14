from flask import Blueprint, jsonify, request
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
