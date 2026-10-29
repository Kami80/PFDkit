import type { Document } from "./contract";

export type DiagramStyle = {
  version: 1;
  symbolSet: "legacy" | "precision" | "teaching";
  preset:
    | "engineeringClassic"
    | "academicColorful"
    | "minimalScientific"
    | "presentation";
  background: string;
  fontFamily: "Arial" | "Georgia" | "Courier New";
  fontSize: number;
  lineWidth: number;
  showTitle: boolean;
  showLegend: boolean;
  colorblind: boolean;
};
export type ObjectStyle = {
  stroke: string;
  fill: string;
  textColor: string;
  lineWidth: number;
  fontSize: number;
  labelVisible: boolean;
};
export const DEFAULT_STYLE: DiagramStyle = {
  version: 1,
  symbolSet: "legacy",
  preset: "engineeringClassic",
  background: "#ffffff",
  fontFamily: "Arial",
  fontSize: 12,
  lineWidth: 1.8,
  showTitle: true,
  showLegend: true,
  colorblind: true,
};
const hex = (value: unknown, fallback: string): string =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
const bounded = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function getDiagramStyle(document: Document): DiagramStyle {
  const raw = record(document.presentation.metadata.style);
  return {
    version: 1,
    symbolSet:
      raw.symbolSet === "precision" || raw.symbolSet === "teaching"
        ? raw.symbolSet
        : "legacy",
    preset: ["academicColorful", "minimalScientific", "presentation"].includes(
      String(raw.preset),
    )
      ? (raw.preset as DiagramStyle["preset"])
      : "engineeringClassic",
    background: hex(raw.background, DEFAULT_STYLE.background),
    fontFamily:
      raw.fontFamily === "Georgia" || raw.fontFamily === "Courier New"
        ? raw.fontFamily
        : "Arial",
    fontSize: bounded(
      raw.fontSize,
      raw.preset === "presentation"
        ? 18
        : raw.preset === "minimalScientific"
          ? 11
          : 12,
      8,
      32,
    ),
    lineWidth: bounded(
      raw.lineWidth,
      raw.preset === "presentation"
        ? 2.5
        : raw.preset === "minimalScientific"
          ? 1.2
          : 1.8,
      0.5,
      8,
    ),
    showTitle: raw.showTitle !== false,
    showLegend: raw.showLegend !== false,
    colorblind: raw.colorblind !== false,
  };
}

export function resolveObjectStyle(
  document: Document,
  id: string,
  typeOrKind: string,
): ObjectStyle & { fontFamily: string; dasharray?: string } {
  const diagram = getDiagramStyle(document);
  const colorful =
    diagram.preset === "academicColorful" || diagram.preset === "presentation";
  const darkSymbolCanvas =
    diagram.symbolSet !== "legacy" &&
    diagramTextColor(diagram.background) === "#f1f5f9";
  const palette: Record<string, string> = {
    feed: "#0369a1",
    product: "#0369a1",
    pump: "#7c3aed",
    heatExchanger: "#b45309",
    separator: "#047857",
    tank: "#0e7490",
    mixer: "#7c3aed",
    splitter: "#7c3aed",
    column: "#047857",
    reactor: "#b91c1c",
    material: "#0369a1",
    energy: "#b45309",
  };
  const base = darkSymbolCanvas
    ? "#f1f5f9"
    : colorful
      ? palette[typeOrKind] || "#334155"
      : diagram.preset === "minimalScientific"
        ? "#111111"
        : "#263746";
  const accessible: Record<string, string> = {
    feed: "#0369a1",
    product: "#0369a1",
    pump: "#6d28d9",
    heatExchanger: "#9a3412",
    separator: "#0e7490",
    tank: "#0369a1",
    mixer: "#6d28d9",
    splitter: "#6d28d9",
    column: "#0e7490",
    reactor: "#9a3412",
    material: "#0369a1",
    energy: "#9a3412",
  };
  const overrides = record(
    record(document.presentation.metadata.objectStyles)[id],
  );
  return {
    stroke: hex(
      overrides.stroke,
      colorful && diagram.colorblind && !darkSymbolCanvas
        ? accessible[typeOrKind] || base
        : base,
    ),
    fill: hex(
      overrides.fill,
      darkSymbolCanvas ? "#101a2d" : colorful ? "#f1f5f9" : "#ffffff",
    ),
    textColor: hex(overrides.textColor, diagramTextColor(diagram.background)),
    lineWidth: bounded(overrides.lineWidth, diagram.lineWidth, 0.5, 8),
    fontSize: bounded(overrides.fontSize, diagram.fontSize, 8, 32),
    labelVisible: overrides.labelVisible !== false,
    fontFamily: diagram.fontFamily,
    dasharray: typeOrKind === "energy" ? "7 4" : undefined,
  };
}

export function diagramTextColor(background: string): string {
  const channels = [1, 3, 5]
    .map((offset) => parseInt(background.slice(offset, offset + 2), 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  const luminance =
    channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  const dark = (luminance + 0.05) / 0.072,
    light = 0.958 / (luminance + 0.05);
  if (Math.max(dark, light) >= 4.5)
    return dark >= light ? "#172b3a" : "#f1f5f9";
  return luminance > 0.179 ? "#000000" : "#ffffff";
}

export function symbolAccent(style: DiagramStyle, stroke = "#263746"): string {
  if (style.preset === "minimalScientific") return stroke;
  return diagramTextColor(style.background) === "#f1f5f9"
    ? "#74dbe4"
    : "#006b80";
}

export function stylePatch(
  document: Document,
  patch: Partial<DiagramStyle>,
): Document["presentation"] {
  return {
    ...document.presentation,
    metadata: {
      ...document.presentation.metadata,
      style: {
        ...record(document.presentation.metadata.style),
        ...getDiagramStyle(document),
        ...patch,
      },
    },
  };
}
