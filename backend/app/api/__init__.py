from app.api import sessions_routes  # noqa: F401
from app.api import files_routes  # noqa: F401
from app.api import upload_routes  # noqa: F401
from app.api import explorer_routes  # noqa: F401
from app.api import filters_routes  # noqa: F401
from app.api import map_routes  # noqa: F401
from app.api import tools_routes  # noqa: F401
from app.api import system_routes  # noqa: F401
from app.api import face_routes  # noqa: F401
from app.api import collection_routes  # noqa: F401
from app.api import memory_routes  # noqa: F401
from app.api import admin_routes  # noqa: F401

from app.api.sessions_routes import sessions_bp
from app.api.files_routes import files_bp
from app.api.upload_routes import upload_bp
from app.api.explorer_routes import explorer_bp
from app.api.filters_routes import filters_bp
from app.api.map_routes import map_bp
from app.api.tools_routes import tools_bp
from app.api.system_routes import system_bp
from app.api.face_routes import face_bp
from app.api.collection_routes import collection_bp
from app.api.memory_routes import memory_bp
from app.api.admin_routes import admin_bp

__all__ = [
    "sessions_bp", "files_bp", "upload_bp", "explorer_bp", "filters_bp",
    "map_bp", "tools_bp", "system_bp", "face_bp", "collection_bp", "memory_bp",
    "admin_bp",
]
