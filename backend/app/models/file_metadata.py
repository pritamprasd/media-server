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
    video_codec = db.Column(db.Text, nullable=True)

    tags = db.Column(db.JSON, nullable=True)
    description = db.Column(db.Text, nullable=True)
    search_words = db.Column(db.Text, nullable=True)

    file_hash = db.Column(db.String(64), nullable=True, index=True)
    dhash = db.Column(db.String(16), nullable=True)

    thumbnail = db.Column(db.Text, nullable=True)
    thumbnail_status = db.Column(db.Text, default="pending", nullable=False)

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
            "video_codec": self.video_codec,
            "tags": self.tags,
            "description": self.description,
            "search_words": self.search_words,
            "file_hash": self.file_hash,
            "dhash": self.dhash,
            "thumbnail": self.thumbnail,
            "thumbnail_status": self.thumbnail_status,
        }


class DHashBand(db.Model):
    __tablename__ = "dhash_bands"

    id = db.Column(db.Integer, primary_key=True)
    metadata_id = db.Column(
        db.Integer, db.ForeignKey("file_metadata.id"), nullable=False
    )
    band_index = db.Column(db.Integer, nullable=False)
    band_value = db.Column(db.Integer, nullable=False)

    __table_args__ = (
        db.Index("ix_dhash_band_lookup", "band_index", "band_value"),
    )

    metadata_rel = db.relationship("FileMetadata", backref="dhash_bands")
