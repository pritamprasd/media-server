import os

from flask import jsonify, request

from app import db
from app.api import api_bp
from app.models.imported_file import ImportedFile
from app.models.person import Person
from app.models.detected_face import DetectedFace
from app.tasks import detect_faces


@api_bp.route("/persons", methods=["GET"])
def list_persons():
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 50, type=int)
    per_page = min(per_page, 200)
    pagination = Person.query.order_by(
        Person.face_count.desc(), Person.created_at.desc()
    ).paginate(page=page, per_page=per_page, error_out=False)
    result = []
    for p in pagination.items:
        d = p.to_dict()
        sample_face = DetectedFace.query.filter_by(person_id=p.id).first()
        if sample_face:
            d["thumbnail"] = sample_face.thumbnail or d["thumbnail"]
        result.append(d)
    return jsonify({
        "persons": result,
        "page": page,
        "per_page": per_page,
        "total": pagination.total,
        "pages": pagination.pages,
    }), 200


@api_bp.route("/persons/<int:person_id>", methods=["PUT"])
def update_person(person_id):
    person = db.session.get(Person, person_id)
    if not person:
        return jsonify({"error": "Person not found"}), 404
    data = request.get_json(silent=True) or {}
    name = data.get("name")
    if name is not None:
        new_name = str(name).strip() or None
        old_name = person.name
        person.name = new_name

        from app.models.file_metadata import FileMetadata

        face_file_ids = db.session.query(DetectedFace.file_id).filter(
            DetectedFace.person_id == person_id
        ).distinct().all()
        face_file_ids = [r[0] for r in face_file_ids]

        for fid in face_file_ids:
            meta = FileMetadata.query.filter_by(file_id=fid).first()
            if not meta:
                continue
            tags = meta.tags or []

            if old_name and old_name in tags:
                tags = [t for t in tags if t != old_name]

            if new_name and new_name not in tags:
                tags.append(new_name)

            meta.tags = tags

    db.session.commit()
    return jsonify(person.to_dict()), 200


@api_bp.route("/persons/<int:person_id>", methods=["DELETE"])
def delete_person(person_id):
    person = db.session.get(Person, person_id)
    if not person:
        return jsonify({"error": "Person not found"}), 404
    DetectedFace.query.filter_by(person_id=person_id).update(
        {DetectedFace.person_id: None}, synchronize_session="fetch"
    )
    db.session.delete(person)
    db.session.commit()
    return jsonify({"message": "Person deleted"}), 200


@api_bp.route("/persons/<int:person_id>/faces", methods=["GET"])
def list_person_faces(person_id):
    person = db.session.get(Person, person_id)
    if not person:
        return jsonify({"error": "Person not found"}), 404
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 12, type=int)
    per_page = min(per_page, 100)
    pagination = DetectedFace.query.filter_by(person_id=person_id).order_by(
        DetectedFace.created_at.desc()
    ).paginate(page=page, per_page=per_page, error_out=False)
    faces = [f.to_dict() for f in pagination.items]
    return jsonify({
        "faces": faces,
        "page": page,
        "per_page": per_page,
        "total": pagination.total,
        "pages": pagination.pages,
    }), 200


@api_bp.route("/persons/<int:person_id>/files", methods=["GET"])
def list_person_files(person_id):
    person = db.session.get(Person, person_id)
    if not person:
        return jsonify({"error": "Person not found"}), 404
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 32, type=int)
    per_page = min(per_page, 200)
    query = ImportedFile.query.join(
        DetectedFace, ImportedFile.id == DetectedFace.file_id
    ).filter(
        DetectedFace.person_id == person_id,
        ImportedFile.deleted != True,
    ).order_by(ImportedFile.created_at.desc()).distinct()
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    from app.models.file_metadata import FileMetadata
    files = []
    for f in pagination.items:
        d = f.to_dict()
        meta = FileMetadata.query.filter_by(file_id=f.id).first()
        d["thumbnail"] = meta.thumbnail if meta else None
        d["thumbnail_status"] = meta.thumbnail_status if meta else "pending"
        files.append(d)
    return jsonify({
        "files": files,
        "page": page,
        "per_page": per_page,
        "total": pagination.total,
        "pages": pagination.pages,
    }), 200


@api_bp.route("/persons/scan", methods=["POST"])
def scan_all_faces():
    subq = db.session.query(DetectedFace.file_id).distinct().subquery()
    files = ImportedFile.query.filter(
        ImportedFile.deleted != True,
        ImportedFile.mime_type.like("image/%"),
        ~ImportedFile.id.in_(db.session.query(subq.c.file_id)),
    ).all()
    print(f"Total files for scan all faces: {len(files)}")
    count = 0
    for f in files:
        detect_faces.delay({
            "id": f.id,
            "file_path": f.file_path,
            "mime_type": f.mime_type,
            "filename": f.filename,
        })
        count += 1
    return jsonify({"message": f"Face detection queued for {count} files"}), 202


@api_bp.route("/files/<int:file_id>/detect-faces", methods=["POST"])
def detect_faces_for_file(file_id):
    file_record = db.session.get(ImportedFile, file_id)
    if not file_record:
        return jsonify({"error": "File not found"}), 404
    if not file_record.mime_type or not file_record.mime_type.startswith("image/"):
        return jsonify({"error": "Not an image file"}), 400
    file_info = {
        "id": file_record.id,
        "file_path": file_record.file_path,
        "mime_type": file_record.mime_type,
        "filename": file_record.filename,
    }
    detect_faces.delay(file_info)
    return jsonify({"message": "Face detection queued"}), 202


