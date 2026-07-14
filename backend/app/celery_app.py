import os
from pathlib import Path

from dotenv import load_dotenv
from celery import Celery

dotenv_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path)

_Q_IMPORT = os.environ.get("CELERY_QUEUE_IMPORT", "import_queue_dev")
_Q_METADATA = os.environ.get("CELERY_QUEUE_METADATA", "metadata_dev")
_Q_AI = os.environ.get("CELERY_QUEUE_AI", "ai_metadata_dev")
_Q_THUMB = os.environ.get("CELERY_QUEUE_THUMBNAIL", "thumbnail_dev")
_Q_FACE = os.environ.get("CELERY_QUEUE_FACE", "face_detection_dev")

celery = Celery("media_server")
celery.conf.update(
    broker_url=os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0"),
    result_backend=os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/0"),
    broker_connection_retry_on_startup=True,
    task_queues={
        "celery": {},
        _Q_METADATA: {},
        _Q_AI: {},
        _Q_THUMB: {},
        _Q_IMPORT: {},
        _Q_FACE: {},
    },
    task_routes={
        "app.tasks.process_import_folder": {"queue": _Q_IMPORT},
        "app.tasks.extract_file_metadata": {"queue": _Q_METADATA},
        "app.tasks.generate_ai_metadata": {"queue": _Q_AI},
        "app.tasks.generate_thumbnail": {"queue": _Q_THUMB},
        "app.tasks.detect_faces": {"queue": _Q_FACE},
        "app.tasks.bulk_generate_exif": {"queue": _Q_IMPORT},
        "app.tasks.bulk_generate_thumbnails": {"queue": _Q_THUMB},
        "app.tasks.bulk_detect_faces": {"queue": _Q_FACE},
    },
)


_app = None

class FlaskTask(celery.Task):
    abstract = True

    def __call__(self, *args, **kwargs):
        from flask import has_app_context
        if has_app_context():
            return super().__call__(*args, **kwargs)
        global _app
        if _app is None:
            from app import create_app
            _app = create_app()
        with _app.app_context():
            return super().__call__(*args, **kwargs)


celery.Task = FlaskTask


def init_celery(app, celery=celery):
    celery.conf.update(
        broker_url=app.config["CELERY_BROKER_URL"],
        result_backend=app.config["CELERY_RESULT_BACKEND"],
        **{k: v for k, v in app.config.items() if k.startswith("CELERY_")},
    )
    return celery


from app.metrics import instrument_celery
instrument_celery(celery)
