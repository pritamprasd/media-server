import io
import os
import zipfile

from flask import current_app, jsonify, request, Response
from sqlalchemy import func

from app import db
from app.api import api_bp
from app.models.imported_file import ImportedFile
from app.models.collection import Collection, collection_files


@api_bp.route("/collections", methods=["GET"])
def list_collections():
    file_id = request.args.get("file_id", type=int)
    collections = Collection.query.order_by(Collection.updated_at.desc()).all()
    member_ids = set()
    if file_id:
        member_ids = {
            cid for (cid,) in db.session.query(collection_files.c.collection_id)
            .filter(collection_files.c.file_id == file_id)
            .all()
        }
    result = []
    for c in collections:
        d = c.to_dict()
        d["file_count"] = db.session.query(func.count()).select_from(collection_files).filter(
            collection_files.c.collection_id == c.id
        ).scalar()
        d["is_member"] = c.id in member_ids
        if c.cover_file_id:
            d["cover_thumbnail"] = f"/api/files/{c.cover_file_id}/thumbnail"
        else:
            first_file_id = db.session.query(collection_files.c.file_id).filter(
                collection_files.c.collection_id == c.id
            ).first()
            d["cover_thumbnail"] = f"/api/files/{first_file_id[0]}/thumbnail" if first_file_id else None
        result.append(d)
    return jsonify(result)


@api_bp.route("/collections", methods=["POST"])
def create_collection():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Name is required"}), 400
    if Collection.query.filter(func.lower(Collection.name) == name.lower()).first():
        return jsonify({"error": "A collection with this name already exists"}), 409
    collection = Collection(
        name=name,
        description=data.get("description", ""),
        cover_file_id=data.get("cover_file_id"),
    )
    db.session.add(collection)
    db.session.commit()
    return jsonify(collection.to_dict()), 201


@api_bp.route("/collections/<int:collection_id>", methods=["GET"])
def get_collection(collection_id):
    collection = db.session.get(Collection, collection_id)
    if not collection:
        return jsonify({"error": "Collection not found"}), 404
    d = collection.to_dict(include_files=True)
    if collection.cover_file_id:
        d["cover_thumbnail"] = f"/api/files/{collection.cover_file_id}/thumbnail"
    else:
        first_file_id = db.session.query(collection_files.c.file_id).filter(
            collection_files.c.collection_id == collection.id
        ).first()
        d["cover_thumbnail"] = f"/api/files/{first_file_id[0]}/thumbnail" if first_file_id else None
    for f in d.get("files", []):
        f["thumbnail"] = f"/api/files/{f['id']}/thumbnail"
    return jsonify(d)


@api_bp.route("/collections/<int:collection_id>", methods=["PUT"])
def update_collection(collection_id):
    collection = db.session.get(Collection, collection_id)
    if not collection:
        return jsonify({"error": "Collection not found"}), 404
    data = request.get_json(silent=True) or {}
    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            return jsonify({"error": "Name cannot be empty"}), 400
        existing = Collection.query.filter(
            func.lower(Collection.name) == name.lower(),
            Collection.id != collection_id,
        ).first()
        if existing:
            return jsonify({"error": "A collection with this name already exists"}), 409
        collection.name = name
    if "description" in data:
        collection.description = data["description"]
    if "cover_file_id" in data:
        collection.cover_file_id = data["cover_file_id"]
    db.session.commit()
    return jsonify(collection.to_dict())


@api_bp.route("/collections/<int:collection_id>", methods=["DELETE"])
def delete_collection(collection_id):
    collection = db.session.get(Collection, collection_id)
    if not collection:
        return jsonify({"error": "Collection not found"}), 404
    db.session.delete(collection)
    db.session.commit()
    return jsonify({"ok": True})


@api_bp.route("/collections/<int:collection_id>/files", methods=["POST"])
def add_files_to_collection(collection_id):
    collection = db.session.get(Collection, collection_id)
    if not collection:
        return jsonify({"error": "Collection not found"}), 404
    data = request.get_json(silent=True) or {}
    file_ids = data.get("file_ids", [])
    if not file_ids:
        return jsonify({"error": "file_ids is required"}), 400
    files = ImportedFile.query.filter(ImportedFile.id.in_(file_ids)).all()
    existing_ids = {f.id for f in collection.files}
    added = 0
    for f in files:
        if f.id not in existing_ids:
            collection.files.append(f)
            added += 1
    db.session.commit()
    return jsonify({"added": added, "total": len(collection.files)})


@api_bp.route("/collections/<int:collection_id>/files", methods=["DELETE"])
def remove_files_from_collection(collection_id):
    collection = db.session.get(Collection, collection_id)
    if not collection:
        return jsonify({"error": "Collection not found"}), 404
    data = request.get_json(silent=True) or {}
    file_ids = data.get("file_ids", [])
    if not file_ids:
        return jsonify({"error": "file_ids is required"}), 400
    file_id_set = set(file_ids)
    collection.files = [f for f in collection.files if f.id not in file_id_set]
    db.session.commit()
    return jsonify({"ok": True, "total": len(collection.files)})


@api_bp.route("/collections/<int:collection_id>/download", methods=["GET"])
def download_collection_zip(collection_id):
    collection = db.session.get(Collection, collection_id)
    if not collection:
        return jsonify({"error": "Collection not found"}), 404

    files = collection.files
    if not files:
        return jsonify({"error": "Collection is empty"}), 400

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        name_counts = {}
        for f in files:
            if not os.path.isfile(f.file_path):
                continue
            arcname = f.filename
            if arcname in name_counts:
                name_counts[arcname] += 1
                base, ext = os.path.splitext(arcname)
                arcname = f"{base}_{name_counts[arcname]}{ext}"
            else:
                name_counts[arcname] = 0
            zf.write(f.file_path, arcname)
    zip_data = zip_buf.getvalue()
    zip_buf.close()

    safe_name = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in collection.name)
    return Response(
        zip_data,
        mimetype="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}.zip"',
            "Content-Length": str(len(zip_data)),
        },
    )
