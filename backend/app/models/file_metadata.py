from app import db


class FileMetadata(db.Model):
    __tablename__ = "file_metadata"

    id = db.Column(db.Integer, primary_key=True)
    file_id = db.Column(
        db.Integer, db.ForeignKey("imported_files.id"), nullable=False, unique=True
    )
    metadata_status = db.Column(db.Text, default="pending", nullable=False)

    exif = db.Column(db.JSON, nullable=True)
    latitude = db.Column(db.Float, nullable=True)
    longitude = db.Column(db.Float, nullable=True)
    date_taken = db.Column(db.DateTime, nullable=True)
    width = db.Column(db.Integer, nullable=True)
    height = db.Column(db.Integer, nullable=True)
    duration = db.Column(db.Float, nullable=True)

    tags = db.Column(db.JSON, nullable=True)
    description = db.Column(db.Text, nullable=True)
    search_words = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, server_default=db.func.now())
    updated_at = db.Column(db.DateTime, server_default=db.func.now(), onupdate=db.func.now())

    file = db.relationship("ImportedFile", backref=db.backref("metadata", uselist=False))

    def to_dict(self):
        return {
            "id": self.id,
            "file_id": self.file_id,
            "metadata_status": self.metadata_status,
            "exif": self.exif,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "date_taken": self.date_taken.isoformat() if self.date_taken else None,
            "width": self.width,
            "height": self.height,
            "duration": self.duration,
            "tags": self.tags,
            "description": self.description,
            "search_words": self.search_words,
        }
