import type { SvgExport } from "./export-svg";
import { escapeXml } from "./exchanger-geometry";

export const PAGE_PRESETS = {
  drawing: { label: "Drawing bounds", width: 0, height: 0 },
  widescreen: { label: "16:9 presentation", width: 960, height: 540 },
  standard: { label: "4:3 presentation", width: 720, height: 540 },
  a4: { label: "A4 portrait", width: 595.276, height: 841.89 },
  letter: { label: "Letter portrait", width: 612, height: 792 },
  scientific: {
    label: "Scientific figure (89 × 64 mm)",
    width: 252.283,
    height: 181.417,
  },
  custom: { label: "Custom size", width: 720, height: 540 },
} as const;
export type PagePreset = keyof typeof PAGE_PRESETS;
export type PageOptions = {
  preset: PagePreset;
  width?: number;
  height?: number;
  margin: number;
  transparent?: boolean;
  background?: string;
};
export function pageDimensions(
  figure: Pick<SvgExport, "width" | "height">,
  options: PageOptions,
) {
  const preset = PAGE_PRESETS[options.preset];
  const width =
    options.preset === "drawing"
      ? figure.width
      : options.preset === "custom"
        ? (options.width ?? 720)
        : preset.width;
  const height =
    options.preset === "drawing"
      ? figure.height
      : options.preset === "custom"
        ? (options.height ?? 540)
        : preset.height;
  const margin = options.preset === "drawing" ? 0 : options.margin;
  if (
    ![width, height, margin].every(Number.isFinite) ||
    width < 72 ||
    height < 72 ||
    width > 14400 ||
    height > 14400 ||
    margin < 0 ||
    margin * 2 >= Math.min(width, height)
  )
    throw new Error(
      "Page size must be 72–14,400 points per side, with margins smaller than half the page. 72 pt = 1 inch.",
    );
  const scale = Math.min(
    (width - margin * 2) / figure.width,
    (height - margin * 2) / figure.height,
  );
  return {
    width,
    height,
    margin,
    scale,
    x: (width - figure.width * scale) / 2,
    y: (height - figure.height * scale) / 2,
  };
}

/** Effective point size after contain-fitting, including inherited SVG sizes. */
export function minimumPrintFontSize(
  figure: SvgExport,
  options: PageOptions,
): number | null {
  const sizes = Array.from(figure.svg.matchAll(/\bfont-size="([\d.]+)"/g))
    .map((match) => Number(match[1]))
    .filter((size) => Number.isFinite(size) && size > 0);
  return sizes.length
    ? Math.min(...sizes) * pageDimensions(figure, options).scale
    : null;
}

/** Contain-fit always preserves aspect ratio; title, legend and annotations share the scene bounds. */
export function academicSvg(
  figure: SvgExport,
  options: PageOptions,
): SvgExport {
  if (options.preset === "drawing") return figure;
  const page = pageDimensions(figure, options);
  const inner = figure.svg
    .replace(/^<svg\b[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "");
  const background = /^#[0-9a-f]{6}$/i.test(options.background ?? "")
    ? options.background!
    : "#ffffff";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${page.width}pt" height="${page.height}pt" viewBox="0 0 ${page.width} ${page.height}" role="img"><title>${escapeXml(PAGE_PRESETS[options.preset].label)}</title>${options.transparent ? "" : `<rect width="${page.width}" height="${page.height}" fill="${background}"/>`}<g transform="translate(${page.x} ${page.y}) scale(${page.scale}) translate(${-figure.bounds.x} ${-figure.bounds.y})">${inner}</g></svg>`;
  return {
    svg,
    width: page.width,
    height: page.height,
    bounds: { x: 0, y: 0, width: page.width, height: page.height },
  };
}

export const PDF_FONT_NOTE =
  "PDF uses standard Helvetica, Times or Courier fonts. Common arrows and dashes use readable ASCII equivalents. Other non-Latin characters require SVG/PNG; unsupported text stops PDF export.";
/** Base fonts are deliberate: no network font fetches or missing-glyph substitutions. */
export function pdfText(text: string): string {
  const replacements: Record<string, string> = {
    "→": "->",
    "←": "<-",
    "↑": "up",
    "↓": "down",
    "×": "x",
    "–": "-",
    "—": " - ",
    "−": "-",
    "…": "...",
    "≤": "<=",
    "≥": ">=",
    "↔": "<->",
    "⌘": "Cmd",
    "•": "-",
    "“": '"',
    "”": '"',
    "‘": "'",
    "’": "'",
  };
  const normalized = text.replace(
    /[→←↑↓×–—−…≤≥↔⌘•“”‘’]/g,
    (character) => replacements[character],
  );
  const invalid = Array.from(normalized).find((character) => {
    const code = character.codePointAt(0)!;
    return (
      code > 255 ||
      (code >= 127 && code < 160) ||
      (code < 32 && !"\n\r\t".includes(character))
    );
  });
  if (invalid)
    throw new Error(
      `PDF font does not support “${invalid}” (U+${invalid.codePointAt(0)!.toString(16).toUpperCase()}). Export SVG or PNG to preserve this text, or use supported Latin text for PDF.`,
    );
  return normalized;
}

/** svg2pdf ignores paint-order, so halos would cover the selectable text fill. */
export function pdfCompatibleSvg(svg: string): string {
  return svg.replace(/<(?:text|tspan)\b[^>]*>/g, (tag) =>
    tag
      .replace(/\s(?:stroke(?:-[\w-]+)?|paint-order)="[^"]*"/g, "")
      .replace(/>$/, ' stroke="none">'),
  );
}

export async function svgToPdf(figure: SvgExport): Promise<Blob> {
  const parsed = new DOMParser().parseFromString(
    pdfCompatibleSvg(figure.svg),
    "image/svg+xml",
  );
  if (parsed.querySelector("parsererror"))
    throw new Error(
      "PDF export could not parse the generated SVG. Export SVG and report this document.",
    );
  for (const element of parsed.querySelectorAll("text,tspan,title,desc"))
    for (const node of element.childNodes)
      if (node.nodeType === Node.TEXT_NODE)
        node.textContent = pdfText(node.textContent ?? "");
  for (const element of parsed.querySelectorAll("[font-family]")) {
    const family = element.getAttribute("font-family") ?? "";
    element.setAttribute(
      "font-family",
      family.includes("Georgia")
        ? "times"
        : family.includes("Courier")
          ? "courier"
          : "helvetica",
    );
  }
  if (figure.width > 14400 || figure.height > 14400)
    throw new Error(
      "PDF page exceeds 14,400 points. Choose a paper or presentation preset, or export SVG.",
    );
  const [{ jsPDF }] = await Promise.all([
    import("jspdf"),
    import("svg2pdf.js"),
  ]);
  const pdf = new jsPDF({
    orientation: figure.width > figure.height ? "landscape" : "portrait",
    unit: "pt",
    format: [figure.width, figure.height],
    compress: true,
    putOnlyUsedFonts: true,
  });
  pdf.setProperties({
    title: parsed.querySelector("title")?.textContent ?? "PFDkit figure",
    subject:
      "Schematic teaching figure; entered values are not simulation results",
    creator: "PFDkit",
    author: "PFDkit document author",
  });
  await pdf.svg(parsed.documentElement as unknown as SVGElement, {
    x: 0,
    y: 0,
    width: figure.width,
    height: figure.height,
    loadExternalStyleSheets: false,
  });
  return pdf.output("blob");
}
