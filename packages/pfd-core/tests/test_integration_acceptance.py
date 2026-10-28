"""Cross-feature acceptance checks, independent of the core implementation tests."""

from __future__ import annotations

import json

import pytest
from pydantic import BaseModel, ValidationError

from pfd_core import (
    Dimension,
    Document,
    Endpoint,
    EquipmentRegistry,
    GraphValidationError,
    PortDefinition,
    Quantity,
    add_equipment,
    connect,
    convert_quantity,
    new_document,
    registry,
    remove_equipment,
    update_equipment,
    update_stream,
    validate_document,
)


def test_edit_save_reload_preserves_units_zero_unknown_and_separate_sections() -> None:
    document = add_equipment(new_document("Acceptance"), "feed", id="feed", x=12.5, y=-7)
    document = add_equipment(document, "pump", id="pump", x=250, y=42)
    document = connect(
        document,
        Endpoint(equipment_id="feed", port_id="out"),
        Endpoint(equipment_id="pump", port_id="in"),
        id="stream",
    )
    document = update_equipment(
        document,
        "pump",
        tag="P-REVIEW",
        config={"drive": "steam"},
        metadata={"vendor": {"unknownField": [0, None, "keep"]}},
    )
    document = update_stream(
        document,
        "stream",
        flow_rate=Quantity(value=0, unit="kg/h", dimension=Dimension.MASS_FLOW),
        pressure=Quantity(value=None, unit="bar", dimension=Dimension.PRESSURE),
        temperature=Quantity(value=23.4567890123, unit="degC", dimension=Dimension.TEMPERATURE),
    )
    document.metadata["extension.example"] = {"nested": [False, None, 0]}
    document.education.notes = "Keep this teaching explanation separate from the drawing."
    document.presentation.metadata["style"] = {"stroke": "#123456"}
    document.presentation.nodes["pump"].metadata["label"] = "Revised label"

    encoded = document.to_json()
    reopened = Document.model_validate_json(encoded)
    assert reopened.model_dump() == document.model_dump()
    assert reopened.to_json() == encoded
    stream = reopened.engineering.streams[0]
    assert stream.flow_rate is not None and stream.flow_rate.value == 0
    assert stream.pressure is not None and stream.pressure.value is None
    assert reopened.presentation.nodes["feed"].x == 12.5
    assert reopened.engineering.equipment[1].config["drive"] == "steam"
    assert validate_document(reopened).valid
    assert json.loads(encoded)["schemaVersion"] == "1.0.0"


def test_rejected_mutations_preserve_document_and_delete_cleans_references() -> None:
    document = add_equipment(new_document(), "feed", id="feed")
    document = add_equipment(document, "pump", id="pump")
    original = document.to_json()
    with pytest.raises(GraphValidationError):
        connect(
            document,
            Endpoint(equipment_id="feed", port_id="out"),
            Endpoint(equipment_id="pump", port_id="power"),
        )
    assert document.to_json() == original
    with pytest.raises(GraphValidationError):
        update_equipment(document, "pump", config={"efficiency": 1.5})
    assert document.to_json() == original
    connected = connect(
        document,
        Endpoint(equipment_id="feed", port_id="out"),
        Endpoint(equipment_id="pump", port_id="in"),
        id="stream",
    )
    with pytest.raises(GraphValidationError):
        connect(
            connected,
            Endpoint(equipment_id="feed", port_id="out"),
            Endpoint(equipment_id="pump", port_id="in"),
        )
    cleaned = remove_equipment(connected, "pump")
    assert not cleaned.engineering.streams
    assert "pump" not in cleaned.presentation.nodes
    assert validate_document(cleaned).valid
    assert len(connected.engineering.streams) == 1


def test_registered_energy_extension_supports_versioned_configuration() -> None:
    class Config(BaseModel):
        rating: float | None = None

    registry = EquipmentRegistry()
    for kind, direction, side in [("driver", "out", "right"), ("load", "in", "left")]:
        registry.register(
            type=f"example.{kind}",
            name=kind,
            description="Test extension",
            tag_prefix=kind.upper(),
            extension="example",
            version="2.0.0",
            ports=[
                PortDefinition(
                    id="shaft", name="Shaft", kind="energy", direction=direction, side=side
                )
            ],
            config_model=Config,
        )
    document = add_equipment(
        new_document(), "example.driver", id="driver", equipment_registry=registry
    )
    document = add_equipment(document, "example.load", id="load", equipment_registry=registry)
    document = connect(
        document,
        Endpoint(equipment_id="driver", port_id="shaft"),
        Endpoint(equipment_id="load", port_id="shaft"),
        kind="energy",
        equipment_registry=registry,
    )
    assert validate_document(document, registry).valid
    assert not validate_document(document).valid
    assert registry.get("example.driver").version == "2.0.0"
    assert registry.get("example.driver").extension == "example"
    assert "rating" in registry.get("example.driver").config_schema["properties"]


def test_closed_recycle_is_structurally_valid_without_a_solver() -> None:
    document = add_equipment(new_document(), "pump", id="pump")
    document = connect(
        document,
        Endpoint(equipment_id="pump", port_id="out"),
        Endpoint(equipment_id="pump", port_id="in"),
        id="recycle",
    )
    result = validate_document(document)
    assert result.valid
    assert result.physical_checks_performed == []


@pytest.mark.parametrize("value", ["0", False, True])
def test_canonical_quantity_rejects_coerced_non_numbers(value: object) -> None:
    with pytest.raises(ValidationError):
        Quantity(value=value, unit="kg/s", dimension=Dimension.MASS_FLOW)


def test_unknown_temperature_conversion_preserves_unknown_and_absolute_conversion() -> None:
    unknown = Quantity(value=None, unit="degC", dimension=Dimension.TEMPERATURE)
    assert convert_quantity(unknown, "K").value is None
    freezing = Quantity(value=32, unit="degF", dimension=Dimension.TEMPERATURE)
    converted = convert_quantity(freezing, "K")
    assert converted.value == pytest.approx(273.15)
    with pytest.raises(ValueError, match="Cannot convert"):
        convert_quantity(freezing, "bar")


@pytest.mark.parametrize("field", ["tubePasses", "shellPasses"])
def test_integer_configuration_matches_json_schema_number_semantics(field: str) -> None:
    registry.validate_config("heatExchanger", {field: 2.0})
    for invalid in ["2", True, False, 1.5, float("inf"), float("nan")]:
        with pytest.raises(ValidationError):
            registry.validate_config("heatExchanger", {field: invalid})
