from app.utility import location_utility
from app.utility.location_utility import dms_to_decimal


def test_north_positive():
    assert dms_to_decimal((10, 30, 0), "N") == 10.5


def test_south_negative():
    assert dms_to_decimal((10, 30, 0), "S") == -10.5


def test_west_negative():
    assert dms_to_decimal((20, 0, 0), "W") == -20.0


def test_east_positive():
    assert dms_to_decimal((20, 0, 0), "E") == 20.0


def test_seconds_component():
    result = dms_to_decimal((0, 0, 3600), "N")
    assert result == 1.0


def test_none_input():
    assert dms_to_decimal(None, "N") is None


def test_wrong_length():
    assert dms_to_decimal((10, 30), "N") is None


def test_invalid_values():
    assert dms_to_decimal(("a", "b", "c"), "N") is None


def test_rounding():
    result = dms_to_decimal((1, 2, 3), "N")
    assert result == round(1 + 2 / 60.0 + 3 / 3600.0, 6)
