import os
import mimetypes
from datetime import datetime

from flask import jsonify, request, send_file

from app import db
from app.api import api_bp
from app.models.import_session import ImportSession
from app.models.imported_directory import ImportedDirectory
from app.models.imported_file import ImportedFile
from app.models.file_metadata import FileMetadata
from app.tasks import extract_file_metadata, generate_ai_metadata

MIME_GROUPS = {
    "image": [
        "image/jpeg", "image/png", "image/gif", "image/webp",
        "image/bmp", "image/tiff", "image/svg+xml", "image/avif",
    ],
    "video": [
        "video/mp4", "video/x-matroska", "video/webm",
        "video/x-msvideo", "video/quicktime", "video/x-flv",
        "video/x-ms-wmv", "video/ogg",
    ],
}

EXT_TO_MIME = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".tiff": "image/tiff", ".tif": "image/tiff",
    ".svg": "image/svg+xml",
    ".avif": "image/avif",
    ".mp4": "video/mp4", ".m4v": "video/mp4",
    ".mkv": "video/x-matroska",
    ".webm": "video/webm",
    ".avi": "video/x-msvideo",
    ".mov": "video/quicktime",
    ".flv": "video/x-flv",
    ".wmv": "video/x-ms-wmv",
    ".ogv": "video/ogg",
}


def guess_mime(filename):
    ext = os.path.splitext(filename)[1].lower()
    mime = EXT_TO_MIME.get(ext)
    if mime:
        return mime
    guessed = mimetypes.guess_type(filename)[0]
    return guessed or "application/octet-stream"


def expand_mime_groups(groups):
    types = set()
    for g in groups:
        types.update(MIME_GROUPS.get(g, []))
    return types


@api_bp.route("/status", methods=["GET"])
def status():
    return jsonify({"message": "API is running"}), 200


@api_bp.route("/import", methods=["POST"])
def import_folder():
    data = request.get_json(silent=True) or {}
    folder_path = data.get("path", "").strip()
    groups = data.get("groups", [])

    if not folder_path:
        return jsonify({"error": "Path is required"}), 400
    if not groups:
        return jsonify({"error": "At least one MIME group (image/video) is required"}), 400
    if not os.path.isdir(folder_path):
        return jsonify({"error": f"Directory not found: {folder_path}"}), 404

    allowed_mimes = expand_mime_groups(groups)

    session = ImportSession.query.filter_by(root_path=folder_path).first()
    if session:
        root_dir = ImportedDirectory.query.filter_by(
            session_id=session.id, path=""
        ).first()
        seen_dirs = set()
        seen_files = set()
    else:
        session = ImportSession(
            root_path=folder_path,
            mime_groups=groups,
        )
        db.session.add(session)
        db.session.flush()

        root_dir = ImportedDirectory(
            session_id=session.id,
            path="",
            name="",
            parent_path=None,
        )
        db.session.add(root_dir)
        seen_dirs = seen_files = None

    db.session.flush()
    dir_map = {"": root_dir.id if root_dir else None}
    file_count = 0
    file_infos = []

    for root, dirs, filenames in os.walk(folder_path):
        rel_root = os.path.relpath(root, folder_path)
        if rel_root == ".":
            rel_root = ""

        for d in dirs:
            child_rel = os.path.join(rel_root, d) if rel_root else d
            parent_rel = rel_root
            dir_entry = ImportedDirectory.query.filter_by(
                session_id=session.id, path=child_rel
            ).first()
            if dir_entry:
                dir_entry.name = d
                dir_entry.parent_path = parent_rel
            else:
                dir_entry = ImportedDirectory(
                    session_id=session.id,
                    path=child_rel,
                    name=d,
                    parent_path=parent_rel,
                )
                db.session.add(dir_entry)
            db.session.flush()
            dir_map[child_rel] = dir_entry.id
            if seen_dirs is not None:
                seen_dirs.add(child_rel)

        for filename in filenames:
            full_path = os.path.join(root, filename)
            mime = guess_mime(filename)
            if mime not in allowed_mimes:
                continue

            rel_path = os.path.join(rel_root, filename) if rel_root else filename
            stat = os.stat(full_path)

            f = ImportedFile.query.filter_by(
                session_id=session.id, file_path=full_path
            ).first()
            if f:
                f.directory_id = dir_map.get(rel_root, root_dir.id)
                f.filename = filename
                f.relative_path = rel_path
                f.mime_type = mime
                f.size = stat.st_size
                f.modified = datetime.fromtimestamp(stat.st_mtime)
            else:
                f = ImportedFile(
                    session_id=session.id,
                    directory_id=dir_map.get(rel_root, root_dir.id),
                    filename=filename,
                    file_path=full_path,
                    relative_path=rel_path,
                    mime_type=mime,
                    size=stat.st_size,
                    modified=datetime.fromtimestamp(stat.st_mtime),
                )
                db.session.add(f)
            file_count += 1
            if seen_files is not None:
                seen_files.add(full_path)

            db.session.flush()
            file_infos.append({
                "id": f.id,
                "session_id": f.session_id,
                "directory_id": f.directory_id,
                "filename": f.filename,
                "file_path": f.file_path,
                "relative_path": f.relative_path,
                "mime_type": f.mime_type,
                "size": f.size,
                "modified": f.modified.isoformat(),
            })

    session.mime_groups = groups
    session.total_files = file_count
    if seen_dirs is not None and seen_files is not None:
        ImportedDirectory.query.filter(
            ImportedDirectory.session_id == session.id,
            ImportedDirectory.path != "",
            ~ImportedDirectory.path.in_(seen_dirs),
        ).delete(synchronize_session="fetch")
        ImportedFile.query.filter(
            ImportedFile.session_id == session.id,
            ~ImportedFile.file_path.in_(seen_files),
        ).delete(synchronize_session="fetch")
    db.session.commit()

    for file_info in file_infos:
        extract_file_metadata.delay(file_info)
        generate_ai_metadata.delay(file_info)

    return jsonify({
        "session": session.to_dict(),
        "message": f"Import completed. {file_count} file(s) imported.",
    }), 201


