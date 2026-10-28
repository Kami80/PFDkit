import { describe, expect, it } from "vitest";
import { getSymbol } from "./symbols";
import { exampleDocument, validateDocument } from "./contract";

describe("restriction and compressor", () => {
  it.each(["flowRestriction", "compressor"])(
    "keeps stable material ports for %s",
    (type) => {
      const symbol = getSymbol(type);
      expect(symbol.ports.in).toEqual({ x: 0, y: 40 });
      expect(symbol.ports.out).toEqual({ x: 120, y: 40 });
    },
  );
  it("provides distinct compressor variants and shaft-power geometry", () => {
    const centrifugal = getSymbol("compressor", { machineType: "centrifugal" });
    const reciprocating = getSymbol("compressor", {
      machineType: "reciprocating",
    });
    expect(centrifugal.shapes).not.toEqual(reciprocating.shapes);
    expect(centrifugal.ports).toEqual(reciprocating.ports);
    expect(centrifugal.ports.power).toEqual({ x: 60, y: 80 });
  });
  it("enforces generated configuration constraints", () => {
    const configErrors = (type: string, config: Record<string, unknown>) => {
      const doc = structuredClone(exampleDocument);
      doc.engineering.equipment[0].type = type;
      doc.engineering.equipment[0].config = config;
      return validateDocument(doc).issues.filter(
        (issue) => issue.severity === "error",
      );
    };
    expect(
      configErrors("compressor", { isentropicEfficiency: 1.1 }).length,
    ).toBeGreaterThan(0);
    expect(
      configErrors("flowRestriction", { boreDiameterM: 0 }).length,
    ).toBeGreaterThan(0);
    expect(configErrors("flowRestriction", { pressureDropPa: 0 })).toEqual([]);
    expect(
      configErrors("compressor", {
        machineType: "reciprocating",
        outletPressurePa: null,
      }),
    ).toEqual([]);
  });
});
