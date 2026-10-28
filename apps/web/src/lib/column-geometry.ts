import { equipmentPorts, stageConnections, type Document } from "./contract";
import { escapeXml } from "./exchanger-geometry";
import { diagramTextColor, getDiagramStyle } from "./styles";

export const COLUMN_PROVENANCE =
  "Original PFDkit schematic and explanation (MIT). Reference: ETH Zurich Hyper-TVT, Distillation, sections 2, 5.1–5.6. https://www.hyper-tvt.ethz.ch/distillation-page.html";
type StageCondition = {
  stage: number;
  temperatureK: number | null;
  pressurePa: number | null;
  status: string;
};

export function columnState(document: Document, equipmentId: string) {
  const equipment = document.engineering.equipment.find(
    (item) => item.id === equipmentId && item.type === "column",
  );
  if (!equipment)
    throw new Error("Select a column for equipment detail export.");
  const config = equipment.config;
  const stageCount = Number(config.stageCount ?? 10);
  const stageY = (stage: number) =>
    160 +
    (config.stageNumbering === "bottomUp" ? stageCount + 1 - stage : stage) *
      30;
  return {
    equipment,
    config,
    stageCount,
    stageY,
    bodyHeight: (stageCount + 1) * 30,
    feeds: [
      {
        portId: "feed",
        stage: Number(config.feedStage ?? Math.min(5, stageCount)),
      },
      ...stageConnections(config.feeds),
    ],
    sideDraws: stageConnections(config.sideDraws),
    stageProperties: (Array.isArray(config.stageProperties)
      ? config.stageProperties
      : []) as StageCondition[],
    streams: equipmentPorts("column", config).map((port) => ({
      portId: port.id,
      stream: document.engineering.streams.find((stream) =>
        [stream.source, stream.target].some(
          (endpoint) =>
            endpoint.equipmentId === equipmentId && endpoint.portId === port.id,
        ),
      ),
    })),
  };
}

