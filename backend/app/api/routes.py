import os
from datetime import datetime

from flask import current_app, jsonify, request, send_file

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

config = get_config()

@api_bp.route("/status", methods=["GET"])
def status():
    return jsonify({"message": "API is running"}), 200


@api_bp.route("/directories", methods=["GET"])
def list_directories():
    dirs = ImportedDirectory.query.order_by(
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
    )

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
            .filter(FileMetadata.file_hash.isnot(None))
            .group_by(FileMetadata.file_hash)
            .having(db.func.count(FileMetadata.id) > 1)
            .all()
        )
        groups = []
        for h, cnt in hashes:
            metas = (
                FileMetadata.query.filter_by(file_hash=h)
                .join(ImportedFile)
                .order_by(ImportedFile.filename)
                .all()
            )
            group = []
            for m in metas:
                f = m.file
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
        near_meta = FileMetadata.query.filter(
            FileMetadata.dhash.isnot(None)
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
    files = ImportedFile.query.filter_by(
        is_favorite=True
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
