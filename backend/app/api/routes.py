import io
import os
from datetime import datetime

from flask import current_app, jsonify, request, send_file
from werkzeug.utils import secure_filename

from app import db
from app.api import api_bp
from app.config import get_config
from app.models.file_metadata import FileMetadata, DHashBand
from app.models.import_session import ImportSession
from app.models.imported_directory import ImportedDirectory
from app.models.imported_file import ImportedFile
from app.tasks import extract_file_metadata, generate_ai_metadata, generate_thumbnail, process_import_folder
from app.utility.file_system import traverse_directory
from app.utility.hash_utility import hamming_distance
from app.utility.mime_utility import guess_mime

config = get_config()

@api_bp.route("/status", methods=["GET"])
def status():
    return jsonify({"message": "API is running"}), 200


@api_bp.route("/directories", methods=["GET"])
def list_directories():
    dirs = ImportedDirectory.query.filter(
        ImportedDirectory.deleted != True
    ).order_by(
        ImportedDirectory.session_id, ImportedDirectory.path
    ).all()
    session_cache = {}
    result = []
    for d in dirs:
        entry = d.to_dict()
        if d.session_id not in session_cache:
            session = db.session.get(ImportSession, d.session_id)
            session_cache[d.session_id] = session.root_path if session else ""
        entry["session_root_path"] = session_cache[d.session_id]
        result.append(entry)
    return jsonify(result)


