from app import db


class ImportSession(db.Model):
    __tablename__ = "import_sessions"

    id = db.Column(db.Integer, primary_key=True)
    root_path = db.Column(db.Text, nullable=False)
    mime_groups = db.Column(db.JSON, nullable=False)
    total_files = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, server_default=db.func.now())

    directories = db.relationship(
        "ImportedDirectory",
        backref="session",
        lazy="dynamic",
        cascade="all, delete-orphan",
    )
    files = db.relationship(
        "ImportedFile",
        backref="session",
        lazy="dynamic",
        cascade="all, delete-orphan",
    )

    def to_dict(self):
        return {
            "id": self.id,
            "root_path": self.root_path,
            "mime_groups": self.mime_groups,
            "total_files": self.total_files,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
