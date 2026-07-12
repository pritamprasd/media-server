from app.utility import type_utility
from app.utility.type_utility import safe_int


def test_valid_int_string():
    assert safe_int("42") == 42


def test_valid_int():
    assert safe_int(7) == 7


def test_float_truncated():
    assert safe_int(3.9) == 3


def test_invalid_string():
    assert safe_int("abc") is None


def test_none():
    assert safe_int(None) is None


def test_empty_string():
    assert safe_int("") is None


def test_negative():
    assert safe_int("-5") == -5
