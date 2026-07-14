import os


class Config:
    """Flask configuration loaded from environment variables.

    CRON_DB_PATH: Where the SQLite database is stored. Changing this moves
    all task history and job definitions. Must be a writable path inside
    the container (mounted volume recommended).

    CRON_CONFIG_PATH: Path to the YAML jobs config file. This is the
    source of truth on startup. If missing, an empty default is created.

    FLASK_SECRET_KEY: Secret for session signing. Change this in production
    to prevent session forgery.
    """
    DB_PATH = os.environ.get("CRON_DB_PATH", "data/cron.db")
    CONFIG_PATH = os.environ.get("CRON_CONFIG_PATH", "config/jobs.yaml")
    SECRET_KEY = os.environ.get("FLASK_SECRET_KEY", "cron-service-secret")
