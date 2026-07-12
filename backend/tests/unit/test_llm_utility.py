import pytest

from app.utility import llm_utility
from app.utility.llm_utility import parse_ai_response
from app.models.ai_metadata import AiMetadataModel


def test_parse_plain_json():
    text = '{"description": "a cat", "tags": ["cat"], "search_words": ["cat"]}'
    result = parse_ai_response(text)
    assert isinstance(result, AiMetadataModel)
    assert result.description == "a cat"
    assert result.tags == ["cat"]


def test_parse_fenced_json():
    text = '```json\n{"description": "dog", "tags": [], "search_words": []}\n```'
    result = parse_ai_response(text)
    assert result.description == "dog"


def test_parse_json_embedded_in_text():
    text = 'Here is the data: {"description": "x", "tags": [], "search_words": []} thanks'
    result = parse_ai_response(text)
    assert result.description == "x"


def test_parse_defaults():
    result = parse_ai_response("{}")
    assert result.description == ""
    assert result.tags == []


def test_parse_invalid_raises():
    with pytest.raises(Exception):
        parse_ai_response("no json here at all")