@api_bp.route("/browse-fs", methods=["GET"])
def browse_fs():
    path = request.args.get("path", "").strip()
    if not path:
        path = os.path.expanduser(config.IMPORT_DEFAULT_PATH)
    path = os.path.normpath(path)
    if not os.path.isdir(path):
        return jsonify({"error": "Directory not found"}), 404
    dirs, files, parent = traverse_directory(path)
    return jsonify({
        "path": path,
        "parent": parent,
        "directories": dirs,
        "files": files,
    })


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

    process_import_folder.delay(folder_path, groups)
    return jsonify({
        "session": "",
        "message": f"Import initiated"
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

    directories = ImportedDirectory.query.filter(
        ImportedDirectory.deleted != True,
        ImportedDirectory.session_id == session_id,
        ImportedDirectory.parent_path == path,
    ).order_by(ImportedDirectory.name).all()

    if path == "":
        root_dir = ImportedDirectory.query.filter_by(
            session_id=session_id, path=""
        ).first()
        files = ImportedFile.query.filter(
            ImportedFile.deleted != True,
            ImportedFile.session_id == session_id,
            ImportedFile.directory_id == (root_dir.id if root_dir else -1),
        ).order_by(ImportedFile.filename).all()
    else:
        parent_dir = ImportedDirectory.query.filter(
            ImportedDirectory.deleted != True,
            ImportedDirectory.session_id == session_id,
            ImportedDirectory.path == path,
        ).first()
        if not parent_dir:
            return jsonify({"directories": [], "files": []}), 200
        files = ImportedFile.query.filter(
            ImportedFile.deleted != True,
            ImportedFile.directory_id == parent_dir.id,
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


@api_bp.route("/files/<int:file_id>/tags", methods=["PATCH"])
def update_file_tags(file_id):
    file_record = db.session.get(ImportedFile, file_id)
    if not file_record:
        return jsonify({"error": "File not found"}), 404
    data = request.get_json(silent=True) or {}
    tags = data.get("tags", [])
    if not isinstance(tags, list):
        return jsonify({"error": "tags must be a list"}), 400
    meta = FileMetadata.query.filter_by(file_id=file_id).first()
    if not meta:
        return jsonify({"error": "Metadata not yet available"}), 404
    meta.tags = tags
    db.session.commit()
    return jsonify({"tags": meta.tags}), 200


@api_bp.route("/files/<int:file_id>/favorite", methods=["PATCH"])
def toggle_favorite(file_id):
    file_record = db.session.get(ImportedFile, file_id)
    if not file_record:
        return jsonify({"error": "File not found"}), 404
    file_record.is_favorite = not file_record.is_favorite
    db.session.commit()
    return jsonify(file_record.to_dict()), 200


@api_bp.route("/files", methods=["GET"])
def list_files():
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 50, type=int)
    per_page = min(per_page, 200)
    mime_group = request.args.get("mime_group")
    q = request.args.get("q", "").strip()
    directory_id = request.args.get("directory_id", type=int)
    min_width = request.args.get("min_width", type=int)
    min_height = request.args.get("min_height", type=int)

    query = db.session.query(
        ImportedFile, FileMetadata.thumbnail, FileMetadata.thumbnail_status,
        FileMetadata.width, FileMetadata.height, FileMetadata.tags
    ).outerjoin(
        FileMetadata, ImportedFile.id == FileMetadata.file_id
    ).filter(ImportedFile.deleted != True)

    if directory_id is not None and directory_id > 0:
        dir_record = db.session.get(ImportedDirectory, directory_id)
        if dir_record:
            dir_path = dir_record.path
            base = ImportedDirectory.query.filter(
                ImportedDirectory.session_id == dir_record.session_id,
            )
            if dir_path:
                descendants = base.filter(
                    db.or_(
                        ImportedDirectory.path == dir_path,
                        ImportedDirectory.path.like(f"{dir_path}/%"),
                    )
                )
            else:
                descendants = base
            dir_ids = [d.id for d in descendants.all()]
            query = query.filter(ImportedFile.directory_id.in_(dir_ids))

    if mime_group == "image":
        query = query.filter(ImportedFile.mime_type.like("image/%"))
    elif mime_group == "video":
        query = query.filter(ImportedFile.mime_type.like("video/%"))

    if q:
        like = f"%{q}%"
        query = query.filter(
            db.or_(
                db.cast(FileMetadata.tags, db.String).ilike(like),
                FileMetadata.description.ilike(like),
                FileMetadata.search_words.ilike(like),
                ImportedFile.filename.ilike(like),
            )
        )

    tag = request.args.get("tag", "").strip().lower()
    if tag:
        query = query.filter(FileMetadata.tags.cast(db.String).contains(f'"{tag}"'))

    has_ai = request.args.get("has_ai", type=bool)
    if has_ai:
        query = query.filter(
            db.or_(
                FileMetadata.tags.isnot(None),
                FileMetadata.description.isnot(None),
                FileMetadata.search_words.isnot(None),
            )
        )

    if min_width is not None:
        query = query.filter(
            db.or_(FileMetadata.width.is_(None), FileMetadata.width >= min_width)
        )
    if min_height is not None:
        query = query.filter(
            db.or_(FileMetadata.height.is_(None), FileMetadata.height >= min_height)
        )

    pagination = query.order_by(
        ImportedFile.created_at.desc()
    ).paginate(
        page=page, per_page=per_page, error_out=False
    )

    files = []
    for f, thumb, thumb_status, w, h, tags in pagination.items:
        d = f.to_dict()
        d["thumbnail"] = thumb
        d["thumbnail_status"] = thumb_status or "pending"
        d["width"] = w
        d["height"] = h
        d["tags"] = tags
        d["created_at"] = f.created_at.isoformat() if f.created_at else None
        files.append(d)

    return jsonify({
        "files": files,
        "page": page,
        "per_page": per_page,
        "total": pagination.total,
        "pages": pagination.pages,
    }), 200


@api_bp.route("/duplicates", methods=["GET"])
def list_duplicates():
    type_ = request.args.get("type", "exact")
    if type_ == "exact":
        hashes = (
            db.session.query(FileMetadata.file_hash, db.func.count(FileMetadata.id))
            .join(ImportedFile, FileMetadata.file_id == ImportedFile.id)
            .filter(
                ImportedFile.deleted != True,
                FileMetadata.file_hash.isnot(None),
            )
            .group_by(FileMetadata.file_hash)
            .having(db.func.count(FileMetadata.id) > 1)
            .all()
        )
        groups = []
        for h, cnt in hashes:
            metas = (
                FileMetadata.query.filter_by(file_hash=h)
                .join(ImportedFile)
                .filter(ImportedFile.deleted != True)
                .order_by(ImportedFile.filename)
                .all()
            )
            group = []
            for m in metas:
                f = m.file
                if f.deleted:
                    continue
                group.append({
                    "file_id": f.id,
                    "filename": f.filename,
                    "size": f.size,
                    "mime_type": f.mime_type,
                    "file_hash": m.file_hash,
                    "thumbnail": m.thumbnail,
                })
            groups.append({"hash": h, "count": cnt, "files": group})
        return jsonify({"groups": groups}), 200

    if type_ == "near":
        THRESHOLD = 10
        near_meta = FileMetadata.query.join(
            ImportedFile, FileMetadata.file_id == ImportedFile.id
        ).filter(
            ImportedFile.deleted != True,
            FileMetadata.dhash.isnot(None),
        ).all()
        pairs = []
        seen = set()
        for i, m1 in enumerate(near_meta):
            bands1 = {b.band_index: b.band_value for b in m1.dhash_bands}
            for j, m2 in enumerate(near_meta):
                if i >= j:
                    continue
                key = tuple(sorted([m1.file_id, m2.file_id]))
                if key in seen:
                    continue
                bands2 = {b.band_index: b.band_value for b in m2.dhash_bands}
                matches = sum(
                    1 for bi in range(4)
                    if bands1.get(bi) == bands2.get(bi)
                )
                if matches >= 3:
                    dist = hamming_distance(m1.dhash, m2.dhash)
                    if dist <= THRESHOLD:
                        seen.add(key)
                        pairs.append({
                            "distance": dist,
                            "file_a": {
                                "file_id": m1.file_id,
                                "filename": m1.file.filename,
                                "thumbnail": m1.thumbnail,
                            },
                            "file_b": {
                                "file_id": m2.file_id,
                                "filename": m2.file.filename,
                                "thumbnail": m2.thumbnail,
                            },
                        })
        pairs.sort(key=lambda p: p["distance"])
        return jsonify({"pairs": pairs}), 200

    return jsonify({"error": "Invalid type"}), 400


@api_bp.route("/files/<int:file_id>/near-duplicates", methods=["GET"])
def get_near_duplicates(file_id):
    meta = FileMetadata.query.filter_by(file_id=file_id).first()
    if not meta or not meta.dhash:
        return jsonify({"error": "No dhash available"}), 404

    THRESHOLD = 10
    bands = {b.band_index: b.band_value for b in meta.dhash_bands}

    candidate_ids = set()
    for bi in range(4):
        matching = DHashBand.query.filter_by(
            band_index=bi, band_value=bands[bi]
        ).all()
        for m in matching:
            if m.metadata_id != meta.id:
                candidate_ids.add(m.metadata_id)

    results = []
    for mid in candidate_ids:
        other = db.session.get(FileMetadata, mid)
        if not other or not other.dhash:
            continue
        dist = hamming_distance(meta.dhash, other.dhash)
        if dist <= THRESHOLD:
            results.append({
                "distance": dist,
                "file_id": other.file_id,
                "filename": other.file.filename,
                "thumbnail": other.thumbnail,
            })

    results.sort(key=lambda r: r["distance"])
    return jsonify({"duplicates": results}), 200


@api_bp.route("/favorites", methods=["GET"])
def list_favorites():
    files = ImportedFile.query.filter(
        ImportedFile.deleted != True,
        ImportedFile.is_favorite == True,
    ).order_by(ImportedFile.filename).all()
    return jsonify([f.to_dict() for f in files]), 200


@api_bp.route("/files/<int:file_id>/thumbnail", methods=["GET"])
def get_file_thumbnail(file_id):
    meta = FileMetadata.query.filter_by(file_id=file_id).first()
    if not meta or not meta.thumbnail:
        return jsonify({"error": "Thumbnail not available"}), 404
    header, _, b64data = meta.thumbnail.partition(",")
    return jsonify({
        "thumbnail": meta.thumbnail,
        "thumbnail_status": meta.thumbnail_status,
    }), 200


@api_bp.route("/files/<int:file_id>/edit", methods=["POST"])
def edit_file(file_id):
    from PIL import Image

    data = request.get_json(silent=True) or {}
    operations = data.get("operations", [])

    file_record = db.session.get(ImportedFile, file_id)
    if not file_record:
        return jsonify({"error": "File not found"}), 404
    if not os.path.isfile(file_record.file_path):
        return jsonify({"error": "Original file no longer exists"}), 404

    img = Image.open(file_record.file_path)
    img = img.convert("RGB")

    for op in operations:
        op_type = op.get("type")
        if op_type == "rotate":
            img = img.rotate(op.get("degrees", 0), expand=True, resample=Image.BICUBIC)
        elif op_type == "flip":
            d = op.get("direction")
            if d == "horizontal":
                img = img.transpose(Image.FLIP_LEFT_RIGHT)
            elif d == "vertical":
                img = img.transpose(Image.FLIP_TOP_BOTTOM)
        elif op_type == "grayscale":
            img = img.convert("L").convert("RGB")

    edited_dir = current_app.config["EDITED_IMAGES_DIR"]
    os.makedirs(edited_dir, exist_ok=True)

    stem, _ = os.path.splitext(file_record.filename)
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    save_name = f"{stem}_edited_{ts}.jpg"
    save_path = os.path.join(edited_dir, save_name)

    img.save(save_path, format="JPEG", quality=95)
    img.close()

    session = ImportSession.query.filter_by(root_path=edited_dir).first()
    if not session:
        session = ImportSession(root_path=edited_dir, mime_groups=["image"])
        db.session.add(session)
        db.session.flush()
        root_dir = ImportedDirectory(
            session_id=session.id, path="", name="", parent_path=None,
        )
        db.session.add(root_dir)
        db.session.flush()
    else:
        root_dir = ImportedDirectory.query.filter_by(
            session_id=session.id, path=""
        ).first()

    stat = os.stat(save_path)
    f = ImportedFile(
        session_id=session.id,
        directory_id=root_dir.id,
        filename=save_name,
        file_path=save_path,
        relative_path=save_name,
        mime_type="image/jpeg",
        size=stat.st_size,
        modified=datetime.fromtimestamp(stat.st_mtime),
    )
    db.session.add(f)
    db.session.flush()

    session.total_files = (session.total_files or 0) + 1
    db.session.commit()

    file_info = {
        "id": f.id,
        "session_id": f.session_id,
        "directory_id": f.directory_id,
        "filename": f.filename,
        "file_path": f.file_path,
        "relative_path": f.relative_path,
        "mime_type": f.mime_type,
        "size": f.size,
        "modified": f.modified.isoformat(),
    }

    extract_file_metadata.delay(file_info)
    generate_ai_metadata.delay(file_info)
    generate_thumbnail.delay(file_info)

    return jsonify(f.to_dict()), 201


def _convert_heic_to_jpeg(path):
    import subprocess as sp

    for cmd in (["magick", "convert"], ["convert"]):
        try:
            result = sp.run(
                [*cmd, "-define", "jpeg:preserve-exif=true", path, "jpeg:-"],
                capture_output=True, timeout=30,
            )
            if result.returncode == 0 and result.stdout:
                return result.stdout
        except Exception:
            pass
    return None


@api_bp.route("/files/<int:file_id>/serve", methods=["GET"])
def serve_file(file_id):
    file_record = db.session.get(ImportedFile, file_id)
    if not file_record:
        return jsonify({"error": "File not found"}), 404
    if not os.path.isfile(file_record.file_path):
        return jsonify({"error": "File no longer exists on disk"}), 404
    if file_record.mime_type in ("image/heic", "image/heif"):
        jpeg_data = _convert_heic_to_jpeg(file_record.file_path)
        if jpeg_data:
            return send_file(io.BytesIO(jpeg_data), mimetype="image/jpeg", as_attachment=False)
        return jsonify({"error": "Could not decode HEIC image"}), 500
    return send_file(
        file_record.file_path,
        mimetype=file_record.mime_type,
        as_attachment=False,
    )


@api_bp.route("/files/<int:file_id>", methods=["DELETE"])
def delete_file(file_id):
    data = request.get_json(silent=True) or {}
    delete_storage = data.get("delete_storage", False)

    file_record = db.session.get(ImportedFile, file_id)
    if not file_record:
        return jsonify({"error": "File not found"}), 404

    file_path = file_record.file_path

    FileMetadata.query.filter_by(file_id=file_id).delete()

    session = ImportSession.query.get(file_record.session_id)
    db.session.delete(file_record)
    if session:
        session.total_files = max(0, (session.total_files or 0) - 1)

    db.session.commit()

    if delete_storage and os.path.isfile(file_path):
        try:
            os.remove(file_path)
        except OSError:
            pass

    return jsonify({"message": "File deleted"}), 200


ALLOWED_UPLOAD_MIMES = {
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "image/bmp", "image/tiff", "image/avif", "image/heic", "image/heif",
    "video/mp4", "video/x-matroska", "video/webm",
    "video/x-msvideo", "video/quicktime", "video/x-flv",
    "video/x-ms-wmv", "video/ogg",
}


def _get_or_create_upload_session(upload_dir):
    session = ImportSession.query.filter_by(root_path=upload_dir).first()
    if session:
        root_dir = ImportedDirectory.query.filter_by(
            session_id=session.id, path=""
        ).first()
        return session, root_dir
    session = ImportSession(root_path=upload_dir, mime_groups=["image", "video"])
    db.session.add(session)
    db.session.flush()
    root_dir = ImportedDirectory(
        session_id=session.id, path="", name="", parent_path=None,
    )
    db.session.add(root_dir)
    db.session.flush()
    return session, root_dir


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


@api_bp.route("/upload/directories", methods=["GET"])
def list_upload_dirs():
    upload_dir = current_app.config["UPLOAD_DIR"]
    prefix = request.args.get("prefix", "").strip().strip("/")
    scan_dir = os.path.join(upload_dir, prefix) if prefix else upload_dir
    if not os.path.isdir(scan_dir):
        return jsonify({"directories": [], "prefix": prefix}), 200
    dirs = []
    for entry in sorted(os.listdir(scan_dir)):
        full = os.path.join(scan_dir, entry)
        if os.path.isdir(full):
            dirs.append({"name": entry, "path": os.path.join(prefix, entry) if prefix else entry})
    return jsonify({"directories": dirs, "prefix": prefix}), 200


@api_bp.route("/upload/directories", methods=["POST"])
def create_upload_dir():
    upload_dir = current_app.config["UPLOAD_DIR"]
    data = request.get_json(silent=True) or {}
    path = data.get("path", "").strip().strip("/")
    if not path:
        return jsonify({"error": "Path is required"}), 400
    full = os.path.join(upload_dir, path)
    try:
        os.makedirs(full, exist_ok=True)
    except OSError as e:
        return jsonify({"error": str(e)}), 500
    session, root_dir = _get_or_create_upload_session(upload_dir)
    _ensure_upload_subdir(session, path)
    db.session.commit()
    return jsonify({"path": path, "message": "Directory created"}), 201


@api_bp.route("/upload", methods=["POST"])
def upload_files():
    upload_dir = current_app.config["UPLOAD_DIR"]
    subdir = request.form.get("directory", "").strip().strip("/")
    nickname = request.form.get("nickname", "").strip()
    if not nickname:
        return jsonify({"error": "nickname is required"}), 400

    files = request.files.getlist("files")
    if not files:
        return jsonify({"error": "No files provided"}), 400

    target_dir = os.path.join(upload_dir, subdir) if subdir else upload_dir
    os.makedirs(target_dir, exist_ok=True)

    session, root_dir = _get_or_create_upload_session(upload_dir)
    parent_dir = _ensure_upload_subdir(session, subdir) if subdir else root_dir

    saved = []
    errors = []

    for f in files:
        if not f.filename:
            continue
        safe = secure_filename(f.filename)
        if not safe:
            safe = f.filename

        save_path = os.path.join(target_dir, safe)
        f.save(save_path)

        mime = guess_mime(save_path)
        if mime not in ALLOWED_UPLOAD_MIMES:
            try:
                os.remove(save_path)
            except OSError:
                pass
            errors.append({"filename": safe, "error": f"Unsupported mime type: {mime}"})
            continue

        stat = os.stat(save_path)
        rel_path = os.path.join(subdir, safe) if subdir else safe

        file_record = ImportedFile(
            session_id=session.id,
            directory_id=parent_dir.id,
            filename=safe,
            file_path=save_path,
            relative_path=rel_path,
            mime_type=mime,
            nickname=nickname,
            size=stat.st_size,
            modified=datetime.fromtimestamp(stat.st_mtime),
        )
        db.session.add(file_record)
        db.session.flush()

        session.total_files = (session.total_files or 0) + 1
        db.session.commit()

        file_info = {
            "id": file_record.id,
            "session_id": file_record.session_id,
            "directory_id": file_record.directory_id,
            "filename": file_record.filename,
            "file_path": file_record.file_path,
            "relative_path": file_record.relative_path,
            "mime_type": file_record.mime_type,
            "size": file_record.size,
            "modified": file_record.modified.isoformat(),
        }

        extract_file_metadata.delay(file_info)
        generate_ai_metadata.delay(file_info)
        generate_thumbnail.delay(file_info)

        saved.append(file_record.to_dict())

    return jsonify({"saved": saved, "errors": errors}), 201


@api_bp.route("/upload/files/delete", methods=["POST"])
def soft_delete_upload_files():
    data = request.get_json(silent=True) or {}
    file_ids = data.get("file_ids", [])
    paths = data.get("paths", [])
    if not file_ids and not paths:
        return jsonify({"error": "Provide file_ids or paths"}), 400

    query = ImportedFile.query
    if file_ids:
        query = query.filter(ImportedFile.id.in_(file_ids))
    if paths:
        query = query.filter(ImportedFile.file_path.in_(paths))

    count = query.update({ImportedFile.deleted: True}, synchronize_session="fetch")
    db.session.commit()
    return jsonify({"deleted": count}), 200


@api_bp.route("/upload/directories/delete", methods=["POST"])
def soft_delete_upload_dir():
    data = request.get_json(silent=True) or {}
    path = data.get("path", "").strip().strip("/")
    if not path:
        return jsonify({"error": "path is required"}), 400

    upload_dir = current_app.config["UPLOAD_DIR"]
    full_path = os.path.join(upload_dir, path)

    dirs = ImportedDirectory.query.filter(
        ImportedDirectory.path == path
    ).all()
    for d in dirs:
        d.deleted = True
        ImportedFile.query.filter_by(directory_id=d.id).update(
            {ImportedFile.deleted: True}, synchronize_session="fetch"
        )

    subdirs = ImportedDirectory.query.filter(
        ImportedDirectory.path.like(f"{path}/%")
    ).all()
    sub_ids = [sd.id for sd in subdirs]
    if sub_ids:
        ImportedDirectory.query.filter(ImportedDirectory.id.in_(sub_ids)).update(
            {ImportedDirectory.deleted: True}, synchronize_session="fetch"
        )
        ImportedFile.query.filter(ImportedFile.directory_id.in_(sub_ids)).update(
            {ImportedFile.deleted: True}, synchronize_session="fetch"
        )

    db.session.commit()

    return jsonify({"message": f"Deleted path '{path}'", "deleted_dirs": len(dirs) + len(subdirs)}), 200


@api_bp.route("/upload/files/recent", methods=["GET"])
def list_recent_upload_files():
    upload_dir = current_app.config["UPLOAD_DIR"]
    session, _root_dir = _get_or_create_upload_session(upload_dir)
    prefix = request.args.get("prefix", "").strip().strip("/")
    query = ImportedFile.query.filter(
        ImportedFile.deleted != True,
        ImportedFile.session_id == session.id,
    )
    if prefix:
        like = f"{prefix}/%"
        no_sub = f"{prefix}/%/%"
        query = query.filter(
            db.or_(
                ImportedFile.relative_path == prefix,
                db.and_(
                    ImportedFile.relative_path.like(like),
                    ~ImportedFile.relative_path.like(no_sub),
                ),
            )
        )
    else:
        query = query.filter(~ImportedFile.relative_path.like("%/%"))
    files = query.order_by(ImportedFile.created_at.desc()).limit(100).all()
    return jsonify({"files": [f.to_dict() for f in files]}), 200


@api_bp.route("/upload/nicknames", methods=["GET"])
def list_nicknames():
    upload_dir = current_app.config["UPLOAD_DIR"]
    session, _root_dir = _get_or_create_upload_session(upload_dir)
    rows = (
        db.session.query(ImportedFile.nickname)
        .filter(
            ImportedFile.nickname.isnot(None),
            ImportedFile.nickname != "",
            ImportedFile.session_id == session.id,
        )
        .distinct()
        .order_by(ImportedFile.nickname)
        .all()
    )
    return jsonify({"nicknames": [r[0] for r in rows]}), 200


@api_bp.route("/tags", methods=["GET"])
def list_all_tags():
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


@api_bp.route("/stats", methods=["GET"])
def get_statistics():
    total_files = ImportedFile.query.filter(ImportedFile.deleted != True).count()
    total_favorites = ImportedFile.query.filter(
        ImportedFile.deleted != True, ImportedFile.is_favorite == True
    ).count()
    total_metadata = FileMetadata.query.count()

    image_count = ImportedFile.query.filter(
        ImportedFile.deleted != True,
        ImportedFile.mime_type.like("image/%"),
    ).count()
    video_count = ImportedFile.query.filter(
        ImportedFile.deleted != True,
        ImportedFile.mime_type.like("video/%"),
    ).count()

    total_size = db.session.query(db.func.sum(ImportedFile.size)).filter(
        ImportedFile.deleted != True
    ).scalar() or 0

    statuses = (
        db.session.query(
            FileMetadata.metadata_status, db.func.count(FileMetadata.id)
        )
        .group_by(FileMetadata.metadata_status)
        .all()
    )

    thumbnail_statuses = (
        db.session.query(
            FileMetadata.thumbnail_status, db.func.count(FileMetadata.id)
        )
        .group_by(FileMetadata.thumbnail_status)
        .all()
    )

    date_counts = (
        db.session.query(
            db.func.date(ImportedFile.created_at).label("date"),
            ImportedFile.mime_type,
            db.func.count(ImportedFile.id),
        )
        .filter(ImportedFile.created_at.isnot(None), ImportedFile.deleted != True)
        .group_by(db.func.date(ImportedFile.created_at), ImportedFile.mime_type)
        .order_by(db.func.date(ImportedFile.created_at).desc())
        .all()
    )

    date_rows = {}
    for d, mt, cnt in date_counts:
        d_str = str(d)
        if d_str not in date_rows:
            date_rows[d_str] = {"date": d_str, "image": 0, "video": 0}
        if mt and mt.startswith("image/"):
            date_rows[d_str]["image"] += cnt
        elif mt and mt.startswith("video/"):
            date_rows[d_str]["video"] += cnt
        else:
            date_rows[d_str]["other"] = date_rows[d_str].get("other", 0) + cnt
    files_by_date = list(date_rows.values())
    files_by_date.sort(key=lambda x: x["date"])

    tags_raw = []
    all_metas = FileMetadata.query.filter(
        FileMetadata.tags.isnot(None)
    ).with_entities(FileMetadata.tags).all()
    for (tags,) in all_metas:
        if tags and isinstance(tags, list):
            tags_raw.extend(tags)

    tag_freq = {}
    for t in tags_raw:
        t = t.strip().lower()
        if t:
            tag_freq[t] = tag_freq.get(t, 0) + 1
    top_tags = sorted(tag_freq.items(), key=lambda x: -x[1])[:20]

    files_with_gps = FileMetadata.query.filter(
        FileMetadata.latitude.isnot(None),
        FileMetadata.longitude.isnot(None),
    ).count()

    files_with_description = FileMetadata.query.filter(
        FileMetadata.description.isnot(None),
        FileMetadata.description != "",
    ).count()

    files_with_nickname = ImportedFile.query.filter(
        ImportedFile.deleted != True,
        ImportedFile.nickname.isnot(None),
        ImportedFile.nickname != "",
    ).count()

    mime_detail = (
        db.session.query(
            ImportedFile.mime_type, db.func.count(ImportedFile.id)
        )
        .filter(ImportedFile.deleted != True)
        .group_by(ImportedFile.mime_type)
        .order_by(db.func.count(ImportedFile.id).desc())
        .all()
    )

    tag_count_dist = {}
    for (tags,) in all_metas:
        cnt = len(tags) if tags else 0
        tag_count_dist[cnt] = tag_count_dist.get(cnt, 0) + 1
    tag_count_buckets = sorted(tag_count_dist.items())

    dim_ranges = {"< 1 MP": 0, "1-5 MP": 0, "5-10 MP": 0, "10+ MP": 0, "unknown": 0}
    dim_metas = FileMetadata.query.with_entities(
        FileMetadata.width, FileMetadata.height
    ).all()
    for w, h in dim_metas:
        if w and h:
            mp = (w * h) / 1_000_000
            if mp < 1:
                dim_ranges["< 1 MP"] += 1
            elif mp < 5:
                dim_ranges["1-5 MP"] += 1
            elif mp < 10:
                dim_ranges["5-10 MP"] += 1
            else:
                dim_ranges["10+ MP"] += 1
        else:
            dim_ranges["unknown"] += 1

    def fmt(s):
        if s < 1024:
            return f"{s} B"
        if s < 1048576:
            return f"{s / 1024:.1f} KB"
        if s < 1073741824:
            return f"{s / 1048576:.1f} MB"
        return f"{s / 1073741824:.2f} GB"

    return jsonify({
        "overview": {
            "total_files": total_files,
            "total_favorites": total_favorites,
            "total_metadata": total_metadata,
            "total_size": total_size,
            "total_size_formatted": fmt(total_size),
        },
        "mime_breakdown": {
            "image": image_count,
            "video": video_count,
        },
        "mime_detail": [
            {"mime": m, "count": c} for m, c in mime_detail
        ],
        "metadata_status": [
            {"status": s, "count": c} for s, c in statuses
        ],
        "thumbnail_status": [
            {"status": s, "count": c} for s, c in thumbnail_statuses
        ],
        "files_by_date": files_by_date,
        "top_tags": [
            {"tag": t, "count": c} for t, c in top_tags
        ],
        "tag_count_distribution": [
            {"tag_count": k, "file_count": v} for k, v in tag_count_buckets
        ],
        "dimension_ranges": dim_ranges,
        "coverage": {
            "files_with_gps": files_with_gps,
            "files_with_description": files_with_description,
            "files_with_nickname": files_with_nickname,
        },
    })


@api_bp.route("/files/with-gps", methods=["GET"])
def list_files_with_gps():
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 200, type=int)
    per_page = min(per_page, 1000)

    query = ImportedFile.query.join(
        FileMetadata, ImportedFile.id == FileMetadata.file_id
    ).options(
        db.contains_eager(ImportedFile.metadata)
    ).filter(
        ImportedFile.deleted != True,
        FileMetadata.latitude.isnot(None),
        FileMetadata.longitude.isnot(None),
    ).order_by(ImportedFile.created_at.desc())

    pag = query.paginate(page=page, per_page=per_page, error_out=False)
    items = []
    for f in pag.items:
        items.append({
            "id": f.id,
            "filename": f.filename,
            "latitude": f.metadata.latitude,
            "longitude": f.metadata.longitude,
            "thumbnail": f.metadata.thumbnail if f.metadata else None,
            "mime_type": f.mime_type,
            "created_at": f.created_at.isoformat() if f.created_at else None,
        })
    return jsonify({
        "files": items,
        "total": pag.total,
        "page": pag.page,
        "per_page": pag.per_page,
        "pages": pag.pages,
    }), 200
