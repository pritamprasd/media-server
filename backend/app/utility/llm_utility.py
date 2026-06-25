import re

from pydantic import ValidationError

from app.models.ai_metadata import AiMetadataModel


def parse_ai_response(response_text):
    cleaned = response_text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
        cleaned = cleaned.rsplit("```", 1)[0]
    cleaned = cleaned.strip()

    try:
        return AiMetadataModel.model_validate_json(cleaned)
    except ValidationError:
        pass

    json_match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if json_match:
        try:
            return AiMetadataModel.model_validate_json(json_match.group())
        except ValidationError:
            pass

    raise ValidationError(f"Could not parse AI response as valid metadata JSON")
