from app import db


class UserMemory(db.Model):
    __tablename__ = "user_memories"

    id = db.Column(db.Integer, primary_key=True)
    file_id = db.Column(
        db.Integer, db.ForeignKey("imported_files.id", ondelete="CASCADE"), nullable=False
    )
    content = db.Column(db.Text, nullable=False)
    tags = db.Column(db.JSON, nullable=True)
    created_at = db.Column(db.DateTime, server_default=db.func.now())
    updated_at = db.Column(db.DateTime, server_default=db.func.now(), onupdate=db.func.now())

    file = db.relationship("ImportedFile", backref=db.backref("memories", cascade="all, delete-orphan"))

    def to_dict(self):
        return {
            "id": self.id,
            "file_id": self.file_id,
            "content": self.content,
            "tags": self.tags or [],
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
