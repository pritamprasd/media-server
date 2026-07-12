import os
import tempfile

import pytest
from PIL import Image

from app.utility import hash_utility
from app.utility.hash_utility import (
    compute_file_hash,
    compute_dhash,
    dhash_to_bands,
    hamming_distance,
)


@pytest.fixture
def tmp_file():
    fd, path = tempfile.mkstemp()
    with os.fdopen(fd, "wb") as f:
        f.write(b"hello world")
    yield path
    os.remove(path)


def test_compute_file_hash_deterministic(tmp_file):
    h1 = compute_file_hash(tmp_file)
    h2 = compute_file_hash(tmp_file)
    assert h1 == h2
    assert len(h1) == 64


def test_compute_file_hash_matches_known_value(tmp_file):
    import hashlib
    expected = hashlib.sha256(b"hello world").hexdigest()
    assert compute_file_hash(tmp_file) == expected


def test_compute_file_hash_differs_for_different_content():
    fd, path = tempfile.mkstemp()
    with os.fdopen(fd, "wb") as f:
        f.write(b"different content")
    try:
        assert compute_file_hash(path) != "0" * 64
    finally:
        os.remove(path)


def test_hamming_distance_zero_for_equal():
    assert hamming_distance("ff", "ff") == 0


def test_hamming_distance_counts_bits():
    assert hamming_distance("00", "0f") == 4
    assert hamming_distance("0", "1") == 1


def test_dhash_to_bands_length():
    bands = dhash_to_bands("ffffffffffffffff", n_bands=4)
    assert len(bands) == 4
    assert all(b == 0xFFFF for b in bands)


def test_dhash_to_bands_zero():
    bands = dhash_to_bands("0000000000000000", n_bands=4)
    assert bands == [0, 0, 0, 0]


def test_compute_dhash_missing_heic_returns_zeros():
    result = compute_dhash("/nonexistent/path/xyz.heic")
    assert result == "0" * 16


def test_compute_dhash_on_real_image():
    fd, path = tempfile.mkstemp(suffix=".png")
    os.close(fd)
    try:
        img = Image.new("RGB", (16, 16))
        for x in range(16):
            for y in range(16):
                img.putpixel((x, y), (x * 15, 0, 0))
        img.save(path)
        result = compute_dhash(path)
        assert isinstance(result, str)
        assert len(result) == 16
        assert result == compute_dhash(path)
    finally:
        os.remove(path)
