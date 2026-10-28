import pytest
from pydantic import ValidationError

from pfd_core import (
    Document,
    Endpoint,
    GraphValidationError,
    add_equipment,
    connect,
    new_document,
    registry,
    update_equipment,
    validate_document,
)


@pytest.mark.parametrize(
    "kind,field,value",
    [
        ("checkValve", "crackingPressurePa", 0.0),
        ("pressureReliefValve", "setPressurePa", 200000.0),
        ("pressureRegulator", "outletPressurePa", 100000.0),
    ],
)
def test_inline_flow_control_connections_and_roundtrip(kind, field, value):
    doc = add_equipment(new_document(), "feed", id="feed")
    doc = add_equipment(doc, kind, id="unit", config={field: value})
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
    with pytest.raises(GraphValidationError):
        update_equipment(doc, "unit", config={field: -1})
    assert doc.engineering.equipment[1].config[field] == value


@pytest.mark.parametrize(
    "kind,field",
    [
        ("checkValve", "crackingPressurePa"),
        ("pressureReliefValve", "setPressurePa"),
        ("pressureRegulator", "outletPressurePa"),
    ],
)
def test_pressure_unknowns_and_type_validation(kind, field):
    assert registry.get(kind).default_config[field] is None
    for bad in (True, "100"):
        with pytest.raises(GraphValidationError):
            add_equipment(new_document(), kind, config={field: bad})
    with pytest.raises(ValidationError):
        add_equipment(new_document(), kind, config={field: float("inf")})


def test_relief_port_geometry_and_check_direction():
    ports = registry.get("pressureReliefValve").ports
    assert [(p.id, p.side, p.direction) for p in ports] == [
        ("in", "bottom", "in"),
        ("out", "right", "out"),
    ]
    doc = add_equipment(new_document(), "feed", id="feed")
    doc = add_equipment(doc, "checkValve", id="nrv")
    with pytest.raises(GraphValidationError):
        connect(
            doc,
            Endpoint(equipment_id="feed", port_id="out"),
            Endpoint(equipment_id="nrv", port_id="out"),
        )


@pytest.mark.parametrize(
    "kind,config",
    [
        ("checkValve", {"construction": "unknown"}),
        ("pressureReliefValve", {"mechanism": "unknown"}),
        ("pressureRegulator", {"actuation": "unknown"}),
        ("pressureReliefValve", {"setPressurePa": 0}),
        ("pressureRegulator", {"outletPressurePa": 0}),
    ],
)
def test_invalid_subtypes_and_absolute_pressures(kind, config):
    with pytest.raises(GraphValidationError):
        add_equipment(new_document(), kind, config=config)
