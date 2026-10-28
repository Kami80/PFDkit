import { units, type Document, type Equipment } from "./contract";
import type { Quantity } from "./contract";
import { diagramTextColor, getDiagramStyle } from "./styles";

export function convertOperatingQuantity(
  quantity: Quantity,
  targetUnit: string,
): Quantity {
  const source = units[quantity.unit as keyof typeof units],
    target = units[targetUnit as keyof typeof units];
  if (
    !source ||
    !target ||
    source.dimension !== quantity.dimension ||
    target.dimension !== quantity.dimension
  )
    throw new Error("Choose a supported unit for this measurement dimension.");
  const value =
    quantity.value === null
      ? null
      : (quantity.value * source.scale + source.offset - target.offset) /
        target.scale;
  if (
    value !== null &&
    (!Number.isFinite(value) ||
      (Number.isInteger(value) && !Number.isSafeInteger(value)))
  )
    throw new Error(
      "The converted value exceeds the portable numeric range. Choose another supported unit or leave the value unknown.",
    );
  return {
    ...quantity,
    unit: targetUnit,
    value,
  };
}

export const escapeXml = (value: unknown): string =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!,
  );
export const EXCHANGER_PROVENANCE =
  "Original PFDkit schematic and explanation (MIT). Reference: DOE Fundamentals Handbook, Thermodynamics, Heat Transfer, and Fluid Flow, DOE-HDBK-1012/2-92, Heat Exchangers, pp. 31–33. https://www.energy.gov/documents/doe-hdbk-1012-92vol2";
export function exchangerStreams(document: Document, equipmentId: string) {
  return ["tubeIn", "tubeOut", "shellIn", "shellOut"].map((portId) => ({
    portId,
    stream: document.engineering.streams.find(
      (stream) =>
        (stream.source.equipmentId === equipmentId &&
          stream.source.portId === portId) ||
        (stream.target.equipmentId === equipmentId &&
          stream.target.portId === portId),
    ),
  }));
}
export function exchangerState(document: Document, equipment: Equipment) {
  const tubePasses = Number(equipment.config.tubePasses ?? 1),
    shellPasses = Number(equipment.config.shellPasses ?? 1);
  const arrangement = String(
    equipment.config.flowArrangement ?? "counterCurrent",
  );
  const supported =
    shellPasses <= 2 &&
    tubePasses <= 8 &&
    shellPasses <= tubePasses &&
    (arrangement !== "crossFlow" || (tubePasses === 1 && shellPasses === 1));
  const streams = exchangerStreams(document, equipment.id);
  const temperature = (port: string) => {
    const quantity = streams.find((item) => item.portId === port)?.stream
      ?.temperature;
    if (!quantity || quantity.value === null) return null;
    const unit = units[quantity.unit as keyof typeof units];
    return unit?.dimension === "temperature"
      ? quantity.value * unit.scale + unit.offset
      : null;
  };
  const tube = temperature("tubeIn"),
    shell = temperature("shellIn");
  const role =
    tube === null || shell === null
      ? "Hot/cold roles unknown: enter both inlet temperatures to compare."
      : tube === shell
        ? "Entered inlet temperatures are equal; no hot/cold distinction inferred."
        : `Relative to the entered inlet temperatures: ${tube > shell ? "tube" : "shell"} circuit is hotter. No outlet temperatures are calculated.`;
  return { tubePasses, shellPasses, arrangement, supported, streams, role };
}

