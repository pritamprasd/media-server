from app import db
from app.models import BaseModel

class DetectedFace(BaseModel):
    __tablename__ = "detected_faces"

    file_id = db.Column(db.Integer, db.ForeignKey("imported_files.id"), nullable=False, index=True)
    person_id = db.Column(db.Integer, db.ForeignKey("persons.id"), nullable=True, index=True)
    encoding = db.Column(db.JSON, nullable=True)
    bounding_box = db.Column(db.JSON, nullable=False)
    confidence = db.Column(db.Float, nullable=True)
    thumbnail = db.Column(db.Text, nullable=True)
    age = db.Column(db.Float, nullable=True)
    gender = db.Column(db.Integer, nullable=True)
    face_status = db.Column(db.String(32), default="detected")

    file = db.relationship("ImportedFile", backref=db.backref("detected_faces", lazy="dynamic"))
    person = db.relationship("Person", back_populates="faces")

    def to_dict(self):
        return {
            "id": self.id,
            "file_id": self.file_id,
            "person_id": self.person_id,
            "bounding_box": self.bounding_box,
            "confidence": self.confidence,
            "thumbnail": self.thumbnail,
            "age": self.age,
            "gender": self.gender,
            "face_status": self.face_status,
            "filename": self.file.filename if self.file else None,
            "file_mime": self.file.mime_type if self.file else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
