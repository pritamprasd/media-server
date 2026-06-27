from app import db


class BaseModel(db.Model):
    __abstract__ = True

    id = db.Column(db.Integer, primary_key=True)
    created_at = db.Column(db.DateTime, server_default=db.func.now())
    updated_at = db.Column(db.DateTime, server_default=db.func.now(), onupdate=db.func.now())


from app.models.import_session import ImportSession  # noqa: E402, F401
from app.models.imported_directory import ImportedDirectory  # noqa: E402, F401
from app.models.imported_file import ImportedFile  # noqa: E402, F401
from app.models.file_metadata import FileMetadata, DHashBand  # noqa: E402, F401
from app.models.location import SavedLocation  # noqa: E402, F401
from app.models.filter_preset import FilterPreset  # noqa: E402, F401
from app.models.person import Person  # noqa: E402, F401
from app.models.detected_face import DetectedFace  # noqa: E402, F401
