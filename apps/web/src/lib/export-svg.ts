import { getSmoothStepPath, Position } from "@xyflow/react";
import {
  serializeDocument,
  type Document,
  type Equipment,
  equipmentPorts,
} from "./contract";
import {
  getPortPosition,
  getSymbol,
  NODE_WIDTH,
  NODE_HEIGHT,
  SYMBOL_OFFSET_X,
  SYMBOL_OFFSET_Y,
} from "./symbols";
import {
  diagramTextColor,
  getDiagramStyle,
  resolveObjectStyle,
} from "./styles";
import { escapeXml } from "./exchanger-geometry";
import { renderEquipmentDetail } from "./explorers";
import { sectionEquipmentIds } from "./hierarchy";

export type ExportOptions = {
  target?: "full" | "selection" | "equipment" | "section";
  sectionId?: string;
  includeAnnotations?: boolean;
  selectionIds?: string[];
  equipmentId?: string;
  transparent?: boolean;
  padding?: number;
  background?: string;
};
export type SvgExport = {
  svg: string;
  width: number;
  height: number;
  bounds: { x: number; y: number; width: number; height: number };
};
type Rect = { x: number; y: number; width: number; height: number };
function attribution(
  document: Document,
): { credit: string; metadata: string } | null {
  const value = document.metadata.attribution;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const text = (key: string) =>
    typeof data[key] === "string" || typeof data[key] === "number"
      ? String(data[key])
      : "";
  return {
    credit: [
      text("creator"),
      text("license"),
      text("publicationId") &&
        `Publication ${text("publicationId")} · revision ${text("revision")}`,
      text("source"),
    ]
      .filter(Boolean)
      .join(" · "),
    metadata: JSON.stringify(value),
  };
}
const position = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
};
const color = (value: unknown, fallback: string) =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;

// Conservative em width covers common serif/mono fallbacks, including wide Unicode.
export function textWidth(text: string, size: number): number {
  return Array.from(text).reduce(
    (width, letter) =>
      width + (/[\u0020-\u007e]/.test(letter) ? 1.2 : 1.8) * size,
    0,
  );
}
function union(rectangles: Rect[]): Rect {
  if (!rectangles.length) return { x: 0, y: 0, width: 400, height: 220 };
  const x = Math.min(...rectangles.map((rect) => rect.x)),
    y = Math.min(...rectangles.map((rect) => rect.y));
  return {
    x,
    y,
    width: Math.max(...rectangles.map((rect) => rect.x + rect.width)) - x,
    height: Math.max(...rectangles.map((rect) => rect.y + rect.height)) - y,
  };
}

