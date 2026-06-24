from pydantic import BaseModel, Field


class AiMetadataModel(BaseModel):
    description: str = Field(
        default="",
        description="1-2 sentence description of the image or video",
    )
    tags: list[str] = Field(
        default=[],
        description="5-10 relevant tags describing the content",
    )
    search_words: list[str] = Field(
        default=[],
        description="5-10 short keywords for search",
    )
