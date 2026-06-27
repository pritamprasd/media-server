from app import db
from app.models import BaseModel

class Person(BaseModel):
    __tablename__ = "persons"

    name = db.Column(db.String(255), nullable=True)
    thumbnail = db.Column(db.Text, nullable=True)
    face_count = db.Column(db.Integer, default=0)
    avg_encoding = db.Column(db.JSON, nullable=True)
    meta_info = db.Column(db.JSON, nullable=True)

    faces = db.relationship("DetectedFace", back_populates="person", lazy="dynamic")

    def to_dict(self):
        avg_enc = self.avg_encoding if self.avg_encoding else []
        return {
            "id": self.id,
            "name": self.name,
            "thumbnail": self.thumbnail,
            "face_count": self.face_count,
            "avg_encoding": avg_enc[:8],
            "meta_info": self.meta_info,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
