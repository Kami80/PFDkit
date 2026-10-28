"""Explorer configurations retain unknown values and stable external references."""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from pfd_core import (
    Document,
    Endpoint,
    add_equipment,
    connect,
    registry,
    update_equipment,
    validate_document,
)
from pfd_core.registry import ColumnConfig, ExchangerConfig

PORT_CASES = json.loads(
    (Path(__file__).resolve().parents[3] / "contracts/fixtures/column-ports.json").read_text(
        encoding="utf-8"
    )
)


@pytest.mark.parametrize("case", PORT_CASES, ids=lambda case: case["name"])
def test_column_port_cross_runtime_fixtures(case):
    if not case["valid"]:
        with pytest.raises(ValidationError):
            registry.for_equipment("column", case["config"])
        return
    actual = registry.for_equipment("column", case["config"]).ports
    assert len(actual) == len(case["ports"])
    for port, expected in zip(actual, case["ports"], strict=True):
        assert (port.id, port.side, port.direction, port.name) == (
            expected["id"],
            expected["side"],
            expected["direction"],
            expected["name"],
        )
        assert port.offset == pytest.approx(expected["offset"], abs=1e-12)


@pytest.mark.parametrize("count", [1, 2, 100])
def test_maximum_density_column_ports_have_distinct_bounded_centers(count):
    for stage in {1, count}:
        config = {
            "stageCount": count,
            "feedStage": stage,
            "feeds": [{"portId": f"feed_{index}", "stage": stage} for index in range(12)],
            "sideDraws": [
                {
                    "portId": f"draw_{index}",
                    "stage": stage,
                    "phase": "vapor" if index % 2 else "liquid",
                }
                for index in range(12)
            ],
        }
        ports = registry.for_equipment("column", config).ports
        for side, expected_count in [("left", 13), ("right", 14)]:
            offsets = sorted(port.offset for port in ports if port.side == side)
            assert len(offsets) == expected_count
            assert offsets[0] >= 1 / 80 - 1e-12
            assert offsets[-1] <= 79 / 80 + 1e-12
            assert all(
                (b - a) * 80 >= 6 - 1e-12 for a, b in zip(offsets, offsets[1:], strict=False)
            )


def test_registry_capabilities_and_unknown_geometry():
    for kind in ["heatExchanger", "column"]:
        definition = registry.get(kind)
        assert "explorer" in definition.available_views
        assert definition.explorer and definition.explorer["references"]
    config = ExchangerConfig(tubePasses=8, shellPasses=2, baffleCount=12)
    assert config.tubeLengthM is None
    assert config.shellDiameterM is None
    with pytest.raises(ValidationError):
        ExchangerConfig(baffleCount=-1)


def test_dynamic_ports_preserve_connected_references_and_reject_removal():
    document = add_equipment(
        Document(),
        "column",
        id="column",
        config={
            "stageCount": 12,
            "feeds": [{"portId": "secondFeed", "stage": 8}],
            "sideDraws": [{"portId": "draw", "stage": 3, "phase": "vapor"}],
        },
    )
    document = add_equipment(document, "feed", id="source")
    document = connect(
        document,
        Endpoint(equipment_id="source", port_id="out"),
        Endpoint(equipment_id="column", port_id="secondFeed"),
        id="stable-stream",
    )
    changed = update_equipment(
        document, "column", config={"feeds": [{"portId": "secondFeed", "stage": 4}]}
    )
    assert changed.engineering.streams[0].id == "stable-stream"
    assert changed.engineering.streams[0].target.port_id == "secondFeed"
    with pytest.raises(ValueError, match="secondFeed"):
        update_equipment(changed, "column", config={"feeds": []})
    assert validate_document(document).valid


def test_removed_stages_reserved_ids_conditions_and_float_integer_parity():
    valid = ColumnConfig(
        stageCount=10,
        feeds=[{"portId": "feed2", "stage": 2.0}],
        stageProperties=[{"stage": 2.0, "temperatureK": None, "pressurePa": 0.0}],
    )
    assert valid.feeds[0].stage == 2
    assert valid.stageProperties[0].temperature_k is None
    for config in [
        {"stageCount": 3, "feedStage": 5},
        {"feeds": [{"portId": "feed", "stage": 1}]},
        {"feeds": [{"portId": "same", "stage": 1}], "sideDraws": [{"portId": "same", "stage": 2}]},
        {"stageProperties": [{"stage": 2}, {"stage": 2}]},
        {"stageProperties": [{"stage": 2, "temperatureK": -1}]},
        {"feeds": [{"portId": "bad space", "stage": 1}]},
    ]:
        with pytest.raises(ValidationError):
            ColumnConfig.model_validate(config)


def test_bottom_up_port_offsets_and_legacy_unsupported_exchanger():
    top = registry.for_equipment(
        "column", {"stageCount": 10, "feeds": [{"portId": "f2", "stage": 2}]}
    )
    bottom = registry.for_equipment(
        "column",
        {"stageCount": 10, "stageNumbering": "bottomUp", "feeds": [{"portId": "f2", "stage": 2}]},
    )
    assert next(p.offset for p in top.ports if p.id == "f2") == 2 / 11
    assert next(p.offset for p in bottom.ports if p.id == "f2") == 9 / 11
    document = add_equipment(
        Document(),
        "heatExchanger",
        config={"tubePasses": 2, "shellPasses": 1, "flowArrangement": "crossFlow"},
    )
    report = validate_document(document)
    assert report.valid
    assert "unsupported_illustration" in {issue.code for issue in report.issues}
