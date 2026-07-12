import os
import tempfile

import pytest

from app.utility import mime_utility
from app.utility.mime_utility import (
    guess_mime,
    guess_mime_from_bytes,
    expand_mime_groups,
    EXT_TO_MIME,
    MIME_GROUPS,
)


def test_guess_mime_by_extension():
    assert guess_mime("photo.jpg") == "image/jpeg"
    assert guess_mime("photo.JPG") == "image/jpeg"
    assert guess_mime("clip.mp4") == "video/mp4"
    assert guess_mime("image.heic") == "image/heic"
    assert guess_mime("movie.mkv") == "video/x-matroska"


def test_guess_mime_unknown_nonexistent():
    assert guess_mime("file.unknownext") == "application/octet-stream"


def test_expand_mime_groups_image():
    types = expand_mime_groups(["image"])
    assert "image/jpeg" in types
    assert "image/png" in types


def test_expand_mime_groups_multiple():
    types = expand_mime_groups(["image", "video"])
    assert "image/jpeg" in types
    assert "video/mp4" in types


def test_expand_mime_groups_unknown_group():
    assert expand_mime_groups(["bogus"]) == set()


def test_expand_mime_groups_empty():
    assert expand_mime_groups([]) == set()


def test_guess_mime_from_bytes_png():
    fd, path = tempfile.mkstemp()
    with os.fdopen(fd, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + b"\x00" * 24)
    try:
        assert guess_mime_from_bytes(path) == "image/png"
    finally:
        os.remove(path)


def test_guess_mime_from_bytes_jpeg():
    fd, path = tempfile.mkstemp()
    with os.fdopen(fd, "wb") as f:
        f.write(b"\xff\xd8\xff" + b"\x00" * 29)
    try:
        assert guess_mime_from_bytes(path) == "image/jpeg"
    finally:
        os.remove(path)


def test_guess_mime_from_bytes_gif():
    fd, path = tempfile.mkstemp()
    with os.fdopen(fd, "wb") as f:
        f.write(b"GIF89a" + b"\x00" * 26)
    try:
        assert guess_mime_from_bytes(path) == "image/gif"
    finally:
        os.remove(path)


def test_guess_mime_from_bytes_unknown():
    fd, path = tempfile.mkstemp()
    with os.fdopen(fd, "wb") as f:
        f.write(b"random junk bytes here nothing")
    try:
        assert guess_mime_from_bytes(path) is None
    finally:
        os.remove(path)


def test_ext_to_mime_consistency():
    for ext, mime in EXT_TO_MIME.items():
        assert ext.startswith(".")
        assert "/" in mime
