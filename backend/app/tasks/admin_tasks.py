import logging

from app import db
from app.celery_app import celery
from app.models.imported_file import ImportedFile
from app.tasks import (
    generate_thumbnail,
    extract_file_metadata,
    detect_faces,
)

logger = logging.getLogger(__name__)


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


@celery.task(name="app.tasks.bulk_generate_exif")
def bulk_generate_exif(file_ids):
    """Queue EXIF/metadata extraction for the given file ids."""
    files = ImportedFile.query.filter(ImportedFile.id.in_(file_ids)).all()
    for f in files:
        extract_file_metadata.delay(_make_file_info(f))
    logger.info("Queued %d files for EXIF extraction", len(files))
    return len(files)


@celery.task(name="app.tasks.bulk_generate_thumbnails")
def bulk_generate_thumbnails(file_ids):
    """Queue thumbnail generation for the given file ids."""
    files = ImportedFile.query.filter(ImportedFile.id.in_(file_ids)).all()
    for f in files:
        generate_thumbnail.delay(_make_file_info(f))
    logger.info("Queued %d files for thumbnail generation", len(files))
    return len(files)


@celery.task(name="app.tasks.bulk_detect_faces")
def bulk_detect_faces(file_ids):
    """Queue face detection for the given (image) file ids."""
    files = ImportedFile.query.filter(
        ImportedFile.id.in_(file_ids),
        ImportedFile.mime_type.like("image/%"),
    ).all()
    file_infos = [_make_file_info(f) for f in files]
    if file_infos:
        detect_faces.delay(file_infos)
    logger.info("Queued %d image files for face detection", len(file_infos))
    return len(file_infos)