export type CircuitSegment = {
  from: { x: number; y: number };
  to: { x: number; y: number };
};
export function exchangerRouting(
  tubePasses: number,
  arrangement: string,
  shellPasses = 1,
  baffleCount = 0,
) {
  const tubeSegments: CircuitSegment[] =
    tubePasses === 2
      ? [
          { from: { x: 180, y: 170 }, to: { x: 580, y: 170 } },
          { from: { x: 580, y: 250 }, to: { x: 180, y: 250 } },
        ]
      : tubePasses === 1
        ? [{ from: { x: 180, y: 210 }, to: { x: 580, y: 210 } }]
        : Array.from({ length: tubePasses }, (_, index) => ({
            from: {
              x: index % 2 ? 580 : 180,
              y: 140 + (index * 140) / (tubePasses - 1),
            },
            to: {
              x: index % 2 ? 180 : 580,
              y: 140 + (index * 140) / (tubePasses - 1),
            },
          }));
  const shellX =
    arrangement === "coCurrent"
      ? 190
      : arrangement === "counterCurrent"
        ? 575
        : 380;
  const shellOutX =
    arrangement === "coCurrent"
      ? 575
      : arrangement === "counterCurrent"
        ? 190
        : 380;
  const firstY = tubeSegments[0].from.y,
    lastY = tubeSegments.at(-1)!.to.y;
  const tubePath =
    tubePasses <= 2
      ? tubePasses === 2
        ? "M60 170H625V250H60"
        : "M60 210H700"
      : `M60 ${firstY}H${tubeSegments[0].to.x}` +
        tubeSegments
          .slice(1)
          .map((segment) => `V${segment.from.y}H${segment.to.x}`)
          .join("") +
        `H${tubePasses % 2 ? 700 : 60}`;
  const shellSegments =
    shellPasses === 2
      ? [
          { from: { x: shellX, y: 155 }, to: { x: shellOutX, y: 155 } },
          { from: { x: shellOutX, y: 285 }, to: { x: shellX, y: 285 } },
        ]
      : [
          arrangement === "crossFlow"
            ? { from: { x: 380, y: 125 }, to: { x: 380, y: 310 } }
            : { from: { x: shellX, y: 150 }, to: { x: shellOutX, y: 150 } },
        ];
  let shellPath =
    arrangement === "crossFlow"
      ? "M380 65V365"
      : "M" + shellX + " 65V150H" + shellOutX + "V365";
  if (shellPasses === 2)
    shellPath = `M${shellX} 65V155H${shellOutX}V285H${shellX}V365`;
  else if (baffleCount && arrangement !== "crossFlow") {
    const sign = shellOutX > shellX ? 1 : -1;
    shellPath =
      `M${shellX} 65V145` +
      Array.from(
        { length: baffleCount },
        (_, i) =>
          `L${shellX + (sign * (i + 1) * Math.abs(shellOutX - shellX)) / (baffleCount + 1)} ${i % 2 ? 145 : 285}`,
      ).join("") +
      `L${shellOutX} 285V365`;
  }
  return {
    tubePath,
    shellPath: shellPath,
    tubeSegments,
    shellSegments,
    tubeIn: { x: 60, y: firstY },
    tubeOut: {
      x: tubePasses % 2 === 0 ? 60 : 700,
      y: lastY,
    },
    shellIn: { x: shellX, y: 65 },
    shellOut: { x: shellPasses % 2 === 0 ? shellX : shellOutX, y: 365 },
  };
}

