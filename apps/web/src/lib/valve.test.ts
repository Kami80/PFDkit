import { describe, expect, it } from "vitest";
import { getSymbol } from "./symbols";

describe("built-in valve", () => {
  it.each(["checkValve", "pressureReliefValve", "pressureRegulator"])(
    "provides distinct artwork and stable ports for %s",
    (type) => {
      const symbol = getSymbol(type);
      expect(symbol.ports.in).toEqual(
        type === "pressureReliefValve" ? { x: 60, y: 80 } : { x: 0, y: 40 },
      );
      expect(symbol.ports.out).toEqual({ x: 120, y: 40 });
      expect(symbol.shapes.map((shape) => shape.attrs.d).join()).not.toBe(
        getSymbol("valve")
          .shapes.map((shape) => shape.attrs.d)
          .join(),
      );
    },
  );
  it("uses a valve glyph and stable material connection points", () => {
    const symbol = getSymbol("valve");
    expect(symbol.ports.in).toEqual({ x: 0, y: 40 });
    expect(symbol.ports.out).toEqual({ x: 120, y: 40 });
    expect(
      symbol.shapes.some((shape) => String(shape.attrs.d).includes("60 40V20")),
    ).toBe(true);
  });
});
