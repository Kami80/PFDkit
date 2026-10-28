"use client";

import { useState } from "react";
import { definitions, units, type Quantity, type Stream } from "@/lib/contract";
import { useEditorStore } from "@/lib/editor-store";
import { equipmentPorts } from "@pfdkit/contracts";
import { EquipmentConfigForm } from "./equipment-config-form";
import { Button } from "@/components/ui/button";

function NumberField({
  label,
  value,
  onCommit,
  min,
  max,
  integer = false,
}: {
  label: string;
  value: number | null;
  onCommit: (value: number | null) => void;
  min?: number;
  max?: number;
  integer?: boolean;
}) {
  const [error, setError] = useState("");
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        step={integer ? 1 : "any"}
        key={`${label}-${value}`}
        defaultValue={value === null ? "" : String(value)}
        min={min}
        max={max}
        placeholder="Unknown"
        aria-invalid={!!error}
        onInput={() => setError("")}
        onBlur={(event) => {
          if (event.target.dataset.canceled === "true") {
            delete event.target.dataset.canceled;
            return;
          }
          const draft = event.target.value;
          const next = draft.trim() === "" ? null : Number(draft);
          if (integer && next === null) {
            event.target.value = value === null ? "" : String(value);
            setError(`${label} requires a whole number.`);
          } else if (
            next === null ||
            (Number.isFinite(next) &&
              (min === undefined || next >= min) &&
              (max === undefined || next <= max) &&
              (!integer || Number.isInteger(next)))
          )
            onCommit(next);
          else {
            event.target.value = value === null ? "" : String(value);
            useEditorStore
              .getState()
              .notify(
                `${label} must be a valid number${min === undefined ? "." : ` between ${min} and ${max}.`}`,
              );
            setError(
              `${label} must be ${integer ? "a whole number" : "a number"}${min === undefined ? "." : ` between ${min} and ${max}.`}`,
            );
          }
        }}
      />
      {error && (
        <span className="inline-field-error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

const unitDefinitions: Record<
  string,
  { dimension: string; scale: number; offset: number }
> = units;
const optionsFor = (dimension: Quantity["dimension"]) =>
  Object.keys(unitDefinitions).filter(
    (name) => unitDefinitions[name].dimension === dimension,
  );
const defaultUnits: Record<Quantity["dimension"], string> = {
  massFlow: "kg/s",
  molarFlow: "mol/s",
  volumeFlow: "m3/s",
  temperature: "K",
  pressure: "Pa",
  power: "W",
  dimensionless: "1",
};

function QuantityField({
  label,
  quantity,
  dimension,
  onChange,
  streamId,
  field,
}: {
  label: string;
  quantity: Quantity | null;
  dimension: Quantity["dimension"];
  onChange: (quantity: Quantity) => void;
  streamId: string;
  field: "flowRate" | "temperature" | "pressure" | "power";
}) {
  const unit = quantity?.unit ?? defaultUnits[dimension];
  return (
    <div className="quantity-row">
      <NumberField
        label={label}
        value={quantity?.value ?? null}
        onCommit={(value) => onChange({ value, unit, dimension })}
      />
      <label className="field unit-field">
        <span>{label} unit</span>
        <select
          aria-label={`${label} unit`}
          value={unit}
          onChange={(event) => {
            const next = event.target.value;
            const currentStream = useEditorStore
              .getState()
              .document.engineering.streams.find(
                (item) => item.id === streamId,
              );
            const current =
              field === "power"
                ? currentStream?.properties.power
                : currentStream?.[field];
            const oldScale = unitDefinitions[current?.unit ?? unit];
            const nextScale = unitDefinitions[next];
            const value = current?.value;
            onChange({
              dimension,
              unit: next,
              value:
                value === null || value === undefined
                  ? null
                  : (value * oldScale.scale +
                      oldScale.offset -
                      nextScale.offset) /
                    nextScale.scale,
            });
          }}
        >
          {optionsFor(dimension).map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function Properties() {
  const {
    document,
    selection,
    updateEquipment,
    updateStream,
    removeSelection,
    selectionIds,
    beginTransaction,
    commitTransaction,
    cancelTransaction,
    copySelection,
    duplicateSelection,
    openExplorer,
    reconnectStream,
  } = useEditorStore();
  const equipment =
    selection?.kind === "equipment"
      ? document.engineering.equipment.find((item) => item.id === selection.id)
      : null;
  const stream =
    selection?.kind === "stream"
      ? document.engineering.streams.find((item) => item.id === selection.id)
      : null;
  const definition = definitions.find((item) => item.type === equipment?.type);
  const config = (patch: Record<string, unknown>) =>
    equipment &&
    updateEquipment(equipment.id, {
      config: patch,
    });
  const patchStream = (patch: Partial<Stream>) =>
    stream && updateStream(stream.id, patch);
  if (selectionIds.length > 1)
    return (
      <aside className="properties-panel" aria-label="Properties">
        <div className="panel-heading">
          <span className="eyebrow">MULTIPLE SELECTION</span>
          <h2>{selectionIds.length} objects selected</h2>
        </div>
        <div className="mixed-selection">
          <p>
            Move this selection together, copy its equipment and internal
            streams, or apply shared appearance from Style. Select one object to
            edit its engineering properties.
          </p>
          <Button variant="outline" onClick={copySelection}>
            Copy selection
          </Button>
          <Button variant="outline" onClick={duplicateSelection}>
            Duplicate selection
          </Button>
          <Button variant="destructive" onClick={removeSelection}>
            Delete selection
          </Button>
          <p>
            Ctrl / ⌘ + click toggles selection. Shift + drag selects a region.
          </p>
        </div>
      </aside>
    );
  return (
    <aside
      className="properties-panel"
      aria-label="Properties"
      onFocusCapture={(event) => {
        const target = event.target as HTMLInputElement;
        if (target.matches("input,select,textarea")) {
          target.dataset.beforeValue = target.value;
          beginTransaction("Edit properties");
        }
      }}
      onBlur={(event) => {
        if ((event.target as Element).matches("input,select,textarea"))
          commitTransaction();
      }}
      onKeyDownCapture={(event) => {
        const target = event.target as HTMLInputElement;
        if (event.key === "Escape" && target.matches("input,select,textarea")) {
          event.preventDefault();
          event.stopPropagation();
          target.dataset.canceled = "true";
          target.value = target.dataset.beforeValue ?? target.value;
          cancelTransaction();
          target.blur();
        }
        if (event.key === "Enter" && target.matches("input")) {
          event.preventDefault();
          target.blur();
        }
      }}
    >
      <div className="panel-heading">
        <span className="eyebrow">INSPECTOR</span>
        <h2>
          {equipment
            ? definition?.name
            : stream
              ? stream.kind === "energy"
                ? "Energy stream"
                : "Material stream"
              : "Process details"}
        </h2>
      </div>
      {!equipment && !stream && (
        <>
          <div className="empty-inspector">
            <div className="crosshair">⌖</div>
            <h3>Select an object</h3>
            <p>
              Choose equipment or a stream on the canvas to edit its properties.
            </p>
          </div>
          <div className="help-card">
            <span className="eyebrow">WORKSPACE GUIDE</span>
            <p>
              <b>1.</b> Add equipment from the palette.
            </p>
            <p>
              <b>2.</b> Drag an outlet to a compatible inlet, or use Connect
              ports.
            </p>
            <p>
              <b>3.</b> Enter operating values, then export your document.
            </p>
          </div>
        </>
      )}
      {equipment && (
        <div className="property-content">
          <label className="field">
            <span>Equipment tag</span>
            <input
              aria-label="Equipment tag"
              value={equipment.tag}
              onChange={(event) =>
                updateEquipment(equipment.id, { tag: event.target.value })
              }
            />
          </label>
          <p className="field-note">{definition?.description}</p>
          {["heatExchanger", "column"].includes(equipment.type) && (
            <Button
              variant="outline"
              onClick={() => openExplorer(equipment.id)}
            >
              Explore {definition?.name?.toLowerCase()}
            </Button>
          )}
          <EquipmentConfigForm equipment={equipment} onChange={config} />
          <h3>Ports</h3>
          <ul className="port-list">
            {equipmentPorts(equipment.type, equipment.config).map((port) => (
              <li key={port.id}>
                <span className={`port-dot ${port.kind}`} />
                <span>{port.name}</span>
                <small>
                  {port.kind} · {port.direction}
                </small>
              </li>
            ))}
          </ul>
          <code className="object-id">{equipment.id}</code>
        </div>
      )}
      {stream && (
        <div className="property-content">
          <label className="field">
            <span>Stream label</span>
            <input
              value={stream.tag}
              onChange={(event) => patchStream({ tag: event.target.value })}
            />
          </label>
          <div className="connection-summary">
            {
              document.engineering.equipment.find(
                (item) => item.id === stream.source.equipmentId,
              )?.tag
            }{" "}
            <span>→</span>{" "}
            {
              document.engineering.equipment.find(
                (item) => item.id === stream.target.equipmentId,
              )?.tag
            }
          </div>
          <h3>Operating values</h3>
          <details className="stream-endpoints">
            <summary>Reconnect endpoints</summary>
            {(["source", "target"] as const).map((endpoint) => {
              const options = document.engineering.equipment.flatMap((item) =>
                equipmentPorts(item.type, item.config)
                  .filter(
                    (port) =>
                      port.direction ===
                        (endpoint === "source" ? "out" : "in") &&
                      port.kind === stream.kind,
                  )
                  .map((port) => ({
                    value: JSON.stringify([item.id, port.id]),
                    label: `${item.tag} · ${port.name}`,
                  })),
              );
              return (
                <label className="field" key={endpoint}>
                  <span>
                    {endpoint === "source" ? "Source outlet" : "Target inlet"}
                  </span>
                  <select
                    aria-label={`Reconnect ${endpoint}`}
                    value={JSON.stringify([
                      stream[endpoint].equipmentId,
                      stream[endpoint].portId,
                    ])}
                    onChange={(event) => {
                      const [id, port] = JSON.parse(event.target.value) as [
                        string,
                        string,
                      ];
                      const current = useEditorStore
                        .getState()
                        .document.engineering.streams.find(
                          (item) => item.id === stream.id,
                        )!;
                      reconnectStream(
                        stream.id,
                        endpoint === "source" ? id : current.source.equipmentId,
                        endpoint === "source" ? port : current.source.portId,
                        endpoint === "target" ? id : current.target.equipmentId,
                        endpoint === "target" ? port : current.target.portId,
                      );
                    }}
                  >
                    {options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </details>
          <p className="field-note">
            Blank values remain unknown. Unit changes convert an entered value.
          </p>
          {stream.kind === "material" ? (
            <>
              <label className="field">
                <span>Flow basis</span>
                <select
                  aria-label="Flow basis"
                  value={stream.flowBasis}
                  onChange={(event) =>
                    patchStream({
                      flowBasis: event.target.value as Stream["flowBasis"],
                      flowRate: null,
                    })
                  }
                >
                  <option value="mass">Mass</option>
                  <option value="molar">Molar</option>
                  <option value="volume">Volume</option>
                </select>
              </label>
              <QuantityField
                streamId={stream.id}
                field="flowRate"
                label="Flow rate"
                quantity={stream.flowRate}
                dimension={
                  stream.flowBasis === "mass"
                    ? "massFlow"
                    : stream.flowBasis === "molar"
                      ? "molarFlow"
                      : "volumeFlow"
                }
                onChange={(flowRate) => patchStream({ flowRate })}
              />
              <QuantityField
                streamId={stream.id}
                field="temperature"
                label="Temperature"
                quantity={stream.temperature}
                dimension="temperature"
                onChange={(temperature) => patchStream({ temperature })}
              />
              <QuantityField
                streamId={stream.id}
                field="pressure"
                label="Pressure (absolute)"
                quantity={stream.pressure}
                dimension="pressure"
                onChange={(pressure) => patchStream({ pressure })}
              />
            </>
          ) : (
            <QuantityField
              streamId={stream.id}
              field="power"
              label="Power"
              quantity={stream.properties.power ?? null}
              dimension="power"
              onChange={(power) =>
                patchStream({ properties: { ...stream.properties, power } })
              }
            />
          )}
          <code className="object-id">{stream.id}</code>
        </div>
      )}
      {selection && (
        <div className="inspector-footer">
          <Button variant="destructive" onClick={removeSelection}>
            Delete {equipment ? "equipment" : "stream"}
          </Button>
          <span>or press Delete</span>
        </div>
      )}
    </aside>
  );
}
