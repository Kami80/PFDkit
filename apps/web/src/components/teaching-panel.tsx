"use client";
import { useState } from "react";
import {
  parseDocument,
  serializeDocument,
  type Document,
  type Annotation,
  type PresentationStep,
} from "@pfdkit/contracts";
import { useEditorStore } from "@/lib/editor-store";
import { sectionTemplate } from "@/lib/hierarchy";
import { Modal } from "./modal";
import { Button } from "./ui/button";
import "./teaching.css";

export function TeachingPanel({
  onClose,
  onPresent,
}: {
  onClose: () => void;
  onPresent: () => void;
}) {
  const state = useEditorStore();
  const doc = state.document;
  const [name, setName] = useState("Process section");
  const [text, setText] = useState("");
  const [kind, setKind] = useState<Annotation["kind"]>("callout");
  const [provenance, setProvenance] =
    useState<Annotation["provenance"]>("conceptual");
  const [templates, setTemplates] = useState<Document[]>(() => {
    try {
      return (
        JSON.parse(
          localStorage.getItem("pfdkit.section-templates.v1") ?? "[]",
        ) as unknown[]
      ).map((t) => parseDocument(JSON.stringify(t)));
    } catch {
      return [];
    }
  });
  const annotations = doc.education.annotations ?? [],
    steps = doc.education.steps ?? [];
  const patchStep = (id: string, patch: Partial<PresentationStep>) =>
    state.updateEducation({
      steps: steps.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  const storeTemplate = (id: string) => {
    const template = sectionTemplate(doc, id),
      next = [...templates, template];
    try {
      localStorage.setItem(
        "pfdkit.section-templates.v1",
        JSON.stringify(next.map((t) => JSON.parse(serializeDocument(t)))),
      );
      setTemplates(next);
      state.notify("Process template saved in this browser.");
    } catch {
      state.notify(
        "Template storage is unavailable. Export the section as JSON to reuse it.",
      );
    }
  };
  return (
    <Modal
      title="Teaching and process sections"
      onClose={() => {
        state.commitTransaction();
        onClose();
      }}
    >
      <div
        className="teaching-panel"
        onFocusCapture={(event) => {
          if ((event.target as HTMLElement).matches("input,select,textarea"))
            state.beginTransaction("Edit teaching content");
        }}
        onBlur={(event) => {
          if ((event.target as HTMLElement).matches("input,select,textarea"))
            state.commitTransaction();
        }}
        onKeyDownCapture={(event) => {
          if (
            event.key === "Escape" &&
            (event.target as HTMLElement).matches("input,select,textarea")
          ) {
            event.preventDefault();
            event.stopPropagation();
            state.cancelTransaction();
            (event.target as HTMLElement).blur();
          }
        }}
      >
        <p>
          Process sections preserve the original streams and specifications.
          Teaching content is saved separately from engineering data.
        </p>
        <p role="status" aria-live="polite">
          {state.lastMessage}
        </p>
        <div className="teaching-fields">
          <Button
            variant="outline"
            disabled={!state.past.length}
            onClick={state.undo}
          >
            Undo teaching edit
          </Button>
          <Button
            variant="outline"
            disabled={!state.future.length}
            onClick={state.redo}
          >
            Redo teaching edit
          </Button>
        </div>
        <section>
          <h3>Process sections</h3>
          <label className="field">
            <span>Section name</span>
            <input
              aria-label="Section name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <Button
            onClick={() => state.createSection(name)}
            disabled={!state.selectionIds.length}
          >
            Group selected equipment
          </Button>
          <p className="field-note">
            Select a connected section at the current level. Four nested levels
            are supported. Empty sections remain editable.
          </p>
          <ul className="teaching-items">
            {(doc.engineering.sections ?? []).map((s) => (
              <li key={s.id}>
                <strong>{s.name}</strong>
                <small>
                  {s.equipmentIds.length} direct equipment ·{" "}
                  {s.boundaryPorts.length} boundary streams
                </small>
                <div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      state.enterSection(s.id);
                      onClose();
                    }}
                  >
                    Enter {s.name}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => state.duplicateSection(s.id)}
                  >
                    Duplicate
                  </Button>
                  <Button variant="outline" onClick={() => storeTemplate(s.id)}>
                    Save template
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => state.extractSection(s.id)}
                  >
                    Extract
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {templates.length > 0 && (
            <>
              <h4>Saved process templates</h4>
              <ul className="teaching-items">
                {templates.map((t, i) => (
                  <li key={`${t.id}-${i}`}>
                    <strong>{t.title}</strong>
                    <Button
                      variant="outline"
                      onClick={() => state.insertSectionTemplate(t)}
                    >
                      Insert template
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        const next = templates.filter(
                          (_, index) => index !== i,
                        );
                        try {
                          localStorage.setItem(
                            "pfdkit.section-templates.v1",
                            JSON.stringify(next),
                          );
                          setTemplates(next);
                        } catch {
                          state.notify("Could not update template storage.");
                        }
                      }}
                    >
                      Remove template
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
        <section>
          <h3>Educational annotations</h3>
          <label className="field">
            <span>Annotation text</span>
            <textarea
              aria-label="Annotation text"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <div className="teaching-fields">
            <label className="field">
              <span>Annotation type</span>
              <select
                aria-label="Annotation type"
                value={kind}
                onChange={(e) => setKind(e.target.value as Annotation["kind"])}
              >
                {["note", "callout", "arrow", "component"].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Value provenance</span>
              <select
                aria-label="Value provenance"
                value={provenance}
                onChange={(e) =>
                  setProvenance(e.target.value as Annotation["provenance"])
                }
              >
                {["conceptual", "manual", "illustrative", "calculated"].map(
                  (k) => (
                    <option key={k}>{k}</option>
                  ),
                )}
              </select>
            </label>
          </div>
          <p className="field-note">
            Calculated labels describe explicitly supplied external results;
            PFDkit performs no process calculations.
          </p>
          <Button
            disabled={!text.trim()}
            onClick={() => {
              const targetId =
                state.selectionIds.at(-1) ?? state.currentSectionId;
              const position =
                targetId && Object.hasOwn(doc.presentation.nodes, targetId)
                  ? doc.presentation.nodes[targetId]
                  : { x: 40, y: 40 };
              state.updateEducation({
                annotations: [
                  ...annotations,
                  {
                    id: crypto.randomUUID(),
                    kind,
                    text,
                    targetId,
                    x: position.x,
                    y: position.y - 35,
                    endX: kind === "arrow" ? position.x + 60 : null,
                    endY: kind === "arrow" ? position.y + 40 : null,
                    visible: true,
                    provenance,
                  },
                ],
              });
              setText("");
            }}
          >
            Add annotation to selection
          </Button>
          <ul className="teaching-items">
            {annotations.map((a) => (
              <li key={a.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={a.visible}
                    onChange={(e) =>
                      state.updateEducation({
                        annotations: annotations.map((item) =>
                          item.id === a.id
                            ? { ...item, visible: e.target.checked }
                            : item,
                        ),
                      })
                    }
                  />{" "}
                  Show {a.kind}: {a.text}
                </label>
                <label className="field">
                  <span>Edit annotation text</span>
                  <textarea
                    aria-label={`Annotation ${a.id} text`}
                    value={a.text}
                    onChange={(e) =>
                      state.updateEducation({
                        annotations: annotations.map((item) =>
                          item.id === a.id
                            ? { ...item, text: e.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                </label>
                <div className="teaching-fields">
                  {(
                    [
                      "x",
                      "y",
                      ...(a.kind === "arrow" ? ["endX", "endY"] : []),
                    ] as const
                  ).map((axis) => (
                    <label className="field" key={axis}>
                      <span>{axis}</span>
                      <input
                        type="number"
                        aria-label={`Annotation ${a.id} ${axis}`}
                        value={a[axis as "x" | "y" | "endX" | "endY"] ?? ""}
                        onChange={(e) => {
                          if (
                            e.target.value.trim() &&
                            Number.isFinite(Number(e.target.value))
                          )
                            state.updateEducation({
                              annotations: annotations.map((item) =>
                                item.id === a.id
                                  ? { ...item, [axis]: Number(e.target.value) }
                                  : item,
                              ),
                            });
                        }}
                      />
                    </label>
                  ))}
                </div>
                <small>
                  {a.provenance} · {a.targetId ?? "diagram"}
                </small>
                <Button
                  variant="ghost"
                  onClick={() =>
                    state.updateEducation({
                      annotations: annotations.filter(
                        (item) => item.id !== a.id,
                      ),
                    })
                  }
                >
                  Delete annotation
                </Button>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3>Lecture steps</h3>
          <p>
            Save a selection or the current process section as a focus target.
            Reveals accumulate forward and reverse predictably.
          </p>
          <Button
            onClick={() =>
              state.updateEducation({
                steps: [
                  ...steps,
                  {
                    id: crypto.randomUUID(),
                    title: `Step ${steps.length + 1}`,
                    targetIds: state.selectionIds.length
                      ? [...state.selectionIds]
                      : state.currentSectionId
                        ? [state.currentSectionId]
                        : [],
                    revealIds: [],
                    annotationIds: annotations
                      .filter((a) => a.visible)
                      .map((a) => a.id),
                    notes: "",
                    explorerId: null,
                  },
                ],
              })
            }
          >
            Add step from selection
          </Button>
          {!steps.length && (
            <p>
              No saved steps yet. Present the full diagram, or add steps to
              build a lecture.
            </p>
          )}
          <ol className="teaching-items">
            {steps.map((s, index) => (
              <li key={s.id}>
                <label className="field">
                  <span>Step {index + 1} title</span>
                  <input
                    aria-label={`Step ${index + 1} title`}
                    value={s.title}
                    onChange={(e) => patchStep(s.id, { title: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Lecture notes (hidden by default)</span>
                  <textarea
                    aria-label={`Step ${index + 1} notes`}
                    value={s.notes}
                    onChange={(e) => patchStep(s.id, { notes: e.target.value })}
                  />
                </label>
                <small>
                  Focus: {s.targetIds.join(", ") || "full diagram"} · Reveal:{" "}
                  {s.revealIds.length} objects
                </small>
                <div>
                  <Button
                    variant="outline"
                    onClick={() =>
                      patchStep(s.id, {
                        targetIds: state.selectionIds.length
                          ? [...state.selectionIds]
                          : state.currentSectionId
                            ? [state.currentSectionId]
                            : [],
                      })
                    }
                  >
                    Use current focus
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      patchStep(s.id, { revealIds: [...state.selectionIds] })
                    }
                  >
                    Reveal selection at step
                  </Button>
                </div>
                <label className="field">
                  <span>Open explorer</span>
                  <select
                    aria-label={`Step ${index + 1} explorer`}
                    value={s.explorerId ?? ""}
                    onChange={(e) =>
                      patchStep(s.id, { explorerId: e.target.value || null })
                    }
                  >
                    <option value="">Diagram only</option>
                    {doc.engineering.equipment
                      .filter((e) =>
                        ["heatExchanger", "column"].includes(e.type),
                      )
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.tag}
                        </option>
                      ))}
                  </select>
                </label>
                <div>
                  <Button
                    variant="outline"
                    disabled={index === 0}
                    onClick={() => {
                      const next = [...steps];
                      [next[index - 1], next[index]] = [
                        next[index],
                        next[index - 1],
                      ];
                      state.updateEducation({ steps: next });
                    }}
                  >
                    Move step earlier
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      state.updateEducation({
                        steps: steps.filter((item) => item.id !== s.id),
                      })
                    }
                  >
                    Delete step
                  </Button>
                </div>
              </li>
            ))}
          </ol>
          <Button onClick={onPresent}>Start presentation</Button>
        </section>
      </div>
    </Modal>
  );
}
