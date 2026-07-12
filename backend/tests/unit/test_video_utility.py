import pytest

from app.utility import video_utility
from app.utility.video_utility import (
    _atempo_chain,
    extract_video_metadata,
    extract_video_frames,
    generate_video_thumbnail,
)


class Meta:
    pass


def test_atempo_chain_normal_speed():
    assert _atempo_chain(1.0) == []


def test_atempo_chain_double():
    assert _atempo_chain(2.0) == ["atempo=2.00000"]


def test_atempo_chain_high_speed_chains():
    result = _atempo_chain(4.0)
    assert result[0] == "atempo=2.0"
    assert len(result) >= 2


def test_atempo_chain_slow():
    result = _atempo_chain(0.5)
    assert result == ["atempo=0.50000"]


def test_atempo_chain_very_slow_chains():
    result = _atempo_chain(0.25)
    assert result[0] == "atempo=0.5"
    assert len(result) >= 2


def test_extract_metadata_missing_file():
    meta = Meta()
    extract_video_metadata("/nonexistent/x.mp4", meta)
    assert not hasattr(meta, "width")


def test_extract_frames_missing_file():
    assert extract_video_frames("/nonexistent/x.mp4") == []


def test_generate_thumbnail_missing_file():
    meta = Meta()
    generate_video_thumbnail("/nonexistent/x.mp4", meta)
    assert not hasattr(meta, "thumbnail")
