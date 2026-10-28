"""Containment is separate from the process graph: recycle streams are valid."""

from .models import Document, Finding


def validate_hierarchy(document: Document) -> list[Finding]:
    findings: list[Finding] = []

    def issue(code: str, message: str, identity: str, warning: bool = False) -> None:
        findings.append(
            Finding(
                code=code,
                message=message,
                object_id=identity,
                severity="warning" if warning else "error",
            )
        )

    sections = {section.id: section for section in document.engineering.sections}
    equipment = {item.id for item in document.engineering.equipment}
    streams = {item.id: item for item in document.engineering.streams}
    identities = [item.id for item in document.engineering.equipment]
    identities += [item.id for item in document.engineering.streams]
    identities += [item.id for item in document.engineering.components]
    identities += [section.id for section in document.engineering.sections]
    identities += [port.id for section in sections.values() for port in section.boundary_ports]
    identities += [item.id for item in document.education.annotations]
    identities += [item.id for item in document.education.steps]
    seen: set[str] = set()
    for identity in identities:
        if identity in seen:
            issue(
                "duplicate_id", "Identifiers must be unique across all document objects.", identity
            )
        seen.add(identity)
    owners: set[str] = set()
    for section in sections.values():
        if section.parent_id is not None and section.parent_id not in sections:
            issue("missing_parent_section", "The parent section does not exist.", section.id)
        chain: set[str] = set()
        cursor: str | None = section.id
        while cursor in sections:
            if cursor in chain:
                issue("recursive_section", "Process containment cannot be recursive.", section.id)
                break
            chain.add(cursor)
            cursor = sections[cursor].parent_id
        if len(chain) > 4:
            issue(
                "section_depth", "Process sections support at most four nested levels.", section.id
            )
        for identity in section.equipment_ids:
            if identity not in equipment:
                issue("missing_section_equipment", "Section equipment does not exist.", section.id)
            if identity in owners:
                issue(
                    "multiple_section_owners",
                    "Equipment can belong directly to one section.",
                    identity,
                )
            owners.add(identity)

    def members(identity: str, visited: set[str]) -> set[str]:
        if identity in visited:
            return set()
        visited = visited | {identity}
        result = set(sections[identity].equipment_ids)
        for child in sections.values():
            if child.parent_id == identity:
                result |= members(child.id, visited)
        return result

    for section in sections.values():
        inside = members(section.id, set())
        expected = {
            stream.id: stream
            for stream in streams.values()
            if (stream.source.equipment_id in inside) != (stream.target.equipment_id in inside)
        }
        mapped: set[str] = set()
        for port in section.boundary_ports:
            stream = expected.get(port.stream_id)
            if stream is None:
                issue("invalid_boundary_mapping", "Boundary must map a crossing stream.", port.id)
                continue
            incoming = stream.target.equipment_id in inside
            endpoint = stream.target if incoming else stream.source
            if (
                port.internal_endpoint != endpoint
                or port.kind != stream.kind
                or port.direction != ("in" if incoming else "out")
                or port.stream_id in mapped
            ):
                issue(
                    "invalid_boundary_mapping",
                    "Boundary endpoint, direction or kind is inconsistent.",
                    port.id,
                )
            mapped.add(port.stream_id)
        if mapped != set(expected):
            issue(
                "missing_boundary_mapping",
                "Every crossing stream needs one boundary mapping.",
                section.id,
            )
    targets = equipment | set(streams) | set(sections)
    annotations = {item.id for item in document.education.annotations}
    for annotation in document.education.annotations:
        if annotation.target_id is not None and annotation.target_id not in targets:
            issue(
                "missing_teaching_target",
                "Annotation target was deleted or is unavailable.",
                annotation.id,
                True,
            )
    for step in document.education.steps:
        references = [*step.target_ids, *step.reveal_ids]
        if step.explorer_id is not None:
            references.append(step.explorer_id)
        if any(identity not in targets for identity in references) or any(
            identity not in annotations for identity in step.annotation_ids
        ):
            issue(
                "missing_teaching_target",
                "Presentation step has deleted or unavailable targets.",
                step.id,
                True,
            )
        if step.explorer_id is not None:
            item = next(
                (item for item in document.engineering.equipment if item.id == step.explorer_id),
                None,
            )
            if item is not None and item.type not in ("heatExchanger", "column"):
                issue(
                    "unsupported_teaching_explorer",
                    "This equipment has no supported explorer.",
                    step.id,
                    True,
                )
    return findings
