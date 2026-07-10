from app import db

collection_files = db.Table(
    "collection_files",
    db.Column("collection_id", db.Integer, db.ForeignKey("collections.id"), primary_key=True),
    db.Column("file_id", db.Integer, db.ForeignKey("imported_files.id"), primary_key=True),
)


class Collection(db.Model):
    __tablename__ = "collections"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.Text, nullable=False, unique=True)
    description = db.Column(db.Text, nullable=True)
    cover_file_id = db.Column(db.Integer, db.ForeignKey("imported_files.id"), nullable=True)
    created_at = db.Column(db.DateTime, server_default=db.func.now())
    updated_at = db.Column(db.DateTime, server_default=db.func.now(), onupdate=db.func.now())

    files = db.relationship("ImportedFile", secondary=collection_files, backref="collections")
    cover_file = db.relationship("ImportedFile", foreign_keys=[cover_file_id])

    def to_dict(self, include_files=False):
        result = {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "cover_file_id": self.cover_file_id,
            "file_count": len(self.files),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_files:
            result["files"] = [f.to_dict() for f in self.files]
        return result