export function diagramSvg(
  document: Document,
  options: ExportOptions = {},
): SvgExport {
  if (options.target === "section") {
    if (
      !document.engineering.sections.some(
        (section) => section.id === options.sectionId,
      )
    )
      throw new Error("Choose an existing process section for export.");
    options = {
      ...options,
      target: "selection",
      selectionIds: sectionEquipmentIds(document, options.sectionId!),
    };
  }
  document = {
    ...document,
    presentation: {
      ...document.presentation,
      metadata: {
        ...document.presentation.metadata,
        style: {
          ...getDiagramStyle(document),
          background: color(
            options.background,
            getDiagramStyle(document).background,
          ),
        },
      },
    },
  };
  if (options.target === "equipment") {
    let svg = renderEquipmentDetail(
      document,
      options.equipmentId || "",
      options.transparent,
      options.includeAnnotations !== false,
    );
    const credit = attribution(document);
    if (credit)
      svg = svg.replace(
        "</svg>",
        `<desc>${escapeXml(credit.credit)}</desc><metadata>${escapeXml(credit.metadata)}</metadata></svg>`,
      );
    const width = Number(svg.match(/width="([\d.]+)"/)?.[1] || 760);
    const height = Number(svg.match(/height="([\d.]+)"/)?.[1] || 520);
    return {
      svg,
      width,
      height,
      bounds: { x: 0, y: 0, width, height },
    };
  }
  const style = getDiagramStyle(document),
    selected = new Set(
      (options.selectionIds || []).flatMap((id) =>
        document.engineering.sections.some((section) => section.id === id)
          ? [id, ...sectionEquipmentIds(document, id)]
          : [id],
      ),
    );
  if (options.target === "selection" && !selected.size)
    throw new Error(
      "Select equipment or streams before exporting selected content.",
    );
  const selectedStreams = document.engineering.streams.filter(
    (stream) =>
      options.target !== "selection" ||
      selected.has(stream.id) ||
      (selected.has(stream.source.equipmentId) &&
        selected.has(stream.target.equipmentId)),
  );
  // A selected stream includes endpoint symbols so it remains understandable independently.
  if (options.target === "selection")
    selectedStreams.forEach((stream) => {
      selected.add(stream.source.equipmentId);
      selected.add(stream.target.equipmentId);
    });
  const equipment = document.engineering.equipment.filter(
    (item) => options.target !== "selection" || selected.has(item.id),
  );
  const objects = new Map(
    document.engineering.equipment.map((item) => [item.id, item]),
  );
  const markerDefinitions: string[] = [];
  const rectangles: Rect[] = [],
    paths: string[] = [],
    nodes: string[] = [];
  const origin = (item: Equipment) =>
    Object.hasOwn(document.presentation.nodes, item.id)
      ? document.presentation.nodes[item.id]
      : { x: 0, y: 0 };
  for (const stream of selectedStreams) {
    const source = objects.get(stream.source.equipmentId),
      target = objects.get(stream.target.equipmentId);
    if (!source || !target) continue;
    const start = getPortPosition(
        source.type,
        stream.source.portId,
        source.config,
      ),
      end = getPortPosition(target.type, stream.target.portId, target.config);
    const sourcePort = equipmentPorts(source.type, source.config).find(
        (port) => port.id === stream.source.portId,
      ),
      targetPort = equipmentPorts(target.type, target.config).find(
        (port) => port.id === stream.target.portId,
      );
    const sx = origin(source).x + start.x,
      sy = origin(source).y + start.y,
      tx = origin(target).x + end.x,
      ty = origin(target).y + end.y;
    const [path, labelX, labelY] = getSmoothStepPath({
      sourceX: sx,
      sourceY: sy,
      targetX: tx,
      targetY: ty,
      sourcePosition:
        position[sourcePort?.side as keyof typeof position] || Position.Right,
      targetPosition:
        position[targetPort?.side as keyof typeof position] || Position.Left,
      borderRadius: 0,
      offset: 24,
    });
    const paint = resolveObjectStyle(document, stream.id, stream.kind),
      label = paint.labelVisible ? stream.tag : "";
    const marker = `stream-${markerDefinitions.length}`;
    markerDefinitions.push(
      `<marker id="arrow-${marker}" markerWidth="9" markerHeight="9" refX="7" refY="3.5" orient="auto" markerUnits="strokeWidth"><path d="M0 0L7 3.5L0 7Z" fill="${paint.stroke}"/></marker>`,
    );
    // XYFlow orthogonal detours are bounded by endpoints plus node clearance.
    rectangles.push({
      x: Math.min(sx, tx) - 80,
      y: Math.min(sy, ty) - 80,
      width: Math.abs(tx - sx) + 160,
      height: Math.abs(ty - sy) + 160,
    });
    if (label)
      rectangles.push({
        x: labelX - textWidth(label, paint.fontSize) / 2 - 8,
        y: labelY - paint.fontSize - 8,
        width: textWidth(label, paint.fontSize) + 16,
        height: paint.fontSize * 2 + 16,
      });
    paths.push(
      `<g><title>${escapeXml(`${stream.tag || stream.id}: ${stream.source.equipmentId}/${stream.source.portId} to ${stream.target.equipmentId}/${stream.target.portId}`)}</title><path d="${escapeXml(path)}" fill="none" stroke="${paint.stroke}" stroke-width="${paint.lineWidth}"${paint.dasharray ? ` stroke-dasharray="${paint.dasharray}"` : ""} marker-end="url(#arrow-${marker})"/>${label ? `<text x="${labelX}" y="${labelY - 7}" text-anchor="middle" fill="${paint.textColor}" font-size="${paint.fontSize}" font-family="${escapeXml(paint.fontFamily)}" stroke="${color(options.background, style.background)}" stroke-width="4" paint-order="stroke">${escapeXml(label)}</text>` : ""}</g>`,
    );
  }
  for (const item of equipment) {
    const { x, y } = origin(item),
      symbol = getSymbol(item.type, item.config),
      paint = resolveObjectStyle(document, item.id, item.type);
    const labelWidth = textWidth(item.tag, paint.fontSize);
    rectangles.push({
      x: x - Math.max(0, (labelWidth - NODE_WIDTH) / 2) - paint.lineWidth,
      y: y - paint.fontSize,
      width: Math.max(NODE_WIDTH, labelWidth) + paint.lineWidth * 2,
      height: NODE_HEIGHT + paint.fontSize * 2,
    });
    const shapes = symbol.shapes
      .map(
        (shape) =>
          `<${shape.tag} ${Object.entries(shape.attrs)
            .map(([key, value]) => `${key}="${escapeXml(value)}"`)
            .join(
              " ",
            )} fill="${shape.fill === "body" ? paint.fill : "none"}" stroke="${shape.stroke ? paint.stroke : "none"}" stroke-width="${paint.lineWidth}" stroke-linecap="round" stroke-linejoin="round"/>`,
      )
      .join("");
    nodes.push(
      `<g transform="translate(${x} ${y})"><title>${escapeXml(`${item.tag || item.id} (${item.type})`)}</title><g transform="translate(${SYMBOL_OFFSET_X} ${SYMBOL_OFFSET_Y})">${shapes}</g>${paint.labelVisible ? `<text x="${NODE_WIDTH / 2}" y="${NODE_HEIGHT - 12}" text-anchor="middle" font-family="${escapeXml(paint.fontFamily)}" font-size="${paint.fontSize}" fill="${paint.textColor}">${escapeXml(item.tag)}</text>` : ""}</g>`,
    );
  }
  if (options.includeAnnotations !== false) {
    const contentBounds = union(rectangles);
    const visibleIds = new Set([
      ...equipment.map((item) => item.id),
      ...selectedStreams.map((item) => item.id),
    ]);
    for (const section of document.engineering.sections ?? [])
      if (
        sectionEquipmentIds(document, section.id).some((id) =>
          visibleIds.has(id),
        )
      )
        visibleIds.add(section.id);
    for (const annotation of document.education.annotations ?? []) {
      if (
        !annotation.visible ||
        (options.target === "selection" &&
          annotation.targetId &&
          !visibleIds.has(annotation.targetId))
      )
        continue;
      if (
        options.target === "selection" &&
        !annotation.targetId &&
        (annotation.x < contentBounds.x - 64 ||
          annotation.x > contentBounds.x + contentBounds.width + 64 ||
          annotation.y < contentBounds.y - 64 ||
          annotation.y > contentBounds.y + contentBounds.height + 64)
      )
        continue;
      const lines = [`[${annotation.provenance}] ${annotation.text}`].flatMap(
        (line) => line.match(/.{1,65}(?:\s|$)|.{1,65}/g) ?? [line],
      );
      const width = Math.max(...lines.map((line) => textWidth(line, 12))) + 20,
        height = lines.length * 18 + 16;
      rectangles.push({ x: annotation.x, y: annotation.y, width, height });
      const endX = annotation.endX ?? annotation.x,
        endY = annotation.endY ?? annotation.y;
      const hasConnector =
        (annotation.kind === "arrow" || annotation.kind === "callout") &&
        annotation.endX !== null &&
        annotation.endY !== null &&
        (endX !== annotation.x || endY !== annotation.y);
      if (hasConnector) {
        rectangles.push({
          x: Math.min(annotation.x, endX),
          y: Math.min(annotation.y, endY),
          width: Math.abs(endX - annotation.x) + 12,
          height: Math.abs(endY - annotation.y) + 12,
        });
        if (
          !markerDefinitions.some((marker) =>
            marker.includes('id="annotation-arrow"'),
          )
        )
          markerDefinitions.push(
            '<marker id="annotation-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L6 3L0 6Z" fill="#334155"/></marker>',
          );
      }
      nodes.push(
        `<g data-annotation-id="${escapeXml(annotation.id)}">${hasConnector ? `<path d="M${annotation.x} ${annotation.y}L${endX} ${endY}" fill="none" stroke="#334155" stroke-width="2" marker-end="url(#annotation-arrow)"/>` : ""}<rect x="${annotation.x}" y="${annotation.y}" width="${width}" height="${height}" rx="5" fill="#fffbeb" stroke="#64748b"/>${lines.map((line, index) => `<text x="${annotation.x + 10}" y="${annotation.y + 20 + index * 18}" font-size="12" fill="#172b3a">${escapeXml(line)}</text>`).join("")}</g>`,
      );
    }
  }
  let bounds = union(rectangles);
  const extras: string[] = [];
  if (style.showTitle) {
    const titleSize = Math.max(18, style.fontSize * 1.5),
      width = textWidth(document.title || "Untitled process", titleSize);
    const title = {
      x: bounds.x,
      y: bounds.y - titleSize * 3,
      width,
      height: titleSize * 2,
    };
    rectangles.push(title);
    extras.push(
      `<text x="${title.x}" y="${title.y + titleSize}" font-size="${titleSize}" font-weight="bold" fill="${diagramTextColor(style.background)}">${escapeXml(document.title || "Untitled process")}</text>`,
    );
  }
  if (style.showLegend) {
    const entries = [
      "Material stream — solid arrow",
      "Energy stream — dashed arrow",
      "Values entered manually; no simulation",
    ];
    const legend: Rect = {
      x: bounds.x,
      y: bounds.y + bounds.height + 24,
      width: Math.max(...entries.map((entry) => textWidth(entry, 12))) + 40,
      height: 80,
    };
    rectangles.push(legend);
    extras.push(
      `<g transform="translate(${legend.x} ${legend.y})" font-size="12" fill="${diagramTextColor(style.background)}">${entries.map((entry, index) => `<text x="0" y="${index * 23 + 16}">${escapeXml(entry)}</text>`).join("")}</g>`,
    );
  }
  bounds = union(rectangles);
  const credit = attribution(document);
  if (credit) {
    const lines = credit.credit.match(/.{1,100}/gu) ?? [];
    const footer = {
      x: bounds.x,
      y: bounds.y + bounds.height + 20,
      width: Math.max(...lines.map((line) => textWidth(line, 11)), 0),
      height: lines.length * 17 + 12,
    };
    rectangles.push(footer);
    extras.push(
      `<g data-attribution="true" font-size="11" fill="${diagramTextColor(style.background)}">${lines.map((line, index) => `<text x="${footer.x}" y="${footer.y + 15 + index * 17}">${escapeXml(line)}</text>`).join("")}</g><metadata>${escapeXml(credit.metadata)}</metadata>`,
    );
    bounds = union(rectangles);
  }
  const padding = Math.max(
    8,
    Math.min(200, Number.isFinite(options.padding) ? options.padding! : 32),
  );
  bounds = {
    x: bounds.x - padding,
    y: bounds.y - padding,
    width: Math.ceil(bounds.width + padding * 2),
    height: Math.ceil(bounds.height + padding * 2),
  };
  const background = color(options.background, style.background);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}" role="img" aria-label="${escapeXml(document.title)}"><title>${escapeXml(document.title)}</title><desc>Original PFDkit process diagram; manually entered values; structural validation only.</desc>${options.transparent ? "" : `<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="${background}"/>`}<defs>${markerDefinitions.join("")}</defs><g font-family="${escapeXml(style.fontFamily)},sans-serif">${paths.join("")}${nodes.join("")}${extras.join("")}</g></svg>`;
  return { svg, width: bounds.width, height: bounds.height, bounds };
}

