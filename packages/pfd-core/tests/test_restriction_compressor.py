from copy import deepcopy

import pytest
from pydantic import BaseModel, ValidationError

from pfd_core import (
    Document,
    Endpoint,
    GraphValidationError,
    PortDefinition,
    Quantity,
    add_equipment,
    connect,
    new_document,
    registry,
    update_equipment,
    update_stream,
    validate_document,
)


@pytest.mark.parametrize("kind", ["flowRestriction", "compressor"])
def test_connections_and_roundtrip(kind):
    doc = add_equipment(new_document(), "feed", id="feed")
    doc = add_equipment(doc, kind, id="unit")
    doc = add_equipment(doc, "product", id="product")
    doc = connect(
        doc,
        Endpoint(equipment_id="feed", port_id="out"),
        Endpoint(equipment_id="unit", port_id="in"),
    )
    doc = connect(
        doc,
        Endpoint(equipment_id="unit", port_id="out"),
        Endpoint(equipment_id="product", port_id="in"),
    )
    assert validate_document(doc).valid
    assert Document.model_validate_json(doc.to_json()) == doc
    assert validate_document(doc).physical_checks_performed == []


@pytest.mark.parametrize(
    "kind,field,bad",
    [
        ("flowRestriction", "boreDiameterM", 0),
        ("flowRestriction", "boreDiameterM", -1),
        ("flowRestriction", "pressureDropPa", -1),
        ("flowRestriction", "restrictionType", "bad"),
        ("compressor", "isentropicEfficiency", 0),
        ("compressor", "isentropicEfficiency", 1.1),
        ("compressor", "outletPressurePa", 0),
        ("compressor", "machineType", "bad"),
        ("compressor", "drive", "bad"),
        ("compressor", "outletPressurePa", True),
        ("flowRestriction", "boreDiameterM", "0.1"),
    ],
)
def test_invalid_configuration_is_rejected_without_mutation(kind, field, bad):
    doc = add_equipment(new_document(), kind, id="unit")
    original = doc.to_json()
    with pytest.raises(GraphValidationError):
        update_equipment(doc, "unit", config={field: bad})
    assert doc.to_json() == original


@pytest.mark.parametrize(
    "kind,field",
    [
        ("flowRestriction", "boreDiameterM"),
        ("flowRestriction", "pressureDropPa"),
        ("compressor", "isentropicEfficiency"),
        ("compressor", "outletPressurePa"),
    ],
)
def test_unknown_and_nonfinite_values(kind, field):
    assert registry.get(kind).default_config[field] is None
    with pytest.raises(ValidationError):
        add_equipment(new_document(), kind, config={field: float("inf")})


def test_zero_drop_and_compressor_subtype_keep_ports():
    restriction = add_equipment(new_document(), "flowRestriction", config={"pressureDropPa": 0})
    assert validate_document(restriction).valid
    doc = add_equipment(new_document(), "compressor", id="k")
    changed = update_equipment(doc, "k", config={"machineType": "reciprocating"})
    assert doc.engineering.equipment[0].config["machineType"] == "centrifugal"
    assert (
        registry.for_equipment("compressor", changed.engineering.equipment[0].config).ports
        == registry.get("compressor").ports
    )


def test_compressor_power_kind_and_optional_port():
    class EmptyConfig(BaseModel):
        pass

    extension = deepcopy(registry)
    extension.register(
        type="testPower",
        name="Power source",
        description="Test energy source",
        tag_prefix="PW",
        ports=[
            PortDefinition(
                id="out", name="Shaft power", direction="out", kind="energy", side="right"
            )
        ],
        config_model=EmptyConfig,
    )
    doc = add_equipment(new_document(), "compressor", id="k", equipment_registry=extension)
    assert validate_document(doc, extension).valid
    doc = add_equipment(doc, "testPower", id="source", equipment_registry=extension)
    with pytest.raises(GraphValidationError):
        connect(
            doc,
            Endpoint(equipment_id="source", port_id="out"),
            Endpoint(equipment_id="k", port_id="in"),
            kind="energy",
            equipment_registry=extension,
        )
    doc = connect(
        doc,
        Endpoint(equipment_id="source", port_id="out"),
        Endpoint(equipment_id="k", port_id="power"),
        kind="energy",
        id="shaft",
        equipment_registry=extension,
    )
    doc = update_stream(
        doc,
        "shaft",
        properties={"power": Quantity(value=5, unit="kW", dimension="power")},
        equipment_registry=extension,
    )
    assert validate_document(doc, extension).valid
    assert validate_document(Document.model_validate_json(doc.to_json()), extension).valid
