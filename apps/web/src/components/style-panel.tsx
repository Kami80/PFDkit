"use client";
import { useEffect, useRef, useState } from "react";
import { useEditorStore } from "@/lib/editor-store";
import {
  getDiagramStyle,
  resolveObjectStyle,
  stylePatch,
  type DiagramStyle,
} from "@/lib/styles";
import css from "./m2.module.css";

function StyleNumber({
  label,
  value,
  min,
  max,
  step = 1,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (value: number) => void;
}) {
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(String(value));
  const focused = useRef(false);
  useEffect(() => {
    queueMicrotask(() => {
      if (!focused.current) setDraft(String(value));
    });
  }, [value]);
  return (
    <label>
      {label}
      <input
        aria-label={label}
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={(event) => {
          focused.current = false;
          const text = event.currentTarget.value,
            number = Number(text);
          if (
            !text ||
            !Number.isFinite(number) ||
            number < min ||
            number > max
          ) {
            setError(`Enter a number from ${min} to ${max}.`);
            return;
          }
          setError("");
          if (number !== value) onCommit(number);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            event.stopPropagation();
            event.currentTarget.value = String(value);
            setDraft(String(value));
            setError("");
            event.currentTarget.blur();
          }
        }}
      />
      {error && (
        <span role="alert" className={css.error}>
          {error}
        </span>
      )}
    </label>
  );
}

