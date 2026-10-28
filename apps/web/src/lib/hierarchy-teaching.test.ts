import { beforeEach, describe, expect, it } from "vitest";
import {
  exampleDocument,
  parseDocument,
  serializeDocument,
  validateDocument,
} from "./contract";
import {
  groupSection,
  extractSection,
  insertTemplate,
  sectionEquipmentIds,
  sectionTemplate,
  syncBoundaries,
} from "./hierarchy";
import { presentationView } from "./teaching";
import { useEditorStore } from "./editor-store";
const doc = () => structuredClone(exampleDocument);
const state = () => useEditorStore.getState();
beforeEach(() => state().replaceDocument(doc()));

describe("process hierarchy", () => {
  it("groups a connected section without changing canonical streams, saves and extracts with IDs intact", () => {
    const d = doc(),
      streams = structuredClone(d.engineering.streams);
    const section = groupSection(d, ["pump-1", "exchanger-1"], "Heating", null);
    expect(section.boundaryPorts).toHaveLength(2);
    expect(d.engineering.streams).toEqual(streams);
    expect(validateDocument(d).valid).toBe(true);
    expect(parseDocument(serializeDocument(d))).toEqual(d);
    const boundaries = section.boundaryPorts.map((p) => p.id);
    syncBoundaries(d);
    expect(section.boundaryPorts.map((p) => p.id)).toEqual(boundaries);
    extractSection(d, section.id);
    expect(d.engineering.sections).toEqual([]);
    expect(d.engineering.streams).toEqual(streams);
  });
  it("rejects disconnected and multiply-owned selections; permits valid process recycles independently from containment", () => {
    const d = doc();
    expect(() =>
      groupSection(d, ["feed-1", "product-1"], "Invalid", null),
    ).toThrow(/connected/);
    const parent = groupSection(d, ["pump-1", "exchanger-1"], "Parent", null);
    expect(() => groupSection(d, ["pump-1"], "Other", null)).toThrow(
      /directly/,
    );
    const child = groupSection(d, ["exchanger-1"], "Child", parent.id);
    expect(sectionEquipmentIds(d, parent.id).sort()).toEqual([
      "exchanger-1",
      "pump-1",
    ]);
    parent.parentId = child.id;
    expect(
      validateDocument(d).issues.some((i) => i.code === "recursive_section"),
    ).toBe(true);
  });
  it("checks missing parents, duplicate owners, wrong or missing boundaries and depth", () => {
    const d = doc();
    const s = groupSection(d, ["pump-1"], "Pump", null);
    s.boundaryPorts[0].direction = "out";
    expect(
      validateDocument(d).issues.some(
        (i) => i.code === "invalid_boundary_mapping",
      ),
    ).toBe(true);
    s.boundaryPorts = [];
    expect(
      validateDocument(d).issues.some(
        (i) => i.code === "missing_boundary_mapping",
      ),
    ).toBe(true);
    s.parentId = "missing";
    expect(
      validateDocument(d).issues.some(
        (i) => i.code === "missing_parent_section",
      ),
    ).toBe(true);
    s.parentId = null;
    syncBoundaries(d);
    let parent = s;
    for (let n = 0; n < 4; n++) {
      const next = {
        id: `level-${n}`,
        name: "Nested",
        parentId: parent.id,
        equipmentIds: [],
        boundaryPorts: [],
      };
      d.engineering.sections.push(next);
      parent = next;
    }
    expect(
      validateDocument(d).issues.some((i) => i.code === "section_depth"),
    ).toBe(true);
    d.engineering.sections[1].equipmentIds = ["pump-1"];
    expect(
      validateDocument(d).issues.some(
        (i) => i.code === "multiple_section_owners",
      ),
    ).toBe(true);
  });
  it("duplicates nested section templates and remaps internal objects, annotations and lecture references", () => {
    const d = doc();
    const root = groupSection(d, ["pump-1", "exchanger-1"], "Heating", null);
    const nested = groupSection(d, ["exchanger-1"], "Exchange", root.id);
    d.education.annotations = [
      {
        id: "a",
        kind: "callout",
        text: "Illustrative heat transfer",
        targetId: nested.id,
        x: 200,
        y: 100,
        endX: null,
        endY: null,
        visible: true,
        provenance: "conceptual",
      },
      {
        id: "position-note",
        kind: "note",
        text: "Local diagram note",
        targetId: null,
        x: 300,
        y: 100,
        endX: null,
        endY: null,
        visible: true,
        provenance: "conceptual",
      },
    ];
    d.education.steps = [
      {
        id: "step",
        title: "Heat",
        targetIds: [nested.id],
        revealIds: ["exchanger-1"],
        annotationIds: ["a"],
        notes: "Lecture",
        explorerId: "exchanger-1",
      },
    ];
    const template = sectionTemplate(d, root.id);
    expect(template.engineering.streams).toHaveLength(1);
    expect(
      template.education.annotations.some((a) => a.id === "position-note"),
    ).toBe(true);
    const ids = insertTemplate(d, template, null);
    expect(ids).toHaveLength(2);
    expect(ids).not.toContain("pump-1");
    expect(validateDocument(d).valid).toBe(true);
    const copiedStep = d.education.steps.at(-1)!;
    expect(copiedStep.explorerId).not.toBe("exchanger-1");
    expect(copiedStep.targetIds).not.toContain(nested.id);
    expect(copiedStep.annotationIds).not.toContain("a");
    expect(
      new Set(
        d.engineering.sections.flatMap((s) => s.boundaryPorts.map((p) => p.id)),
      ).size,
    ).toBe(d.engineering.sections.flatMap((s) => s.boundaryPorts).length);
  });
  it("keeps grouping, reconnecting, deletion, extraction and undo atomic", () => {
    state().setSelection(["pump-1", "exchanger-1"]);
    state().createSection("Heating");
    const section = state().document.engineering.sections[0];
    const grouped = structuredClone(state().document);
    state().setSelection(["exchanger-1"]);
    state().removeSelection();
    expect(validateDocument(state().document).valid).toBe(true);
    expect(state().document.engineering.sections[0].equipmentIds).toEqual([
      "pump-1",
    ]);
    state().undo();
    expect(state().document).toEqual(grouped);
    state().extractSection(section.id);
    expect(state().document.engineering.sections).toHaveLength(0);
    state().undo();
    expect(state().document).toEqual(grouped);
    const incoming = grouped.engineering.streams.find(
      (s) => s.target.equipmentId === "pump-1",
    )!;
    state().reconnectStream(incoming.id, "feed-1", "out", "pump-1", "in");
    expect(state().document.engineering.sections[0].boundaryPorts).toEqual(
      section.boundaryPorts,
    );
  });
  it("restores independent root/section viewport and selection even for reserved-looking IDs", () => {
    const d = doc();
    const section = groupSection(d, ["pump-1"], "Reserved", null);
    section.id = "root";
    state().replaceDocument(d);
    state().setSelection(["feed-1"]);
    state().setViewport({ x: 20, y: 30, zoom: 1.2 });
    state().enterSection("root");
    state().setSelection(["pump-1"]);
    state().setViewport({ x: 70, y: 80, zoom: 2 });
    state().enterSection(null);
    expect(state().selectionIds).toEqual(["feed-1"]);
    expect(state().viewport.x).toBe(20);
    state().enterSection("root");
    expect(state().selectionIds).toEqual(["pump-1"]);
    expect(state().viewport.x).toBe(70);
    state().extractSection("root");
    expect(state().currentSectionId).toBe(null);
  });
  it("normalizes fully populated legacy 1.0 documents with no new fields", () => {
    const old = JSON.parse(JSON.stringify(doc()));
    delete old.engineering.sections;
    delete old.education.steps;
    delete old.education.annotations;
    const reopened = parseDocument(JSON.stringify(old));
    expect(reopened.engineering.sections).toEqual([]);
    expect(reopened.education.steps).toEqual([]);
    expect(reopened.education.annotations).toEqual([]);
  });
});

