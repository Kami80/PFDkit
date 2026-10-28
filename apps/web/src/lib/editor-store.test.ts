import { beforeEach, describe, expect, it } from "vitest";
import {
  exampleDocument,
  parseDocument,
  serializeDocument,
} from "@pfdkit/contracts";
import { useEditorStore } from "./editor-store";

beforeEach(() => {
  useEditorStore.getState().replaceDocument(structuredClone(exampleDocument));
});

describe("document commands integrated with the authoritative contract", () => {
  it("moves presentation while preserving engineering, education and unknown metadata", () => {
    const document = structuredClone(exampleDocument);
    document.metadata.extension = { nested: [null, false, 0] };
    document.presentation.nodes["pump-1"].metadata.label = "Keep this label";
    document.education.notes = "Original explanation";
    useEditorStore.getState().replaceDocument(document);
    useEditorStore.getState().moveEquipment("pump-1", 123.25, -90.5);
    const moved = useEditorStore.getState().document;
    expect(moved.engineering).toEqual(document.engineering);
    expect(moved.education).toEqual(document.education);
    expect(moved.metadata).toEqual(document.metadata);
    expect(moved.presentation.nodes["pump-1"]).toEqual({
      x: 123.25,
      y: -90.5,
      metadata: { label: "Keep this label" },
    });
    expect(parseDocument(serializeDocument(moved))).toEqual(moved);
  });

  it("retains imported prototype-like identifiers when adding missing layout", () => {
    const document = parseDocument(
      JSON.stringify({
        id: "special-id-draft",
        engineering: {
          equipment: [{ id: "__proto__", type: "pump", tag: "P-SPECIAL" }],
        },
      }),
    );
    useEditorStore.getState().replaceDocument(document);
    useEditorStore.getState().moveEquipment("__proto__", 48.5, 96.25);
    const moved = useEditorStore.getState().document;
    expect(Object.hasOwn(moved.presentation.nodes, "__proto__")).toBe(true);
    expect(moved.presentation.nodes["__proto__"].x).toBe(48.5);
    expect(parseDocument(serializeDocument(moved))).toEqual(moved);
  });

  it("rejects incompatible connection and configuration changes without altering the active document", () => {
    const saved = serializeDocument(useEditorStore.getState().document);
    useEditorStore.getState().connect("feed-1", "out", "pump-1", "power");
    expect(useEditorStore.getState().lastMessage).toContain("energy");
    expect(serializeDocument(useEditorStore.getState().document)).toBe(saved);
    useEditorStore.getState().updateEquipment("pump-1", {
      config: { efficiency: 2 },
    });
    expect(useEditorStore.getState().lastMessage).toContain("invalid");
    expect(serializeDocument(useEditorStore.getState().document)).toBe(saved);
  });

  it("deletes attached streams and layout while keeping unrelated content", () => {
    const original = structuredClone(exampleDocument);
    useEditorStore.getState().select({ kind: "equipment", id: "pump-1" });
    useEditorStore.getState().removeSelection();
    const changed = useEditorStore.getState().document;
    expect(changed.engineering.equipment.map((item) => item.id)).toEqual([
      "feed-1",
      "exchanger-1",
      "product-1",
    ]);
    expect(changed.engineering.streams.map((item) => item.id)).toEqual([
      "stream-3",
    ]);
    expect(Object.hasOwn(changed.presentation.nodes, "pump-1")).toBe(false);
    expect(changed.education).toEqual(original.education);
    expect(parseDocument(serializeDocument(changed))).toEqual(changed);
    expect(useEditorStore.getState().selection).toBeNull();
  });
});