/** Original schematic: separate circuits, physical nozzle mapping and explicit unsupported pass counts. */
export function renderExchangerSvg(
  document: Document,
  equipmentId: string,
  transparent = false,
  overlays = true,
): string {
  const equipment = document.engineering.equipment.find(
    (item) => item.id === equipmentId && item.type === "heatExchanger",
  );
  if (!equipment)
    throw new Error("Select a heat exchanger for equipment detail export.");
  const state = exchangerState(document, equipment),
    style = getDiagramStyle(document),
    routing = exchangerRouting(
      state.tubePasses,
      state.arrangement,
      state.shellPasses,
      Number(equipment.config.baffleCount ?? 0),
    );
  const tube = "#0369a1",
    shell = "#9a3412",
    textColor = diagramTextColor(style.background);
  const title =
    (equipment.tag || "Heat exchanger") + " — shell and tube detail";
  const refs = state.streams.map(
    ({ portId, stream }) =>
      portId +
      ": " +
      (stream
        ? (stream.tag || "Unlabeled stream") + " [" + stream.id + "]"
        : "Unconnected / unknown"),
  );
  const detailWidth = Math.max(
    800,
    ...[title, ...refs].map((text) =>
      Array.from(text).reduce(
        (sum, character) => sum + (/[\u0020-\u007e]/.test(character) ? 20 : 30),
        48,
      ),
    ),
  );
  const label = (
    x: number,
    y: number,
    text: string,
    size = 13,
    fill = textColor,
  ) =>
    '<text x="' +
    x +
    '" y="' +
    y +
    '" font-size="' +
    size +
    '" fill="' +
    fill +
    '">' +
    escapeXml(text) +
    "</text>";
  const arrow = (color: string, id: string) =>
    '<marker id="' +
    id +
    '" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L6 3L0 6Z" fill="' +
    color +
    '"/></marker>';
  const segments = (items: CircuitSegment[], circuit: string, color: string) =>
    items
      .map(
        (item, index) =>
          '<path data-circuit="' +
          circuit +
          '" data-pass="' +
          (index + 1) +
          '" d="M' +
          item.from.x +
          " " +
          item.from.y +
          "L" +
          item.to.x +
          " " +
          item.to.y +
          '" fill="none" stroke="' +
          color +
          '" stroke-width="3" marker-end="url(#hx-' +
          circuit +
          '-arrow)"/>',
      )
      .join("");
  const wrap = (text: string) =>
    text.match(/.{1,85}(?:\s|$)|.{1,85}/g) || [text];
  const notes = [
    state.tubePasses === 2
      ? "Two tube passes reverse locally in the right header. Logical tubeOut maps to the LEFT physical nozzle in this detail; the PFD symbol keeps its stable logical port."
      : state.arrangement === "counterCurrent"
        ? "Single-pass tube and shell axial directions oppose each other."
        : state.arrangement === "coCurrent"
          ? "Single-pass tube and shell axial directions are the same."
          : "Cross-flow circuits cross in projection; the fluids remain physically separated.",
    state.tubePasses > 1
      ? "A multi-pass unit is not purely countercurrent along every tube segment."
      : "",
    state.role,
    "Circuit colors identify tube and shell, not an assumed hot/cold role. Values are manually entered; no thermal calculation is performed.",
  ]
    .filter(Boolean)
    .flatMap(wrap);
  const height = 520 + notes.length * 19;
  const body = [
    label(24, 30, title, 16),
    label(
      24,
      53,
      "Saved configuration: " +
        state.arrangement +
        "; " +
        state.tubePasses +
        " tube pass(es), " +
        state.shellPasses +
        " shell pass(es).",
    ),
    '<rect x="105" y="110" width="550" height="220" rx="60" fill="#f8fafc" stroke="#334155" stroke-width="2"/>',
    '<path d="M155 115V325M605 115V325" stroke="#64748b" stroke-width="3" fill="none"/>',
    state.tubePasses === 2
      ? '<path data-header-partition="left" d="M105 210H155" stroke="#64748b" stroke-width="3" fill="none"><title>Header partition separates tube inlet and outlet chambers.</title></path>'
      : "",
    state.supported
      ? '<path data-circuit-path="tube" d="' +
        routing.tubePath +
        '" fill="none" stroke="' +
        tube +
        '" stroke-width="5" marker-end="url(#hx-tube-arrow)"/><path data-circuit-path="shell" d="' +
        routing.shellPath +
        '" fill="none" stroke="' +
        shell +
        '" stroke-width="4" stroke-dasharray="9 5" marker-end="url(#hx-shell-arrow)"/>' +
        segments(routing.tubeSegments, "tube", tube) +
        segments(routing.shellSegments, "shell", shell)
      : label(
          180,
          205,
          "Detailed routing unavailable for this pass count.",
          13,
          "#172b3a",
        ) +
        label(
          180,
          230,
          "Saved configuration retained: use 1–8 tube / 1–2 shell for this schematic.",
          12,
          "#172b3a",
        ),
    label(22, routing.tubeIn.y - 20, "tubeIn →"),
    label(
      state.tubePasses % 2 === 0 ? 22 : 660,
      routing.tubeOut.y + 30,
      state.tubePasses % 2 === 0 ? "← tubeOut" : "tubeOut →",
      13,
      textColor,
    ),
    label(routing.shellIn.x + 12, 82, "shellIn ↓"),
    label(routing.shellOut.x + 12, 369, "shellOut ↓"),
    label(230, 300, "Shell housing", 13, "#172b3a"),
    label(130, 104, "Tube sheet"),
    label(270, 234, "Tube bundle (solid)", 13, "#172b3a"),
    label(280, 130, "Shell circuit (dashed)", 13, "#172b3a"),
    ...Array.from(
      { length: Number(equipment.config.baffleCount ?? 0) },
      (_, index) =>
        `<path data-baffle="${index + 1}" d="M${200 + (index * 360) / Math.max(1, Number(equipment.config.baffleCount) - 1)} ${index % 2 ? 175 : 115}V${index % 2 ? 325 : 265}" stroke="#64748b" stroke-width="3" fill="none"><title>Segmental baffle ${index + 1}</title></path>`,
    ),
    state.shellPasses === 2
      ? '<path data-shell-partition="true" d="M155 220H605" stroke="#475569" stroke-width="3" fill="none"><title>Longitudinal shell partition; conceptual two-shell-pass routing.</title></path>'
      : "",
    overlays
      ? label(
          24,
          390,
          `Baffles: ${equipment.config.baffleCount ?? 0}; tube length: ${equipment.config.tubeLengthM ?? "unknown"} m; shell diameter: ${equipment.config.shellDiameterM ?? "unknown"} m. Geometry is schematic.`,
        )
      : "",
    ...refs.map((text, index) => label(24, 415 + index * 24, text)),
    ...notes.map((text, index) => label(24, 520 + index * 19, text, 12)),
    label(
      24,
      height - 8,
      "Original PFDkit schematic (MIT) · DOE-HDBK-1012/2-92 heat exchanger principles",
      11,
    ),
  ].join("");
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
    detailWidth +
    '" height="' +
    height +
    '" viewBox="0 0 ' +
    detailWidth +
    " " +
    height +
    '" role="img" aria-label="' +
    escapeXml(title) +
    '"><title>' +
    escapeXml(title) +
    "</title><desc>" +
    escapeXml(EXCHANGER_PROVENANCE) +
    "</desc>" +
    (transparent
      ? ""
      : '<rect width="' +
        detailWidth +
        '" height="' +
        height +
        '" fill="' +
        style.background +
        '"/>') +
    "<defs>" +
    arrow(tube, "hx-tube-arrow") +
    arrow(shell, "hx-shell-arrow") +
    '</defs><g font-family="' +
    escapeXml(style.fontFamily) +
    ',sans-serif">' +
    body +
    "</g></svg>"
  );
}
