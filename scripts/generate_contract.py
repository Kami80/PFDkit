"""Regenerate committed contract assets from the authoritative Python package."""

from __future__ import annotations

import argparse
import copy
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "packages/pfd-core/src"))

from pfd_core import (
    UNITS,
    Document,
    Endpoint,
    add_equipment,
    connect,
    registry,
    validate_document,
)
from teaching_examples import teaching_examples


def fixture() -> dict[str, Any]:
    equipment = [
        {"id": "feed-1", "type": "feed", "tag": "F-101"},
        {
            "id": "pump-1",
            "type": "pump",
            "tag": "P-101",
            "config": {"efficiency": 0.78, "drive": "electric"},
        },
        {
            "id": "exchanger-1",
            "type": "heatExchanger",
            "tag": "E-101",
            "config": {
                "tubePasses": 2,
                "shellPasses": 1,
                "flowArrangement": "counterCurrent",
            },
        },
        {"id": "product-1", "type": "product", "tag": "PR-101"},
    ]
    streams = []
    for index, (source, source_port, target, target_port) in enumerate(
        [
            ("feed-1", "out", "pump-1", "in"),
            ("pump-1", "out", "exchanger-1", "tubeIn"),
            ("exchanger-1", "tubeOut", "product-1", "in"),
        ],
        1,
    ):
        streams.append(
            {
                "id": f"stream-{index}",
                "tag": f"S-{index:03}",
                "source": {"equipmentId": source, "portId": source_port},
                "target": {"equipmentId": target, "portId": target_port},
                "flowRate": {
                    "value": 1.23456789012345,
                    "unit": "kg/s",
                    "dimension": "massFlow",
                },
                "temperature": {
                    "value": None,
                    "unit": "degC",
                    "dimension": "temperature",
                },
                "pressure": {"value": 0, "unit": "bar", "dimension": "pressure"},
            }
        )
    return Document.model_validate(
        {
            "id": "example-feed-pump-exchanger",
            "title": "Feed heating process",
            "metadata": {
                "attribution": {"creator": "PFDkit contributors", "license": "MIT"},
                "example": True,
            },
            "engineering": {"equipment": equipment, "streams": streams},
            "presentation": {
                "nodes": {
                    item["id"]: {"x": index * 240.0, "y": 160.0}
                    for index, item in enumerate(equipment)
                }
            },
            "education": {
                "notes": "The shell circuit is deliberately incomplete. Values are entered illustrations, not calculated results."
            },
        }
    ).model_dump(mode="json", by_alias=True)


