import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DocumentImportError,
  exampleDocument,
  parseDocument,
  serializeDocument,
  validateDocument,
} from "@pfdkit/contracts";
import manifest from "../../../../examples/manifest.json";

describe("shared Python/browser document contract", () => {
  for (const fixture of manifest)
    it(`agrees with Python: ${fixture.file}`, () => {
      const text = readFileSync(
        resolve(process.cwd(), "../../examples", fixture.file),
        "utf8",
      );
      if (
        fixture.codes.includes("unsupported_version") ||
        fixture.codes.includes("schema_error")
      ) {
        expect(() => parseDocument(text)).toThrow(DocumentImportError);
        try {
          parseDocument(text);
        } catch (error) {
          expect(
            (error as DocumentImportError).issues.map((issue) => issue.code),
          ).toEqual(fixture.codes);
        }
        return;
      }
      const report = validateDocument(JSON.parse(text));
      expect(report.valid).toBe(fixture.valid);
      expect(
        [...new Set(report.issues.map((issue) => issue.code))].sort(),
      ).toEqual(fixture.codes);
      if (fixture.valid) expect(parseDocument(text)).toEqual(JSON.parse(text));
      else expect(() => parseDocument(text)).toThrow(DocumentImportError);
    });

  it("preserves all persisted fields, metadata, nulls, zero, units, layout and precision", () => {
    const original = structuredClone(exampleDocument);
    original.metadata.custom = {
      nested: [null, 0, "future"],
      attribution: "Example author",
    };
    original.engineering.equipment[1].config.vendorExtension = { mode: "demo" };
    original.engineering.streams[0].metadata.measurement = "manually entered";
    original.presentation.nodes["pump-1"] = {
      x: 123.456789012345,
      y: -20.25,
      metadata: { label: "A" },
    };
    original.education.metadata.slide = 3;
    const saved = serializeDocument(original);
    expect(parseDocument(saved)).toEqual(original);
    expect(serializeDocument(parseDocument(saved))).toBe(saved);
  });

  it("normalizes omitted defaults and preserves explicit config without mutation", () => {
    const draft = parseDocument(
      '{"id":"draft","engineering":{"equipment":[{"id":"pump","type":"pump","config":{}}]}}',
    );
    expect(draft.engineering.equipment[0].config).toEqual({});
    expect(draft.presentation.viewport.zoom).toBe(1);
    expect(draft.engineering.streams).toEqual([]);
    expect(draft.schemaVersion).toBe("1.0.0");
    expect(parseDocument(serializeDocument(draft))).toEqual(draft);
  });

  it("rejects malformed JSON, numeric strings and non-finite or unsafe numbers", () => {
    expect(() => parseDocument("{bad}")).toThrow("not valid JSON");
    for (const x of ["12", Infinity, 9007199254740992]) {
      const document = structuredClone(exampleDocument);
      document.presentation.nodes["pump-1"].x = x as number;
      expect(validateDocument(document).valid).toBe(false);
    }
  });

  it("reports a wrong unit without inventing a numeric value", () => {
    const document = structuredClone(exampleDocument);
    document.engineering.streams[0].temperature = {
      value: null,
      dimension: "temperature",
      unit: "bar",
    };
    expect(
      validateDocument(document).issues.some(
        (issue) => issue.code === "invalid_unit",
      ),
    ).toBe(true);
    expect(document.engineering.streams[0].temperature.value).toBeNull();
  });
});
