import logging
import ollama

from app import db
from app.celery_app import celery
from app.models.ai_metadata import AiMetadataModel
from app.utility.database_utility import get_or_create_metadata
from app.utility.llm_utility import parse_ai_response
from app.utility.tags_utility import extract_folder_tags
from app.utility.video_utility import extract_video_frames
from app.metrics import ai_descriptions_total, ai_failed_total

logger = logging.getLogger(__name__)
AI_METADATA_SCHEMA = AiMetadataModel.model_json_schema()


def _heic_to_jpeg_base64(path):
    import base64
    import subprocess as sp
    for cmd in (["magick", "convert"], ["convert"]):
        try:
            result = sp.run([*cmd, "-define", "jpeg:preserve-exif=true", path, "jpeg:-"], capture_output=True, timeout=30)
            if result.returncode == 0 and result.stdout:
                return base64.b64encode(result.stdout).decode("utf-8")
        except Exception:
            pass
    return None


@celery.task(bind=True, max_retries=3, name="app.tasks.generate_ai_metadata")
def generate_ai_metadata(self, file_info):
    from flask import current_app
    file_id = file_info["id"]
    file_path = file_info["file_path"]
    mime = file_info.get("mime_type", "")
    filename = file_info.get("filename", "")

    meta = get_or_create_metadata(file_id)
    meta.metadata_status = "processing_ai"
    db.session.commit()

    host = current_app.config.get("OLLAMA_BASE_URL", "http://localhost:11434")
    vision_model = current_app.config.get("OLLAMA_MODEL", "llava")
    client = ollama.Client(host=host)

    system_prompt = (
        "Describe the provided image/video in 1-2 sentences, "
        "then list 5-10 relevant tags, "
        "then list 5-10 short search keywords. "
        "Respond with valid JSON matching the provided schema."
    )

    try:
        if mime.startswith("image/"):
            images = [file_path]
            if mime in ("image/heic", "image/heif"):
                b64 = _heic_to_jpeg_base64(file_path)
                if b64:
                    images = [b64]
                else:
                    current_app.logger.warning("AI metadata: could not convert HEIC to JPEG for file %d", file_id)
            response = client.chat(
                model=vision_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": "Describe this image.", "images": images},
                ],
                format=AI_METADATA_SCHEMA,
                options={"temperature": 0.3},
            )
            used_model = vision_model
        else:
            frames = extract_video_frames(file_path)
            if frames:
                response = client.chat(
                    model=vision_model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": "These are frames from a video. Describe the video scene.", "images": frames},
                    ],
                    format=AI_METADATA_SCHEMA,
                    options={"temperature": 0.3},
                )
                used_model = vision_model
            else:
                raise Exception("No frames extracted from video")

        raw = response["message"]["content"]

        if not raw or not raw.strip():
            logger.error(
                "Ollama returned empty response for file_id=%s model=%s",
                file_id, used_model,
            )
            raise Exception("Ollama returned empty response")

        metadata = parse_ai_response(raw)
        meta.description = metadata.description or raw.strip()[:500]
        ai_tags = metadata.tags or []
        folder_tags = extract_folder_tags(file_info.get("relative_path", ""))
        merged = list(dict.fromkeys(folder_tags + ai_tags))
        meta.tags = merged
        meta.search_words = ", ".join(metadata.search_words) if metadata.search_words else ""
        meta.metadata_status = "completed"
        ai_descriptions_total.inc()

    except Exception as exc:
        meta.metadata_status = "failed"
        ai_failed_total.inc()
        db.session.commit()
        raise self.retry(exc=exc, countdown=60)

    db.session.commit()
    return {"file_id": file_id, "status": meta.metadata_status}
