"""Original, deterministic M3 lessons; source principles do not imply solved values."""

from typing import Any

from pfd_core import Document, validate_document

ATTRIBUTION = {
    "creator": "PFDkit contributors",
    "license": "MIT",
    "artwork": "Original PFDkit schematics and teaching text; source illustrations are not reproduced.",
    "reviewedOn": "2026-10-28",
    "reviewScope": "Structural references, terminology, configuration and teaching scope; no process design, balances or safety assessment.",
}


def lesson(
    name: str,
    title: str,
    equipment: list[tuple[str, str, str, dict[str, Any]]],
    connections: list[tuple[str, str, str, str, str]],
    notes: str,
    references: list[dict[str, str]],
    principle: str,
    explorer: str | None = None,
) -> dict[str, Any]:
    items = [
        {"id": identity, "type": kind, "tag": tag, "config": config}
        for identity, kind, tag, config in equipment
    ]
    streams = [
        {
            "id": f"{name}-stream-{index}",
            "tag": tag,
            "source": {"equipmentId": source, "portId": outlet},
            "target": {"equipmentId": target, "portId": inlet},
            "temperature": {"value": None, "unit": "degC", "dimension": "temperature"},
            "metadata": {
                "valueStatus": "illustrative",
                "explanation": "Unknown by default; no process calculation performed.",
            },
        }
        for index, (source, outlet, target, inlet, tag) in enumerate(connections, 1)
    ]
    streams[0]["temperature"]["value"] = 25.0
    streams[0]["metadata"]["explanation"] = (
        "Arbitrary illustrative inlet temperature for a unit-entry exercise; not measured or calculated. All other stream temperatures remain unknown."
    )
    positions = {
        item["id"]: {
            "x": float(index % 5 * 250 + 80),
            "y": float(index // 5 * 300 + 140),
        }
        for index, item in enumerate(items)
    }
    document = Document.model_validate(
        {
            "id": f"teaching-{name}",
            "title": title,
            "metadata": {
                "example": True,
                "attribution": ATTRIBUTION,
                "references": references,
                "valueStatus": "illustrative",
                "scope": notes,
            },
            "engineering": {"equipment": items, "streams": streams},
            "presentation": {
                "nodes": positions,
                "metadata": {
                    "style": {
                        "preset": "academicColorful",
                        "showTitle": True,
                        "showLegend": True,
                    }
                },
            },
            "education": {
                "notes": notes
                + " The first inlet temperature is an arbitrary illustrative 25 degC entry, not a measured or calculated condition. Other stream temperatures remain unknown.",
                "annotations": [
                    {
                        "id": f"{name}-principle",
                        "kind": "note",
                        "text": principle,
                        "targetId": explorer or items[0]["id"],
                        "x": 80.0,
                        "y": -40.0,
                        "visible": True,
                        "provenance": "conceptual",
                    },
                    {
                        "id": f"{name}-value-status",
                        "kind": "note",
                        "text": "First inlet: 25 degC is an arbitrary illustrative entry. Other temperatures remain unknown; no process calculation.",
                        "targetId": items[0]["id"],
                        "x": 80.0,
                        "y": 550.0,
                        "visible": True,
                        "provenance": "illustrative",
                    },
                ],
                "steps": [
                    {
                        "id": f"{name}-overview",
                        "title": "Process overview",
                        "targetIds": [item["id"] for item in items],
                        "revealIds": [item["id"] for item in items],
                        "annotationIds": [f"{name}-principle"],
                        "notes": notes,
                    },
                    {
                        "id": f"{name}-equipment",
                        "title": "Explain the equipment",
                        "targetIds": [explorer or items[0]["id"]],
                        "revealIds": [item["id"] for item in items]
                        + [stream["id"] for stream in streams],
                        "annotationIds": [f"{name}-principle"],
                        "notes": principle,
                        "explorerId": explorer,
                    },
                ],
            },
        }
    )
    report = validate_document(document)
    if not report.valid:
        raise ValueError(f"Invalid teaching example {name}: {report.issues}")
    return document.model_dump(mode="json", by_alias=True)


def teaching_examples() -> dict[str, dict[str, Any]]:
    return {
        "distillation": lesson(
            "distillation",
            "Distillation: multiple feeds and a side draw",
            [
                ("d-feed", "feed", "Fresh feed", {}),
                ("d-feed2", "feed", "Second feed", {}),
                (
                    "d-column",
                    "column",
                    "C-201",
                    {
                        "stageCount": 12,
                        "feedStage": 6,
                        "stageBasis": "theoretical",
                        "stageNumbering": "topDown",
                        "feeds": [{"portId": "secondFeed", "stage": 9}],
                        "sideDraws": [
                            {"portId": "liquidDraw", "stage": 4, "phase": "liquid"}
                        ],
                        "condenser": "total",
                        "reboiler": "partial",
                        "refluxRatio": None,
                        "boilupRatio": None,
                        "stageProperties": [
                            {
                                "stage": 6,
                                "temperatureK": None,
                                "pressurePa": None,
                                "status": "illustrative",
                            }
                        ],
                    },
                ),
                ("d-distillate", "product", "Distillate", {}),
                ("d-bottoms", "product", "Bottoms", {}),
                ("d-side", "product", "Side product", {}),
            ],
            [
                ("d-feed", "out", "d-column", "feed", "Feed A"),
                ("d-feed2", "out", "d-column", "secondFeed", "Feed B"),
                ("d-column", "overhead", "d-distillate", "in", "Overhead"),
                ("d-column", "bottoms", "d-bottoms", "in", "Bottoms"),
                ("d-column", "liquidDraw", "d-side", "in", "Liquid side draw"),
            ],
            "Conceptual distillation lesson. Declared stages exclude condenser/reboiler. Unknown conditions and ratios are intentional; no VLE, reflux, duty, purity or stage-efficiency calculation is performed.",
            [
                {
                    "title": "ETH Zurich Hyper-TVT: Distillation",
                    "url": "https://www.hyper-tvt.ethz.ch/distillation-page.html",
                }
            ],
            "Vapor rises and liquid descends. Two feeds and a liquid side draw retain distinct stable ports at explicit stages.",
            "d-column",
        ),
        "fermentation": lesson(
            "fermentation",
            "Fermentation: broth and carbon dioxide recovery",
            [
                ("f-feed", "feed", "Sugar solution", {}),
                ("f-pump", "pump", "P-301", {}),
                (
                    "f-reactor",
                    "reactor",
                    "Fermenter (conceptual)",
                    {"reactorType": "stirredTank", "operation": "continuous"},
                ),
                ("f-separator", "separator", "Gas disengagement", {}),
                ("f-gas", "product", "CO2-rich gas", {}),
                ("f-broth", "product", "Ethanol-containing broth", {}),
            ],
            [
                ("f-feed", "out", "f-pump", "in", "Sugar feed"),
                ("f-pump", "out", "f-reactor", "in", "Pumped feed"),
                ("f-reactor", "out", "f-separator", "in", "Fermentation mixture"),
                ("f-separator", "vaporOut", "f-gas", "in", "Gas"),
                ("f-separator", "liquidOut", "f-broth", "in", "Broth"),
            ],
            "Simplified fermentation block flow using generic reactor/separator symbols. Pretreatment, biology, sterility, nutrients, kinetics, ethanol purification and cooling equipment are outside this lesson. Composition, conversion and productivity remain unknown.",
            [
                {
                    "title": "US DOE AFDC: Ethanol Production",
                    "url": "https://afdc.energy.gov/fuels/ethanol-production",
                },
                {
                    "title": "Wisconsin Energy Institute: Distillation of Ethanol",
                    "url": "https://energy.wisc.edu/education/for-educators/educational-materials/distillation-ethanol",
                },
            ],
            "Fermentation can produce ethanol and carbon dioxide from sugar-based feedstocks. The generic reactor illustrates a process role rather than biological design.",
        ),
        "water-treatment": lesson(
            "water-treatment",
            "Water treatment: coagulation and settling concept",
            [
                ("w-feed", "feed", "Raw water", {}),
                ("w-dose", "feed", "Coagulant feed", {}),
                (
                    "w-mixer",
                    "mixer",
                    "Coagulation mixing",
                    {"mixingMethod": "agitated"},
                ),
                (
                    "w-tank",
                    "tank",
                    "Flocculation contact (conceptual)",
                    {"roof": "open"},
                ),
                (
                    "w-separator",
                    "separator",
                    "Settling (conceptual)",
                    {"service": "liquidLiquid"},
                ),
                (
                    "w-water",
                    "product",
                    "Clarified water: further treatment required",
                    {},
                ),
                ("w-sludge", "product", "Settled solids / water", {}),
            ],
            [
                ("w-feed", "out", "w-mixer", "in1", "Raw water"),
                ("w-dose", "out", "w-mixer", "in2", "Chemical addition"),
                ("w-mixer", "out", "w-tank", "in", "Mixed water"),
                ("w-tank", "out", "w-separator", "in", "Flocculated water"),
                (
                    "w-separator",
                    "vaporOut",
                    "w-water",
                    "in",
                    "Upper clarified liquid (not vapor)",
                ),
                (
                    "w-separator",
                    "liquidOut",
                    "w-sludge",
                    "in",
                    "Settled sludge (conceptual)",
                ),
            ],
            "Conceptual coagulation, flocculation and settling only. The generic liquid-liquid separator stands in for an unimplemented clarifier; vaporOut is a legacy logical upper-outlet ID, not a vapor-phase claim. Filtration and disinfection are omitted, so the product is not declared potable. No dosing or contaminant-removal calculation.",
            [
                {
                    "title": "CDC: How Water Treatment Works",
                    "url": "https://www.cdc.gov/drinking-water/about/how-water-treatment-works.html",
                }
            ],
            "Coagulation and flocculation help particles form settleable flocs. Clarified water still needs downstream filtration/disinfection; this lesson does not certify drinking water.",
        ),
        "hydrogen-production": lesson(
            "hydrogen-production",
            "Hydrogen production: conceptual water electrolysis",
            [
                ("h-feed", "feed", "Water supply", {}),
                ("h-pump", "pump", "P-501", {}),
                (
                    "h-cell",
                    "reactor",
                    "Electrolyzer (generic reactor symbol)",
                    {"reactorType": "stirredTank", "operation": "continuous"},
                ),
                ("h-split", "splitter", "Separate cell outlets (conceptual)", {}),
                ("h-hydrogen", "product", "Hydrogen-rich outlet", {}),
                ("h-oxygen", "product", "Oxygen-rich outlet", {}),
            ],
            [
                ("h-feed", "out", "h-pump", "in", "Water"),
                ("h-pump", "out", "h-cell", "in", "Cell water feed"),
                ("h-cell", "out", "h-split", "in", "Logical product boundary"),
                ("h-split", "out1", "h-hydrogen", "in", "Hydrogen circuit"),
                ("h-split", "out2", "h-oxygen", "in", "Oxygen circuit"),
            ],
            "The generic reactor and splitter illustrate logical process roles only. The splitter represents physically separate cell outlets, not downstream separation of a mixed hydrogen/oxygen stream. Electrical supply is described in notes because the current generic reactor heat port is not an electrical-work model. Purification, compression and electrolyte loops are outside scope. No current, voltage, efficiency, production rate or safety design is inferred.",
            [
                {
                    "title": "US DOE: Hydrogen Production, Electrolysis",
                    "url": "https://www.energy.gov/cmei/fuels/hydrogen-production-electrolysis",
                }
            ],
            "Electrical energy splits water into hydrogen and oxygen in an electrolyzer. Product circuits are conceptually separate; the generic symbols do not depict cell internals.",
        ),
        "heat-exchanger-network": lesson(
            "heat-exchanger-network",
            "Heat-exchanger network: two independent utility circuits",
            [
                ("n-feed", "feed", "Process feed", {}),
                (
                    "n-e1",
                    "heatExchanger",
                    "E-601",
                    {
                        "tubePasses": 4,
                        "shellPasses": 2,
                        "baffleCount": 4,
                        "flowArrangement": "counterCurrent",
                        "tubeLengthM": None,
                        "shellDiameterM": None,
                    },
                ),
                (
                    "n-e2",
                    "heatExchanger",
                    "E-602",
                    {
                        "tubePasses": 2,
                        "shellPasses": 1,
                        "baffleCount": 6,
                        "flowArrangement": "coCurrent",
                    },
                ),
                ("n-product", "product", "Process product", {}),
                ("n-u1", "feed", "Utility A in", {}),
                ("n-u1out", "product", "Utility A out", {}),
                ("n-u2", "feed", "Utility B in", {}),
                ("n-u2out", "product", "Utility B out", {}),
            ],
            [
                ("n-feed", "out", "n-e1", "tubeIn", "Process inlet"),
                ("n-e1", "tubeOut", "n-e2", "tubeIn", "Inter-exchanger process"),
                ("n-e2", "tubeOut", "n-product", "in", "Process outlet"),
                ("n-u1", "out", "n-e1", "shellIn", "Utility A supply"),
                ("n-e1", "shellOut", "n-u1out", "in", "Utility A return"),
                ("n-u2", "out", "n-e2", "shellIn", "Utility B supply"),
                ("n-e2", "shellOut", "n-u2out", "in", "Utility B return"),
            ],
            "Two exchangers in series with independently connected shell circuits. Tube/shell colors identify circuits rather than assumed hot/cold roles. Except for the explicitly illustrative first-inlet temperature exercise, temperatures and flows remain unknown. Passes/baffles are illustrative specifications, not exchanger sizing or pinch analysis.",
            [
                {
                    "title": "US DOE Fundamentals Handbook: Heat Transfer",
                    "url": "https://www.energy.gov/documents/doe-hdbk-1012-92vol2",
                }
            ],
            "Separate tube and shell circuits transfer heat through walls without material mixing. Multi-pass paths reverse locally and are not everywhere purely countercurrent.",
            "n-e1",
        ),
    }
