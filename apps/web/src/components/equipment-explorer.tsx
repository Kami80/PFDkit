"use client";
import { useMemo, useState } from "react";
import type { Document } from "@/lib/contract";
import { useEditorStore } from "@/lib/editor-store";
import { explorerFor } from "@/lib/explorers";
import { exchangerState } from "@/lib/exchanger-geometry";
import { Modal } from "./modal";
import { EquipmentConfigForm } from "./equipment-config-form";
import { OperatingField } from "./operating-field";
import { ExportDialog } from "./export-dialog";
import css from "./m2.module.css";

/** Navigation, committed edits, operating entries and educational chrome shared by all explorers. */
export function EquipmentExplorer({
  equipmentId,
  onClose,
  readOnly = false,
  document: suppliedDocument,
}: {
  equipmentId: string;
  onClose: () => void;
  readOnly?: boolean;
  document?: Document;
}) {
  const {
    document: editorDocument,
    updateEquipment,
    updateStream,
    undo,
    redo,
    past,
    future,
    beginTransaction,
    commitTransaction,
  } = useEditorStore();
  const document = suppliedDocument ?? editorDocument;
  const [exporting, setExporting] = useState(false),
    [overlays, setOverlays] = useState(true),
    [zoom, setZoom] = useState(1),
    [selectedComponent, setSelectedComponent] = useState("");
  const equipment = document.engineering.equipment.find(
    (item) => item.id === equipmentId,
  );
  const explorer = equipment && explorerFor(equipment.type);
  const svg = useMemo(
    () =>
      explorer ? explorer.render(document, equipmentId, false, overlays) : "",
    [document, equipmentId, explorer, overlays],
  );
  if (!equipment || !explorer)
    return (
      <Modal title="Equipment explorer unavailable" onClose={onClose}>
        <p>
          The selected equipment no longer exists or has no supported explorer.
        </p>
        <button type="button" onClick={onClose}>
          Return to PFD
        </button>
      </Modal>
    );
  const state =
    equipment.type === "heatExchanger"
      ? exchangerState(document, equipment)
      : null;
  const content = explorer.content;
  return (
    <Modal
      title={`Explore ${equipment.tag || explorer.name}`}
      onClose={onClose}
    >
      <div className={css.row}>
        <button type="button" onClick={onClose}>
          Return to PFD
        </button>
        {!readOnly && (
          <>
            <button type="button" onClick={undo} disabled={!past.length}>
              Undo explorer edit
            </button>
            <button type="button" onClick={redo} disabled={!future.length}>
              Redo explorer edit
            </button>
          </>
        )}
        <button type="button" onClick={() => setExporting(true)}>
          Export equipment detail
        </button>
      </div>
      <p className={css.muted}>
        {readOnly
          ? "Presentation inspection: engineering values are read only."
          : "Edits apply to the same PFD and autosave. Enter or blur commits a value; Escape cancels its current input. Undo reverses committed edits."}
      </p>
      <div className={css.columns}>
        <div>
          <div className={css.row}>
            <label>
              <input
                type="checkbox"
                checked={overlays}
                onChange={(event) => setOverlays(event.target.checked)}
              />
              Educational overlays
            </label>
            <label>
              Illustration zoom
              <select
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
              >
                <option value={0.75}>75%</option>
                <option value={1}>100%</option>
                <option value={1.5}>150%</option>
                <option value={2}>200%</option>
              </select>
            </label>
          </div>
          <div className={css.explorerViewport}>
            <div
              className={css.svg}
              style={{ width: `${zoom * 100}%`, minWidth: 480 }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
          {state && <p>{state.role}</p>}
          {state && !state.supported && (
            <p className={css.error}>
              Detailed routing unavailable for the saved arrangement.
              Configuration is retained. This schematic supports up to eight
              tube passes and two shell passes, with shell passes no greater
              than tube passes. Cross-flow requires one pass per circuit.
            </p>
          )}
          {overlays && (
            <section aria-label="Component descriptions">
              <h3>Components</h3>
              <div className={css.row}>
                {Object.keys(content.components).map((key) => (
                  <button
                    type="button"
                    key={key}
                    aria-pressed={selectedComponent === key}
                    onClick={() => setSelectedComponent(key)}
                  >
                    {key.replace(/([A-Z])/g, " $1")}
                  </button>
                ))}
              </div>
              <p role="status">
                {content.components[selectedComponent] ||
                  "Choose a component to read its role."}
              </p>
            </section>
          )}
          <details open>
            <summary>Operating principle and provenance</summary>
            <p>{content.principle}</p>
            <p>
              Original PFDkit schematic and teaching text (MIT). Colors identify
              circuits/phases, with solid/dashed paths for redundant cues.
              Dimensions are entered specifications; path spacing is schematic.
            </p>
            {content.references.map((reference) => (
              <p key={reference.url}>
                <a href={reference.url} target="_blank" rel="noreferrer">
                  {reference.title}
                </a>
              </p>
            ))}
          </details>
        </div>
        <div
          onFocusCapture={() => {
            if (!readOnly) beginTransaction("Edit equipment explorer");
          }}
          onBlur={(event) => {
            if (
              !event.currentTarget.contains(event.relatedTarget as Node | null)
            )
              if (!readOnly) commitTransaction();
          }}
        >
          {!readOnly && (
            <EquipmentConfigForm
              equipment={equipment}
              prefix="Explorer "
              onChange={(config) => updateEquipment(equipmentId, { config })}
            />
          )}
          <h3>Connected streams</h3>
          {explorer.streams(document, equipmentId).map(({ portId, stream }) => (
            <section className={css.stream} key={portId}>
              <strong>{portId}</strong>
              {stream ? (
                <>
                  <p>
                    {stream.tag || stream.id}
                    <br />
                    <small>ID: {stream.id}</small>
                  </p>
                  {readOnly ? (
                    <p>
                      {(["temperature", "pressure", "flowRate"] as const)
                        .map(
                          (field) =>
                            `${field}: ${stream[field]?.value ?? "unknown"} ${stream[field]?.unit ?? ""}`,
                        )
                        .join("; ")}
                    </p>
                  ) : (
                    (["temperature", "pressure", "flowRate"] as const).map(
                      (field) => (
                        <OperatingField
                          key={field}
                          stream={stream}
                          field={field}
                          onChange={(quantity) =>
                            updateStream(stream.id, { [field]: quantity })
                          }
                        />
                      ),
                    )
                  )}
                  <span className={css.muted}>
                    Manual / illustrative user entries; blank = unknown. No
                    process calculation.
                  </span>
                </>
              ) : (
                <p>
                  Unconnected: operating values unknown. Connect this port in
                  the PFD.
                </p>
              )}
            </section>
          ))}
        </div>
      </div>
      {exporting && (
        <ExportDialog
          document={document}
          equipmentId={equipmentId}
          onClose={() => setExporting(false)}
        />
      )}
    </Modal>
  );
}

export const ExplorerShell = EquipmentExplorer;
