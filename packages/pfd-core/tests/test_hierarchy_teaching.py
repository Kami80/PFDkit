"""Nested sections validate independently from allowed process recycle loops."""

import json
from pathlib import Path

import pytest

from pfd_core import Document, validate_document


def example() -> dict:
    return json.loads(
        (Path(__file__).resolve().parents[3] / "examples/valid-process.json").read_text(
            encoding="utf-8"
        )
    )


def section_document() -> dict:
    data = example()
    boundaries = []
    for stream in data["engineering"]["streams"]:
        incoming = stream["target"]["equipmentId"] == "pump-1"
        outgoing = stream["source"]["equipmentId"] == "pump-1"
        if incoming or outgoing:
            boundaries.append(
                {
                    "id": "boundary-" + stream["id"],
                    "streamId": stream["id"],
                    "internalEndpoint": stream["target"] if incoming else stream["source"],
                    "direction": "in" if incoming else "out",
                    "kind": stream["kind"],
                }
            )
    data["engineering"]["sections"] = [
        {
            "id": "section",
            "name": "Pumping",
            "parentId": None,
            "equipmentIds": ["pump-1"],
            "boundaryPorts": boundaries,
        }
    ]
    return data


def test_hierarchy_round_trip_and_legacy_defaults() -> None:
    document = Document.model_validate(section_document())
    assert validate_document(document).valid
    assert Document.model_validate_json(document.to_json()) == document
    legacy = example()
    legacy["engineering"].pop("sections", None)
    legacy["education"].pop("steps", None)
    legacy["education"].pop("annotations", None)
    old_document = Document.model_validate(legacy)
    assert old_document.engineering.sections == []
    assert old_document.education.steps == []
    assert old_document.education.annotations == []


@pytest.mark.parametrize(
    "case,code",
    [
        ("parent", "missing_parent_section"),
        ("recursive", "recursive_section"),
        ("depth", "section_depth"),
        ("member", "missing_section_equipment"),
        ("owners", "multiple_section_owners"),
        ("boundary", "invalid_boundary_mapping"),
        ("missing_boundary", "missing_boundary_mapping"),
        ("id", "duplicate_id"),
    ],
)
def test_invalid_containment_and_boundary_contract(case: str, code: str) -> None:
    data = section_document()
    section = data["engineering"]["sections"][0]
    if case == "parent":
        section["parentId"] = "missing"
    elif case == "recursive":
        section["parentId"] = "section"
    elif case == "depth":
        parent = "section"
        for n in range(4):
            identity = f"level-{n}"
            data["engineering"]["sections"].append(
                {"id": identity, "name": identity, "parentId": parent}
            )
            parent = identity
    elif case == "member":
        section["equipmentIds"].append("missing")
    elif case == "owners":
        section["equipmentIds"].append("pump-1")
    elif case == "boundary":
        section["boundaryPorts"][0]["kind"] = "energy"
    elif case == "missing_boundary":
        section["boundaryPorts"] = []
    elif case == "id":
        data["education"]["annotations"] = [{"id": "section", "text": "Duplicate"}]
    result = validate_document(Document.model_validate(data))
    assert not result.valid
    assert code in {issue.code for issue in result.issues}


def test_process_recycle_is_not_recursive_containment() -> None:
    data = section_document()
    stream = data["engineering"]["streams"][0]
    stream["source"] = {"equipmentId": "pump-1", "portId": "out"}
    stream["target"] = {"equipmentId": "pump-1", "portId": "in"}
    data["engineering"]["streams"] = [stream]
    data["engineering"]["sections"][0]["boundaryPorts"] = []
    assert validate_document(Document.model_validate(data)).valid


def test_deleted_teaching_targets_are_preserved_as_warnings() -> None:
    data = section_document()
    data["education"]["annotations"] = [
        {"id": "note", "text": "Retained context", "targetId": "deleted"}
    ]
    data["education"]["steps"] = [
        {"id": "lecture", "targetIds": ["deleted"], "annotationIds": ["missing"]}
    ]
    document = Document.model_validate(data)
    report = validate_document(document)
    assert report.valid
    assert (
        len([finding for finding in report.issues if finding.code == "missing_teaching_target"])
        == 2
    )
    assert Document.model_validate_json(document.to_json()) == document