@api_bp.route("/faces/<int:face_id>", methods=["PUT"])
def update_face(face_id):
    face = db.session.get(DetectedFace, face_id)
    if not face:
        return jsonify({"error": "Face not found"}), 404
    data = request.get_json(silent=True) or {}
    name = data.get("name", "").strip() or None

    if not name:
        face.person_id = None
        db.session.commit()
        return jsonify({"message": "Face unassigned", "face_id": face.id}), 200

    person = Person.query.filter_by(name=name).first()
    if not person:
        person = Person(name=name, face_count=1)
        from app.utility.face_utility import compute_average_encoding
        if face.encoding:
            person.avg_encoding = compute_average_encoding([face.encoding])
        db.session.add(person)
        db.session.flush()
    else:
        person.face_count = (person.face_count or 0) + 1
        if face.encoding and person.avg_encoding:
            from app.utility.face_utility import compute_average_encoding
            person.avg_encoding = compute_average_encoding([person.avg_encoding, face.encoding])

    face.person_id = person.id

    from app.models.file_metadata import FileMetadata
    meta = FileMetadata.query.filter_by(file_id=face.file_id).first()
    if meta:
        tags = meta.tags or []
        if name not in tags:
            tags.append(name)
            meta.tags = tags

    db.session.commit()
    result = face.to_dict()
    result["person_name"] = person.name
    result["person_id"] = person.id
    return jsonify(result), 200


@api_bp.route("/faces", methods=["GET"])
def list_recent_faces():
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 50, type=int)
    per_page = min(per_page, 200)
    person_id = request.args.get("person_id", type=int)
    query = DetectedFace.query
    if person_id is not None:
        query = query.filter_by(person_id=person_id)
    pagination = query.order_by(DetectedFace.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    faces = [f.to_dict() for f in pagination.items]
    return jsonify({
        "faces": faces,
        "page": page,
        "per_page": per_page,
        "total": pagination.total,
        "pages": pagination.pages,
    }), 200


@api_bp.route("/persons/merge", methods=["POST"])
def merge_persons():
    data = request.get_json(silent=True) or {}
    person_ids = data.get("person_ids", [])
    target_name = data.get("name", "").strip() or None
    if len(person_ids) < 2:
        return jsonify({"error": "At least 2 person IDs required"}), 400
    persons = Person.query.filter(Person.id.in_(person_ids)).all()
    if len(persons) < 2:
        return jsonify({"error": "At least 2 valid persons required"}), 400
    persons.sort(key=lambda p: p.id)
    target = persons[0]
    others = persons[1:]
    face_count = target.face_count or 0
    all_encodings = []
    if target.avg_encoding:
        all_encodings.append(target.avg_encoding)
    for other in others:
        DetectedFace.query.filter_by(person_id=other.id).update(
            {DetectedFace.person_id: target.id}, synchronize_session="fetch"
        )
        face_count += other.face_count or 0
        if other.avg_encoding:
            all_encodings.append(other.avg_encoding)
        db.session.delete(other)
    from app.utility.face_utility import compute_average_encoding
    from app.models.file_metadata import FileMetadata
    target.face_count = face_count
    if all_encodings:
        target.avg_encoding = compute_average_encoding(all_encodings)
    if target_name:
        old_name = target.name
        target.name = target_name
        face_file_ids = db.session.query(DetectedFace.file_id).filter(
            DetectedFace.person_id == target.id
        ).distinct().all()
        face_file_ids = [r[0] for r in face_file_ids]
        for fid in face_file_ids:
            meta = FileMetadata.query.filter_by(file_id=fid).first()
            if not meta:
                continue
            tags = meta.tags or []
            if old_name and old_name in tags:
                tags = [t for t in tags if t != old_name]
            if target_name and target_name not in tags:
                tags.append(target_name)
            meta.tags = tags
    db.session.commit()
    return jsonify(target.to_dict()), 200


@api_bp.route("/files/<int:file_id>/faces", methods=["GET"])
def list_file_faces(file_id):
    file_record = db.session.get(ImportedFile, file_id)
    if not file_record:
        return jsonify({"error": "File not found"}), 404
    faces = DetectedFace.query.filter_by(file_id=file_id).order_by(
        DetectedFace.confidence.desc()
    ).all()
    result = []
    for f in faces:
        d = f.to_dict()
        if f.person:
            d["person_name"] = f.person.name
            d["person_id"] = f.person.id
        else:
            d["person_name"] = None
        result.append(d)
    return jsonify(result), 200


@api_bp.route("/faces/stats", methods=["GET"])
def face_stats():
    total_persons = Person.query.count()
    total_faces = DetectedFace.query.count()
    named_persons = Person.query.filter(Person.name.isnot(None)).count()
    files_with_faces = db.session.query(DetectedFace.file_id).distinct().count()
    return jsonify({
        "total_persons": total_persons,
        "total_faces": total_faces,
        "named_persons": named_persons,
        "files_with_faces": files_with_faces,
    }), 200