describe("temporary lecture state", () => {
  it("reveals cumulatively, reverses, hides targeted annotations, and never edits engineering or saved visibility", () => {
    const d = doc();
    d.education.annotations = [
      {
        id: "a",
        kind: "note",
        text: "Heater",
        targetId: "exchanger-1",
        x: 0,
        y: 0,
        endX: null,
        endY: null,
        visible: true,
        provenance: "illustrative",
      },
    ];
    d.education.steps = [
      {
        id: "s1",
        title: "Feed",
        targetIds: ["feed-1"],
        revealIds: ["feed-1"],
        annotationIds: [],
        notes: "First",
        explorerId: null,
      },
      {
        id: "s2",
        title: "Exchange",
        targetIds: ["exchanger-1"],
        revealIds: ["exchanger-1"],
        annotationIds: ["a"],
        notes: "Second",
        explorerId: "exchanger-1",
      },
    ];
    const original = structuredClone(d);
    expect(
      presentationView(d, 0).document.engineering.equipment.some(
        (e) => e.id === "exchanger-1",
      ),
    ).toBe(false);
    expect(presentationView(d, 0).document.education.annotations).toHaveLength(
      0,
    );
    expect(presentationView(d, 1).document.education.annotations).toHaveLength(
      1,
    );
    expect(presentationView(d, 0).document.education.annotations).toHaveLength(
      0,
    );
    expect(d).toEqual(original);
  });
  it("preserves deleted targets as clear editable warnings", () => {
    const d = doc();
    d.education.steps = [
      {
        id: "s",
        title: "Deleted",
        targetIds: ["gone"],
        revealIds: [],
        annotationIds: ["missing-note"],
        notes: "",
        explorerId: null,
      },
    ];
    expect(validateDocument(d).valid).toBe(true);
    expect(
      validateDocument(d).issues.some(
        (i) => i.code === "missing_teaching_target",
      ),
    ).toBe(true);
    expect(presentationView(d, 0).missingIds).toEqual(["gone", "missing-note"]);
  });
});
