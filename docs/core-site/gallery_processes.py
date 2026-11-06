"""Runnable teaching PFDs. Entered conditions are illustrative, never solved."""

from pathlib import Path

from pfd_core import (
    Document,
    Endpoint,
    Quantity,
    add_equipment,
    connect,
    new_document,
    update_stream,
    validate_document,
)


def build(title, equipment, streams) -> Document:
    doc = new_document(title)
    doc.id = "gallery-" + title.split(" · ")[0].lower()
    for identity, kind, tag, x, y, config in equipment:
        doc = add_equipment(
            doc, kind, id=identity, tag=tag, x=x * 300, y=y * 250, config=config
        )
    for index, (source, outlet, target, inlet, label) in enumerate(streams, 1):
        doc = connect(
            doc,
            Endpoint(equipment_id=source, port_id=outlet),
            Endpoint(equipment_id=target, port_id=inlet),
            id=f"S{index:02}",
            tag=label,
        )
    doc = update_stream(
        doc,
        "S01",
        flow_rate=Quantity(value=1, unit="kg/s", dimension="massFlow"),
        temperature=Quantity(value=25, unit="degC", dimension="temperature"),
    )
    doc.metadata["valueStatus"] = (
        "Illustrative input values; no mass/energy balance or thermodynamic calculation."
    )
    assert validate_document(doc).valid
    return doc


def distillation() -> Document:
    return build(
        "Binary distillation · reflux and reboil",
        [
            ("feed", "feed", "F-101 Feed", 0, 1, {}),
            (
                "column",
                "column",
                "C-101 Column",
                1,
                1,
                {"stageCount": 12, "feedStage": 6},
            ),
            ("condenser", "heatExchanger", "E-101 Condenser", 2, 0, {}),
            ("drum", "tank", "V-101 Reflux drum", 3, 0, {"orientation": "horizontal"}),
            ("split", "splitter", "SP-101 Reflux split", 4, 0, {}),
            ("distillate", "product", "D-101 Distillate", 5, 0, {}),
            ("reflux", "pump", "P-101 Reflux pump", 4, 1, {}),
            ("reboiler", "heatExchanger", "E-102 Reboiler", 2, 2, {}),
            ("bottom-split", "splitter", "SP-102 Boilup split", 3, 2, {}),
            ("bottoms", "product", "B-101 Bottoms", 4, 2, {}),
        ],
        [
            ("feed", "out", "column", "feed", "S01 Feed"),
            ("column", "overhead", "condenser", "tubeIn", "S02 Vapor"),
            ("condenser", "tubeOut", "drum", "in", "S03 Condensate"),
            ("drum", "out", "split", "in", "S04 Liquid"),
            ("split", "out1", "distillate", "in", "S05 Distillate"),
            ("split", "out2", "reflux", "in", "S06 Reflux"),
            ("reflux", "out", "column", "reflux", "S07 Reflux return"),
            ("column", "bottoms", "reboiler", "tubeIn", "S08 Sump liquid"),
            ("reboiler", "tubeOut", "bottom-split", "in", "S09 Reboiled fluid"),
            ("bottom-split", "out1", "column", "boilup", "S10 Boilup"),
            ("bottom-split", "out2", "bottoms", "in", "S11 Bottoms"),
        ],
    )


