from app.utility import tags_utility
from app.utility.tags_utility import extract_folder_tags


def test_single_component_returns_empty():
    assert extract_folder_tags("photo.jpg") == []


def test_top_level_dir_is_dropped():
    assert extract_folder_tags("root/photo.jpg") == []


def test_two_dirs_drops_first():
    assert extract_folder_tags("root/vacation/photo.jpg") == ["vacation"]


def test_underscores_and_hyphens_become_spaces():
    assert extract_folder_tags("root/summer_trip/beach-day/photo.jpg") == [
        "summer trip",
        "beach day",
    ]


def test_numeric_dirs_skipped():
    assert extract_folder_tags("root/2021/holiday/photo.jpg") == ["holiday"]


def test_backslash_normalized():
    assert extract_folder_tags("root\\vacation\\photo.jpg") == ["vacation"]


def test_dedupe_preserves_order():
    result = extract_folder_tags("root/a/vacation/vacation/photo.jpg")
    assert result == ["vacation"]


def test_short_component_skipped():
    assert extract_folder_tags("root/a/x/photo.jpg") == []


def test_lowercased():
    assert extract_folder_tags("root/Vacation/BEACH/photo.jpg") == ["vacation", "beach"]


def test_dot_components_ignored():
    assert extract_folder_tags("./root/vacation/photo.jpg") == ["vacation"]
