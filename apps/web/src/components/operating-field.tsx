"use client";
import { useState } from "react";
import { useEditorStore } from "@/lib/editor-store";
import { units, type Quantity, type Stream } from "@/lib/contract";
import { convertOperatingQuantity } from "@/lib/exchanger-geometry";
import css from "./m2.module.css";

export function OperatingField({
  stream,
  field,
  onChange,
}: {
  stream: Stream;
  field: "temperature" | "pressure" | "flowRate";
  onChange: (quantity: Quantity) => void;
}) {
  const dimension =
    field === "temperature"
      ? "temperature"
      : field === "pressure"
        ? "pressure"
        : (
            {
              mass: "massFlow",
              molar: "molarFlow",
              volume: "volumeFlow",
            } as const
          )[stream.flowBasis];
  const options = Object.entries(units)
    .filter(([, unit]) => unit.dimension === dimension)
    .map(([name]) => name);
  const quantity = stream[field] || {
    value: null,
    unit: options[0],
    dimension,
  };
  const [error, setError] = useState("");
  const latest = () =>
    useEditorStore
      .getState()
      .document.engineering.streams.find((item) => item.id === stream.id)?.[
      field
    ] || quantity;
  return (
    <div className={css.row}>
      <label>
        {field === "flowRate"
          ? "Flow rate"
          : field === "temperature"
            ? "Temperature"
            : "Pressure"}{" "}
        (entered)
        <input
          key={`${stream.id}-${field}-${quantity.value}-${quantity.unit}`}
          aria-label={`${stream.tag} ${field}`}
          type="number"
          step="any"
          defaultValue={quantity.value ?? ""}
          placeholder="Unknown"
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              event.stopPropagation();
              event.currentTarget.value =
                quantity.value === null ? "" : String(quantity.value);
              event.currentTarget.blur();
            }
          }}
          onBlur={(event) => {
            const value =
              event.target.value === "" ? null : Number(event.target.value);
            if (
              value !== null &&
              (!Number.isFinite(value) ||
                (Number.isInteger(value) && !Number.isSafeInteger(value)))
            ) {
              setError(
                "Enter a finite value within the portable numeric range (integers up to 9,007,199,254,740,991), or leave blank for unknown.",
              );
              return;
            }
            setError("");
            const current = latest();
            if (value !== current.value) onChange({ ...current, value });
          }}
        />
      </label>
      <label>
        Unit
        <select
          aria-label={`${stream.tag} ${field} unit`}
          value={quantity.unit}
          onChange={(event) => {
            try {
              onChange(convertOperatingQuantity(latest(), event.target.value));
              setError("");
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "Unit conversion failed.",
              );
            }
          }}
        >
          {options.map((unit) => (
            <option key={unit}>{unit}</option>
          ))}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