def advanced_column() -> Document:
    """Explicit auxiliaries, utilities and stage-based streams; no calculations."""
    doc = build(
        "Advanced column · multiple feeds and draws",
        [
            ("feed1", "feed", "F-401 Main feed", 0, 2, {}),
            ("feed2", "feed", "F-402 Side feed", 0, 3, {}),
            (
                "column",
                "column",
                "C-401 Column",
                1,
                2,
                {
                    "stageCount": 16,
                    "feedStage": 10,
                    "feeds": [{"portId": "side-feed", "stage": 6}],
                    "sideDraws": [
                        {"portId": "vapor-draw", "stage": 4, "phase": "vapor"},
                        {"portId": "liquid-draw", "stage": 12, "phase": "liquid"},
                    ],
                },
            ),
            ("vapor", "product", "P-401 Vapor draw", 2, 1, {}),
            ("liquid", "product", "P-402 Liquid draw", 2, 3, {}),
            (
                "cond",
                "condenser",
                "E-401 Total condenser",
                3,
                0,
                {"mode": "total", "dutyW": 20000},
            ),
            ("drum", "tank", "V-401 Reflux drum", 4, 0, {"orientation": "horizontal"}),
            ("split", "splitter", "SP-401 Reflux split", 5, 0, {}),
            ("distillate", "product", "D-401 Distillate", 6, 0, {}),
            ("reflux", "pump", "P-403 Reflux pump", 4, 1, {}),
            (
                "reboiler",
                "reboiler",
                "E-402 Partial reboiler",
                3,
                4,
                {"mode": "partial", "dutyW": 25000},
            ),
            ("bottoms", "product", "B-401 Bottoms", 4, 4, {}),
            ("cw", "feed", "U-401 Cooling water", 2, 0, {}),
            ("cwout", "product", "U-402 Cooling return", 3, 1, {}),
            ("steam", "feed", "U-403 Steam", 2, 4, {}),
            ("condensate", "product", "U-404 Condensate", 3, 5, {}),
        ],
        [
            ("feed1", "out", "column", "feed", "S01 Main feed"),
            ("feed2", "out", "column", "side-feed", "S02 Side feed"),
            ("column", "vapor-draw", "vapor", "in", "S03 Vapor draw"),
            ("column", "liquid-draw", "liquid", "in", "S04 Liquid draw"),
            ("column", "overhead", "cond", "in", "S05 Overhead vapor"),
            ("cond", "liquidOut", "drum", "in", "S06 Condensate"),
            ("drum", "out", "split", "in", "S07 Drum liquid"),
            ("split", "out1", "distillate", "in", "S08 Distillate"),
            ("split", "out2", "reflux", "in", "S09 Reflux"),
            ("reflux", "out", "column", "reflux", "S10 Reflux return"),
            ("column", "bottoms", "reboiler", "in", "S11 Sump liquid"),
            ("reboiler", "vaporOut", "column", "boilup", "S12 Boilup"),
            ("reboiler", "liquidOut", "bottoms", "in", "S13 Bottoms"),
            ("cw", "out", "cond", "utilityIn", "S14 Cooling supply"),
            ("cond", "utilityOut", "cwout", "in", "S15 Cooling return"),
            ("steam", "out", "reboiler", "utilityIn", "S16 Steam supply"),
            ("reboiler", "utilityOut", "condensate", "in", "S17 Steam condensate"),
        ],
    )
    doc = update_stream(
        doc, "S02", temperature=Quantity(value=50, unit="degC", dimension="temperature")
    )
    doc = update_stream(
        doc, "S14", flow_rate=Quantity(value=2, unit="kg/s", dimension="massFlow")
    )
    doc = update_stream(
        doc, "S16", flow_rate=Quantity(value=0.1, unit="kg/s", dimension="massFlow")
    )
    return doc


def gas_cleaning() -> Document:
    return build(
        "Gas cleaning · fan, baghouse and scrubber",
        [
            ("gas", "feed", "F-501 Dusty gas", 0, 0, {}),
            ("fan", "fan", "FN-501 Fan", 1, 0, {"machineType": "centrifugal"}),
            ("baghouse", "baghouse", "BH-501 Baghouse", 2, 0, {}),
            ("scrubber", "wetScrubber", "SC-501 Wet scrubber", 3, 0, {}),
            ("clean", "product", "P-501 Treated gas", 4, 0, {}),
            ("dust", "product", "P-502 Captured dust", 2, 1, {}),
            ("water", "feed", "F-502 Scrubbing water", 4, 1, {}),
            ("spent", "product", "P-503 Spent liquid", 3, 1, {}),
        ],
        [
            ("gas", "out", "fan", "in", "S01 Dusty gas"),
            ("fan", "out", "baghouse", "gasIn", "S02 Gas to filter"),
            ("baghouse", "gasOut", "scrubber", "gasIn", "S03 Filtered gas"),
            ("baghouse", "solidsOut", "dust", "in", "S04 Dust"),
            ("water", "out", "scrubber", "liquidIn", "S05 Water"),
            ("scrubber", "gasOut", "clean", "in", "S06 Treated gas"),
            ("scrubber", "liquidOut", "spent", "in", "S07 Spent liquid"),
        ],
    )


