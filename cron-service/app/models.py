from datetime import datetime, timezone
from app import db


class CronJob(db.Model):
    __tablename__ = "cron_job"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False, unique=True)
    source = db.Column(db.String(500), nullable=False)
    destination = db.Column(db.String(500), nullable=False)
    schedule = db.Column(db.String(100), nullable=False, default="0 * * * *")
    enabled = db.Column(db.Boolean, default=True)
    extra_flags = db.Column(db.String(500), default="")
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    tasks = db.relationship("TaskRun", backref="job", lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "source": self.source,
            "destination": self.destination,
            "schedule": self.schedule,
            "enabled": self.enabled,
            "extra_flags": self.extra_flags,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class TaskRun(db.Model):
    __tablename__ = "task_run"

    id = db.Column(db.Integer, primary_key=True)
    job_id = db.Column(db.Integer, db.ForeignKey("cron_job.id"), nullable=True)
    source = db.Column(db.String(500), nullable=False)
    destination = db.Column(db.String(500), nullable=False)
    status = db.Column(db.String(20), default="running")
    started_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    ended_at = db.Column(db.DateTime, nullable=True)
    output = db.Column(db.Text, default="")
    summary = db.Column(db.String(500), default="")
    pid = db.Column(db.Integer, nullable=True)
    extra_flags = db.Column(db.String(500), default="")
    job_name = db.Column(db.String(200), default="Manual Run")

    def to_dict(self):
        return {
            "id": self.id,
            "job_id": self.job_id,
            "job_name": self.job_name,
            "source": self.source,
            "destination": self.destination,
            "status": self.status,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
            "output": self.output,
            "summary": self.summary,
            "pid": self.pid,
            "extra_flags": self.extra_flags,
        }
