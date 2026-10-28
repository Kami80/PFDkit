"""Checks for gallery interchange and documentation rendering behavior."""

from itertools import pairwise
from pathlib import Path

from docs_diagram import diagram, values
from docs_routing import route
from gallery_processes import process_gallery
from pfd_core import (
    Document,
    Quantity,
    add_equipment,
    new_document,
    registry,
    validate_document,
)


def test_gallery_downloads_are_valid_and_have_provenance():
    root = Path(__file__).resolve().parents[1]
    for name, doc, *_ in process_gallery():
        assert validate_document(doc).valid
        downloaded = Document.model_validate_json(
            (root / f"docs/core-site/{name}.json").read_text()
        )
        assert validate_document(downloaded).valid
        assert downloaded.metadata["scope"]
        assert downloaded.metadata["references"]
        assert downloaded.engineering.streams[0].flow_rate.value == 1


def test_values_preserve_unknown_and_zero():
    stream = process_gallery()[0][1].engineering.streams[0]
    stream.temperature = Quantity(value=None, unit="degC", dimension="temperature")
    assert "T=? degC" in values(stream)
    stream.temperature = Quantity(value=0, unit="degC", dimension="temperature")
    assert "T=0 degC" in values(stream)


def test_routes_are_orthogonal_and_avoid_equipment():
    points = route((0, 0), (100, 0), [(40, -10, 60, 10)], set())
    assert points[0] == (0, 0) and points[-1] == (100, 0)
    for a, b in pairwise(points):
        assert a[0] == b[0] or a[1] == b[1]
        if a[1] == b[1]:
            assert not (
                min(a[0], b[0]) < 60 and max(a[0], b[0]) > 40 and -10 < a[1] < 10
            )


def test_every_builtin_has_vector_artwork():
    doc = new_document("Equipment catalog")
    for i, definition in enumerate(registry.definitions()):
        doc = add_equipment(doc, definition.type, id=definition.type, x=i * 250)
    rendered = diagram(doc)
    assert "<circle" in rendered  # Pump / exchanger artwork, not generic boxes.
    assert "heatExchanger" in rendered
    assert "Equipment catalog" in rendered


def test_rendered_streams_have_labels_and_values():
    doc = process_gallery()[0][1]
    rendered = diagram(doc)
    for stream in doc.engineering.streams:
        assert stream.tag in rendered
    assert "F=1 kg/s" in rendered
    assert "T=25 degC" in rendered