def solids_drying() -> Document:
    return build(
        "Solids processing · filtration and drying",
        [
            ("slurry", "feed", "F-601 Slurry", 0, 0, {}),
            ("filter", "filter", "FL-601 Filter", 1, 0, {}),
            ("filtrate", "product", "P-601 Filtrate", 2, 0, {}),
            ("dryer", "rotaryDryer", "DR-601 Rotary dryer", 2, 1, {}),
            ("air", "feed", "F-602 Drying gas", 1, 1, {}),
            ("product", "product", "P-602 Dry solids", 3, 1, {}),
            ("exhaust", "product", "P-603 Exhaust gas", 2, 2, {}),
        ],
        [
            ("slurry", "out", "filter", "in", "S01 Slurry"),
            ("filter", "liquidOut", "filtrate", "in", "S02 Filtrate"),
            ("filter", "solidsOut", "dryer", "feedIn", "S03 Filter cake"),
            ("air", "out", "dryer", "gasIn", "S04 Drying gas"),
            ("dryer", "solidsOut", "product", "in", "S05 Dry product"),
            ("dryer", "gasOut", "exhaust", "in", "S06 Exhaust"),
        ],
    )


def ethanol() -> Document:
    return build(
        "Ethanol · fermentation and distillation",
        [
            ("sugar", "feed", "F-201 Sugar solution", 0, 0, {}),
            ("pump", "pump", "P-201 Feed pump", 1, 0, {}),
            ("cooler", "heatExchanger", "E-201 Feed conditioning", 2, 0, {}),
            ("fermenter", "reactor", "R-201 Fermenter", 3, 0, {}),
            ("separator", "separator", "V-201 Gas disengagement", 4, 0, {}),
            ("gas", "product", "G-201 CO2-rich gas", 5, 0, {}),
            ("column", "column", "C-201 Recovery column", 4, 1, {}),
            ("ethanol", "product", "D-201 Hydrous ethanol", 5, 1, {}),
            ("stillage", "product", "B-201 Stillage", 5, 2, {}),
        ],
        [
            ("sugar", "out", "pump", "in", "S01 Sugar feed"),
            ("pump", "out", "cooler", "tubeIn", "S02 Pressurized feed"),
            ("cooler", "tubeOut", "fermenter", "in", "S03 Conditioned feed"),
            ("fermenter", "out", "separator", "in", "S04 Fermented broth"),
            ("separator", "vaporOut", "gas", "in", "S05 CO2-rich gas"),
            ("separator", "liquidOut", "column", "feed", "S06 Degassed broth"),
            ("column", "overhead", "ethanol", "in", "S07 Ethanol-rich outlet"),
            ("column", "bottoms", "stillage", "in", "S08 Stillage"),
        ],
    )


def ammonia() -> Document:
    return build(
        "Ammonia · synthesis, recovery and recycle",
        [
            ("feed", "feed", "F-301 Pressurized H2/N2", 0, 0, {}),
            ("mixer", "mixer", "M-301 Feed mixing", 1, 0, {}),
            ("heater", "heatExchanger", "E-301 Feed heater", 2, 0, {}),
            (
                "reactor",
                "reactor",
                "R-301 Synthesis reactor",
                3,
                0,
                {"reactorType": "plugFlow"},
            ),
            ("cooler", "heatExchanger", "E-302 Cooling/condensation", 4, 0, {}),
            ("separator", "separator", "V-301 Ammonia separator", 5, 0, {}),
            ("ammonia", "product", "P-301 Liquid ammonia", 6, 1, {}),
            ("splitter", "splitter", "SP-301 Purge split", 5, 1, {}),
            ("purge", "product", "G-301 Purge gas", 6, 2, {}),
        ],
        [
            ("feed", "out", "mixer", "in1", "S01 Makeup gas"),
            ("mixer", "out", "heater", "tubeIn", "S02 Combined feed"),
            ("heater", "tubeOut", "reactor", "in", "S03 Reactor feed"),
            ("reactor", "out", "cooler", "tubeIn", "S04 Reactor effluent"),
            ("cooler", "tubeOut", "separator", "in", "S05 Cooled mixture"),
            ("separator", "liquidOut", "ammonia", "in", "S06 Ammonia"),
            ("separator", "vaporOut", "splitter", "in", "S07 Unreacted gas"),
            ("splitter", "out1", "mixer", "in2", "S08 Recycle gas"),
            ("splitter", "out2", "purge", "in", "S09 Purge"),
        ],
    )


