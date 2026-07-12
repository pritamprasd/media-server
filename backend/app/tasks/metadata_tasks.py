import logging

from app import db
from app.celery_app import celery
from app.models import ImportedFile
from app.utility.database_utility import get_or_create_metadata
from app.utility.tags_utility import extract_folder_tags
from app.utility.hash_utility import compute_file_hash, compute_dhash, dhash_to_bands
from app.utility.image_utility import extract_image_metadata
from app.utility.video_utility import extract_video_metadata
from app.metrics import metadata_extracted_total, metadata_failed_total

logger = logging.getLogger(__name__)


@celery.task(bind=True, max_retries=3, name="app.tasks.extract_file_metadata")
def extract_file_metadata(self, file_info):
    file_id = file_info["id"]
    file_path = file_info["file_path"]
    mime = file_info.get("mime_type", "")
    relative_path = file_info.get("relative_path", "")
    meta = get_or_create_metadata(file_id)
    meta.metadata_status = "extracting"

    folder_tags = extract_folder_tags(file_path)
    if folder_tags:
        existing = meta.tags or []
        merged = list(dict.fromkeys(folder_tags + existing))
        meta.tags = merged
    db.session.commit()

    try:
        file_hash = compute_file_hash(file_path)
        meta.file_hash = file_hash
        if mime.startswith("image/"):
            extract_image_metadata(file_path, meta)
            dhash = compute_dhash(file_path)
            meta.dhash = dhash
            bands = dhash_to_bands(dhash)
            from app.models.file_metadata import DHashBand
            DHashBand.query.filter_by(metadata_id=meta.id).delete()
            for bi, bv in enumerate(bands):
                db.session.add(DHashBand(metadata_id=meta.id, band_index=bi, band_value=bv))
        elif mime.startswith("video/"):
            extract_video_metadata(file_path, meta)
        meta.metadata_status = "extracted"
        metadata_extracted_total.inc()
    except Exception as exc:
        meta.metadata_status = "failed"
        metadata_failed_total.inc()
        db.session.commit()
        raise self.retry(exc=exc, countdown=60)

    db.session.commit()
    return {"file_id": file_id, "status": meta.metadata_status}
