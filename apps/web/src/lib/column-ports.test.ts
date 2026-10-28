import { describe, expect, it } from "vitest";
import cases from "../../../../contracts/fixtures/column-ports.json";
import { equipmentPorts, exampleDocument, validateDocument } from "./contract";
import { getPortPosition, getSymbol, SYMBOL_OFFSET_Y } from "./symbols";

describe("column PFD handle layout shared with Python", () => {
  for (const fixture of cases) {
    it(fixture.name, () => {
      const document = structuredClone(exampleDocument);
      document.engineering.equipment = [
        {
          id: "column",
          type: "column",
          tag: "C-101",
          config: fixture.config,
          metadata: {},
        },
      ];
      document.engineering.streams = [];
      document.engineering.sections = [];
      document.education.steps = [];
      document.education.annotations = [];
      document.presentation.nodes = { column: { x: 0, y: 0, metadata: {} } };
      expect(validateDocument(document).valid).toBe(fixture.valid);
      if (!fixture.valid || !fixture.ports) return;
      const ports = equipmentPorts("column", fixture.config);
      expect(ports).toHaveLength(fixture.ports.length);
      for (const expected of fixture.ports) {
        const actual = ports.find((port) => port.id === expected.id)!;
        expect(actual).toMatchObject({
          id: expected.id,
          side: expected.side,
          direction: expected.direction,
          name: expected.name,
        });
        expect(actual.offset).toBeCloseTo(expected.offset, 12);
        const symbol = getSymbol("column", fixture.config);
        if (actual.side === "left" || actual.side === "right") {
          expect(symbol.ports[actual.id].y).toBeCloseTo(actual.offset * 80, 12);
          expect(
            getPortPosition("column", actual.id, fixture.config).y,
          ).toBeCloseTo(SYMBOL_OFFSET_Y + actual.offset * 80, 12);
          expect(
            symbol.shapes.some((shape) =>
              actual.side === "left"
                ? shape.attrs.d ===
                  `M0 ${actual.offset * 80}L43 ${Math.max(15, Math.min(65, actual.offset * 80))}`
                : shape.attrs.d ===
                  `M77 ${Math.max(15, Math.min(65, actual.offset * 80))}L120 ${actual.offset * 80}`,
            ),
          ).toBe(true);
        }
      }
    });
  }

  it("keeps all 13 left and 14 right centers selectable at every stage-count boundary", () => {
    for (const stageCount of [1, 2, 100]) {
      for (const stage of [1, stageCount]) {
        const feeds = Array.from({ length: 12 }, (_, index) => ({
          portId: `feed_${index}`,
          stage,
        }));
        const sideDraws = Array.from({ length: 12 }, (_, index) => ({
          portId: `draw_${index}`,
          stage,
          phase: index % 2 ? "liquid" : "vapor",
        }));
        const config = { stageCount, feedStage: stage, feeds, sideDraws };
        const ports = equipmentPorts("column", config);
        for (const [side, count] of [
          ["left", 13],
          ["right", 14],
        ] as const) {
          const offsets = ports
            .filter((port) => port.side === side)
            .map((port) => port.offset)
            .sort((a, b) => a - b);
          expect(offsets).toHaveLength(count);
          expect(offsets[0]).toBeGreaterThanOrEqual(1 / 80 - 1e-12);
          expect(offsets.at(-1)).toBeLessThanOrEqual(79 / 80 + 1e-12);
          for (let index = 1; index < offsets.length; index++) {
            expect(
              (offsets[index] - offsets[index - 1]) * 80,
            ).toBeGreaterThanOrEqual(6 - 1e-12);
          }
        }
        // Reordering form rows cannot silently change a stream's physical handle.
        expect(
          equipmentPorts("column", {
            ...config,
            feeds: [...feeds].reverse(),
            sideDraws: [...sideDraws].reverse(),
          })
            .map((port) => [port.id, port.offset])
            .sort(),
        ).toEqual(ports.map((port) => [port.id, port.offset]).sort());
      }
    }
  });

  it("preserves physical handle locations when all logical stage numbers reverse", () => {
    const top = cases.find(
      (item) => item.name === "maximum same-stage density",
    )!;
    const bottom = cases.find(
      (item) => item.name === "maximum density numbering reversed",
    )!;
    expect(
      equipmentPorts("column", top.config).map((port) => [
        port.id,
        port.offset,
      ]),
    ).toEqual(
      equipmentPorts("column", bottom.config).map((port) => [
        port.id,
        port.offset,
      ]),
    );
  });
});
