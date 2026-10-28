import { definitions, type Document } from "./contract";
import {
  renderExchangerSvg,
  exchangerState,
  escapeXml,
} from "./exchanger-geometry";
import { renderColumnSvg, columnState } from "./column-geometry";

export type ExplorerContent = {
  views: string[];
  principle: string;
  components: Record<string, string>;
  references: { title: string; url: string }[];
  valueStatus: string;
};
export type ExplorerDefinition = {
  render: (
    document: Document,
    equipmentId: string,
    transparent?: boolean,
    overlays?: boolean,
  ) => string;
  streams: (
    document: Document,
    equipmentId: string,
  ) => {
    portId: string;
    stream: Document["engineering"]["streams"][number] | undefined;
  }[];
};
/** Executable renderers are trusted application code; imported documents contain data only. */
const implementations = new Map<string, ExplorerDefinition>([
  [
    "heatExchanger",
    {
      render: renderExchangerSvg,
      streams: (document, equipmentId) => {
        const equipment = document.engineering.equipment.find(
          (item) => item.id === equipmentId,
        )!;
        return exchangerState(document, equipment).streams;
      },
    },
  ],
  [
    "column",
    {
      render: renderColumnSvg,
      streams: (document, equipmentId) =>
        columnState(document, equipmentId).streams,
    },
  ],
]);
export function explorerFor(type: string) {
  const definition = definitions.find((item) => item.type === type);
  const renderer = implementations.get(type);
  if (
    !definition?.availableViews.includes("explorer") ||
    !definition.explorer ||
    !renderer
  )
    return null;
  return {
    ...renderer,
    content: definition.explorer as unknown as ExplorerContent,
    name: definition.name,
  };
}
export function renderEquipmentDetail(
  document: Document,
  equipmentId: string,
  transparent = false,
  overlays = true,
) {
  const item = document.engineering.equipment.find(
    (equipment) => equipment.id === equipmentId,
  );
  const explorer = item && explorerFor(item.type);
  if (!explorer)
    throw new Error(
      "Select equipment with a supported detail explorer (heat exchanger or column).",
    );
  const svg = explorer.render(document, equipmentId, transparent, overlays);
  const annotations = (document.education.annotations ?? []).filter(
    (annotation) => annotation.visible && annotation.targetId === equipmentId,
  );
  if (!overlays || !annotations.length) return svg;
  const lines = annotations.flatMap(
    (annotation) =>
      `[${annotation.provenance}] ${annotation.text}`.match(
        /.{1,75}(?:\s|$)|.{1,75}/g,
      ) ?? [],
  );
  const oldWidth = Number(svg.match(/width="([\d.]+)"/)?.[1]),
    oldHeight = Number(svg.match(/height="([\d.]+)"/)?.[1]);
  const width = Math.max(
      oldWidth,
      ...lines.map((line) => Array.from(line).length * 16 + 48),
    ),
    height = oldHeight + 32 + lines.length * 22;
  return svg
    .replace(
      /width="[\d.]+" height="[\d.]+" viewBox="[^"]+"/,
      `width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"`,
    )
    .replace(
      /<\/svg>$/,
      `<g font-family="Arial,sans-serif" fill="#172b3a">${transparent ? "" : `<rect x="0" y="${oldHeight}" width="${width}" height="${height - oldHeight}" fill="#ffffff"/>`}${lines.map((line, index) => `<text x="24" y="${oldHeight + 24 + index * 22}" font-size="12">${escapeXml(line)}</text>`).join("")}</g></svg>`,
    );
}
