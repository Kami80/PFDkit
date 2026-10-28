"""Render documentation PFDs using the editor's shared vector equipment symbols."""

import json
import subprocess
import textwrap
from html import escape
from itertools import count, pairwise
from pathlib import Path

from docs_routing import route
from pfd_core import Document, EquipmentRegistry, registry

_ids = count()


def values(stream, *, composition=True) -> str:
    entries = []
    for label, quantity in [
        ("F", stream.flow_rate),
        ("T", stream.temperature),
        ("P", stream.pressure),
        ("Q", stream.properties.get("power")),
    ]:
        if quantity is None:
            continue
        data = quantity.model_dump() if hasattr(quantity, "model_dump") else quantity
        if not isinstance(data, dict) or "unit" not in data:
            continue
        value = data.get("value")
        entries.append(
            f"{label}={'?' if value is None else f'{value:g}'} {data['unit']}"
        )
    if composition and stream.composition is not None:
        entries.append(
            stream.composition.basis
            + ": "
            + ", ".join(
                f"{fraction.component_id}={fraction.value if fraction.value is not None else '?'}"
                for fraction in stream.composition.fractions
            )
        )
    return " · ".join(entries)


def diagram(doc: Document, equipment_registry: EquipmentRegistry = registry) -> str:
    if not doc.engineering.equipment:
        return '<p class="empty-output">Empty document created.</p>'
    definitions = []
    for item in doc.engineering.equipment:
        try:
            ports = equipment_registry.for_equipment(item.type, item.config).ports
        except ValueError:
            ports = []
        definitions.append(
            {
                "id": item.id,
                "type": item.type,
                "config": item.config,
                "ports": [p.model_dump() for p in ports],
            }
        )
    bridge = Path(__file__).with_name("docs-symbols.cjs")
    result = subprocess.run(
        ["node", str(bridge)],
        input=json.dumps(definitions),
        text=True,
        capture_output=True,
        check=True,
    )
    symbols = json.loads(result.stdout)
    items = doc.engineering.equipment
    raw = [
        (doc.presentation.nodes[e.id].x, doc.presentation.nodes[e.id].y)
        if e.id in doc.presentation.nodes
        else (0, 0)
        for e in items
    ]
    unique = len(set(raw)) == len(raw)
    if unique:
        xs, ys = sorted({p[0] for p in raw}), sorted({p[1] for p in raw})
        positions = {
            e.id: (120 + xs.index(p[0]) * 290, 160 + ys.index(p[1]) * 250)
            for e, p in zip(items, raw, strict=True)
        }
    else:
        positions = {e.id: (120 + i * 290, 160) for i, e in enumerate(items)}
    max_x = max(x for x, _ in positions.values()) + 220
    max_y = max(y for _, y in positions.values()) + 240
    marker = f"flow-{next(_ids)}"
    height = max_y
    parts = [
        f'<svg class="process-preview" width="{max_x}" height="{height}" role="img" aria-label="{escape(doc.title, quote=True)}" viewBox="0 0 {max_x} {height}" xmlns="http://www.w3.org/2000/svg">',
        f'<defs><marker id="{marker}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 10 5 0 10" fill="currentColor"/></marker></defs>',
    ]

    def endpoint(endpoint, source):
        x, y = positions[endpoint.equipment_id]
        port = symbols[endpoint.equipment_id]["ports"].get(
            endpoint.port_id, {"x": 120 if source else 0, "y": 40}
        )
        px, py = x + port["x"], y + port["y"]
        dx, dy = (
            (-30, 0)
            if port["x"] == 0
            else (30, 0)
            if port["x"] == 120
            else (0, -30)
            if port["y"] == 0
            else (0, 30)
        )
        return px, py, px + dx, py + dy

    boxes = [(x - 6, y - 6, x + 126, y + 86) for x, y in positions.values()]
    used = set()
    for stream in doc.engineering.streams:
        ax, ay, sx, sy = endpoint(stream.source, True)
        bx, by, tx, ty = endpoint(stream.target, False)
        points = [(ax, ay), *route((sx, sy), (tx, ty), boxes, used), (bx, by)]
        segments = list(pairwise(points))
        horizontal = [(a, b) for a, b in segments if a[1] == b[1]]
        a, b = max(
            horizontal or segments,
            key=lambda pair: (
                abs(pair[0][0] - pair[1][0]) + abs(pair[0][1] - pair[1][1])
            ),
        )
        lx, ly = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 20
        dash = ' stroke-dasharray="7 5"' if stream.kind == "energy" else ""
        path = "M" + " L".join(f"{x} {y}" for x, y in points)
        parts.append(
            f'<path d="{path}" fill="none" stroke="currentColor" stroke-width="2"{dash} marker-end="url(#{marker})"/>'
        )
        parts.append(
            f'<text class="stream-label" x="{lx}" y="{ly}" text-anchor="middle">{escape(stream.tag or stream.id)}</text>'
        )
        label = values(stream, composition=False)
        if label:
            parts.append(
                f'<text class="stream-value" x="{lx}" y="{ly + 15}" text-anchor="middle">{escape(label)}</text>'
            )
    for item in items:
        x, y = positions[item.id]
        parts.append(
            f'<g transform="translate({x} {y})" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
        )
        for shape in symbols[item.id]["shapes"]:
            attrs = " ".join(
                f'{key}="{escape(str(value), quote=True)}"'
                for key, value in shape["attrs"].items()
            )
            fill = "var(--surface)" if shape["fill"] == "body" else "none"
            parts.append(f'<{shape["tag"]} {attrs} fill="{fill}"/>')
        parts.append("</g>")
        for line_index, line in enumerate(textwrap.wrap(item.tag, 21) or [item.type]):
            parts.append(
                f'<text class="equipment-tag" x="{x + 60}" y="{y + 106 + line_index * 16}" text-anchor="middle">{escape(line)}</text>'
            )
        parts.append(
            f'<text class="equipment-kind" x="{x + 60}" y="{y - 14}" text-anchor="middle">{escape(item.type)}</text>'
        )
    parts.append("</svg>")
    return (
        '<div class="diagram-tools"><button class="diagram-size" aria-pressed="true">View actual size</button><span>Fit overview / scrollable detail</span></div><div class="diagram-scroll fit-diagram" role="region" tabindex="0" aria-label="Process flow diagram">'
        + "".join(parts)
        + '</div><p class="preview-caption">Original PFDkit equipment symbols · solid: material; dashed: energy · ? = entered unknown. Values are illustrative entries, not calculated results.</p>'
    )
