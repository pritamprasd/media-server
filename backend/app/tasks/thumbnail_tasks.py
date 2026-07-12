from app import db
from app.celery_app import celery
from app.utility.database_utility import get_or_create_metadata
from app.utility.image_utility import generate_image_thumbnail
from app.utility.video_utility import generate_video_thumbnail
from app.metrics import thumbnails_generated_total


@celery.task(bind=True, max_retries=3, name="app.tasks.generate_thumbnail")
def generate_thumbnail(self, file_info):
    file_id = file_info["id"]
    file_path = file_info["file_path"]
    mime = file_info.get("mime_type", "")

    meta = get_or_create_metadata(file_id)
    meta.thumbnail_status = "generating"
    db.session.commit()

    try:
        if mime.startswith("image/"):
            generate_image_thumbnail(file_path, meta)
        elif mime.startswith("video/"):
            generate_video_thumbnail(file_path, meta)
        meta.thumbnail_status = "completed" if meta.thumbnail else "failed"
        if meta.thumbnail_status == "completed":
            thumbnails_generated_total.inc()
    except Exception as exc:
        meta.thumbnail_status = "failed"
        db.session.commit()
        raise self.retry(exc=exc, countdown=60)

    db.session.commit()
    return {"file_id": file_id, "thumbnail_status": meta.thumbnail_status}
