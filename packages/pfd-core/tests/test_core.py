import json

import pytest
from pydantic import ValidationError

from pfd_core import (
    Component,
    ComponentFraction,
    Composition,
    Dimension,
    Document,
    Endpoint,
    GraphValidationError,
    Quantity,
    add_equipment,
    connect,
    convert_quantity,
    new_document,
    remove_equipment,
    update_equipment,
    update_stream,
    validate_document,
)


def endpoint(equipment: str, port: str) -> Endpoint:
    return Endpoint(equipment_id=equipment, port_id=port)


def process() -> Document:
    doc = new_document("A teaching process")
    for index, kind in enumerate(["feed", "pump", "heatExchanger", "product"]):
        doc = add_equipment(doc, kind, id=kind, x=index * 200, y=100)
    for number, (source, source_port, target, target_port) in enumerate(
        [
            ("feed", "out", "pump", "in"),
            ("pump", "out", "heatExchanger", "tubeIn"),
            ("heatExchanger", "tubeOut", "product", "in"),
        ]
    ):
        doc = connect(
            doc, endpoint(source, source_port), endpoint(target, target_port), id=f"stream-{number}"
        )
    return doc


def test_process_is_valid_with_unconnected_second_circuit_warning() -> None:
    doc = process()
    result = validate_document(doc)
    assert result.valid
    assert {(issue.object_id, issue.path) for issue in result.issues} == {
        ("heatExchanger", "ports.shellIn"),
        ("heatExchanger", "ports.shellOut"),
    }
    assert result.physical_checks_performed == []


def test_failed_connection_and_configuration_are_non_destructive() -> None:
    doc = process()
    original = doc.to_json()
    with pytest.raises(GraphValidationError, match="energy"):
        connect(doc, endpoint("feed", "out"), endpoint("pump", "power"))
    with pytest.raises(GraphValidationError, match="efficiency"):
        update_equipment(doc, "pump", config={"efficiency": 2})
    assert doc.to_json() == original


def test_recycle_is_allowed_and_capacity_checked() -> None:
    doc = add_equipment(new_document(), "pump", id="pump")
    doc = connect(doc, endpoint("pump", "out"), endpoint("pump", "in"))
    assert validate_document(doc).valid
    with pytest.raises(GraphValidationError, match="connection"):
        connect(doc, endpoint("pump", "out"), endpoint("pump", "in"))


def test_delete_cascades_only_attached_streams_and_layout() -> None:
    doc = process()
    changed = remove_equipment(doc, "pump")
    assert len(doc.engineering.streams) == 3
    assert [item.id for item in changed.engineering.streams] == ["stream-2"]
    assert "pump" not in changed.presentation.nodes
    assert validate_document(changed).valid


def test_quantities_convert_and_preserve_unknown_and_zero() -> None:
    assert (
        convert_quantity(
            Quantity(value=3600, unit="kg/h", dimension=Dimension.MASS_FLOW), "kg/s"
        ).value
        == 1
    )
    assert convert_quantity(
        Quantity(value=0, unit="degC", dimension=Dimension.TEMPERATURE), "K"
    ).value == pytest.approx(273.15)
    assert convert_quantity(
        Quantity(value=32, unit="degF", dimension=Dimension.TEMPERATURE), "degC"
    ).value == pytest.approx(0)
    assert (
        convert_quantity(Quantity(value=None, unit="bar", dimension=Dimension.PRESSURE), "Pa").value
        is None
    )
    assert (
        convert_quantity(Quantity(value=0, unit="bar", dimension=Dimension.PRESSURE), "Pa").value
        == 0
    )
    with pytest.raises(ValueError, match="Cannot convert"):
        convert_quantity(Quantity(value=2, unit="bar", dimension=Dimension.PRESSURE), "kg/s")


def test_roundtrip_preserves_extensions_and_unknowns() -> None:
    doc = process()
    doc.metadata = {"vendor": {"revision": 3}}
    doc.education.metadata = {"exercise": [1, "two", None]}
    doc = update_equipment(
        doc, "pump", config={"efficiency": None, "extension": {"note": "preserve me"}}
    )
    doc = update_stream(
        doc,
        "stream-0",
        flow_rate=Quantity(value=0, dimension=Dimension.MASS_FLOW, unit="kg/h"),
        temperature=Quantity(value=None, dimension=Dimension.TEMPERATURE, unit="degC"),
    )
    serialized = doc.to_json()
    assert Document.model_validate_json(serialized).to_json() == serialized
    assert "schemaVersion" in json.loads(serialized)
    assert "flowRate" in json.loads(serialized)["engineering"]["streams"][0]


@pytest.mark.parametrize("value", [float("nan"), float("inf"), "4", True])
def test_finite_strict_numbers(value: object) -> None:
    with pytest.raises(ValidationError):
        Quantity(value=value, unit="kg/s", dimension=Dimension.MASS_FLOW)


def test_invalid_composition_references_and_sum_are_reported() -> None:
    doc = process()
    doc.engineering.components = [Component(id="water", name="Water", formula="H2O")]
    doc.engineering.streams[0].composition = Composition(
        fractions=[ComponentFraction(component_id="missing", value=0.5)]
    )
    assert {issue.code for issue in validate_document(doc).issues} >= {
        "missing_component",
        "composition_sum",
    }


def test_non_json_extensions_are_rejected() -> None:
    with pytest.raises((ValidationError, TypeError)):
        Document(metadata={"invalid": {1, 2}})
    with pytest.raises(ValidationError):
        Document(metadata={"invalid": float("nan")})


def test_partial_composition_known_subtotal_cannot_exceed_one() -> None:
    doc = process()
    doc.engineering.components = [Component(id=id, name=id) for id in ["a", "b", "c"]]
    doc.engineering.streams[0].composition = Composition(
        fractions=[
            ComponentFraction(component_id="a", value=0.8),
            ComponentFraction(component_id="b", value=0.4),
            ComponentFraction(component_id="c", value=None),
        ]
    )
    assert {issue.code for issue in validate_document(doc).issues} >= {
        "composition_sum",
        "unknown_composition",
    }


@pytest.mark.parametrize("value", [2**53, 1e20, -(2**53)])
def test_nonportable_integer_numbers_are_rejected(value: float) -> None:
    with pytest.raises(ValidationError, match="portable safe integer"):
        Document(metadata={"nested": [value]})
