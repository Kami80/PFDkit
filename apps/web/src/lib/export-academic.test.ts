import { describe, expect, it } from "vitest";
import {
  academicSvg,
  pageDimensions,
  minimumPrintFontSize,
  pdfCompatibleSvg,
  pdfText,
  PAGE_PRESETS,
} from "./export-academic";
import { diagramSvg } from "./export-svg";
import { exampleDocument, parseDocument, validateDocument } from "./contract";
import { getDiagramStyle, resolveObjectStyle, stylePatch } from "./styles";
import distillation from "../../../../examples/teaching-distillation.json";
import fermentation from "../../../../examples/teaching-fermentation.json";
import water from "../../../../examples/teaching-water-treatment.json";
import hydrogen from "../../../../examples/teaching-hydrogen-production.json";
import network from "../../../../examples/teaching-heat-exchanger-network.json";

describe("academic scenes and reviewed examples", () => {
  it("fits every physical preset inside margins without stretching or losing scene origins", () => {
    const figure = diagramSvg(structuredClone(exampleDocument));
    for (const preset of Object.keys(
      PAGE_PRESETS,
    ) as (keyof typeof PAGE_PRESETS)[]) {
      const options = { preset, margin: 18, width: 500, height: 300 };
      const page = pageDimensions(figure, options),
        exported = academicSvg(figure, options);
      expect(page.x).toBeGreaterThanOrEqual(0);
      expect(page.y).toBeGreaterThanOrEqual(0);
      expect(page.x + figure.width * page.scale).toBeLessThanOrEqual(
        page.width + 0.001,
      );
      expect(page.y + figure.height * page.scale).toBeLessThanOrEqual(
        page.height + 0.001,
      );
      expect(exported.width).toBe(page.width);
      expect(exported.height).toBe(page.height);
      if (preset !== "drawing")
        expect(exported.svg).toContain(
          `translate(${-figure.bounds.x} ${-figure.bounds.y})`,
        );
    }
    expect(() =>
      pageDimensions(figure, {
        preset: "custom",
        width: NaN,
        height: 300,
        margin: 10,
      }),
    ).toThrow("Page size");
    expect(() =>
      pageDimensions(figure, { preset: "scientific", margin: 100 }),
    ).toThrow("margins");
  });
  it("preserves transparent pages, visible annotations, section scope and escaped text", () => {
    const document = parseDocument(JSON.stringify(distillation));
    document.engineering.sections = [
      {
        id: "section",
        name: "Column section",
        parentId: null,
        equipmentIds: ["d-column"],
        boundaryPorts: document.engineering.streams.map((stream, index) => ({
          id: `boundary-${index}`,
          streamId: stream.id,
          internalEndpoint:
            stream.source.equipmentId === "d-column"
              ? stream.source
              : stream.target,
          direction: stream.source.equipmentId === "d-column" ? "out" : "in",
          kind: "material",
        })),
      },
    ];
    document.education.annotations.push({
      id: "far-away",
      targetId: null,
      kind: "note",
      text: "UNRELATED FAR NOTE",
      x: 100000,
      y: 100000,
      endX: null,
      endY: null,
      visible: true,
      provenance: "conceptual",
    });
    const selected = diagramSvg(document, {
      target: "selection",
      selectionIds: ["section"],
      transparent: true,
    });
    expect(selected.svg).toContain("C-201");
    expect(selected.svg).not.toContain("UNRELATED FAR NOTE");
    expect(selected.svg).toContain("[conceptual]");
    const hidden = diagramSvg(document, {
      target: "section",
      sectionId: "section",
      includeAnnotations: false,
    });
    expect(hidden.svg).not.toContain("data-annotation-id");
    expect(
      academicSvg(selected, { preset: "letter", margin: 24, transparent: true })
        .svg,
    ).not.toContain('<rect width="612"');
  });
  it("uses deliberate PDF font handling and rejects unsupported glyphs instead of losing text", () => {
    expect(pdfText("Temperature 25 °C → outlet — entered")).toBe(
      "Temperature 25 °C -> outlet  -  entered",
    );
    expect(pdfText("Café: 0 bar")).toBe("Café: 0 bar");
    expect(() => pdfText("فشار")).toThrow("Export SVG or PNG");
    expect(() => pdfText("ΔT")).toThrow("U+394");
  });
  it("keeps stream labels filled for PDF without changing shared SVG halos or stream strokes", () => {
    const figure = diagramSvg(structuredClone(exampleDocument));
    expect(figure.svg).toContain('paint-order="stroke"');
    const compatible = pdfCompatibleSvg(figure.svg);
    expect(compatible).not.toContain('paint-order="stroke"');
    const labels = Array.from(
      compatible.matchAll(/<text\b[^>]*>S-00[123]<\/text>/g),
    );
    expect(labels).toHaveLength(3);
    for (const [label] of labels) {
      expect(label).toContain('stroke="none"');
      expect(label).toMatch(/fill="#[0-9a-f]{6}"/i);
      expect(label).not.toContain("stroke-width");
    }
    expect(compatible).toContain('marker-end="url(#arrow-stream-0)"');
    expect(figure.svg).toContain('stroke-width="4" paint-order="stroke"');
    expect(
      pdfCompatibleSvg(
        '<text stroke="white"><tspan stroke="white" fill="black">Label</tspan></text>',
      ),
    ).toBe(
      '<text stroke="none"><tspan fill="black" stroke="none">Label</tspan></text>',
    );
  });
  it("estimates physical label size after fitting a large scene to paper", () => {
    const figure = {
      svg: '<svg><g font-size="12"><text font-size="18">Title</text></g></svg>',
      width: 2000,
      height: 1000,
      bounds: { x: 0, y: 0, width: 2000, height: 1000 },
    };
    expect(
      minimumPrintFontSize(figure, { preset: "drawing", margin: 24 }),
    ).toBe(12);
    expect(
      minimumPrintFontSize(figure, { preset: "a4", margin: 24 }),
    ).toBeCloseTo(3.283656);
    expect(
      minimumPrintFontSize(
        { ...figure, svg: "<svg/>" },
        { preset: "letter", margin: 24 },
      ),
    ).toBeNull();
  });
  it("only draws annotation connectors with a distinct explicit endpoint", () => {
    const document = structuredClone(exampleDocument);
    document.education.annotations = [
      {
        id: "callout",
        targetId: null,
        kind: "callout",
        text: "Explain equipment",
        x: 40,
        y: 40,
        endX: null,
        endY: null,
        visible: true,
        provenance: "conceptual",
      },
    ];
    for (const endpoint of [
      { endX: null, endY: null },
      { endX: 80, endY: null },
      { endX: 40, endY: 40 },
    ]) {
      Object.assign(document.education.annotations[0], endpoint);
      expect(diagramSvg(document).svg).not.toContain('id="annotation-arrow"');
    }
    Object.assign(document.education.annotations[0], { endX: 180, endY: 90 });
    expect(diagramSvg(document).svg).toContain('d="M40 40L180 90"');
    expect(diagramSvg(document).svg).toContain(
      'marker-end="url(#annotation-arrow)"',
    );
  });
  it("keeps all five lessons valid, attributed, inspectable and explicit about unknown measurements", () => {
    for (const fixture of [
      distillation,
      fermentation,
      water,
      hydrogen,
      network,
    ]) {
      const document = parseDocument(JSON.stringify(fixture));
      expect(validateDocument(document).valid).toBe(true);
      expect(document.metadata.attribution).toMatchObject({
        license: "MIT",
        creator: "PFDkit contributors",
      });
      expect(document.metadata.references).not.toHaveLength(0);
      expect(document.education.steps).toHaveLength(2);
      expect(document.engineering.streams[0].temperature).toMatchObject({
        value: 25,
        unit: "degC",
      });
      expect(document.engineering.streams[0].metadata).toMatchObject({
        valueStatus: "illustrative",
      });
      expect(
        String(document.engineering.streams[0].metadata.explanation),
      ).toContain("not measured or calculated");
      expect(
        document.education.annotations.some(
          (annotation) =>
            annotation.visible &&
            annotation.provenance === "illustrative" &&
            annotation.text.includes("25 degC"),
        ),
      ).toBe(true);
      expect(
        document.engineering.streams
          .slice(1)
          .every((stream) => stream.temperature?.value === null),
      ).toBe(true);
      expect(diagramSvg(document).svg).not.toContain("undefined");
    }
  });
  it("adds scientific and presentation themes while retaining object overrides", () => {
    const document = structuredClone(exampleDocument);
    document.presentation.metadata = {
      style: { preset: "minimalScientific" },
      objectStyles: { "pump-1": { stroke: "#123456", fontSize: 16 } },
    };
    expect(getDiagramStyle(document).lineWidth).toBe(1.2);
    expect(resolveObjectStyle(document, "feed-1", "feed").stroke).toBe(
      "#111111",
    );
    document.presentation = stylePatch(document, { preset: "presentation" });
    expect(resolveObjectStyle(document, "pump-1", "pump").stroke).toBe(
      "#123456",
    );
    expect(resolveObjectStyle(document, "pump-1", "pump").fontSize).toBe(16);
    expect(resolveObjectStyle(document, "material", "energy").dasharray).toBe(
      "7 4",
    );
  });
});