export function validatePngSize(width: number, height: number): void {
  if (
    ![width, height].every(
      (value) => Number.isInteger(value) && value >= 64 && value <= 8192,
    ) ||
    width * height > 32_000_000
  )
    throw new Error(
      "PNG dimensions must be whole numbers from 64–8192 px, with at most 32 million pixels total.",
    );
}
export async function svgToPng(
  svg: string,
  width: number,
  height: number,
  background?: string,
): Promise<Blob> {
  validatePngSize(width, height);
  const url = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(
          new Error(
            "This browser could not render the SVG. Export SVG or JSON instead.",
          ),
        );
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error(
        "PNG rendering is unavailable in this browser. Export SVG instead.",
      );
    if (background) {
      context.fillStyle = color(background, "#ffffff");
      context.fillRect(0, 0, width, height);
    }
    // Preserve figure aspect ratio and leave transparent margins when dimensions differ.
    const scale = Math.min(
        width / image.naturalWidth,
        height / image.naturalHeight,
      ),
      renderWidth = image.naturalWidth * scale,
      renderHeight = image.naturalHeight * scale;
    context.drawImage(
      image,
      (width - renderWidth) / 2,
      (height - renderHeight) / 2,
      renderWidth,
      renderHeight,
    );
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(
                new Error(
                  "PNG generation failed. Try a smaller image or export SVG.",
                ),
              ),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function nativeJson(document: Document): Blob {
  return new Blob([serializeDocument(document)], {
    type: "application/json;charset=utf-8",
  });
}
