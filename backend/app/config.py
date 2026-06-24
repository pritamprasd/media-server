import os


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "change-me-in-production")
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", "sqlite:///media_server.db"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_POOL_SIZE = 10
    SQLALCHEMY_MAX_OVERFLOW = 20
    SQLALCHEMY_POOL_PRE_PING = True
    SQLALCHEMY_POOL_RECYCLE = 3600
    CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:5173")
    CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0")
    CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")
    OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
    OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llava")
    EDITED_IMAGES_DIR = os.environ.get(
        "EDITED_IMAGES_DIR",
        os.path.join(os.path.expanduser("~"), "media-server-edited"),
    )


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
