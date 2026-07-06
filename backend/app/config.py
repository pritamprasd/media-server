import os


class Config:
    # Flask session signing key. Changing it invalidates all existing sessions (users
    # will be logged out). Must be a long random string in production.
    SECRET_KEY = os.environ.get("SECRET_KEY", "change-me-in-production")

    # SQLAlchemy connection string. Switch to PostgreSQL in production by setting
    # DATABASE_URL (e.g. postgresql://user:pass@host:5432/dbname). Defaults to a
    # local SQLite file for development convenience.
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", "sqlite:///media_server.db"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_POOL_SIZE = 10
    SQLALCHEMY_MAX_OVERFLOW = 20
    SQLALCHEMY_POOL_PRE_PING = True
    SQLALCHEMY_POOL_RECYCLE = 3600

    # Allowed origins for browser cross-origin requests. Add your frontend URL(s)
    # here (comma-separated). In production this should be the domain serving the
    # frontend (e.g. https://media-server.example.com).
    CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:5173")

    # Redis URL for Celery message broker. Change if Redis runs on a different
    # host/port or uses authentication (e.g. redis://:password@host:6379/0).
    CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0")
    # Redis URL for Celery task result storage. Can be the same as BROKER_URL.
    # Results are used for tracking async task status from the frontend.
    CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")

    # Base URL of the Ollama server hosting vision/text models. Change when
    # running Ollama on a different host or port.
    OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
    # Vision model used for AI image analysis (captioning, object detection, etc.).
    # Must support the /api/chat endpoint with image inputs (e.g. llava, bakllava).
    OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llava")
    # Text-only model used for non-vision AI tasks (e.g. ingredient analysis,
    # recipe generation). Defaults to llama3.2.
    OLLAMA_TEXT_MODEL = os.environ.get("OLLAMA_TEXT_MODEL", "llama3.2")

    # Directory where edited/cropped/processed images are saved. Must exist and be
    # writable by the backend process. Used by the edit/save endpoint in routes.py.
    EDITED_IMAGES_DIR = os.environ.get(
        "EDITED_IMAGES_DIR",
        os.path.join(os.path.expanduser("~"), "media-server-edited"),
    )
    # Default directory path used by the import-from-folder feature. Can be an
    # absolute path or a tilde-expanded home directory path.
    IMPORT_DEFAULT_PATH = os.environ.get("IMPORT_DEFAULT_PATH", "~")
    # Directory where uploaded files are temporarily stored before processing.
    # Must be writable. In Docker deployments this is typically /uploads.
    UPLOAD_DIR = os.environ.get("UPLOAD_DIR", os.path.join("/uploads"))

    # Maximum cosine-distance threshold for matching a detected face to an
    # existing Person record. Lower values = stricter matching (fewer false
    # positives but may miss genuine matches). Range: 0.0–1.0. Default 0.4.
    FACE_MATCH_THRESHOLD = float(os.environ.get("FACE_MATCH_THRESHOLD", "0.3"))
    # Comma-separated list of ONNX Runtime execution providers tried in order
    # for InsightFace inference. GPU providers are tried first; CPU is the final
    # fallback. Example: CUDAExecutionProvider,TensorrtExecutionProvider,CPUExecutionProvider
    FACE_PROVIDERS = os.environ.get("FACE_PROVIDERS", "CUDAExecutionProvider,TensorrtExecutionProvider,CPUExecutionProvider")
    # Minimum confidence score for InsightFace to report a detection. Lower
    # values detect more faces (including blurry/occluded ones) but increase
    # false positives. Range: 0.0–1.0. Default 0.3.
    FACE_DET_THRESH = float(os.environ.get("FACE_DET_THRESH", "0.5"))



class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False


class TestingConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"


config_by_name = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
}


def get_config():
    env = os.environ.get("FLASK_ENV", "development")
    return config_by_name.get(env, DevelopmentConfig)()