/** Every stage is drawn at a fixed readable spacing; long columns grow instead of compressing. */
export function renderColumnSvg(
  document: Document,
  equipmentId: string,
  transparent = false,
  overlays = true,
): string {
  const state = columnState(document, equipmentId),
    { config, stageCount, stageY, bodyHeight } = state;
  const style = getDiagramStyle(document),
    ink = diagramTextColor(style.background);
  const title = `${state.equipment.tag || "Column"} — ${config.service ?? "distillation"} detail`;
  const rows = state.streams.map(
    ({ portId, stream }) =>
      `${portId}: ${stream ? `${stream.tag || "Unlabeled stream"} [${stream.id}]` : "Unconnected / unknown"}`,
  );
  rows.unshift(
    ...state.feeds.map(
      (feed, index) =>
        `F${index + 1} = ${feed.portId}; feed at stage ${feed.stage}`,
    ),
    ...state.sideDraws.map(
      (draw, index) =>
        `D${index + 1} = ${draw.portId}; ${draw.phase ?? "liquid"} draw at stage ${draw.stage}`,
    ),
  );
  const conditionLabels = state.stageProperties.map(
    (entry) =>
      `Stage ${entry.stage}: ${entry.temperatureK ?? "unknown"} K; ${entry.pressurePa ?? "unknown"} Pa (${entry.status})`,
  );
  const width = Math.max(
    1350,
    Array.from(title).length * 22 + 48,
    ...[...rows, ...conditionLabels].map((text) =>
      Array.from(text).reduce(
        (sum, letter) => sum + (/[\u0020-\u007e]/.test(letter) ? 16 : 24),
        48,
      ),
    ),
  );
  const bottom = 160 + bodyHeight,
    footer = Math.max(
      bottom + 180,
      230 + Math.max(state.feeds.length, state.sideDraws.length) * 26,
    ),
    height = footer + (rows.length + conditionLabels.length + 6) * 23;
  const text = (x: number, y: number, value: string, size = 13, fill = ink) =>
    `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}">${escapeXml(value)}</text>`;
  const path = (d: string, color: string, extra = "") =>
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="3" ${extra}/>`;
  const vapor = "#9a3412",
    liquid = "#0369a1";
  const content = [
    text(24, 30, title, 18),
    text(
      24,
      55,
      `${stageCount} ${config.stageBasis ?? "theoretical"} ${config.internals === "packing" ? "conceptual packed stages" : "stages"}; numbering ${config.stageNumbering === "bottomUp" ? "bottom up" : "top down"}.`,
    ),
    text(
      24,
      78,
      "Declared stage count excludes condenser and reboiler; no equilibrium or efficiency calculation.",
    ),
    `<rect x="310" y="160" width="220" height="${bodyHeight}" rx="45" fill="#f8fafc" stroke="#334155" stroke-width="2"/>`,
    ...Array.from({ length: stageCount }, (_, index) => {
      const stage = index + 1,
        y = stageY(stage);
      return `<g data-stage="${stage}">${config.internals === "packing" ? path(`M330 ${y - 9}l20 18 20-18 20 18 20-18 20 18 20-18 20 18 20-18`, "#64748b") : path(`M${index % 2 ? 335 : 315} ${y}H${index % 2 ? 525 : 505}`, "#64748b")}${text(268, y + 4, String(stage))}</g>`;
    }),
    path(
      `M470 ${bottom - 20}V180`,
      vapor,
      'data-flow="vapor" stroke-dasharray="8 5" marker-end="url(#col-vapor)"',
    ),
    path(
      `M370 180V${bottom - 20}`,
      liquid,
      'data-flow="liquid" marker-end="url(#col-liquid)"',
    ),
    text(455, 140, "Vapor rises"),
    text(312, bottom + 25, "Liquid descends"),
    ...state.feeds.map((feed, index) => {
      const y = 190 + index * 26;
      return `<g data-feed-port="${escapeXml(feed.portId)}">${path(`M75 ${y}H${160 + index * 7}V${stageY(feed.stage)}H310`, "#334155", 'marker-end="url(#col-feed)"')}${text(24, y + 4, `F${index + 1}`)}</g>`;
    }),
    ...state.sideDraws.map((draw, index) => {
      const y = 210 + index * 26;
      return `<g data-draw-port="${escapeXml(draw.portId)}">${path(`M530 ${stageY(draw.stage)}H${570 + index * 7}V${y}H790`, draw.phase === "vapor" ? vapor : liquid, `marker-end="url(#col-${draw.phase === "vapor" ? "vapor" : "liquid"})"${draw.phase === "vapor" ? ' stroke-dasharray="8 5"' : ""}`)}${text(805, y + 4, `D${index + 1} (${draw.phase ?? "liquid"})`)}</g>`;
    }),
  ];
  const condenser = String(config.condenser ?? "total"),
    reboiler = String(config.reboiler ?? "partial");
  if (condenser !== "none")
    content.push(
      path("M420 160V115H650", vapor, 'marker-end="url(#col-vapor)"'),
      `<circle data-component="condenser" cx="680" cy="115" r="26" fill="#f8fafc" stroke="#334155" stroke-width="2"/>`,
      text(635, 73, `${condenser} condenser`),
      path("M680 141V168H540V185H530", liquid, 'marker-end="url(#col-liquid)"'),
      text(700, 164, "Reflux return"),
      path(
        "M706 115H810",
        condenser === "partial" ? vapor : liquid,
        `marker-end="url(#col-${condenser === "partial" ? "vapor" : "liquid"})"`,
      ),
      text(740, 102, "Overhead product"),
    );
  else
    content.push(
      path("M420 160V115H810", vapor, 'marker-end="url(#col-vapor)"'),
      text(575, 103, "Overhead; external reflux port retained"),
    );
  if (reboiler !== "none") {
    content.push(
      path(`M420 ${bottom}V${bottom + 70}H650`, liquid),
      `<circle data-component="reboiler" cx="680" cy="${bottom + 70}" r="26" fill="#f8fafc" stroke="#334155" stroke-width="2"/>`,
      text(615, bottom + 122, `${reboiler} reboiler`),
      path(
        `M680 ${bottom + 44}V${bottom - 15}H530`,
        vapor,
        'stroke-dasharray="8 5" marker-end="url(#col-vapor)"',
      ),
      text(695, bottom + 2, "Boilup return"),
    );
    if (reboiler === "total")
      content.push(
        path(
          `M560 ${bottom + 70}V${bottom + 140}H810`,
          liquid,
          'marker-end="url(#col-liquid)"',
        ),
        text(830, bottom + 145, "Liquid bottoms withdrawn upstream"),
      );
    else
      content.push(
        path(
          `M706 ${bottom + 70}H810`,
          liquid,
          'marker-end="url(#col-liquid)"',
        ),
        text(730, bottom + 55, "Bottoms product"),
      );
  } else
    content.push(
      path(
        `M420 ${bottom}V${bottom + 70}H810`,
        liquid,
        'marker-end="url(#col-liquid)"',
      ),
      text(540, bottom + 105, "Bottoms; external boilup port retained"),
    );
  content.push(
    text(
      24,
      footer,
      `Entered reflux ratio: ${config.refluxRatio ?? "unknown"}; boilup ratio: ${config.boilupRatio ?? "unknown"}. No mass/energy balance.`,
    ),
    ...rows.map((row, index) => text(24, footer + 24 + index * 23, row)),
    ...conditionLabels.map((row, index) =>
      text(24, footer + 24 + (rows.length + index) * 23, row),
    ),
  );
  if (overlays)
    content.push(
      text(
        24,
        height - 68,
        "Blue: liquid; rust: vapor. Dashed internal vapor paths distinguish phase in grayscale. F/D labels map to stable port IDs below.",
      ),
      text(
        24,
        height - 45,
        "Loops are conceptual arrangements; external logical reflux/boilup ports remain available. No additional equilibrium stages are inferred.",
      ),
    );
  content.push(
    text(
      24,
      height - 20,
      "Original PFDkit schematic (MIT) · ETH Zurich Hyper-TVT distillation principles",
      11,
    ),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}"><title>${escapeXml(title)}</title><desc>${escapeXml(COLUMN_PROVENANCE)}</desc>${transparent ? "" : `<rect width="${width}" height="${height}" fill="${style.background}"/>`}<defs>${[
    ["vapor", vapor],
    ["liquid", liquid],
    ["feed", "#334155"],
  ]
    .map(
      ([name, fill]) =>
        `<marker id="col-${name}" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L6 3L0 6Z" fill="${fill}"/></marker>`,
    )
    .join(
      "",
    )}</defs><g font-family="${escapeXml(style.fontFamily)},sans-serif">${content.join("")}</g></svg>`;
}
