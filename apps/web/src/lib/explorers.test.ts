import { describe, expect, it, beforeEach } from "vitest";
import {
  exampleDocument,
  parseDocument,
  validateDocument,
  equipmentPorts,
  type Document,
} from "./contract";
import { exchangerRouting, renderExchangerSvg } from "./exchanger-geometry";
import { renderColumnSvg } from "./column-geometry";
import { explorerFor, renderEquipmentDetail } from "./explorers";
import { getPortPosition } from "./symbols";
import { diagramSvg } from "./export-svg";
import { useEditorStore } from "./editor-store";

function columnDocument(): Document {
  const document = structuredClone(exampleDocument);
  document.engineering.equipment = [
    {
      id: "col",
      type: "column",
      tag: "C-101",
      config: {
        stageCount: 12,
        feedStage: 5,
        feeds: [{ portId: "feed-two", stage: 8 }],
        sideDraws: [{ portId: "draw", stage: 3, phase: "vapor" }],
        stageProperties: [
          {
            stage: 3,
            temperatureK: null,
            pressurePa: 0,
            status: "illustrative",
          },
        ],
      },
      metadata: {},
    },
    { id: "feed", type: "feed", tag: "F", config: {}, metadata: {} },
  ];
  document.engineering.streams = [
    {
      ...structuredClone(exampleDocument.engineering.streams[0]),
      id: "stable",
      source: { equipmentId: "feed", portId: "out" },
      target: { equipmentId: "col", portId: "feed-two" },
    },
  ];
  document.presentation.nodes = {
    col: { x: 300, y: 50, metadata: {} },
    feed: { x: 20, y: 50, metadata: {} },
  };
  document.engineering.sections = [];
  document.education.annotations = [];
  document.education.steps = [];
  return document;
}

describe("shared advanced explorers", () => {
  beforeEach(() => useEditorStore.getState().replaceDocument(columnDocument()));
  it("draws supported passes, reversals and saved baffles from configuration", () => {
    const document = structuredClone(exampleDocument),
      equipment = document.engineering.equipment.find(
        (item) => item.type === "heatExchanger",
      )!;
    for (const count of [1, 2, 4, 8]) {
      equipment.config = {
        tubePasses: count,
        shellPasses: count > 1 ? 2 : 1,
        baffleCount: 6,
      };
      const svg = renderExchangerSvg(document, equipment.id);
      expect(svg.match(/data-circuit="tube" data-pass=/g)).toHaveLength(count);
      expect(svg.match(/data-baffle=/g)).toHaveLength(6);
      expect(exchangerRouting(count, "counterCurrent").tubeOut.x).toBe(
        count % 2 ? 700 : 60,
      );
    }
    equipment.config = { tubePasses: 2, flowArrangement: "crossFlow" };
    expect(validateDocument(document).valid).toBe(true);
    expect(renderExchangerSvg(document, equipment.id)).toContain(
      "routing unavailable",
    );
  });
  it("uses the same dynamic port identities and positions for validation, symbols and detail export", () => {
    const document = columnDocument(),
      column = document.engineering.equipment[0];
    expect(validateDocument(document).valid).toBe(true);
    expect(
      equipmentPorts("column", column.config).some(
        (port) => port.id === "feed-two",
      ),
    ).toBe(true);
    expect(
      getPortPosition("column", "feed-two", column.config).y,
    ).toBeGreaterThan(0);
    const svg = renderColumnSvg(document, "col");
    expect(svg.match(/data-stage=/g)).toHaveLength(12);
    expect(svg).toContain('data-feed-port="feed-two"');
    expect(svg).toContain('data-draw-port="draw"');
    expect(svg).toContain("unknown K; 0 Pa (illustrative)");
    expect(diagramSvg(document).svg).not.toContain("undefined");
    expect(
      diagramSvg(document, { target: "equipment", equipmentId: "col" }).svg,
    ).toContain("stage count excludes");
    expect(explorerFor("column")?.content.references[0].url).toContain(
      "ethz.ch",
    );
    expect(explorerFor("pump")).toBeNull();
  });
  it("rejects removed connected ports and removed stages, preserving history and unknown values", () => {
    const before = JSON.stringify(useEditorStore.getState().document);
    useEditorStore.getState().updateEquipment("col", { config: { feeds: [] } });
    expect(JSON.stringify(useEditorStore.getState().document)).toBe(before);
    expect(useEditorStore.getState().lastMessage).toContain("feed-two");
    useEditorStore
      .getState()
      .updateEquipment("col", { config: { stageCount: 6 } });
    expect(JSON.stringify(useEditorStore.getState().document)).toBe(before);
    useEditorStore.getState().updateEquipment("col", {
      config: { feeds: [{ portId: "feed-two", stage: 4 }] },
    });
    expect(useEditorStore.getState().document.engineering.streams[0].id).toBe(
      "stable",
    );
    useEditorStore.getState().undo();
    expect(JSON.stringify(useEditorStore.getState().document)).toBe(before);
    useEditorStore.getState().redo();
    expect(
      parseDocument(JSON.stringify(useEditorStore.getState().document))
        .engineering.streams[0].temperature?.value,
    ).toBeNull();
  });
  it("keeps dense feeds and annotations inspectable and treats imported text as data", () => {
    const document = columnDocument(),
      column = document.engineering.equipment[0];
    column.config.feeds = Array.from({ length: 12 }, (_, index) => ({
      portId: `feed-${index}`,
      stage: 5,
    }));
    column.tag = '<script>alert("x")</script>';
    document.education.annotations.push({
      id: "note",
      kind: "note",
      text: "Conceptual stage explanation",
      targetId: "col",
      x: 0,
      y: 0,
      endX: null,
      endY: null,
      visible: true,
      provenance: "conceptual",
    });
    const svg = renderEquipmentDetail(document, "col");
    expect(svg).toContain("F13");
    expect(svg).toContain("feed-11");
    expect(svg).toContain("[conceptual] Conceptual stage explanation");
    expect(svg).not.toContain("<script>");
  });
});
