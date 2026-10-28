"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Document } from "@pfdkit/contracts";
import { diagramSvg } from "@/lib/export-svg";
import { presentationView } from "@/lib/teaching";
import { EquipmentExplorer } from "./equipment-explorer";
import { Button } from "./ui/button";
import "./teaching.css";

export function Presentation({
  document: process,
  onClose,
}: {
  document: Document;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [notes, setNotes] = useState(false);
  const [explorer, setExplorer] = useState<string | null>(null);
  const [overview, setOverview] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const steps = process.education.steps ?? [],
    step = steps[index];
  const view = useMemo(
    () => presentationView(process, index),
    [process, index],
  );
  const figure = useMemo(
    () =>
      diagramSvg(
        view.document,
        overview || !view.focusIds.length
          ? {}
          : { target: "selection", selectionIds: view.focusIds },
      ),
    [view, overview],
  );
  const targetExplorer = process.engineering.equipment.find(
    (e) =>
      e.id === step?.explorerId && ["heatExchanger", "column"].includes(e.type),
  );
  const navigate = (next: number) => {
    setIndex(Math.max(0, Math.min(steps.length - 1, next)));
    setExplorer(null);
    setOverview(false);
  };
  const exit = () => {
    if (window.document.fullscreenElement)
      void window.document.exitFullscreen().catch(() => {});
    onClose();
  };
  useEffect(() => {
    const previous = window.document.activeElement as HTMLElement | null;
    root.current?.focus();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    let entered = false;
    const changed = () => {
      if (window.document.fullscreenElement === root.current) entered = true;
      else if (entered) onClose();
    };
    window.document.addEventListener("fullscreenchange", changed);
    return () =>
      window.document.removeEventListener("fullscreenchange", changed);
  }, [onClose]);
  return (
    <div
      ref={root}
      className="lecture-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Process presentation"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (
          explorer ||
          (event.target as HTMLElement).closest("input,textarea,select")
        )
          return;
        if (
          ["ArrowRight", "PageDown"].includes(event.key) ||
          (event.key === " " && event.target === root.current)
        ) {
          event.preventDefault();
          navigate(index + 1);
        }
        if (["ArrowLeft", "PageUp"].includes(event.key)) {
          event.preventDefault();
          navigate(index - 1);
        }
        if (event.key === "Home") {
          event.preventDefault();
          navigate(0);
        }
        if (event.key === "End") {
          event.preventDefault();
          navigate(steps.length - 1);
        }
        if (event.key.toLowerCase() === "n") setNotes(!notes);
        if (event.key === "Escape") {
          event.stopPropagation();
          exit();
        }
        if (event.key === "Tab") {
          const buttons = root.current?.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          );
          if (!buttons?.length) return;
          const first = buttons[0],
            last = buttons[buttons.length - 1];
          if (
            event.shiftKey &&
            (window.document.activeElement === first ||
              window.document.activeElement === root.current)
          ) {
            event.preventDefault();
            last.focus();
          } else if (
            !event.shiftKey &&
            window.document.activeElement === last
          ) {
            event.preventDefault();
            first.focus();
          }
        }
      }}
    >
      <header>
        <h2>{step?.title ?? process.title}</h2>
        <Button
          variant="outline"
          onClick={() => {
            void root.current?.requestFullscreen?.().catch(() => {});
          }}
        >
          Fullscreen
        </Button>
        <Button variant="outline" onClick={exit}>
          Exit presentation
        </Button>
      </header>
      {!steps.length && (
        <p>
          Full diagram view. Add lecture steps in Teaching and sections to save
          focuses, reveals, annotations, and notes.
        </p>
      )}
      {!!view.missingIds.length && (
        <p role="status" className="lecture-warning">
          Deleted or unavailable teaching targets: {view.missingIds.join(", ")}.
          Edit the saved step to choose replacements.
        </p>
      )}
      <div
        className="lecture-figure"
        aria-label="Presentation diagram"
        dangerouslySetInnerHTML={{ __html: figure.svg }}
      />
      {notes && (
        <aside className="lecture-notes" aria-label="Lecture notes">
          {step?.notes ||
            process.education.notes ||
            "No lecture notes for this step."}
        </aside>
      )}
      <footer>
        <Button
          variant="outline"
          disabled={index <= 0}
          onClick={() => navigate(index - 1)}
        >
          Previous step
        </Button>
        <span aria-live="polite">
          {steps.length ? `${index + 1} / ${steps.length}` : "Diagram overview"}
        </span>
        <Button
          variant="outline"
          disabled={index >= steps.length - 1}
          onClick={() => navigate(index + 1)}
        >
          Next step
        </Button>
        <Button
          variant="outline"
          aria-pressed={notes}
          onClick={() => setNotes(!notes)}
        >
          {notes ? "Hide notes" : "Show notes"}
        </Button>
        <Button
          variant="outline"
          aria-pressed={overview}
          onClick={() => setOverview(!overview)}
        >
          {overview ? "Focus targets" : "Diagram overview"}
        </Button>
        {targetExplorer && (
          <Button onClick={() => setExplorer(targetExplorer.id)}>
            Inspect {targetExplorer.tag}
          </Button>
        )}
        <small>
          ← → steps · N notes · Esc exit · Specifications entered manually; no
          simulation
        </small>
      </footer>
      {explorer && (
        <EquipmentExplorer
          equipmentId={explorer}
          onClose={() => setExplorer(null)}
          readOnly
        />
      )}
    </div>
  );
}
