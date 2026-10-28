"""The same committed fixtures are consumed by the browser contract tests."""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from pfd_core import Document, validate_document

EXAMPLES = Path(__file__).resolve().parents[3] / "examples"
MANIFEST = json.loads((EXAMPLES / "manifest.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", MANIFEST, ids=lambda case: case["file"])
def test_shared_fixture(case: dict[str, object]) -> None:
    text = (EXAMPLES / str(case["file"])).read_text(encoding="utf-8")
    if case["codes"] in [["unsupported_version"], ["schema_error"]]:
        with pytest.raises(ValidationError):
            Document.model_validate_json(text)
        return
    document = Document.model_validate_json(text)
    report = validate_document(document)
    assert report.valid == case["valid"]
    assert sorted({issue.code for issue in report.issues}) == case["codes"]
    if report.valid:
        assert Document.model_validate_json(document.to_json()) == document
