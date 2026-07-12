import numpy as np
import pytest
from PIL import Image

from app.utility import face_utility
from app.utility.face_utility import (
    encoding_distance,
    compute_average_encoding,
    _pil_to_cv_image,
    _pil_to_base64_jpeg,
)


def test_encoding_distance_identical_is_zero():
    enc = [1.0, 0.0, 0.0]
    assert encoding_distance(enc, enc) == pytest.approx(0.0, abs=1e-6)


def test_encoding_distance_orthogonal_is_one():
    assert encoding_distance([1.0, 0.0], [0.0, 1.0]) == pytest.approx(1.0, abs=1e-6)


def test_encoding_distance_opposite():
    assert encoding_distance([1.0, 0.0], [-1.0, 0.0]) == pytest.approx(2.0, abs=1e-6)


def test_encoding_distance_empty():
    assert encoding_distance([], [1.0]) == 1.0
    assert encoding_distance([1.0], []) == 1.0


def test_encoding_distance_zero_vector():
    assert encoding_distance([0.0, 0.0], [1.0, 1.0]) == 1.0


def test_compute_average_encoding():
    result = compute_average_encoding([[0.0, 2.0], [2.0, 0.0]])
    assert result == [1.0, 1.0]


def test_compute_average_encoding_empty():
    assert compute_average_encoding([]) is None


def test_pil_to_cv_image_rgb():
    img = Image.new("RGB", (2, 2), (10, 20, 30))
    arr = _pil_to_cv_image(img)
    assert arr.shape == (2, 2, 3)
    assert list(arr[0, 0]) == [30, 20, 10]


def test_pil_to_cv_image_rgba():
    img = Image.new("RGBA", (2, 2), (10, 20, 30, 255))
    arr = _pil_to_cv_image(img)
    assert arr.shape == (2, 2, 3)


def test_pil_to_base64_jpeg():
    img = Image.new("RGB", (4, 4), (255, 0, 0))
    result = _pil_to_base64_jpeg(img)
    assert result.startswith("data:image/jpeg;base64,")


def test_pil_to_base64_jpeg_none():
    assert _pil_to_base64_jpeg(None) is None


def test_pil_to_base64_jpeg_resize():
    img = Image.new("RGB", (40, 40), (0, 255, 0))
    result = _pil_to_base64_jpeg(img, size=(8, 8))
    assert result.startswith("data:image/jpeg;base64,")


def test_find_best_person_match():
    class P:
        def __init__(self, enc):
            self.avg_encoding = enc

    persons = [P([1.0, 0.0]), P([0.0, 1.0]), P(None)]
    best, dist = face_utility.find_best_person_match(
        [1.0, 0.0], persons, threshold=0.5
    )
    assert best is persons[0]
    assert dist == pytest.approx(0.0, abs=1e-6)


def test_find_best_person_match_no_match():
    class P:
        def __init__(self, enc):
            self.avg_encoding = enc

    persons = [P([0.0, 1.0])]
    best, dist = face_utility.find_best_person_match(
        [1.0, 0.0], persons, threshold=0.3
    )
    assert best is None