export function StylePanel({ onClose }: { onClose?: () => void }) {
  const {
    document: process,
    selection,
    selectionIds,
    updatePresentation,
    setObjectStyle,
    beginTransaction,
    commitTransaction,
  } = useEditorStore();
  const style = getDiagramStyle(process);
  const [theme, setTheme] = useState("system");
  useEffect(() => {
    let preference = "system";
    try {
      preference = localStorage.getItem("pfdkit:ui-theme") || "system";
    } catch {
      /* UI preference is optional. */
    }
    queueMicrotask(() => setTheme(preference));
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const choice = document.documentElement.dataset.preference || preference;
      document.documentElement.dataset.theme =
        choice === "system" ? (media.matches ? "dark" : "light") : choice;
    };
    apply();
    media.addEventListener("change", apply);
    return () => {
      media.removeEventListener("change", apply);
      useEditorStore.getState().commitTransaction();
    };
  }, []);
  const patch = (value: Partial<DiagramStyle>) =>
    updatePresentation(stylePatch(useEditorStore.getState().document, value));
  const selected =
    selection &&
    (selection.kind === "equipment"
      ? process.engineering.equipment.find((item) => item.id === selection.id)
      : process.engineering.streams.find((item) => item.id === selection.id));
  const objectStyle =
    selected &&
    resolveObjectStyle(
      process,
      selected.id,
      "type" in selected ? selected.type : selected.kind,
    );
  const existingIds = new Set(
    [...process.engineering.equipment, ...process.engineering.streams].map(
      (item) => item.id,
    ),
  );
  const targetIds = (
    selectionIds.length ? selectionIds : selection ? [selection.id] : []
  ).filter((id) => existingIds.has(id));
  return (
    <section
      className={css.panel}
      aria-label="Diagram styling"
      onFocusCapture={() => beginTransaction("Change diagram style")}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          commitTransaction();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          commitTransaction();
          onClose?.();
        }
      }}
    >
      <div className={css.row}>
        <h2>Diagram style</h2>
        {onClose && (
          <button
            type="button"
            onClick={() => {
              commitTransaction();
              onClose();
            }}
          >
            Close style
          </button>
        )}
      </div>
      <label>
        Preset
        <select
          aria-label="Style preset"
          value={style.preset}
          onChange={(event) =>
            patch({ preset: event.target.value as DiagramStyle["preset"] })
          }
        >
          <option value="engineeringClassic">Engineering Classic</option>
          <option value="academicColorful">Academic Colorful</option>
          <option value="minimalScientific">Minimal Scientific</option>
          <option value="presentation">Presentation</option>
        </select>
      </label>
      <label>
        Canvas background
        <input
          type="color"
          value={style.background}
          onChange={(event) => patch({ background: event.target.value })}
        />
      </label>
      <div className={css.row}>
        <label>
          Font
          <select
            value={style.fontFamily}
            onChange={(event) =>
              patch({
                fontFamily: event.target.value as DiagramStyle["fontFamily"],
              })
            }
          >
            <option>Arial</option>
            <option>Georgia</option>
            <option>Courier New</option>
          </select>
        </label>
        <StyleNumber
          label="Label size"
          value={style.fontSize}
          min={8}
          max={32}
          onCommit={(fontSize) => patch({ fontSize })}
        />
      </div>
      <StyleNumber
        label="Line thickness"
        value={style.lineWidth}
        min={0.5}
        max={8}
        step={0.1}
        onCommit={(lineWidth) => patch({ lineWidth })}
      />
      <div className={css.row}>
        <label>
          <input
            type="checkbox"
            checked={style.showTitle}
            onChange={(event) => patch({ showTitle: event.target.checked })}
          />
          Show diagram title
        </label>
        <label>
          <input
            type="checkbox"
            checked={style.showLegend}
            onChange={(event) => patch({ showLegend: event.target.checked })}
          />
          Show legend
        </label>
      </div>
      <label>
        <input
          type="checkbox"
          checked={style.colorblind}
          onChange={(event) => patch({ colorblind: event.target.checked })}
        />
        Colorblind-friendly cues (labels and energy dashes)
      </label>
      <label>
        Interface appearance
        <select
          value={theme}
          onChange={(event) => {
            const value = event.target.value;
            setTheme(value);
            document.documentElement.dataset.preference = value;
            document.documentElement.dataset.theme =
              value === "system"
                ? matchMedia("(prefers-color-scheme: dark)").matches
                  ? "dark"
                  : "light"
                : value;
            try {
              localStorage.setItem("pfdkit:ui-theme", value);
            } catch {
              /* Diagram autosave independently reports storage failure. */
            }
          }}
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      {selected && objectStyle ? (
        <>
          <h3>{selected.tag || selected.id} overrides</h3>
          {targetIds.length > 1 && (
            <p className={css.muted}>
              {targetIds.length} selected objects. Controls show the primary
              object as a representative; each change and reset applies to all
              selected objects.
            </p>
          )}
          {(["stroke", "fill", "textColor"] as const).map((key) => (
            <label key={key}>
              {key === "textColor"
                ? "Text color"
                : key === "stroke"
                  ? "Stroke color"
                  : "Fill color"}
              <input
                type="color"
                value={objectStyle[key]}
                onChange={(event) =>
                  setObjectStyle(targetIds, { [key]: event.target.value })
                }
              />
            </label>
          ))}
          <StyleNumber
            label="Object line thickness"
            value={objectStyle.lineWidth}
            min={0.5}
            max={8}
            step={0.1}
            onCommit={(lineWidth) => setObjectStyle(targetIds, { lineWidth })}
          />
          <StyleNumber
            label="Object label size"
            value={objectStyle.fontSize}
            min={8}
            max={32}
            onCommit={(fontSize) => setObjectStyle(targetIds, { fontSize })}
          />
          <label>
            <input
              type="checkbox"
              checked={objectStyle.labelVisible}
              onChange={(event) =>
                setObjectStyle(targetIds, {
                  labelVisible: event.target.checked,
                })
              }
            />
            Show object label
          </label>
          <button type="button" onClick={() => setObjectStyle(targetIds, {})}>
            Reset selected override
          </button>
        </>
      ) : (
        <p className={css.muted}>
          Select equipment or a stream for individual overrides.
        </p>
      )}
      <p className={css.muted}>
        Visual settings do not change engineering values. Names, distinct
        symbols and dashed energy lines preserve meaning beyond color.
      </p>
    </section>
  );
}
