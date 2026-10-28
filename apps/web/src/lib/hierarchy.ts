import type { Document, ProcessSection } from "@pfdkit/contracts";

export function sectionEquipmentIds(
  document: Document,
  sectionId: string | null,
): string[] {
  if (sectionId === null)
    return document.engineering.equipment.map((e) => e.id);
  const visited = new Set<string>();
  const visit = (id: string): string[] => {
    if (visited.has(id)) return [];
    visited.add(id);
    const section = (document.engineering.sections ?? []).find(
      (s) => s.id === id,
    );
    return section
      ? [
          ...section.equipmentIds,
          ...document.engineering.sections
            .filter((s) => s.parentId === id)
            .flatMap((s) => visit(s.id)),
        ]
      : [];
  };
  return visit(sectionId);
}

/** Canonical graph stays intact. A boundary is a view mapping, never a second stream. */
export function syncBoundaries(document: Document): void {
  const validEquipment = new Set(
    document.engineering.equipment.map((e) => e.id),
  );
  document.engineering.sections ??= [];
  for (const section of document.engineering.sections)
    section.equipmentIds = section.equipmentIds.filter((id) =>
      validEquipment.has(id),
    );
  for (const section of document.engineering.sections) {
    const inside = new Set(sectionEquipmentIds(document, section.id));
    section.boundaryPorts = document.engineering.streams
      .filter(
        (s) =>
          inside.has(s.source.equipmentId) !== inside.has(s.target.equipmentId),
      )
      .map((stream) => {
        const incoming = inside.has(stream.target.equipmentId);
        return {
          id:
            section.boundaryPorts.find((p) => p.streamId === stream.id)?.id ??
            crypto.randomUUID(),
          streamId: stream.id,
          internalEndpoint: structuredClone(
            incoming ? stream.target : stream.source,
          ),
          direction: incoming ? ("in" as const) : ("out" as const),
          kind: stream.kind,
        };
      });
  }
}

export function groupSection(
  document: Document,
  ids: string[],
  name: string,
  parentId: string | null,
): ProcessSection {
  const selected = new Set(
    ids.filter((id) => document.engineering.equipment.some((e) => e.id === id)),
  );
  if (!selected.size)
    throw new Error("Select connected equipment to create a process section.");
  const allSections = document.engineering.sections ?? [];
  const available =
    parentId === null
      ? document.engineering.equipment
          .filter(
            (e) => !allSections.some((s) => s.equipmentIds.includes(e.id)),
          )
          .map((e) => e.id)
      : (allSections.find((s) => s.id === parentId)?.equipmentIds ?? []);
  if ([...selected].some((id) => !available.includes(id)))
    throw new Error(
      "Group equipment directly inside the current section. Enter a section to group its equipment.",
    );
  const reached = new Set([selected.values().next().value!]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const stream of document.engineering.streams) {
      const a = stream.source.equipmentId,
        b = stream.target.equipmentId;
      if (
        selected.has(a) &&
        selected.has(b) &&
        (reached.has(a) || reached.has(b))
      ) {
        if (!reached.has(a) || !reached.has(b)) changed = true;
        reached.add(a);
        reached.add(b);
      }
    }
  }
  if (reached.size !== selected.size)
    throw new Error(
      "The selected equipment must form a connected process section.",
    );
  const section = {
    id: crypto.randomUUID(),
    name: name.trim() || "Process section",
    parentId,
    equipmentIds: [...selected],
    boundaryPorts: [],
  };
  document.engineering.sections = [...allSections, section];
  const parent = document.engineering.sections.find((s) => s.id === parentId);
  if (parent)
    parent.equipmentIds = parent.equipmentIds.filter((id) => !selected.has(id));
  syncBoundaries(document);
  return section;
}

export function extractSection(document: Document, id: string): void {
  const section = document.engineering.sections.find((s) => s.id === id);
  if (!section) return;
  const parent = document.engineering.sections.find(
    (s) => s.id === section.parentId,
  );
  if (parent) parent.equipmentIds.push(...section.equipmentIds);
  for (const child of document.engineering.sections)
    if (child.parentId === id) child.parentId = section.parentId;
  document.engineering.sections = document.engineering.sections.filter(
    (s) => s.id !== id,
  );
  syncBoundaries(document);
}

