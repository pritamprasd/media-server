import io
import os
import tempfile

import pytest
from PIL import Image

from app.utility import image_utility
from app.utility.image_utility import (
    _apply_exif_orientation,
    generate_image_thumbnail,
    extract_image_metadata,
    THUMB_SIZE,
)


class Meta:
    pass


def test_apply_exif_orientation_no_exif_returns_same():
    img = Image.new("RGB", (4, 4), (0, 0, 0))
    result = _apply_exif_orientation(img)
    assert result is img


def test_generate_thumbnail_missing_file():
    meta = Meta()
    generate_image_thumbnail("/nonexistent/x.jpg", meta)
    assert not hasattr(meta, "thumbnail")


def test_generate_thumbnail_on_real_image():
    fd, path = tempfile.mkstemp(suffix=".png")
    os.close(fd)
    try:
        Image.new("RGB", (800, 600), (120, 40, 200)).save(path)
        meta = Meta()
        generate_image_thumbnail(path, meta)
        assert meta.thumbnail.startswith("data:image/jpeg;base64,")
    finally:
        os.remove(path)


def test_extract_metadata_missing_file():
    meta = Meta()
    extract_image_metadata("/nonexistent/x.jpg", meta)
    assert not hasattr(meta, "width")


def test_extract_metadata_sets_dimensions():
    fd, path = tempfile.mkstemp(suffix=".png")
    os.close(fd)
    try:
        Image.new("RGB", (123, 45), (10, 10, 10)).save(path)
        meta = Meta()
        extract_image_metadata(path, meta)
        assert meta.width == 123
        assert meta.height == 45
    finally:
        os.remove(path)


def test_thumb_size_constant():
    assert THUMB_SIZE == (400, 400)
