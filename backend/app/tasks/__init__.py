from app.celery_app import celery
from app.tasks.import_tasks import process_import_folder
from app.tasks.metadata_tasks import extract_file_metadata
from app.tasks.ai_tasks import generate_ai_metadata
from app.tasks.thumbnail_tasks import generate_thumbnail
from app.tasks.face_tasks import detect_faces
from app.tasks.admin_tasks import bulk_generate_exif, bulk_generate_thumbnails, bulk_detect_faces

__all__ = [
    "celery",
    "process_import_folder",
    "extract_file_metadata",
    "generate_ai_metadata",
    "generate_thumbnail",
    "detect_faces",
    "bulk_generate_exif",
    "bulk_generate_thumbnails",
    "bulk_detect_faces",
]
