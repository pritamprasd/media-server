from typing import Any

from sqlalchemy.exc import IntegrityError

from app import db
from app.models import ImportSession, ImportedDirectory, FileMetadata


def get_or_create_session(folder_path, groups) -> tuple[
    ImportedDirectory | Any, set[Any] | None, set[Any] | None, ImportSession | Any]:
    session = ImportSession.query.filter_by(root_path=folder_path).first()
    if session:
        root_dir = ImportedDirectory.query.filter_by(
            session_id=session.id, path=""
        ).first()
        seen_dirs = set()
        seen_files = set()
    else:
        session = ImportSession(
            root_path=folder_path,
            mime_groups=groups,
        )
        db.session.add(session)
        db.session.flush()

        root_dir = ImportedDirectory(
            session_id=session.id,
            path="",
            name="",
            parent_path=None,
        )
        db.session.add(root_dir)
        seen_dirs = seen_files = None
        db.session.flush()
    return root_dir, seen_dirs, seen_files, session


def get_or_create_metadata(file_id):
    for _ in range(3):
        meta = FileMetadata.query.filter_by(file_id=file_id).first()
        if meta:
            return meta
        try:
            meta = FileMetadata(file_id=file_id)
            db.session.add(meta)
            db.session.flush()
            return meta
        except IntegrityError:
            db.session.rollback()
    raise Exception(f"Failed to find/create FileMetadata for file_id={file_id}")
