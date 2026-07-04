import os
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from flask import Flask
from flask_cors import CORS
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy

from app.config import get_config

db = SQLAlchemy()
migrate = Migrate()


def create_app(testing=False):
    application = Flask(__name__)

    config_obj = get_config()
    application.config.from_object(config_obj)

    if testing:
        application.config["TESTING"] = True
        application.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
        application.config["CELERY_BROKER_URL"] = "memory://"
        application.config["CELERY_RESULT_BACKEND"] = "cache+memory://"
        application.config["CELERY_TASK_ALWAYS_EAGER"] = True
        application.config["CELERY_TASK_EAGER_PROPAGATES"] = True

    CORS(application, resources={r"/api/*": {"origins": application.config.get("CORS_ORIGINS", "*")}})

    db.init_app(application)
    migrate.init_app(application, db)

    from app.api import api_bp
    application.register_blueprint(api_bp, url_prefix="/api")

    import app.models  # noqa: F401

    from app.celery_app import init_celery
    init_celery(application)
    application.extensions["celery"] = True

    from app.metrics import init_flask_metrics
    init_flask_metrics(application)

    @application.route("/health")
    def health():
        return {"status": "ok"}

    return application
