import { beforeEach, describe, expect, it } from "vitest";
import { exampleDocument, validateDocument } from "./contract";
import { useEditorStore } from "./editor-store";
import {
  getPortPosition,
  getSymbol,
  SYMBOL_OFFSET_X,
  SYMBOL_OFFSET_Y,
} from "./symbols";
import { registry } from "@pfdkit/contracts";

const state = () => useEditorStore.getState();
beforeEach(() => state().replaceDocument(structuredClone(exampleDocument)));

describe("command history and references", () => {
  it("coalesces movement and forms, cancels a compound edit and leaves failures out of history", () => {
    const original = structuredClone(state().document);
    state().beginTransaction("Drag selection");
    for (let index = 0; index < 50; index++)
      state().moveEquipment("pump-1", index * 20, 80);
    expect(state().past).toHaveLength(0);
    state().commitTransaction();
    expect(state().past).toHaveLength(1);
    const moved = structuredClone(state().document);
    state().undo();
    expect(state().document).toEqual(original);
    state().redo();
    expect(state().document).toEqual(moved);
    state().beginTransaction("Edit label");
    state().updateEquipment("pump-1", { tag: "draft" });
    state().cancelTransaction();
    expect(state().document).toEqual(moved);
    state().updateEquipment("pump-1", { config: { efficiency: 9 } });
    expect(state().past).toHaveLength(1);
    expect(state().document).toEqual(moved);
  });

  it("copies equipment, internal streams, geometry, styling and unknown metadata with fresh references", () => {
    const document = structuredClone(state().document);
    document.engineering.equipment[0].metadata.extension = {
      opaque: [0, null],
    };
    document.presentation.metadata.objectStyles = {
      "feed-1": { stroke: "#123456" },
      "stream-1": { lineWidth: 3 },
    };
    state().replaceDocument(document);
    state().setSelection(["feed-1", "pump-1"]);
    state().copySelection();
    state().paste();
    const pasted = state().document;
    expect(pasted.engineering.equipment).toHaveLength(6);
    expect(pasted.engineering.streams).toHaveLength(4);
    const feed = pasted.engineering.equipment[4];
    const pump = pasted.engineering.equipment[5];
    const stream = pasted.engineering.streams[3];
    expect(feed.id).not.toBe("feed-1");
    expect(pump.id).not.toBe("pump-1");
    expect(stream.id).not.toBe("stream-1");
    expect(stream.source.equipmentId).toBe(feed.id);
    expect(stream.target.equipmentId).toBe(pump.id);
    expect(stream.source.portId).toBe("out");
    expect(feed.metadata).toEqual(document.engineering.equipment[0].metadata);
    const styles = pasted.presentation.metadata.objectStyles as Record<
      string,
      unknown
    >;
    expect(styles[feed.id]).toEqual({ stroke: "#123456" });
    expect(styles[stream.id]).toEqual({ lineWidth: 3 });
    expect(pasted.presentation.nodes[feed.id].x).toBe(
      document.presentation.nodes["feed-1"].x + 20,
    );
    expect(validateDocument(pasted).valid).toBe(true);
    state().undo();
    expect(state().document).toEqual(document);
  });

  it("reconnects with original stream excluded from port counts and retains all entered properties", () => {
    const before = structuredClone(state().document.engineering.streams[0]);
    expect(
      state().canReconnect(before.id, "feed-1", "out", "pump-1", "in"),
    ).toBe(true);
    state().reconnectStream(before.id, "feed-1", "out", "pump-1", "in");
    expect(state().document.engineering.streams[0]).toEqual(before);
    state().addEquipment("pump", 800, 300);
    const newPump = state().document.engineering.equipment.at(-1)!;
    state().reconnectStream(before.id, "feed-1", "out", newPump.id, "in");
    expect(state().document.engineering.streams[0]).toEqual({
      ...before,
      target: { equipmentId: newPump.id, portId: "in" },
    });
    const valid = structuredClone(state().document);
    state().reconnectStream(before.id, "feed-1", "out", newPump.id, "power");
    expect(state().document).toEqual(valid);
    state().undo();
    expect(state().document.engineering.streams[0]).toEqual(before);
  });

  it("moves and deletes a group as one undoable command and cleans only its style references", () => {
    state().setObjectStyle(["pump-1", "stream-1", "product-1"], {
      fill: "#eeeeee",
    });
    const before = structuredClone(state().document);
    state().setSelection(["pump-1", "exchanger-1"]);
    state().moveSelection(20, 40);
    expect(state().document.presentation.nodes["pump-1"].x).toBe(
      before.presentation.nodes["pump-1"].x + 20,
    );
    state().removeSelection();
    expect(state().document.engineering.equipment).toHaveLength(2);
    expect(state().document.engineering.streams).toHaveLength(0);
    expect(state().document.presentation.metadata.objectStyles).toEqual({
      "product-1": { fill: "#eeeeee" },
    });
    state().undo();
    state().undo();
    expect(state().document).toEqual(before);
  });

  it("limits history to one hundred commands and resets it on project replacement", () => {
    for (let index = 0; index < 105; index++)
      state().setTitle(`Revision ${index}`);
    expect(state().past).toHaveLength(100);
    state().replaceDocument(structuredClone(exampleDocument));
    expect(state().past).toEqual([]);
    expect(state().future).toEqual([]);
  });
});

describe("shared catalog geometry", () => {
  it("renders every catalog definition with distinct fixed multiport coordinates and no embedded paint", () => {
    expect(registry).toHaveLength(16);
    for (const definition of registry) {
      const symbol = getSymbol(definition.type, definition.defaultConfig);
      expect(symbol.shapes.length).toBeGreaterThan(0);
      expect(Object.keys(symbol.ports)).toEqual(
        definition.ports.map((port) => port.id),
      );
      for (const port of definition.ports) {
        const point = getPortPosition(
          definition.type,
          port.id,
          definition.defaultConfig,
        );
        expect(point.x).toBeGreaterThanOrEqual(SYMBOL_OFFSET_X);
        expect(point.x).toBeLessThanOrEqual(SYMBOL_OFFSET_X + 120);
        expect(point.y).toBeGreaterThanOrEqual(SYMBOL_OFFSET_Y);
        expect(point.y).toBeLessThanOrEqual(SYMBOL_OFFSET_Y + 80);
      }
      expect(JSON.stringify(symbol)).not.toMatch(/#[0-9a-f]{3,8}/i);
    }
    expect(
      new Set(["in1", "in2", "in3"].map((id) => getPortPosition("mixer", id).y))
        .size,
    ).toBe(3);
  });
  it("changes supported drawing configuration without changing port identities", () => {
    for (const [type, config] of [
      ["tank", { orientation: "horizontal" }],
      ["reactor", { reactorType: "plugFlow" }],
      ["column", { internals: "packing" }],
    ] as const) {
      expect(getSymbol(type, config).shapes).not.toEqual(
        getSymbol(type).shapes,
      );
      expect(getSymbol(type, config).ports).toEqual(getSymbol(type).ports);
    }
  });
});
