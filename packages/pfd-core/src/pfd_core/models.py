"""Version 1 document models. Unknown measurements are JSON null, never zero."""

from __future__ import annotations

import json
from enum import StrEnum
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator
from pydantic.alias_generators import to_camel


def new_id() -> str:
    return str(uuid4())


class Model(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid", allow_inf_nan=False
    )

    @model_validator(mode="after")
    def json_values(self) -> Model:
        data = self.model_dump(mode="python")
        json.dumps(data, allow_nan=False)

        def portable(value: Any) -> None:
            if isinstance(value, bool):
                return
            if isinstance(value, (int, float)) and value == int(value) and abs(value) > 2**53 - 1:
                raise ValueError(
                    "Integer-valued JSON numbers must fit the portable safe integer range ±(2^53-1); store arbitrary precision metadata as strings."
                )
            if isinstance(value, dict):
                for child in value.values():
                    portable(child)
            elif isinstance(value, list):
                for child in value:
                    portable(child)

        portable(data)
        return self


class Dimension(StrEnum):
    MASS_FLOW = "massFlow"
    MOLAR_FLOW = "molarFlow"
    VOLUME_FLOW = "volumeFlow"
    TEMPERATURE = "temperature"
    PRESSURE = "pressure"
    POWER = "power"
    DIMENSIONLESS = "dimensionless"


class Quantity(Model):
    value: float | None = Field(default=None, strict=True)
    unit: str = Field(min_length=1)
    dimension: Dimension


class Component(Model):
    id: str = Field(default_factory=new_id, min_length=1)
    name: str = Field(min_length=1)
    formula: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ComponentFraction(Model):
    component_id: str = Field(min_length=1)
    value: float | None = Field(default=None, ge=0, le=1, strict=True)


class Composition(Model):
    basis: Literal["mole", "mass"] = "mole"
    fractions: list[ComponentFraction] = Field(default_factory=list)


class Equipment(Model):
    id: str = Field(default_factory=new_id, min_length=1)
    type: str = Field(min_length=1)
    tag: str = ""
    config: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class Endpoint(Model):
    equipment_id: str = Field(min_length=1)
    port_id: str = Field(min_length=1)


class Stream(Model):
    id: str = Field(default_factory=new_id, min_length=1)
    kind: Literal["material", "energy"] = "material"
    source: Endpoint
    target: Endpoint
    tag: str = ""
    flow_basis: Literal["mass", "molar", "volume"] = "mass"
    flow_rate: Quantity | None = None
    temperature: Quantity | None = None
    pressure: Quantity | None = None
    composition: Composition | None = None
    properties: dict[str, Quantity] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class BoundaryPort(Model):
    id: str = Field(default_factory=new_id, min_length=1)
    stream_id: str = Field(min_length=1)
    internal_endpoint: Endpoint
    direction: Literal["in", "out"]
    kind: Literal["material", "energy"]


class ProcessSection(Model):
    id: str = Field(default_factory=new_id, min_length=1)
    name: str = Field(min_length=1)
    parent_id: str | None = None
    equipment_ids: list[str] = Field(default_factory=list)
    boundary_ports: list[BoundaryPort] = Field(default_factory=list)


class Engineering(Model):
    equipment: list[Equipment] = Field(default_factory=list)
    streams: list[Stream] = Field(default_factory=list)
    components: list[Component] = Field(default_factory=list)
    sections: list[ProcessSection] = Field(default_factory=list)


class NodeLayout(Model):
    x: float = Field(default=0, strict=True)
    y: float = Field(default=0, strict=True)
    metadata: dict[str, Any] = Field(default_factory=dict)


class Viewport(Model):
    x: float = Field(default=0, strict=True)
    y: float = Field(default=0, strict=True)
    zoom: float = Field(default=1, gt=0, strict=True)


class Presentation(Model):
    nodes: dict[str, NodeLayout] = Field(default_factory=dict)
    viewport: Viewport = Field(default_factory=Viewport)
    metadata: dict[str, Any] = Field(default_factory=dict)


class Annotation(Model):
    id: str = Field(default_factory=new_id, min_length=1)
    kind: Literal["note", "callout", "arrow", "component"] = "note"
    text: str = ""
    target_id: str | None = None
    x: float = Field(default=0, strict=True)
    y: float = Field(default=0, strict=True)
    end_x: float | None = Field(default=None, strict=True)
    end_y: float | None = Field(default=None, strict=True)
    visible: bool = True
    provenance: Literal["conceptual", "manual", "illustrative", "calculated"] = "conceptual"


class PresentationStep(Model):
    id: str = Field(default_factory=new_id, min_length=1)
    title: str = "Untitled step"
    target_ids: list[str] = Field(default_factory=list)
    reveal_ids: list[str] = Field(default_factory=list)
    annotation_ids: list[str] = Field(default_factory=list)
    notes: str = ""
    explorer_id: str | None = None


class Education(Model):
    notes: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)
    annotations: list[Annotation] = Field(default_factory=list)
    steps: list[PresentationStep] = Field(default_factory=list)


class Document(Model):
    schema_version: Literal["1.0.0"] = "1.0.0"
    id: str = Field(default_factory=new_id, min_length=1)
    title: str = "Untitled process"
    metadata: dict[str, Any] = Field(default_factory=dict)
    engineering: Engineering = Field(default_factory=Engineering)
    presentation: Presentation = Field(default_factory=Presentation)
    education: Education = Field(default_factory=Education)

    def to_json(self) -> str:
        return (
            json.dumps(
                self.model_dump(mode="json", by_alias=True),
                indent=2,
                sort_keys=True,
                allow_nan=False,
            )
            + "\n"
        )


class Finding(Model):
    severity: Literal["error", "warning", "info"]
    code: str
    message: str
    object_id: str | None = None
    path: str = ""


class ValidationResult(Model):
    issues: list[Finding] = Field(default_factory=list)
    checks_performed: list[str] = Field(
        default_factory=lambda: [
            "identities",
            "equipment_configuration",
            "references",
            "port_direction",
            "stream_kind",
            "port_cardinality",
            "units",
            "composition",
            "draft_completeness",
        ]
    )
    physical_checks_performed: list[str] = Field(default_factory=list)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def valid(self) -> bool:
        return not any(item.severity == "error" for item in self.issues)
