import type { Document } from "@pfdkit/contracts";
import { sectionEquipmentIds } from "./hierarchy";

export function expandTeachingTargets(
  document: Document,
  ids: string[],
): string[] {
  return [
    ...new Set(
      ids.flatMap((id) => {
        if (document.engineering.sections.some((s) => s.id === id))
          return sectionEquipmentIds(document, id);
        const stream = document.engineering.streams.find((s) => s.id === id);
        return stream
          ? [id, stream.source.equipmentId, stream.target.equipmentId]
          : [id];
      }),
    ),
  ];
}

/** Build a disposable viewing document; the editor document/history are untouched. */
export function presentationView(
  document: Document,
  index: number,
): { document: Document; focusIds: string[]; missingIds: string[] } {
  const view = structuredClone(document);
  const steps = document.education.steps ?? [];
  const active = steps[index];
  const scheduled = new Set(
    expandTeachingTargets(
      document,
      steps.flatMap((s) => s.revealIds),
    ),
  );
  const revealed = new Set(
    expandTeachingTargets(
      document,
      steps.slice(0, index + 1).flatMap((s) => s.revealIds),
    ),
  );
  const visible = (id: string) => !scheduled.has(id) || revealed.has(id);
  view.engineering.equipment = view.engineering.equipment.filter((e) =>
    visible(e.id),
  );
  const equipment = new Set(view.engineering.equipment.map((e) => e.id));
  view.engineering.streams = view.engineering.streams.filter(
    (s) =>
      visible(s.id) &&
      equipment.has(s.source.equipmentId) &&
      equipment.has(s.target.equipmentId),
  );
  const specifiedAnnotations = new Set(steps.flatMap((s) => s.annotationIds));
  const revealedAnnotations = new Set(
    steps.slice(0, index + 1).flatMap((s) => s.annotationIds),
  );
  const renderedTargets = new Set(
    [...view.engineering.equipment, ...view.engineering.streams].map(
      (item) => item.id,
    ),
  );
  for (const section of document.engineering.sections)
    if (
      sectionEquipmentIds(document, section.id).some((id) => equipment.has(id))
    )
      renderedTargets.add(section.id);
  const available = new Set(
    [
      ...document.engineering.equipment,
      ...document.engineering.streams,
      ...document.engineering.sections,
    ].map((e) => e.id),
  );
  view.education.annotations = view.education.annotations.filter(
    (a) =>
      a.visible &&
      (a.targetId === null ||
        renderedTargets.has(a.targetId) ||
        !available.has(a.targetId)) &&
      (!specifiedAnnotations.has(a.id) || revealedAnnotations.has(a.id)),
  );
  const annotationIds = new Set(
    document.education.annotations.map((a) => a.id),
  );
  const missingIds = [
    ...(active?.targetIds ?? []),
    ...(active?.revealIds ?? []),
    ...(active?.explorerId ? [active.explorerId] : []),
  ].filter((id) => !available.has(id));
  missingIds.push(
    ...(active?.annotationIds ?? []).filter((id) => !annotationIds.has(id)),
    ...view.education.annotations.flatMap((a) =>
      a.targetId && !available.has(a.targetId) ? [a.targetId] : [],
    ),
  );
  const focusIds = expandTeachingTargets(
    document,
    active?.targetIds ?? [],
  ).filter((id) => available.has(id));
  let styles = {
    ...(view.presentation.metadata.objectStyles as Record<string, unknown>),
  };
  for (const id of focusIds)
    styles = {
      ...styles,
      [id]: {
        ...(Object.hasOwn(styles, id) ? (styles[id] as object) : {}),
        stroke: "#9a5b00",
        lineWidth: 3,
      },
    };
  view.presentation.metadata.objectStyles = styles;
  return { document: view, focusIds, missingIds: [...new Set(missingIds)] };
}