def assets() -> dict[Path, Any]:
    schema = Document.model_json_schema(by_alias=True)
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    normalized = copy.deepcopy(schema)

    def required_fields(value: Any) -> None:
        if isinstance(value, dict):
            if value.get("type") == "object" and "properties" in value:
                value["required"] = list(value["properties"])
            for item in value.values():
                required_fields(item)
        elif isinstance(value, list):
            for item in value:
                required_fields(item)

    required_fields(normalized)
    result: dict[Path, Any] = {
        Path("contracts/generated/document.schema.json"): schema,
        Path("contracts/generated/document.normalized.schema.json"): normalized,
        Path("contracts/generated/registry.json"): [
            item.model_dump(mode="json", by_alias=True)
            for item in registry.definitions()
        ],
        Path("contracts/generated/units.json"): {
            name: {
                "dimension": unit.dimension.value,
                "scale": unit.scale,
                "offset": unit.offset,
            }
            for name, unit in UNITS.items()
        },
    }
    valid = fixture()
    draft = Document(id="draft-1", title="Incomplete draft").model_dump(
        mode="json", by_alias=True
    )
    draft["engineering"]["equipment"] = [
        copy.deepcopy(valid["engineering"]["equipment"][1])
    ]
    recycle = copy.deepcopy(valid)
    recycle["engineering"]["equipment"] = [
        copy.deepcopy(valid["engineering"]["equipment"][1])
    ]
    recycle["engineering"]["streams"] = [
        {
            **copy.deepcopy(valid["engineering"]["streams"][0]),
            "source": {"equipmentId": "pump-1", "portId": "out"},
            "target": {"equipmentId": "pump-1", "portId": "in"},
        }
    ]
    recycle["presentation"]["nodes"] = {"pump-1": {"x": 1.25, "y": 2.5, "metadata": {}}}
    mismatch = copy.deepcopy(valid)
    mismatch["engineering"]["streams"][0]["target"]["portId"] = "power"
    broken = copy.deepcopy(valid)
    broken["engineering"]["streams"][0]["target"]["equipmentId"] = "missing-1"
    unsupported = copy.deepcopy(valid)
    unsupported["schemaVersion"] = "9.0.0"
    unknown = copy.deepcopy(valid)
    unknown["engineering"]["equipment"][0]["type"] = "futureReactor"
    overflow = copy.deepcopy(valid)
    overflow["engineering"]["components"] = [
        {"id": name, "name": name} for name in ["water", "ethanol", "unknown"]
    ]
    overflow["engineering"]["streams"][0]["composition"] = {
        "basis": "mole",
        "fractions": [
            {"componentId": "water", "value": 0.8},
            {"componentId": "ethanol", "value": 0.6},
            {"componentId": "unknown", "value": None},
        ],
    }
    overflow = Document.model_validate(overflow).model_dump(mode="json", by_alias=True)
    integral_config = copy.deepcopy(valid)
    integral_config["engineering"]["equipment"][2]["config"].update(
        {"tubePasses": 2.0, "shellPasses": 1.0}
    )
    fixtures = {
        "valid-process": valid,
        "incomplete-draft": draft,
        "recycle": recycle,
        "energy-material-mismatch": mismatch,
        "broken-reference": broken,
        "unsupported-version": unsupported,
        "unknown-equipment": unknown,
        "partial-composition-overflow": overflow,
        "integral-float-configuration": integral_config,
    }
    manifest = []
    for name, data in fixtures.items():
        result[Path(f"examples/{name}.json")] = data
        if name == "unsupported-version":
            manifest.append(
                {
                    "file": f"{name}.json",
                    "valid": False,
                    "codes": ["unsupported_version"],
                }
            )
        else:
            report = validate_document(Document.model_validate(data))
            manifest.append(
                {
                    "file": f"{name}.json",
                    "valid": report.valid,
                    "codes": sorted({issue.code for issue in report.issues}),
                }
            )
    result[Path("examples/manifest.json")] = manifest
    unsafe = copy.deepcopy(valid)
    unsafe["metadata"]["unsafeInteger"] = 9007199254740992
    result[Path("examples/unsafe-integer.json")] = unsafe
    manifest.append(
        {"file": "unsafe-integer.json", "valid": False, "codes": ["schema_error"]}
    )
    catalog = Document(
        id="catalog-demo", title="Equipment catalog — editable teaching draft"
    )
    kinds = [
        "feed",
        "pump",
        "heatExchanger",
        "mixer",
        "splitter",
        "separator",
        "tank",
        "column",
        "reactor",
        "product",
    ]
    for index, kind in enumerate(kinds):
        catalog = add_equipment(
            catalog,
            kind,
            id=f"catalog-{kind}",
            x=60 + index % 5 * 220,
            y=80 + index // 5 * 240,
        )
    for source, out_port, target, in_port in [
        ("feed", "out", "pump", "in"),
        ("pump", "out", "heatExchanger", "tubeIn"),
        ("heatExchanger", "tubeOut", "mixer", "in1"),
        ("mixer", "out", "splitter", "in"),
        ("splitter", "out1", "separator", "in"),
        ("separator", "liquidOut", "tank", "in"),
        ("tank", "out", "column", "feed"),
        ("column", "bottoms", "reactor", "in"),
        ("reactor", "out", "product", "in"),
    ]:
        catalog = connect(
            catalog,
            Endpoint(equipment_id=f"catalog-{source}", port_id=out_port),
            Endpoint(equipment_id=f"catalog-{target}", port_id=in_port),
            id=f"catalog-stream-{source}",
        )
    catalog.education.notes = "Catalog demonstration only. Unconnected circuits and branches are deliberate draft warnings; no balances or physical calculations have been performed."
    catalog.presentation.metadata["style"] = {
        "preset": "academicColorful",
        "showTitle": True,
        "showLegend": True,
    }
    result[Path("examples/catalog-demo.json")] = catalog.model_dump(
        mode="json", by_alias=True
    )
    catalog_report = validate_document(catalog)
    manifest.append(
        {
            "file": "catalog-demo.json",
            "valid": catalog_report.valid,
            "codes": sorted({item.code for item in catalog_report.issues}),
        }
    )
    for name, data in teaching_examples().items():
        result[Path(f"examples/teaching-{name}.json")] = data
        report = validate_document(Document.model_validate(data))
        manifest.append(
            {
                "file": f"teaching-{name}.json",
                "valid": report.valid,
                "codes": sorted({issue.code for issue in report.issues}),
            }
        )
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    check = parser.parse_args().check
    stale = []
    for path, data in assets().items():
        target = ROOT / path
        content = json.dumps(data, indent=2, sort_keys=True, allow_nan=False) + "\n"
        if check:
            if not target.exists() or target.read_text(encoding="utf-8") != content:
                stale.append(str(path))
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8", newline="\n")
    if stale:
        raise SystemExit("Stale generated contract assets: " + ", ".join(stale))
    print("Contract assets are current." if check else "Contract assets generated.")


if __name__ == "__main__":
    main()
