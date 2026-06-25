from app import db


class ImportedFile(db.Model):
    __tablename__ = "imported_files"

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(
        db.Integer, db.ForeignKey("import_sessions.id"), nullable=False
    )
    directory_id = db.Column(
        db.Integer, db.ForeignKey("imported_directories.id"), nullable=False
    )
    filename = db.Column(db.Text, nullable=False)
    file_path = db.Column(db.Text, nullable=False)
    relative_path = db.Column(db.Text, nullable=False)
    mime_type = db.Column(db.Text, nullable=False)
    size = db.Column(db.BigInteger, nullable=False)
    modified = db.Column(db.DateTime, nullable=False)
    is_favorite = db.Column(db.Boolean, default=False, nullable=False)
    nickname = db.Column(db.Text, nullable=True)
    deleted = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, server_default=db.func.now())

    __table_args__ = (db.UniqueConstraint("session_id", "file_path"),)

    directory = db.relationship("ImportedDirectory", backref="files_rel")

    def to_dict(self):
        return {
            "id": self.id,
            "filename": self.filename,
            "relative_path": self.relative_path,
            "mime_type": self.mime_type,
            "size": self.size,
            "modified": self.modified.isoformat() if self.modified else None,
            "is_favorite": self.is_favorite,
            "nickname": self.nickname,
            "deleted": self.deleted,
        }
