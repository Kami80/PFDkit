import pytest
from pydantic import BaseModel

from pfd_core import (
    Document,
    Endpoint,
    EquipmentRegistry,
    GraphValidationError,
    PortDefinition,
    add_equipment,
    connect,
    new_document,
    registry,
    update_equipment,
    validate_document,
)


def test_valve_config_limits_and_connections():
    doc = add_equipment(
        new_document(), "valve", id="v", config={"opening": 0.5, "actuation": "pneumatic"}
    )
    assert validate_document(doc).valid
    assert [p.id for p in registry.get("valve").ports] == ["in", "out"]
    with pytest.raises(GraphValidationError):
        update_equipment(doc, "v", config={"opening": 1.1})
    assert doc.engineering.equipment[0].config["opening"] == 0.5


def test_catalog_types_have_metadata_stable_ports_and_roundtrip() -> None:
    assert {item.type for item in registry.definitions()} == {
        "feed",
        "product",
        "pump",
        "heatExchanger",
        "separator",
        "tank",
        "mixer",
        "splitter",
        "column",
        "reactor",
        "valve",
    }
    for definition in registry.definitions():
        assert definition.category and definition.description and definition.available_views
        assert definition.provenance["license"] == "MIT"
        assert len({port.id for port in definition.ports}) == len(definition.ports)
        assert all(port.max_connections == 1 for port in definition.ports)
        doc = add_equipment(new_document(), definition.type, id="unit")
        changed = update_equipment(
            doc, "unit", config={"extension.example": {"zero": 0, "unknown": None}}
        )
        assert Document.model_validate_json(changed.to_json()) == changed
        assert validate_document(changed).valid
        assert registry.get(definition.type).ports == definition.ports


def test_mixer_and_splitter_fixed_port_counts_and_circuit_identity() -> None:
    mixer = registry.get("mixer")
    splitter = registry.get("splitter")
    assert [port.id for port in mixer.ports] == ["in1", "in2", "in3", "out"]
    assert [port.id for port in splitter.ports] == ["in", "out1", "out2", "out3"]
    assert [port.offset for port in mixer.ports[:3]] == [0.25, 0.5, 0.75]
    doc = add_equipment(new_document(), "mixer", id="mix")
    for index in range(3):
        doc = add_equipment(doc, "feed", id=f"feed-{index}")
        doc = connect(
            doc,
            Endpoint(equipment_id=f"feed-{index}", port_id="out"),
            Endpoint(equipment_id="mix", port_id=f"in{index + 1}"),
        )
    doc = add_equipment(doc, "splitter", id="split")
    doc = connect(
        doc,
        Endpoint(equipment_id="mix", port_id="out"),
        Endpoint(equipment_id="split", port_id="in"),
    )
    doc = update_equipment(doc, "mix", config={"mixingMethod": "agitated"})
    assert validate_document(doc).valid
    assert [stream.target.port_id for stream in doc.engineering.streams[:3]] == [
        "in1",
        "in2",
        "in3",
    ]


def test_representative_extension_has_its_own_registry_without_builtin_mutation() -> None:
    class ValveConfig(BaseModel):
        description: str = "Manual isolation"

    extensions = EquipmentRegistry()
    extensions.register(
        type="demo.valve",
        name="Manual valve",
        description="Extension example",
        tag_prefix="XV",
        category="Fluid transport",
        config_model=ValveConfig,
        extension="example",
        version="0.1.0",
        ports=[
            PortDefinition(id="in", name="Inlet", direction="in", side="left"),
            PortDefinition(id="out", name="Outlet", direction="out", side="right"),
        ],
    )
    doc = add_equipment(new_document(), "demo.valve", equipment_registry=extensions)
    assert validate_document(doc, extensions).valid
    assert len(registry.definitions()) == 11
    assert extensions.get("demo.valve").extension == "example"
