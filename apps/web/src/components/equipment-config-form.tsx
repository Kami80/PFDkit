"use client";
import { useState } from "react";
import {
  definitions,
  configurationErrors,
  type Equipment,
} from "@/lib/contract";
import { useEditorStore } from "@/lib/editor-store";

type Field = {
  type?: string;
  enum?: string[];
  anyOf?: Field[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  items?: { $ref?: string };
  $ref?: string;
  properties?: Record<string, Field>;
};
const human = (value: string) =>
  value === "efficiency"
    ? "Efficiency (fraction)"
    : value
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (letter) => letter.toUpperCase());

/** Registry JSON Schema is the single source of form fields and numeric limits. */
export function EquipmentConfigForm({
  equipment,
  onChange: applyChange,
  prefix = "",
}: {
  equipment: Equipment;
  onChange: (patch: Record<string, unknown>) => void;
  prefix?: string;
}) {
  const definition = definitions.find((item) => item.type === equipment.type);
  const schema = definition?.configSchema as
    | { properties?: Record<string, Field>; $defs?: Record<string, Field> }
    | undefined;
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  function onChange(patch: Record<string, unknown>) {
    if (
      equipment.type === "column" &&
      patch.stageNumbering &&
      patch.stageNumbering !== (equipment.config.stageNumbering ?? "topDown")
    ) {
      const count = Number(equipment.config.stageCount ?? 10);
      patch = {
        ...patch,
        feedStage:
          count + 1 - Number(equipment.config.feedStage ?? Math.min(5, count)),
        ...Object.fromEntries(
          ["feeds", "sideDraws", "stageProperties"].map((key) => [
            key,
            (Array.isArray(equipment.config[key])
              ? (equipment.config[key] as { stage: number }[])
              : []
            ).map((item) => ({ ...item, stage: count + 1 - item.stage })),
          ]),
        ),
      };
    }
    const errors = configurationErrors(equipment.type, {
      ...equipment.config,
      ...patch,
    });
    if (errors.length) {
      setError(errors.join(" "));
      setRevision((value) => value + 1);
      return;
    }
    setError("");
    applyChange(patch);
    const state = useEditorStore.getState();
    const saved = state.document.engineering.equipment.find(
      (item) => item.id === equipment.id,
    )?.config;
    if (
      saved &&
      Object.entries(patch).some(
        ([key, value]) => JSON.stringify(saved[key]) !== JSON.stringify(value),
      )
    ) {
      setError(
        state.lastMessage ||
          "Configuration was rejected; the saved values are restored. Check stage and port references.",
      );
      setRevision((value) => value + 1);
    }
  }
  function control(
    key: string,
    field: Field,
    value: unknown,
    commit: (value: unknown) => void,
    label = human(key),
  ) {
    const shape = field.anyOf?.find((item) => item.type !== "null") ?? field;
    const nullable = field.anyOf?.some((item) => item.type === "null");
    if (shape.enum)
      return (
        <label className="field" key={key}>
          <span>{label}</span>
          <select
            aria-label={`${prefix}${label}`}
            value={String(value ?? field.default ?? "")}
            onChange={(event) => commit(event.target.value)}
          >
            {shape.enum.map((option) => (
              <option key={option} value={option}>
                {human(option)}
              </option>
            ))}
          </select>
        </label>
      );
    if (shape.type === "integer" || shape.type === "number")
      return (
        <label className="field" key={key}>
          <span>
            {label}
            {nullable ? " (entered; blank = unknown)" : ""}
          </span>
          <input
            aria-label={`${prefix}${label}`}
            type="number"
            step={shape.type === "integer" ? 1 : "any"}
            min={shape.minimum ?? shape.exclusiveMinimum}
            max={shape.maximum}
            key={`${key}-${value}-${revision}`}
            defaultValue={
              value === null ? "" : String(value ?? field.default ?? "")
            }
            placeholder={nullable ? "Unknown" : undefined}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                event.stopPropagation();
                event.currentTarget.value =
                  value === null ? "" : String(value ?? field.default ?? "");
                event.currentTarget.dataset.cancel = "true";
                event.currentTarget.blur();
              }
            }}
            onBlur={(event) => {
              if (event.target.dataset.cancel) {
                delete event.target.dataset.cancel;
                return;
              }
              const next =
                event.target.value === "" && nullable
                  ? null
                  : Number(event.target.value);
              if (
                (next === null && nullable) ||
                (next !== null &&
                  event.target.value !== "" &&
                  Number.isFinite(next) &&
                  (shape.type !== "integer" || Number.isInteger(next)) &&
                  (shape.minimum === undefined || next >= shape.minimum) &&
                  (shape.maximum === undefined || next <= shape.maximum) &&
                  (shape.exclusiveMinimum === undefined ||
                    next > shape.exclusiveMinimum))
              ) {
                setError("");
                commit(next);
              } else {
                setError(
                  `${label}: enter ${shape.type === "integer" ? "a whole number" : "a finite number"} within the shown limits${nullable ? ", or leave blank" : ""}.`,
                );
                setRevision((value) => value + 1);
              }
            }}
          />
        </label>
      );
    return (
      <label className="field" key={key}>
        <span>{label}</span>
        <input
          aria-label={`${prefix}${label}`}
          key={`${key}-${value}-${revision}`}
          defaultValue={String(value ?? field.default ?? "")}
          onBlur={(event) => commit(event.target.value)}
        />
      </label>
    );
  }
  return (
    <div className="equipment-config-form">
      <h3>Shared equipment configuration</h3>
      {Object.entries(schema?.properties ?? {}).map(([key, field]) => {
        const value = Object.hasOwn(equipment.config, key)
          ? equipment.config[key]
          : field.default;
        if (field.type !== "array")
          return control(key, field, value, (next) =>
            onChange({ [key]: next }),
          );
        const rows = Array.isArray(value)
          ? (value as Record<string, unknown>[])
          : [];
        const itemSchema =
          schema?.$defs?.[field.items?.$ref?.split("/").at(-1) ?? ""];
        return (
          <fieldset key={key}>
            <legend>{human(key)}</legend>
            {key === "feeds" || key === "sideDraws" ? (
              <p>
                Stable port ID and stage number. Removing a connected port is
                rejected; disconnect its stream in the PFD first.
              </p>
            ) : (
              <p>
                Manually entered SI conditions. Unknown values remain blank; no
                stage calculation is performed.
              </p>
            )}
            {rows.map((row, index) => (
              <div key={index} className="config-array-row">
                {Object.entries(itemSchema?.properties ?? {}).map(
                  ([name, shape]) =>
                    control(
                      `${key}-${index}-${name}`,
                      shape,
                      row[name],
                      (next) =>
                        onChange({
                          [key]: rows.map((item, i) =>
                            i === index ? { ...item, [name]: next } : item,
                          ),
                        }),
                      human(name),
                    ),
                )}
                <button
                  type="button"
                  onClick={() =>
                    onChange({ [key]: rows.filter((_, i) => i !== index) })
                  }
                >
                  Remove {key === "stageProperties" ? "condition" : "port"}{" "}
                  {index + 1}
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                const next =
                  key === "stageProperties"
                    ? {
                        stage: 1,
                        temperatureK: null,
                        pressurePa: null,
                        status: "manual",
                      }
                    : {
                        portId: `${key === "feeds" ? "feed" : "draw"}-${crypto.randomUUID().slice(0, 8)}`,
                        stage: Math.min(
                          Number(equipment.config.stageCount ?? 10),
                          5,
                        ),
                        ...(key === "sideDraws" ? { phase: "liquid" } : {}),
                      };
                onChange({ [key]: [...rows, next] });
              }}
            >
              Add{" "}
              {key === "stageProperties"
                ? "stage condition"
                : key === "feeds"
                  ? "feed"
                  : "side draw"}
            </button>
          </fieldset>
        );
      })}
      {error && <p role="alert">{error}</p>}
      {equipment.type === "column" && (
        <p>
          Stages exclude external condenser/reboiler. Reduce stage count only
          after relocating affected feeds, side draws and conditions. Changing
          numbering remaps feed, draw and condition stage numbers to preserve
          physical locations and stream identities.
        </p>
      )}
    </div>
  );
}
