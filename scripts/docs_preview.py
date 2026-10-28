"""Execute trusted documentation snippets and render actual document state."""

import contextlib
import io
from html import escape

from docs_diagram import diagram, values
from pfd_core import Document, EquipmentRegistry, registry


def document_output(
    doc: Document, equipment_registry: EquipmentRegistry = registry
) -> str:
    result = (
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
    result += diagram(doc, equipment_registry)
    if doc.engineering.streams:
        result += '<div class="table-scroll" role="region" tabindex="0" aria-label="Stream connections and entered values"><table><thead><tr><th scope="col">Stream</th><th scope="col">Source → target</th><th scope="col">Kind</th><th scope="col">Entered values</th></tr></thead><tbody>'
        for stream in doc.engineering.streams:
            connection = f"{stream.source.equipment_id}.{stream.source.port_id} → {stream.target.equipment_id}.{stream.target.port_id}"
            result += f'<tr><td>{escape(stream.tag or stream.id)}</td><td><code class="connection-label">{escape(connection)}</code></td><td><span class="stream-kind">{escape(stream.kind)}</span></td><td>{escape(values(stream)) or "Not entered"}</td></tr>'
        result += "</tbody></table></div>"
    return result


def example_output(code: str, namespace: dict) -> str:
    before = {
        key: value.to_json()
        for key, value in namespace.items()
        if isinstance(value, Document)
    }
    output = io.StringIO()
    with contextlib.redirect_stdout(output):
        # Only trusted repository-authored examples are executed during a build.
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
        selected = registry
        for candidate in [
            registry,
            *[
                value
                for value in namespace.values()
                if isinstance(value, EquipmentRegistry)
            ],
        ]:
            try:
                for item in doc.engineering.equipment:
                    candidate.get(item.type)
                selected = candidate
                break
            except ValueError:
                continue
        result += document_output(doc, selected)
    return result + '<pre class="console">' + escape(text) + "</pre></details>"
