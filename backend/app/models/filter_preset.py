from app.models import BaseModel, db


class FilterPreset(BaseModel):
    __tablename__ = "filter_presets"

    name = db.Column(db.String(255), nullable=False)
    operations = db.Column(db.JSON, nullable=False)
    file_id = db.Column(db.Integer, db.ForeignKey("imported_files.id"), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "operations": self.operations,
            "file_id": self.file_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
