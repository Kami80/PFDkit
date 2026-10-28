"use client";
import { useMemo, useState } from "react";
import type { Document } from "@/lib/contract";
import { diagramSvg, downloadBlob } from "@/lib/export-svg";
import { explorerFor } from "@/lib/explorers";
import { EquipmentExplorer } from "./equipment-explorer";
import css from "./platform.module.css";

/** The same renderer and explorer used by exports and the editor, with no store installation or mutation. */
export function DocumentPreview({
  document,
  attribution,
}: {
  document: Document;
  attribution?: string;
}) {
  const figure = useMemo(() => diagramSvg(document), [document]);
  const [explorer, setExplorer] = useState<string | null>(null);
  return (
    <section aria-label="Read-only diagram">
      <div
        className={css.figure}
        dangerouslySetInnerHTML={{ __html: figure.svg }}
      />
      {attribution && <p>{attribution}</p>}
      <div className={css.row}>
        <button
          type="button"
          onClick={() =>
            downloadBlob(
              new Blob([figure.svg], { type: "image/svg+xml" }),
              "diagram.svg",
            )
          }
        >
          Download SVG
        </button>
        <button
          type="button"
          onClick={() =>
            downloadBlob(
              new Blob([JSON.stringify(document, null, 2)], {
                type: "application/json",
              }),
              "diagram.pfd.json",
            )
          }
        >
          Download diagram JSON
        </button>
        {document.engineering.equipment
          .filter((e) => explorerFor(e.type))
          .map((e) => (
            <button type="button" key={e.id} onClick={() => setExplorer(e.id)}>
              Explore {e.tag}
            </button>
          ))}
      </div>
      {explorer && (
        <EquipmentExplorer
          equipmentId={explorer}
          document={document}
          readOnly
          onClose={() => setExplorer(null)}
        />
      )}
    </section>
  );
}