def process_gallery():
    entries = [
        (
            "advanced-column",
            advanced_column(),
            "Sixteen illustrative stages with two feeds, vapor and liquid side draws, external total condenser, reflux drum and partial reboiler. Cooling and steam utility connections are explicit; duties, feed conditions and utility flows are entered examples, not calculated results.",
            "ETH Zurich · Distillation",
            "https://www.hyper-tvt.ethz.ch/distillation-page.html",
        ),
        (
            "gas-cleaning",
            gas_cleaning(),
            "Schematic fan, baghouse and wet-scrubber train with material feeds and separate dust, treated gas and liquid products. No pressure drop, collection efficiency or emissions are calculated.",
            "PFDkit · Equipment catalog",
            "https://github.com/Kami80/PFDkit/blob/main/packages/pfd-core/EQUIPMENT.md",
        ),
        (
            "solids-drying",
            solids_drying(),
            "Illustrative filtration and rotary drying with separately connected filtrate, drying gas, dry product and exhaust. No solids balance, moisture content or duty is calculated.",
            "PFDkit · Equipment catalog",
            "https://github.com/Kami80/PFDkit/blob/main/packages/pfd-core/EQUIPMENT.md",
        ),
        (
            "distillation",
            distillation(),
            "Feed-to-products separation train with explicit reflux and reboil paths. The splitter represents the conceptual vapor/liquid withdrawal from a partial reboiler; it does not calculate phase separation. Utility circuits and controls are omitted.",
            "ETH Zurich · Distillation",
            "https://www.hyper-tvt.ethz.ch/distillation-page.html",
        ),
        (
            "ethanol",
            ethanol(),
            "Sugar-solution boundary through fermentation, gas disengagement and hydrous-ethanol recovery. Column condenser/reboiler are represented by column configuration; feedstock preparation, dehydration and coproduct finishing are outside scope.",
            "US DOE · Ethanol production",
            "https://afdc.energy.gov/fuels/ethanol-production",
        ),
        (
            "ammonia",
            ammonia(),
            "Simplified Haber–Bosch synthesis-loop boundary with cooling, ammonia recovery, purge and recycle. Upstream hydrogen/nitrogen production, fresh-gas compression, recycle circulator, refrigeration details and utilities are omitted. No conversion or operating pressure is inferred.",
            "US DOE · Ammonia synthesis",
            "https://www.energy.gov/sites/default/files/2021-05/052721-h2iqhour_0.pdf",
        ),
    ]
    for _, doc, scope, reference, url in entries:
        doc.metadata["scope"] = scope
        doc.metadata["references"] = [{"title": reference, "url": url}]
        doc.metadata["attribution"] = {
            "creator": "PFDkit contributors",
            "license": "MIT",
            "artwork": "Original PFDkit vector artwork; references support process concepts, not entered values.",
        }
        doc.education.notes = scope + " " + doc.metadata["valueStatus"]
    return entries


if __name__ == "__main__":
    for name, doc, *_ in process_gallery():
        Path(f"{name}.json").write_text(doc.to_json(), encoding="utf-8")
        print(
            f"{name}.json: {len(doc.engineering.equipment)} equipment, {len(doc.engineering.streams)} streams"
        )
