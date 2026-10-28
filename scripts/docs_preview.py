"""Execute trusted documentation snippets and render their actual document state."""

import contextlib
import io
import itertools
from html import escape

from pfd_core import Document

_diagrams = itertools.count()


def example_output(code: str, namespace: dict) -> str:
    before = {
        key: value.to_json()
        for key, value in namespace.items()
        if isinstance(value, Document)
    }
    output = io.StringIO()
    with contextlib.redirect_stdout(output):
        # Only repository-authored documentation is executed during a local build.
        exec(compile(code, "<documentation example>", "exec"), namespace)  # noqa: S102
    documents = [
        value
        for key, value in namespace.items()
        if isinstance(value, Document) and before.get(key) != value.to_json()
    ]
    text = (
        output.getvalue().strip() or "Completed successfully · all assertions passed."
    )
    result = '<details class="output" open><summary>Executed output</summary>'
    if documents:
        doc = documents[-1]
        result += (
            '<div class="stats">'
            + "".join(
                f"<span><b>{count}</b> {label}</span>"
                for count, label in [
                    (len(doc.engineering.equipment), "equipment"),
                    (len(doc.engineering.streams), "streams"),
                    (len(doc.engineering.components), "components"),
                ]
            )
            + "</div>"
        )
        result += diagram(doc)
        if doc.engineering.streams:
            result += '<div class="table-scroll" role="region" tabindex="0" aria-label="Stream connections"><table><thead><tr><th>Stream</th><th>Source → target</th><th>Kind</th></tr></thead><tbody>'
            for stream in doc.engineering.streams:
                connection = f"{stream.source.equipment_id}.{stream.source.port_id} → {stream.target.equipment_id}.{stream.target.port_id}"
                result += f"<tr><td>{escape(stream.tag or stream.id)}</td><td>{escape(connection)}</td><td>{escape(stream.kind)}</td></tr>"
            result += "</tbody></table></div>"
    result += '<pre class="console">' + escape(text) + "</pre></details>"
    return result


def diagram(doc: Document) -> str:
    marker = f"arrow-{next(_diagrams)}"
    equipment = doc.engineering.equipment
    if not equipment:
        return '<p class="empty-output">Empty document created.</p>'
    width = max(660, len(equipment) * 165)
    positions = {
        item.id: (35 + index * 165, 58) for index, item in enumerate(equipment)
    }
    parts = [
        f'<svg class="process-preview" role="img" aria-label="Schematic of {escape(doc.title, quote=True)}" viewBox="0 0 {width} 175" xmlns="http://www.w3.org/2000/svg">',
        f'<defs><marker id="{marker}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 10 5 0 10" fill="currentColor"/></marker></defs>',
    ]
    for stream in doc.engineering.streams:
        if (
            stream.source.equipment_id not in positions
            or stream.target.equipment_id not in positions
        ):
            continue
        x, y = positions[stream.source.equipment_id]
        tx, _ty = positions[stream.target.equipment_id]
        path = (
            f"M{x + 120} {y + 26} H{tx}"
            if x != tx
            else f"M{x + 120} {y + 26} H{x + 140} V{y - 22} H{x - 16} V{y + 26} H{x}"
        )
        parts.append(
            f'<path d="{path}" fill="none" stroke="currentColor" stroke-width="2" marker-end="url(#{marker})"/>'
        )
    for item in equipment:
        x, y = positions[item.id]
        parts.append(
            f'<rect x="{x}" y="{y}" width="120" height="52" rx="12" fill="var(--surface)" stroke="currentColor"/><text x="{x + 60}" y="{y + 23}" text-anchor="middle">{escape(item.tag)}</text><text class="equipment-kind" x="{x + 60}" y="{y + 41}" text-anchor="middle">{escape(item.type)}</text>'
        )
    parts.append(
        '</svg><p class="preview-caption">Document schematic · connections from the executed example; layout simplified for readability.</p>'
    )
    return "".join(parts)
