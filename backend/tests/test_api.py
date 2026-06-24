import os
import tempfile

import pytest

from app import create_app, db
from app.models.imported_file import ImportedFile


@pytest.fixture
def client():
    app = create_app(testing=True)
    with app.test_client() as client:
        with app.app_context():
            db.create_all()
        yield client


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.get_json() == {"status": "ok"}


def test_api_status(client):
    resp = client.get("/api/status")
    assert resp.status_code == 200
    assert resp.get_json()["message"] == "API is running"


def test_import_missing_path(client):
    resp = client.post("/api/import", json={"groups": ["image"]})
    assert resp.status_code == 400


def test_import_missing_groups(client):
    resp = client.post("/api/import", json={"path": "/tmp"})
    assert resp.status_code == 400


def test_import_not_found(client):
    resp = client.post("/api/import", json={"path": "/nonexistent", "groups": ["image"]})
    assert resp.status_code == 404


def test_import_success(client):
    with tempfile.TemporaryDirectory() as tmpdir:
        os.makedirs(os.path.join(tmpdir, "sub"))
        open(os.path.join(tmpdir, "photo.jpg"), "w").close()
        open(os.path.join(tmpdir, "sub", "video.mp4"), "w").close()
        open(os.path.join(tmpdir, "notes.txt"), "w").close()

        resp = client.post("/api/import", json={
            "path": tmpdir,
            "groups": ["image", "video"],
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["session"]["total_files"] == 2


def test_list_sessions(client):
    resp = client.get("/api/sessions")
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), list)


def test_browse_and_serve(client):
    with tempfile.TemporaryDirectory() as tmpdir:
        open(os.path.join(tmpdir, "test.jpg"), "w").close()
        open(os.path.join(tmpdir, "test.png"), "w").close()

        imp_resp = client.post("/api/import", json={
            "path": tmpdir,
            "groups": ["image"],
        })
        session_id = imp_resp.get_json()["session"]["id"]

        browse_resp = client.get(f"/api/sessions/{session_id}/browse")
        assert browse_resp.status_code == 200
        data = browse_resp.get_json()
        assert len(data["files"]) == 2

        file_id = data["files"][0]["id"]
        serve_resp = client.get(f"/api/files/{file_id}/serve")
        assert serve_resp.status_code == 200


def test_browse_invalid_session(client):
    resp = client.get("/api/sessions/9999/browse")
    assert resp.status_code == 404


def test_serve_nonexistent_file(client):
    resp = client.get("/api/files/9999/serve")
    assert resp.status_code == 404


def test_toggle_favorite(client):
    with tempfile.TemporaryDirectory() as tmpdir:
        open(os.path.join(tmpdir, "fav.jpg"), "w").close()

        imp_resp = client.post("/api/import", json={
            "path": tmpdir,
            "groups": ["image"],
        })
        session_id = imp_resp.get_json()["session"]["id"]

        browse_resp = client.get(f"/api/sessions/{session_id}/browse")
        file_id = browse_resp.get_json()["files"][0]["id"]

        resp = client.patch(f"/api/files/{file_id}/favorite")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["is_favorite"] is True

        resp = client.patch(f"/api/files/{file_id}/favorite")
        assert resp.status_code == 200
        assert resp.get_json()["is_favorite"] is False


def test_toggle_favorite_not_found(client):
    resp = client.patch("/api/files/9999/favorite")
    assert resp.status_code == 404


def test_reimport_same_folder_updates_in_place(client):
    with tempfile.TemporaryDirectory() as tmpdir:
        open(os.path.join(tmpdir, "first.jpg"), "w").close()

        resp1 = client.post("/api/import", json={
            "path": tmpdir,
            "groups": ["image"],
        })
        assert resp1.status_code == 201
        session_id = resp1.get_json()["session"]["id"]

        open(os.path.join(tmpdir, "second.jpg"), "w").close()

        resp2 = client.post("/api/import", json={
            "path": tmpdir,
            "groups": ["image"],
        })
        assert resp2.status_code == 201
        assert resp2.get_json()["session"]["id"] == session_id
        assert resp2.get_json()["session"]["total_files"] == 2

        sessions_resp = client.get("/api/sessions")
        sessions = sessions_resp.get_json()
        same_path_sessions = [s for s in sessions if s["root_path"] == tmpdir]
        assert len(same_path_sessions) == 1

        browse_resp = client.get(f"/api/sessions/{session_id}/browse")
        assert len(browse_resp.get_json()["files"]) == 2


def test_list_favorites(client):
    with tempfile.TemporaryDirectory() as tmpdir:
        open(os.path.join(tmpdir, "a.jpg"), "w").close()
        open(os.path.join(tmpdir, "b.jpg"), "w").close()

        imp_resp = client.post("/api/import", json={
            "path": tmpdir,
            "groups": ["image"],
        })
        session_id = imp_resp.get_json()["session"]["id"]

        browse_resp = client.get(f"/api/sessions/{session_id}/browse")
        files = browse_resp.get_json()["files"]

        client.patch(f"/api/files/{files[0]['id']}/favorite")

        fav_resp = client.get("/api/favorites")
        assert fav_resp.status_code == 200
        fav_data = fav_resp.get_json()
        assert len(fav_data) == 1
        assert fav_data[0]["id"] == files[0]["id"]
