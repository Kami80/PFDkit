import { describe, expect, it } from "vitest";
import { getSymbol } from "./symbols";
import { definitions, exampleDocument } from "./contract";
import { getDiagramStyle, stylePatch } from "./styles";
import { diagramSvg } from "./export-svg";

describe("selectable equipment symbol sets", () => {
  it.each(["precision", "teaching"] as const)(
    "shows cross-flow configuration in %s",
    (style) => {
      expect(
        getSymbol("heatExchanger", { flowArrangement: "crossFlow" }, style)
          .shapes,
      ).not.toEqual(
        getSymbol("heatExchanger", { flowArrangement: "counterCurrent" }, style)
          .shapes,
      );
      expect(
        getSymbol("heatExchanger", { flowArrangement: "crossFlow" }, style)
          .ports,
      ).toEqual(getSymbol("heatExchanger", {}, style).ports);
    },
  );
  it("preserves every built-in equipment port in both styles", () => {
    expect(definitions).toHaveLength(16);
    for (const def of definitions) {
      const original = getSymbol(def.type, def.defaultConfig);
      for (const set of ["precision", "teaching"] as const) {
        const symbol = getSymbol(def.type, def.defaultConfig, set);
        expect(symbol.ports).toEqual(original.ports);
        expect(symbol.shapes.length).toBeGreaterThan(0);
      }
    }
  });
  it.each(["pump", "compressor", "heatExchanger", "column", "reactor"])(
    "preserves %s ports in both styles",
    (type) => {
      const original = getSymbol(type);
      const precision = getSymbol(type, {}, "precision");
      const teaching = getSymbol(type, {}, "teaching");
      expect(precision.ports).toEqual(original.ports);
      expect(teaching.ports).toEqual(original.ports);
      expect(precision.shapes).not.toEqual(original.shapes);
      expect(teaching.shapes).not.toEqual(original.shapes);
    },
  );
  it("retains configurable column connections and compressor variants", () => {
    const config = {
      stageCount: 12,
      feedStage: 6,
      feeds: [{ portId: "feed2", stage: 8 }],
      sideDraws: [{ portId: "draw", stage: 4, phase: "liquid" }],
    };
    expect(getSymbol("column", config, "precision").ports).toEqual(
      getSymbol("column", config, "teaching").ports,
    );
    for (const style of ["precision", "teaching"] as const)
      expect(
        getSymbol("compressor", { machineType: "reciprocating" }, style).shapes,
      ).not.toEqual(
        getSymbol("compressor", { machineType: "centrifugal" }, style).shapes,
      );
  });
  it("saves selection and uses it for SVG export", () => {
    const doc = structuredClone(exampleDocument);
    expect(getDiagramStyle(doc).symbolSet).toBe("legacy");
    doc.presentation = stylePatch(doc, { symbolSet: "precision" });
    expect(getDiagramStyle(JSON.parse(JSON.stringify(doc))).symbolSet).toBe(
      "precision",
    );
    const precision = diagramSvg(doc).svg;
    doc.presentation = stylePatch(doc, { symbolSet: "teaching" });
    const teaching = diagramSvg(doc).svg;
    expect(teaching).not.toBe(precision);
    expect(teaching).toContain("#006b80");
    doc.presentation = stylePatch(doc, { background: "#000000" });
    expect(diagramSvg(doc).svg).toContain("#74dbe4");
    expect(diagramSvg(doc).svg).toContain("#f1f5f9");
    expect(diagramSvg(doc).svg).toContain("#101a2d");
    doc.presentation = stylePatch(doc, { preset: "minimalScientific" });
    expect(diagramSvg(doc).svg).not.toContain("#74dbe4");
  });
});
