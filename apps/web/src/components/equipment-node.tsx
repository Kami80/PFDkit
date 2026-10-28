"use client";
import { equipmentPorts } from "@pfdkit/contracts";
import { createElement, memo, useEffect } from "react";
import {
  Handle,
  Position,
  useUpdateNodeInternals,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { definitions, type Equipment } from "@/lib/contract";
import {
  getSymbol,
  NODE_HEIGHT,
  NODE_WIDTH,
  SYMBOL_OFFSET_X,
  SYMBOL_OFFSET_Y,
} from "@/lib/symbols";
import { resolveObjectStyle } from "@/lib/styles";
import { useEditorStore } from "@/lib/editor-store";

type Paint = { stroke?: string; fill?: string; lineWidth?: number };
export function EquipmentSymbol({
  type,
  config = {},
  paint = {},
}: {
  type: string;
  config?: Record<string, unknown>;
  paint?: Paint;
}) {
  const symbol = getSymbol(type, config);
  return (
    <svg
      viewBox={`0 0 ${symbol.width} ${symbol.height}`}
      fill="none"
      aria-hidden="true"
      className="equipment-symbol"
      style={{ color: paint.stroke, strokeWidth: paint.lineWidth }}
    >
      {symbol.shapes.map((shape, index) =>
        createElement(shape.tag, {
          ...shape.attrs,
          key: index,
          fill:
            shape.fill === "body"
              ? (paint.fill ?? "var(--symbol-fill)")
              : "none",
          stroke: shape.stroke ? (paint.stroke ?? "currentColor") : "none",
        }),
      )}
    </svg>
  );
}
const positions: Record<string, Position> = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
};
function EquipmentNodeComponent({
  data,
  selected,
}: NodeProps<Node<{ equipment: Equipment }>>) {
  const equipment = data.equipment;
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    updateNodeInternals(equipment.id);
  }, [equipment.id, equipment.config, updateNodeInternals]);
  const document = useEditorStore((state) => state.document);
  const definition = definitions.find((item) => item.type === equipment.type);
  const style = resolveObjectStyle(document, equipment.id, equipment.type);
  const symbol = getSymbol(equipment.type, equipment.config);
  return (
    <div
      className={`equipment-node ${selected ? "is-selected" : ""}`}
      data-testid={`equipment-${equipment.type}`}
      style={{
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        fontFamily: style.fontFamily,
        color: style.stroke,
      }}
    >
      <span
        className="equipment-tag"
        title={equipment.tag}
        style={{
          color: style.textColor,
          fontSize: style.fontSize,
          visibility: style.labelVisible ? "visible" : "hidden",
        }}
      >
        {equipment.tag || definition?.name}
      </span>
      <div
        className="equipment-symbol-frame"
        style={{
          position: "absolute",
          left: SYMBOL_OFFSET_X,
          top: SYMBOL_OFFSET_Y,
          width: symbol.width,
          height: symbol.height,
        }}
      >
        <EquipmentSymbol
          type={equipment.type}
          config={equipment.config}
          paint={style}
        />
        {equipmentPorts(equipment.type, equipment.config).map((port) => (
          <Handle
            key={port.id}
            id={port.id}
            type={port.direction === "in" ? "target" : "source"}
            position={positions[port.side]}
            style={
              port.side === "left" || port.side === "right"
                ? { top: `${(port.offset ?? 0.5) * 100}%` }
                : { left: `${(port.offset ?? 0.5) * 100}%` }
            }
            className={`port port-${port.kind}`}
            title={`${port.name} (${port.id})  /  ${port.kind} ${port.direction === "in" ? "inlet" : "outlet"}`}
            aria-label={`${equipment.tag} ${port.name} (${port.id})`}
          />
        ))}
      </div>
      <span className="equipment-name" style={{ color: style.textColor }}>
        {definition?.name ?? equipment.type}
      </span>
    </div>
  );
}
export const EquipmentNode = memo(EquipmentNodeComponent);
