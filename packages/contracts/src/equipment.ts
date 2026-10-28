import registry from "../../../contracts/generated/registry.json";

export type ConfigRecord = Record<string, unknown>;
export type EquipmentPort = {
  id: string;
  name: string;
  direction: string;
  side: string;
  kind: string;
  maxConnections: number;
  required: boolean;
  circuit: string | null;
  offset: number;
};
export type StageConnection = {
  portId: string;
  stage: number;
  phase?: "liquid" | "vapor";
};
export function stageConnections(value: unknown): StageConnection[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is StageConnection =>
          !!item &&
          typeof item === "object" &&
          typeof item.portId === "string" &&
          typeof item.stage === "number",
      )
    : [];
}

/** A column's 80-unit PFD side accommodates 14 handles, including reflux/boilup.
 * Keep centers at least 6 units apart, beyond the radius of an 11px hovered handle.
 * Stage numbers remain engineering data; these offsets are schematic fan-out.
 * Keep this deterministic projection in sync with registry._space_column_ports.
 */
function spaceColumnPorts(ports: EquipmentPort[]): void {
  const gap = 6 / 80,
    lower = 1 / 80,
    upper = 79 / 80;
  for (const side of ["left", "right"]) {
    const ordered = ports
      .filter((port) => port.side === side)
      .sort((a, b) =>
        a.offset !== b.offset
          ? a.offset - b.offset
          : a.id < b.id
            ? -1
            : a.id > b.id
              ? 1
              : 0,
      );
    for (let index = 0; index < ordered.length; index++) {
      ordered[index].offset = Math.max(
        ordered[index].offset,
        index ? ordered[index - 1].offset + gap : lower,
      );
    }
    for (let index = ordered.length - 1; index >= 0; index--) {
      ordered[index].offset = Math.min(
        ordered[index].offset,
        index === ordered.length - 1 ? upper : ordered[index + 1].offset - gap,
      );
    }
  }
}

/** The same stable logical ports serve handles, validation, connections and exports. */
export function equipmentPorts(
  type: string,
  config: ConfigRecord = {},
): EquipmentPort[] {
  const ports: EquipmentPort[] = structuredClone(
    registry.find((item) => item.type === type)?.ports ?? [],
  );
  if (type === "column") {
    const count = Number(config.stageCount ?? 10);
    const physicalStage = (stage: number) =>
      config.stageNumbering === "bottomUp" ? count + 1 - stage : stage;
    ports.find((port) => port.id === "feed")!.offset =
      physicalStage(Number(config.feedStage ?? Math.min(5, count))) /
      (count + 1);
    for (const [key, direction, side] of [
      ["feeds", "in", "left"],
      ["sideDraws", "out", "right"],
    ] as const) {
      for (const item of stageConnections(config[key])) {
        const physical = physicalStage(item.stage);
        ports.push({
          id: item.portId,
          name: `${key === "feeds" ? "Feed" : "Side draw"} at stage ${item.stage}`,
          direction,
          side,
          kind: "material",
          maxConnections: 1,
          required: false,
          circuit: null,
          offset: physical / (count + 1),
        });
      }
    }
    spaceColumnPorts(ports);
  }
  return ports;
}

/** Cross-field invariants that JSON Schema alone cannot express. */
export function configurationErrors(
  type: string,
  config: ConfigRecord,
): string[] {
  const errors: string[] = [];
  if (type === "heatExchanger") {
    const tubes = Number(config.tubePasses ?? 1),
      shells = Number(config.shellPasses ?? 1);
    if (config.flowArrangement === "crossFlow" && (tubes !== 1 || shells !== 1))
      errors.push(
        "Cross-flow teaching geometry requires one tube and one shell pass; choose an axial arrangement for multiple passes.",
      );
    if (shells > tubes)
      errors.push("Supported shell passes cannot exceed tube passes.");
  }
  if (type === "column") {
    const count = Number(config.stageCount ?? 10);
    const feeds = stageConnections(config.feeds),
      draws = stageConnections(config.sideDraws);
    const properties = Array.isArray(config.stageProperties)
      ? (config.stageProperties as { stage: number }[])
      : [];
    if (
      Number(config.feedStage ?? Math.min(5, count)) > count ||
      [...feeds, ...draws, ...properties].some((item) => item.stage > count)
    )
      errors.push(
        "A feed, side draw or operating condition references a removed stage. Move or remove it before reducing stage count.",
      );
    const ids = [...feeds, ...draws].map((item) => item.portId);
    if (
      new Set(ids).size !== ids.length ||
      ids.some((id) =>
        ["feed", "overhead", "bottoms", "reflux", "boilup"].includes(id),
      )
    )
      errors.push(
        "Additional feed and side-draw port identities must be unique and cannot replace fixed column ports.",
      );
    if (
      new Set(properties.map((item) => item.stage)).size !== properties.length
    )
      errors.push("Only one operating condition record is allowed per stage.");
  }
  return errors;
}
