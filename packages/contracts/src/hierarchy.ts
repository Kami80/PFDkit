import type { Document } from "../../../contracts/generated/document";
import type { Finding } from "./index";

export function validateHierarchy(document: Document): Finding[] {
  const issues: Finding[] = [];
  const issue = (
    code: string,
    message: string,
    objectId: string,
    warning = false,
  ) =>
    issues.push({
      code,
      message,
      objectId,
      path: "",
      severity: warning ? "warning" : "error",
    });
  const sections = new Map(document.engineering.sections.map((s) => [s.id, s]));
  const equipment = new Set(document.engineering.equipment.map((e) => e.id));
  const streams = new Map(document.engineering.streams.map((s) => [s.id, s]));
  const identities = [
    ...document.engineering.equipment,
    ...document.engineering.streams,
    ...document.engineering.components,
    ...document.engineering.sections,
    ...document.engineering.sections.flatMap((s) => s.boundaryPorts),
    ...document.education.annotations,
    ...document.education.steps,
  ];
  const seen = new Set<string>();
  for (const item of identities) {
    if (seen.has(item.id))
      issue(
        "duplicate_id",
        "Identifiers must be unique across all document objects.",
        item.id,
      );
    seen.add(item.id);
  }
  const owners = new Set<string>();
  for (const section of sections.values()) {
    if (section.parentId !== null && !sections.has(section.parentId))
      issue(
        "missing_parent_section",
        "The parent section does not exist.",
        section.id,
      );
    const chain = new Set<string>();
    let cursor: string | null = section.id;
    while (cursor !== null && sections.has(cursor)) {
      if (chain.has(cursor)) {
        issue(
          "recursive_section",
          "Process containment cannot be recursive.",
          section.id,
        );
        break;
      }
      chain.add(cursor);
      cursor = sections.get(cursor)!.parentId;
    }
    if (chain.size > 4)
      issue(
        "section_depth",
        "Process sections support at most four nested levels.",
        section.id,
      );
    for (const id of section.equipmentIds) {
      if (!equipment.has(id))
        issue(
          "missing_section_equipment",
          "Section equipment does not exist.",
          section.id,
        );
      if (owners.has(id))
        issue(
          "multiple_section_owners",
          "Equipment can belong directly to one section.",
          id,
        );
      owners.add(id);
    }
  }
  const members = (id: string, visited = new Set<string>()): Set<string> => {
    if (visited.has(id)) return new Set();
    const next = new Set(visited).add(id);
    return new Set([
      ...sections.get(id)!.equipmentIds,
      ...[...sections.values()]
        .filter((s) => s.parentId === id)
        .flatMap((s) => [...members(s.id, next)]),
    ]);
  };
  for (const section of sections.values()) {
    const inside = members(section.id);
    const expected = new Map(
      [...streams.values()]
        .filter(
          (s) =>
            inside.has(s.source.equipmentId) !==
            inside.has(s.target.equipmentId),
        )
        .map((s) => [s.id, s]),
    );
    const mapped = new Set<string>();
    for (const port of section.boundaryPorts) {
      const stream = expected.get(port.streamId);
      if (!stream) {
        issue(
          "invalid_boundary_mapping",
          "Boundary must map a crossing stream.",
          port.id,
        );
        continue;
      }
      const incoming = inside.has(stream.target.equipmentId);
      const endpoint = incoming ? stream.target : stream.source;
      if (
        endpoint.equipmentId !== port.internalEndpoint.equipmentId ||
        endpoint.portId !== port.internalEndpoint.portId ||
        port.direction !== (incoming ? "in" : "out") ||
        port.kind !== stream.kind ||
        mapped.has(port.streamId)
      )
        issue(
          "invalid_boundary_mapping",
          "Boundary endpoint, direction or kind is inconsistent.",
          port.id,
        );
      mapped.add(port.streamId);
    }
    if (mapped.size !== expected.size)
      issue(
        "missing_boundary_mapping",
        "Every crossing stream needs one boundary mapping.",
        section.id,
      );
  }
  const targets = new Set([
    ...equipment,
    ...streams.keys(),
    ...sections.keys(),
  ]);
  const annotations = new Set(document.education.annotations.map((a) => a.id));
  for (const annotation of document.education.annotations)
    if (annotation.targetId !== null && !targets.has(annotation.targetId))
      issue(
        "missing_teaching_target",
        "Annotation target was deleted or is unavailable.",
        annotation.id,
        true,
      );
  for (const step of document.education.steps) {
    const references = [
      ...step.targetIds,
      ...step.revealIds,
      ...(step.explorerId ? [step.explorerId] : []),
    ];
    if (
      references.some((id) => !targets.has(id)) ||
      step.annotationIds.some((id) => !annotations.has(id))
    )
      issue(
        "missing_teaching_target",
        "Presentation step has deleted or unavailable targets.",
        step.id,
        true,
      );
    const item = document.engineering.equipment.find(
      (e) => e.id === step.explorerId,
    );
    if (item && !["heatExchanger", "column"].includes(item.type))
      issue(
        "unsupported_teaching_explorer",
        "This equipment has no supported explorer.",
        step.id,
        true,
      );
  }
  return issues;
}
