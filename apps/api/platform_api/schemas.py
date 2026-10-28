from typing import Any, Literal
from urllib.parse import urlparse

from ninja import Schema
from pydantic import ConfigDict, Field, field_validator


class Input(Schema):
    model_config = ConfigDict(extra="forbid")


class Register(Input):
    username: str = Field(min_length=1, max_length=150, pattern=r"^[\w.@+-]+$")
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=1024)


class Login(Input):
    username: str = Field(min_length=1, max_length=150)
    password: str = Field(min_length=1, max_length=1024)


class Recovery(Input):
    email: str = Field(min_length=1, max_length=254)


class Reset(Input):
    uid: str = Field(max_length=100)
    token: str = Field(max_length=200)
    password: str = Field(min_length=1, max_length=1024)


class CreateProject(Input):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=4000)
    document: dict[str, Any]


class EditProject(Input):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=4000)


class Save(Input):
    document: dict[str, Any]
    expectedRevision: int = Field(ge=1, strict=True)


class Restore(Input):
    revision: int = Field(ge=1, strict=True)
    expectedRevision: int = Field(ge=1, strict=True)


class Duplicate(Input):
    title: str | None = Field(default=None, min_length=1, max_length=200)


class Publish(Input):
    revision: int = Field(ge=1, strict=True)
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=4000)
    author: str = Field(min_length=1, max_length=200)
    license: Literal["CC-BY-4.0", "CC0-1.0"]
    category: str = Field(min_length=1, max_length=80)
    tags: list[str] = Field(default_factory=list, max_length=30)
    sourceUrl: str = Field(default="", max_length=2000)
    isTemplate: bool = False

    @field_validator("sourceUrl")
    @classmethod
    def safe_source(cls, value):
        if value:
            parsed = urlparse(value)
            if (
                parsed.scheme not in {"https", "http"}
                or not parsed.hostname
                or parsed.username
                or parsed.password
            ):
                raise ValueError("Sources must be absolute HTTP(S) URLs without credentials")
        return value

    @field_validator("tags")
    @classmethod
    def safe_tags(cls, values):
        if any(not value.strip() or len(value) > 80 for value in values):
            raise ValueError("Tags must have 1–80 characters")
        return sorted(set(value.strip() for value in values))


class ReportInput(Input):
    reason: str = Field(min_length=10, max_length=2000)
