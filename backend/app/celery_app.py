import os
from pathlib import Path

from dotenv import load_dotenv
from celery import Celery

dotenv_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path)

celery = Celery("media_server")
celery.conf.update(
    broker_url=os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0"),
    result_backend=os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/0"),
    broker_connection_retry_on_startup=True,
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