/** A portable section document is also the saved template format. */
export function sectionTemplate(document: Document, id: string): Document {
  const copy = structuredClone(document);
  const equipment = new Set(sectionEquipmentIds(copy, id));
  const sections = new Set<string>([id]);
  for (let depth = 0; depth < 4; depth++)
    for (const section of copy.engineering.sections)
      if (section.parentId && sections.has(section.parentId))
        sections.add(section.id);
  copy.id = crypto.randomUUID();
  copy.title =
    copy.engineering.sections.find((s) => s.id === id)?.name ??
    "Process section";
  copy.engineering.equipment = copy.engineering.equipment.filter((e) =>
    equipment.has(e.id),
  );
  copy.engineering.streams = copy.engineering.streams.filter(
    (s) =>
      equipment.has(s.source.equipmentId) &&
      equipment.has(s.target.equipmentId),
  );
  copy.engineering.sections = copy.engineering.sections.filter((s) =>
    sections.has(s.id),
  );
  copy.engineering.sections.find((s) => s.id === id)!.parentId = null;
  copy.presentation.nodes = Object.fromEntries(
    Object.entries(copy.presentation.nodes).filter(([key]) =>
      equipment.has(key),
    ),
  );
  const objects = new Set([
    ...equipment,
    ...sections,
    ...copy.engineering.streams.map((s) => s.id),
  ]);
  const positions = [...equipment].map((key) =>
    Object.hasOwn(copy.presentation.nodes, key)
      ? copy.presentation.nodes[key]
      : { x: 0, y: 0 },
  );
  const bounds = {
    left: Math.min(...positions.map((p) => p.x)) - 40,
    right: Math.max(...positions.map((p) => p.x)) + 200,
    top: Math.min(...positions.map((p) => p.y)) - 80,
    bottom: Math.max(...positions.map((p) => p.y)) + 180,
  };
  // Untargeted notes inside the section figure bounds travel with the section.
  copy.education.annotations = (copy.education.annotations ?? []).filter((a) =>
    a.targetId !== null
      ? objects.has(a.targetId)
      : a.x >= bounds.left &&
        a.x <= bounds.right &&
        a.y >= bounds.top &&
        a.y <= bounds.bottom,
  );
  const annotationIds = new Set(copy.education.annotations.map((a) => a.id));
  copy.education.steps = (copy.education.steps ?? [])
    .filter(
      (s) =>
        s.targetIds.some((t) => objects.has(t)) ||
        s.revealIds.some((t) => objects.has(t)) ||
        (s.explorerId !== null && objects.has(s.explorerId)) ||
        s.annotationIds.some((t) => annotationIds.has(t)),
    )
    .map((s) => ({
      ...s,
      targetIds: s.targetIds.filter((t) => objects.has(t)),
      revealIds: s.revealIds.filter((t) => objects.has(t)),
      annotationIds: s.annotationIds.filter((t) => annotationIds.has(t)),
      explorerId:
        s.explorerId && equipment.has(s.explorerId) ? s.explorerId : null,
    }));
  syncBoundaries(copy);
  return copy;
}

export function insertTemplate(
  document: Document,
  template: Document,
  parentId: string | null,
): string[] {
  if (!template.engineering.sections?.length)
    throw new Error("A process template must contain a process section.");
  const copy = structuredClone(template);
  const all = [
    ...copy.engineering.equipment,
    ...copy.engineering.streams,
    ...copy.engineering.components,
    ...copy.engineering.sections,
    ...copy.education.annotations,
    ...copy.education.steps,
  ];
  const remap = new Map(all.map((o) => [o.id, crypto.randomUUID()]));
  const id = (old: string) => remap.get(old) ?? old;
  const styles = document.presentation.metadata.objectStyles as
    Record<string, unknown> | undefined;
  const copiedStyles = copy.presentation.metadata.objectStyles as
    Record<string, unknown> | undefined;
  const usedTags = new Set(
    [...document.engineering.equipment, ...document.engineering.streams].map(
      (item) => item.tag,
    ),
  );
  const copiedTag = (tag: string) => {
    let name = `${tag || "Object"} copy`,
      index = 2;
    while (usedTags.has(name)) name = `${tag || "Object"} copy ${index++}`;
    usedTags.add(name);
    return name;
  };
  for (const item of copy.engineering.equipment) {
    const position = Object.hasOwn(copy.presentation.nodes, item.id)
      ? copy.presentation.nodes[item.id]
      : { x: 0, y: 0, metadata: {} };
    document.presentation.nodes = {
      ...document.presentation.nodes,
      [id(item.id)]: { ...position, x: position.x + 40, y: position.y + 40 },
    };
    if (copiedStyles && Object.hasOwn(copiedStyles, item.id))
      document.presentation.metadata.objectStyles = {
        ...styles,
        ...(document.presentation.metadata.objectStyles as object),
        [id(item.id)]: copiedStyles[item.id],
      };
    item.id = id(item.id);
    item.tag = copiedTag(item.tag);
  }
  for (const stream of copy.engineering.streams) {
    if (copiedStyles && Object.hasOwn(copiedStyles, stream.id))
      document.presentation.metadata.objectStyles = {
        ...(document.presentation.metadata.objectStyles as object),
        [id(stream.id)]: copiedStyles[stream.id],
      };
    stream.id = id(stream.id);
    stream.tag = copiedTag(stream.tag);
    stream.source.equipmentId = id(stream.source.equipmentId);
    stream.target.equipmentId = id(stream.target.equipmentId);
    for (const fraction of stream.composition?.fractions ?? [])
      fraction.componentId = id(fraction.componentId);
  }
  for (const component of copy.engineering.components)
    component.id = id(component.id);
  for (const section of copy.engineering.sections) {
    section.id = id(section.id);
    section.parentId = section.parentId ? id(section.parentId) : parentId;
    section.equipmentIds = section.equipmentIds.map(id);
    section.boundaryPorts = [];
  }
  for (const a of copy.education.annotations) {
    a.id = id(a.id);
    a.targetId = a.targetId ? id(a.targetId) : null;
    a.x += 40;
    a.y += 40;
    if (a.endX !== null) a.endX += 40;
    if (a.endY !== null) a.endY += 40;
  }
  for (const s of copy.education.steps) {
    s.id = id(s.id);
    s.targetIds = s.targetIds.map(id);
    s.revealIds = s.revealIds.map(id);
    s.annotationIds = s.annotationIds.map(id);
    s.explorerId = s.explorerId ? id(s.explorerId) : null;
  }
  document.engineering.equipment.push(...copy.engineering.equipment);
  document.engineering.streams.push(...copy.engineering.streams);
  document.engineering.components.push(...copy.engineering.components);
  document.engineering.sections.push(...copy.engineering.sections);
  document.education.annotations.push(...copy.education.annotations);
  document.education.steps.push(...copy.education.steps);
  syncBoundaries(document);
  return copy.engineering.equipment.map((e) => e.id);
}
