"use client";
import { useMemo, useState } from "react";
import type { Document } from "@/lib/contract";
import { useEditorStore } from "@/lib/editor-store";
import {
  diagramSvg,
  downloadBlob,
  nativeJson,
  svgToPng,
  validatePngSize,
  type ExportOptions,
} from "@/lib/export-svg";
import { getDiagramStyle } from "@/lib/styles";
import {
  academicSvg,
  minimumPrintFontSize,
  svgToPdf,
  PAGE_PRESETS,
  PDF_FONT_NOTE,
  type PagePreset,
} from "@/lib/export-academic";
import { explorerFor } from "@/lib/explorers";
import { Modal } from "./modal";
import css from "./m2.module.css";

export function ExportDialog({
  onClose,
  selectionIds = [],
  equipmentId,
  document: suppliedDocument,
}: {
  onClose: () => void;
  selectionIds?: string[];
  equipmentId?: string;
  document?: Document;
}) {
  const { document: editorDocument, notify } = useEditorStore();
  const document = suppliedDocument ?? editorDocument;
  const [format, setFormat] = useState("svg"),
    [target, setTarget] = useState<ExportOptions["target"]>(
      equipmentId ? "equipment" : "full",
    ),
    [transparent, setTransparent] = useState(false),
    [background, setBackground] = useState(
      getDiagramStyle(document).background,
    ),
    [padding, setPadding] = useState(32),
    [width, setWidth] = useState(1600),
    [height, setHeight] = useState(1000),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [preset, setPreset] = useState<PagePreset>("drawing"),
    [margin, setMargin] = useState(24),
    [pageWidth, setPageWidth] = useState(720),
    [pageHeight, setPageHeight] = useState(540),
    [sectionId, setSectionId] = useState(
      document.engineering.sections[0]?.id ?? "",
    ),
    [includeAnnotations, setIncludeAnnotations] = useState(true);
  const exchangerId =
    equipmentId ||
    document.engineering.equipment.find(
      (item) => !!explorerFor(item.type) && selectionIds.includes(item.id),
    )?.id;
  const preview = useMemo(() => {
    try {
      const figure = diagramSvg(document, {
        target,
        selectionIds,
        equipmentId: exchangerId,
        transparent,
        background,
        padding,
        sectionId,
        includeAnnotations,
      });
      const pageOptions = {
        preset,
        width: pageWidth,
        height: pageHeight,
        margin,
        transparent,
        background,
      };
      return {
        ...academicSvg(figure, pageOptions),
        minimumFontSize: minimumPrintFontSize(figure, pageOptions),
        error: "",
      };
    } catch (error) {
      return {
        svg: "",
        width: 0,
        height: 0,
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        minimumFontSize: null,
        error: error instanceof Error ? error.message : "Export unavailable",
      };
    }
  }, [
    document,
    target,
    selectionIds,
    exchangerId,
    transparent,
    background,
    padding,
    preset,
    margin,
    pageWidth,
    pageHeight,
    sectionId,
    includeAnnotations,
  ]);
  const filename =
    document.title.replace(/[^\p{L}\p{N}_-]/gu, "-") || "process";
  return (
    <Modal title="Export figure" onClose={onClose}>
      <div className={css.columns}>
        <div>
          {/* Blob-free data preview is self-contained SVG with escaped content. */}
          <div
            className={css.preview}
            aria-label="Export preview"
            dangerouslySetInnerHTML={{ __html: preview.svg }}
          />
          <p className={css.muted}>
            Figure bounds: {preview.width} × {preview.height} units. No canvas
            controls or editing handles are included.
          </p>
          {preview.error && (
            <p className={css.error} role="alert">
              {preview.error}
            </p>
          )}
        </div>
        <div>
          <label>
            Format
            <select
              aria-label="Export format"
              value={format}
              onChange={(event) => setFormat(event.target.value)}
            >
              <option value="svg">SVG vector figure</option>
              <option value="png">PNG image</option>
              <option value="pdf">PDF vector figure</option>
              <option value="json">JSON editable document</option>
            </select>
          </label>
          <label>
            Content bounds
            <select
              aria-label="Export target"
              value={target}
              onChange={(event) =>
                setTarget(event.target.value as ExportOptions["target"])
              }
            >
              <option value="full">Full diagram</option>
              <option value="selection" disabled={!selectionIds.length}>
                Selected content and endpoints
              </option>
              <option value="equipment" disabled={!exchangerId}>
                Equipment detail
              </option>
              <option
                value="section"
                disabled={!document.engineering.sections.length}
              >
                Process section
              </option>
            </select>
          </label>
          {target === "section" && (
            <label>
              Process section
              <select
                aria-label="Export process section"
                value={sectionId}
                onChange={(event) => setSectionId(event.target.value)}
              >
                {document.engineering.sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {format === "json" ? (
            <p>
              Native JSON always saves the complete editable document, including
              all engineering, layout, styles and educational metadata.
            </p>
          ) : (
            <>
              <label>
                Page / figure size
                <select
                  aria-label="Export size preset"
                  value={preset}
                  onChange={(event) =>
                    setPreset(event.target.value as PagePreset)
                  }
                >
                  {Object.entries(PAGE_PRESETS).map(([key, value]) => (
                    <option key={key} value={key}>
                      {value.label}
                    </option>
                  ))}
                </select>
              </label>
              {preset === "custom" && (
                <div className={css.row}>
                  <label>
                    Page width (pt)
                    <input
                      aria-label="Page width"
                      type="number"
                      min={72}
                      max={14400}
                      value={pageWidth}
                      onChange={(event) =>
                        setPageWidth(Number(event.target.value))
                      }
                    />
                  </label>
                  <label>
                    Page height (pt)
                    <input
                      aria-label="Page height"
                      type="number"
                      min={72}
                      max={14400}
                      value={pageHeight}
                      onChange={(event) =>
                        setPageHeight(Number(event.target.value))
                      }
                    />
                  </label>
                </div>
              )}
              {preset !== "drawing" && (
                <label>
                  Page margin (pt)
                  <input
                    aria-label="Page margin"
                    type="number"
                    min={0}
                    value={margin}
                    onChange={(event) => setMargin(Number(event.target.value))}
                  />
                </label>
              )}
              <p className={css.muted}>
                72 pt = 1 inch. Content fits within margins without stretching.
                Tall columns and large diagrams may need drawing/custom size for
                readable print labels.
              </p>
              {format === "pdf" && <p className={css.muted}>{PDF_FONT_NOTE}</p>}
              {preset !== "drawing" &&
                preview.minimumFontSize !== null &&
                preview.minimumFontSize < 6 && (
                  <p role="status" className={css.muted}>
                    Small print labels: the smallest text is approximately{" "}
                    {preview.minimumFontSize.toFixed(1)} pt at this page size.
                    Use a larger page, drawing bounds or a smaller selection for
                    readable print. You can still download this figure.
                  </p>
                )}
              <label>
                <input
                  type="checkbox"
                  checked={includeAnnotations}
                  onChange={(event) =>
                    setIncludeAnnotations(event.target.checked)
                  }
                />
                Include visible educational annotations
              </label>
              <label>
                <input
                  type="checkbox"
                  aria-label="Transparent background"
                  checked={transparent}
                  onChange={(event) => setTransparent(event.target.checked)}
                />
                Transparent background
              </label>
              <label>
                Background color
                <input
                  type="color"
                  aria-label="Export background color"
                  value={background}
                  onChange={(event) => setBackground(event.target.value)}
                />
              </label>
              <label>
                Padding
                <input
                  type="number"
                  min={8}
                  max={200}
                  value={padding}
                  onChange={(event) => setPadding(Number(event.target.value))}
                />
              </label>
              {format === "png" && (
                <>
                  <div className={css.row}>
                    <label>
                      Width (px)
                      <input
                        aria-label="PNG width"
                        type="number"
                        min={64}
                        max={8192}
                        value={width}
                        onChange={(event) =>
                          setWidth(Number(event.target.value))
                        }
                      />
                    </label>
                    <label>
                      Height (px)
                      <input
                        aria-label="PNG height"
                        type="number"
                        min={64}
                        max={8192}
                        value={height}
                        onChange={(event) =>
                          setHeight(Number(event.target.value))
                        }
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setHeight(
                        Math.round((width * preview.height) / preview.width),
                      )
                    }
                  >
                    Match figure aspect ratio
                  </button>
                  <p className={css.muted}>
                    64–8192 px per side, up to 32 million pixels. Figure
                    proportions are preserved.
                  </p>
                </>
              )}
            </>
          )}
          <button
            type="button"
            disabled={busy || (format !== "json" && !!preview.error)}
            onClick={async () => {
              setBusy(true);
              setMessage("");
              try {
                if (format === "json")
                  downloadBlob(nativeJson(document), `${filename}.pfd.json`);
                else if (format === "svg")
                  downloadBlob(
                    new Blob([preview.svg], {
                      type: "image/svg+xml;charset=utf-8",
                    }),
                    `${filename}${target === "equipment" ? "-detail" : ""}.svg`,
                  );
                else if (format === "pdf")
                  downloadBlob(
                    await svgToPdf(preview),
                    `${filename}${target === "equipment" ? "-detail" : ""}.pdf`,
                  );
                else {
                  validatePngSize(width, height);
                  downloadBlob(
                    await svgToPng(
                      preview.svg,
                      width,
                      height,
                      transparent ? undefined : background,
                    ),
                    `${filename}${target === "equipment" ? "-detail" : ""}.png`,
                  );
                }
                setMessage("Export downloaded.");
                notify("Figure exported successfully.");
              } catch (error) {
                setMessage(
                  error instanceof Error
                    ? error.message
                    : "Export failed. Try JSON or SVG.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Preparing…" : "Download export"}
          </button>
          <p
            role="status"
            className={
              message.includes("failed") || message.includes("must")
                ? css.error
                : css.muted
            }
          >
            {message}
          </p>
        </div>
      </div>
    </Modal>
  );
}
