"""Copy-on-write graph commands. Failed commands never mutate their input."""

from typing import Any, Literal

from .models import Document, Endpoint, Equipment, NodeLayout, Stream, ValidationResult, new_id
from .registry import EquipmentRegistry, registry
from .validation import validate_document


class GraphValidationError(ValueError):
    def __init__(self, result: ValidationResult):
        self.result = result
        super().__init__(
            "; ".join(issue.message for issue in result.issues if issue.severity == "error")
        )


def _checked(document: Document, equipment_registry: EquipmentRegistry) -> Document:
    # Revalidate patched models and nested dictionaries, then semantic constraints.
    document = Document.model_validate(document.model_dump())
    result = validate_document(document, equipment_registry)
    if not result.valid:
        raise GraphValidationError(result)
    return document


def new_document(title: str = "Untitled process") -> Document:
    return Document(title=title)


def add_equipment(
    document: Document,
    type: str,
    *,
    id: str | None = None,
    tag: str | None = None,
    config: dict[str, Any] | None = None,
    x: float = 0,
    y: float = 0,
    equipment_registry: EquipmentRegistry = registry,
) -> Document:
    definition = equipment_registry.get(type)
    identity = id or new_id()
    if identity in [item.id for item in document.engineering.equipment] + [
        item.id for item in document.engineering.streams
    ] + [item.id for item in document.engineering.components]:
        raise ValueError(f"Identifier '{identity}' already exists.")
    used = {item.tag for item in document.engineering.equipment}
    number = 1
    while f"{definition.tag_prefix}-{number:03}" in used:
        number += 1
    item = Equipment(
        id=identity,
        type=type,
        tag=tag if tag is not None else f"{definition.tag_prefix}-{number:03}",
        config=config if config is not None else definition.default_config,
    )
    updated = document.model_copy(deep=True)
    updated.engineering.equipment.append(item)
    updated.presentation.nodes[item.id] = NodeLayout(x=x, y=y)
    return _checked(updated, equipment_registry)


def connect(
    document: Document,
    source: Endpoint,
    target: Endpoint,
    *,
    kind: Literal["material", "energy"] = "material",
    id: str | None = None,
    tag: str = "",
    equipment_registry: EquipmentRegistry = registry,
) -> Document:
    updated = document.model_copy(deep=True)
    updated.engineering.streams.append(
        Stream(id=id or new_id(), source=source, target=target, kind=kind, tag=tag)
    )  # type: ignore[arg-type]
    return _checked(updated, equipment_registry)


def update_equipment(
    document: Document,
    equipment_id: str,
    *,
    tag: str | None = None,
    config: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
    equipment_registry: EquipmentRegistry = registry,
) -> Document:
    updated = document.model_copy(deep=True)
    item = next((item for item in updated.engineering.equipment if item.id == equipment_id), None)
    if item is None:
        raise KeyError(equipment_id)
    if tag is not None:
        item.tag = tag
    if config is not None:
        item.config = {**item.config, **config}
    if metadata is not None:
        item.metadata = {**item.metadata, **metadata}
    return _checked(updated, equipment_registry)


def update_stream(
    document: Document,
    stream_id: str,
    *,
    equipment_registry: EquipmentRegistry = registry,
    **changes: Any,
) -> Document:
    updated = document.model_copy(deep=True)
    index = next(
        (i for i, item in enumerate(updated.engineering.streams) if item.id == stream_id), None
    )
    if index is None:
        raise KeyError(stream_id)
    item = updated.engineering.streams[index]
    updated.engineering.streams[index] = Stream.model_validate({**item.model_dump(), **changes})
    return _checked(updated, equipment_registry)


def remove_stream(document: Document, stream_id: str) -> Document:
    if not any(item.id == stream_id for item in document.engineering.streams):
        raise KeyError(stream_id)
    updated = document.model_copy(deep=True)
    updated.engineering.streams = [
        item for item in updated.engineering.streams if item.id != stream_id
    ]
    return updated


def remove_equipment(document: Document, equipment_id: str) -> Document:
    if not any(item.id == equipment_id for item in document.engineering.equipment):
        raise KeyError(equipment_id)
    updated = document.model_copy(deep=True)
    updated.engineering.equipment = [
        item for item in updated.engineering.equipment if item.id != equipment_id
    ]
    updated.engineering.streams = [
        item
        for item in updated.engineering.streams
        if item.source.equipment_id != equipment_id and item.target.equipment_id != equipment_id
    ]
    updated.presentation.nodes.pop(equipment_id, None)
    return updated
