import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO

db = SQLAlchemy()
socketio = SocketIO()


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
        db.create_all()

        from app.config_loader import load_jobs_from_config
        load_jobs_from_config(app)

        from app.scheduler import init_scheduler
        init_scheduler(app)

    return app
