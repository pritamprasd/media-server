import pytest

from app import create_app, db
from app.utility import database_utility
from app.utility.database_utility import get_or_create_session, get_or_create_metadata
from app.models.imported_file import ImportedFile


@pytest.fixture
def app_ctx():
    app = create_app(testing=True)
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


def test_get_or_create_session_creates(app_ctx):
    root_dir, seen_dirs, seen_files, session = get_or_create_session(
        "/tmp/media", ["image"]
    )
    assert session.id is not None
    assert session.root_path == "/tmp/media"
    assert root_dir.path == ""
    assert seen_dirs is None
    assert seen_files is None


def test_get_or_create_session_existing(app_ctx):
    _, _, _, session1 = get_or_create_session("/tmp/media2", ["image"])
    db.session.commit()
    root_dir, seen_dirs, seen_files, session2 = get_or_create_session(
        "/tmp/media2", ["image"]
    )
    assert session2.id == session1.id
    assert seen_dirs == set()
    assert seen_files == set()


def test_get_or_create_metadata(app_ctx):
    from datetime import datetime

    root_dir, _, _, session = get_or_create_session("/tmp/media3", ["image"])
    db.session.commit()
    f = ImportedFile(
        session_id=session.id,
        directory_id=root_dir.id,
        filename="a.jpg",
        file_path="/tmp/media3/a.jpg",
        relative_path="a.jpg",
        mime_type="image/jpeg",
        size=1,
        modified=datetime.utcnow(),
    )
    db.session.add(f)
    db.session.commit()

    meta1 = get_or_create_metadata(f.id)
    assert meta1.file_id == f.id
    meta2 = get_or_create_metadata(f.id)
    assert meta2.id == meta1.id
