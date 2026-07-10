from flask import Blueprint

api_bp = Blueprint("api", __name__)

from app.api import routes  # noqa: E402, F401
from app.api import face_routes  # noqa: E402, F401
from app.api import collection_routes  # noqa: E402, F401
