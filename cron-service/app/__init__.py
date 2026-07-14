import os
import sqlite3
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO

db = SQLAlchemy()
socketio = SocketIO()


def _schema_needs_update(db_path):
    """Check if the SQLite schema is missing columns from the current model."""
    if not os.path.exists(db_path):
        return False
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.execute("PRAGMA table_info(cron_job)")
        columns = {row[1] for row in cursor.fetchall()}
        conn.close()
        return "task_type" not in columns or "params" not in columns
    except Exception:
        return False


def create_app():
    app = Flask(__name__)

    app.config["SECRET_KEY"] = os.environ.get("FLASK_SECRET_KEY", "cron-service-secret")
    db_path = os.environ.get("CRON_DB_PATH", "data/cron.db")
    os.makedirs(os.path.dirname(db_path) if os.path.dirname(db_path) else "data", exist_ok=True)
    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{db_path}"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    db.init_app(app)
    socketio.init_app(app, async_mode="gevent", cors_allowed_origins="*")

    from app.routes import bp
    app.register_blueprint(bp)

    from app.socket_events import register_events
    register_events(socketio)

    with app.app_context():
        from app import models

        if _schema_needs_update(db_path):
            db.drop_all()

        db.create_all()

        from app.config_loader import load_jobs_from_config
        load_jobs_from_config(app)

        from app.scheduler import init_scheduler
        init_scheduler(app)

    return app
