import { beforeEach, describe, expect, it } from "vitest";
import {
  exampleDocument,
  parseDocument,
  serializeDocument,
  validateDocument,
} from "./contract";
import { useEditorStore } from "./editor-store";
import { diagramSvg } from "./export-svg";
import { LocalProjectStore, type StorageLike } from "./persistence";
import { getDiagramStyle, resolveObjectStyle, stylePatch } from "./styles";

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

beforeEach(() => {
  useEditorStore.getState().replaceDocument(structuredClone(exampleDocument));
});

describe("M2 cross-feature document integrity", () => {
  it("styles, saves, reopens and undoes a diagram without rewriting engineering or extension metadata", () => {
    const original = structuredClone(exampleDocument);
    original.metadata.vendor = { arbitrary: [null, 0, false] };
    original.presentation.metadata.style = {
      preset: "engineeringClassic",
      futureRule: { preserve: true },
    };
    useEditorStore.getState().replaceDocument(original);
    useEditorStore.getState().updatePresentation(
      stylePatch(original, {
        preset: "academicColorful",
        fontSize: 16,
      }),
    );
    useEditorStore.getState().setObjectStyle(["pump-1"], {
      stroke: "#123456",
      lineWidth: 4,
    });
    const styled = useEditorStore.getState().document;
    expect(styled.engineering).toEqual(original.engineering);
    expect(styled.metadata).toEqual(original.metadata);
    expect(styled.presentation.metadata.style).toMatchObject({
      futureRule: { preserve: true },
    });
    expect(resolveObjectStyle(styled, "pump-1", "pump").stroke).toBe("#123456");
    const local = new LocalProjectStore(
      new MemoryStorage(),
      "integration-writer",
    );
    local.save(styled, 0);
    expect(local.load(styled.id).document).toEqual(styled);
    expect(parseDocument(serializeDocument(styled))).toEqual(styled);
    useEditorStore.getState().undo();
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().document).toEqual(original);
    useEditorStore.getState().redo();
    expect(getDiagramStyle(useEditorStore.getState().document).preset).toBe(
      "academicColorful",
    );
  });

  it("copies a styled composition across projects and remaps component collisions across object kinds", () => {
    const source = structuredClone(exampleDocument);
    source.engineering.components = [
      {
        id: "water",
        name: "Water",
        formula: "H2O",
        metadata: { source: "original" },
      },
    ];
    source.engineering.streams[0].composition = {
      basis: "mole",
      fractions: [{ componentId: "water", value: 1 }],
    };
    source.presentation.metadata.objectStyles = {
      "feed-1": { stroke: "#123456", vendor: "keep" },
      "stream-1": { lineWidth: 4 },
    };
    useEditorStore.getState().replaceDocument(source);
    useEditorStore.getState().setSelection(["feed-1", "pump-1"]);
    useEditorStore.getState().copySelection();
    const destination = parseDocument(
      JSON.stringify({
        id: "destination",
        metadata: { future: "keep destination" },
        engineering: {
          equipment: [{ id: "water", type: "tank", tag: "TK-EXISTING" }],
        },
      }),
    );
    useEditorStore.getState().replaceDocument(destination);
    useEditorStore.getState().paste();
    const pasted = useEditorStore.getState().document;
    expect(pasted.engineering.equipment).toHaveLength(3);
    expect(pasted.engineering.streams).toHaveLength(1);
    expect(pasted.engineering.components).toHaveLength(1);
    const component = pasted.engineering.components[0];
    const stream = pasted.engineering.streams[0];
    expect(component.id).not.toBe("water");
    expect(stream.composition?.fractions[0].componentId).toBe(component.id);
    expect(stream.source.portId).toBe("out");
    expect(stream.target.portId).toBe("in");
    expect(stream.id).not.toBe("stream-1");
    expect(stream.source.equipmentId).not.toBe("feed-1");
    const styles = pasted.presentation.metadata.objectStyles as Record<
      string,
      unknown
    >;
    expect(styles[stream.source.equipmentId]).toMatchObject({
      stroke: "#123456",
      vendor: "keep",
    });
    expect(styles[stream.id]).toMatchObject({ lineWidth: 4 });
    expect(styles["feed-1"]).toBeUndefined();
    expect(pasted.metadata).toEqual(destination.metadata);
    expect(validateDocument(pasted).valid).toBe(true);
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().document).toEqual(destination);
  });

  it("reconnects occupied endpoints by replacing the existing stream while retaining values and identity", () => {
    const source = structuredClone(exampleDocument);
    source.engineering.streams[0].metadata.measurement = "keep this provenance";
    useEditorStore.getState().replaceDocument(source);
    expect(
      useEditorStore
        .getState()
        .canReconnect("stream-1", "feed-1", "out", "pump-1", "in"),
    ).toBe(true);
    useEditorStore.getState().addEquipment("pump", 500, 600);
    const target = useEditorStore
      .getState()
      .document.engineering.equipment.at(-1)!;
    const before = structuredClone(useEditorStore.getState().document);
    useEditorStore
      .getState()
      .reconnectStream("stream-1", "feed-1", "out", target.id, "in");
    const reconnected =
      useEditorStore.getState().document.engineering.streams[0];
    expect(reconnected).toEqual({
      ...before.engineering.streams[0],
      target: { equipmentId: target.id, portId: "in" },
    });
    const saved = serializeDocument(useEditorStore.getState().document);
    const historyLength = useEditorStore.getState().past.length;
    useEditorStore
      .getState()
      .reconnectStream("stream-1", "feed-1", "out", "product-1", "in");
    expect(serializeDocument(useEditorStore.getState().document)).toBe(saved);
    expect(useEditorStore.getState().past).toHaveLength(historyLength);
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().document).toEqual(before);
  });

  it("coalesces group movement and restores deleted engineering, layouts and styles in one undo", () => {
    const initial = structuredClone(exampleDocument);
    initial.presentation.metadata.objectStyles = {
      "pump-1": { stroke: "#123456" },
      "stream-1": { lineWidth: 5 },
    };
    useEditorStore.getState().replaceDocument(initial);
    useEditorStore.getState().setSelection(["feed-1", "pump-1"]);
    useEditorStore.getState().beginTransaction("Move group");
    for (let index = 0; index < 40; index++)
      useEditorStore.getState().moveSelection(1.25, 0.75);
    useEditorStore.getState().commitTransaction();
    const moved = structuredClone(useEditorStore.getState().document);
    expect(useEditorStore.getState().past).toHaveLength(1);
    expect(moved.engineering).toEqual(initial.engineering);
    expect(moved.presentation.nodes["feed-1"].x).toBe(
      initial.presentation.nodes["feed-1"].x + 50,
    );
    useEditorStore.getState().removeSelection();
    expect(useEditorStore.getState().past).toHaveLength(2);
    expect(useEditorStore.getState().document.engineering.streams).toHaveLength(
      1,
    );
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().document).toEqual(moved);
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().document).toEqual(initial);
  });

  it("exports escaped native labels with generous text bounds and no editor affordances", () => {
    const document = structuredClone(exampleDocument);
    document.title = 'Wide WWWWWWWWWWWW <script> & "quoted" title';
    document.engineering.equipment[1].tag = "W".repeat(100);
    document.presentation.metadata.style = {
      fontSize: 24,
      fontFamily: "Georgia",
    };
    const output = diagramSvg(document, { transparent: true });
    expect(output.svg).toContain("&lt;script&gt;");
    expect(output.svg).not.toContain("<script>");
    expect(output.svg).not.toContain("react-flow__handle");
    expect(output.svg).not.toContain("is-selected");
    expect(output.width).toBeGreaterThanOrEqual(100 * 24 * 1.1);
    expect(
      diagramSvg(document, { target: "selection", selectionIds: ["pump-1"] })
        .svg,
    ).not.toContain("F-101");
  });
});
