import os
import shutil
import tempfile

import pytest

from app.utility import file_system
from app.utility.file_system import traverse_directory


@pytest.fixture
def sample_dir():
    d = tempfile.mkdtemp()
    os.mkdir(os.path.join(d, "subdir"))
    os.mkdir(os.path.join(d, ".hidden_dir"))
    with open(os.path.join(d, "photo.jpg"), "wb") as f:
        f.write(b"x")
    with open(os.path.join(d, ".hiddenfile"), "wb") as f:
        f.write(b"x")
    yield d
    shutil.rmtree(d)


def test_traverse_lists_dirs(sample_dir):
    dirs, files, parent = traverse_directory(sample_dir)
    names = [d["name"] for d in dirs]
    assert "subdir" in names


def test_traverse_hides_dotfiles(sample_dir):
    dirs, files, parent = traverse_directory(sample_dir)
    all_names = [d["name"] for d in dirs] + [f["name"] for f in files]
    assert ".hidden_dir" not in all_names
    assert ".hiddenfile" not in all_names


def test_traverse_lists_files_with_mime(sample_dir):
    dirs, files, parent = traverse_directory(sample_dir)
    photo = next(f for f in files if f["name"] == "photo.jpg")
    assert photo["mime_type"] == "image/jpeg"


def test_traverse_parent(sample_dir):
    dirs, files, parent = traverse_directory(sample_dir)
    assert parent == os.path.dirname(sample_dir)


def test_traverse_full_paths(sample_dir):
    dirs, files, parent = traverse_directory(sample_dir)
    for entry in dirs + files:
        assert entry["path"].startswith(sample_dir)
