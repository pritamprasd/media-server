import os

from app import db
from app.models.import_session import ImportSession
from app.models.imported_file import ImportedFile
from app.models.file_metadata import FileMetadata, DHashBand
from app.models.detected_face import DetectedFace


def get_file_or_404(file_id):
    record = db.session.get(ImportedFile, file_id)
    if not record:
        return None
    return record


def toggle_favorite(file_id):
    file_record = db.session.get(ImportedFile, file_id)
    if not file_record:
        return {"error": "File not found"}, 404
    file_record.is_favorite = not file_record.is_favorite
    db.session.commit()
    return file_record.to_dict(), 200


def toggle_primary(file_id):
    file_record = db.session.get(ImportedFile, file_id)
    if not file_record:
        return {"error": "File not found"}, 404
    file_record.is_primary = not file_record.is_primary
    db.session.commit()
    return file_record.to_dict(), 200


def delete_file(file_id, delete_storage=False):
    file_record = db.session.get(ImportedFile, file_id)
    if not file_record:
        return {"error": "File not found"}, 404

    file_path = file_record.file_path

    meta = FileMetadata.query.filter_by(file_id=file_id).first()
    if meta:
        DHashBand.query.filter_by(metadata_id=meta.id).delete()
        db.session.delete(meta)

    DetectedFace.query.filter_by(file_id=file_id).delete()
    from app.metrics import files_deleted_total, update_library_stats
    files_deleted_total.inc()
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

    update_library_stats()

    return {"message": "File deleted"}, 200


def list_favorites():
    files = ImportedFile.query.filter(
        ImportedFile.deleted != True,
        ImportedFile.is_hidden != True,
        ImportedFile.is_favorite == True,
    ).order_by(ImportedFile.filename).all()
    return [f.to_dict() for f in files]