@api_bp.route("/sessions", methods=["GET"])
def list_sessions():
    sessions = ImportSession.query.order_by(ImportSession.created_at.desc()).all()
    return jsonify([s.to_dict() for s in sessions]), 200


@api_bp.route("/sessions/<int:session_id>/browse", methods=["GET"])
def browse_session(session_id):
    session = db.session.get(ImportSession, session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404

    path = request.args.get("path", "")

    directories = ImportedDirectory.query.filter_by(
        session_id=session_id, parent_path=path
    ).order_by(ImportedDirectory.name).all()

    if path == "":
        files = ImportedFile.query.filter_by(
            session_id=session_id, directory_id=(
                ImportedDirectory.query.filter_by(
                    session_id=session_id, path=""
                ).first().id
            )
        ).order_by(ImportedFile.filename).all()
    else:
        parent_dir = ImportedDirectory.query.filter_by(
            session_id=session_id, path=path
        ).first()
        if not parent_dir:
            return jsonify({"directories": [], "files": []}), 200
        files = ImportedFile.query.filter_by(
            directory_id=parent_dir.id
        ).order_by(ImportedFile.filename).all()

    return jsonify({
        "directories": [d.to_dict() for d in directories],
        "files": [f.to_dict() for f in files],
    }), 200


@api_bp.route("/files/<int:file_id>/metadata", methods=["GET"])
def get_file_metadata(file_id):
    file_record = db.session.get(ImportedFile, file_id)
    if not file_record:
        return jsonify({"error": "File not found"}), 404
    meta = FileMetadata.query.filter_by(file_id=file_id).first()
    if not meta:
        return jsonify({"error": "Metadata not yet available"}), 404
    return jsonify(meta.to_dict()), 200


@api_bp.route("/files/<int:file_id>/favorite", methods=["PATCH"])
def toggle_favorite(file_id):
    file_record = db.session.get(ImportedFile, file_id)
    if not file_record:
        return jsonify({"error": "File not found"}), 404
    file_record.is_favorite = not file_record.is_favorite
    db.session.commit()
    return jsonify(file_record.to_dict()), 200


@api_bp.route("/favorites", methods=["GET"])
def list_favorites():
    files = ImportedFile.query.filter_by(
        is_favorite=True
    ).order_by(ImportedFile.filename).all()
    return jsonify([f.to_dict() for f in files]), 200


@api_bp.route("/files/<int:file_id>/serve", methods=["GET"])
def serve_file(file_id):
    file_record = db.session.get(ImportedFile, file_id)
    if not file_record:
        return jsonify({"error": "File not found"}), 404
    if not os.path.isfile(file_record.file_path):
        return jsonify({"error": "File no longer exists on disk"}), 404
    return send_file(
        file_record.file_path,
        mimetype=file_record.mime_type,
        as_attachment=False,
    )
