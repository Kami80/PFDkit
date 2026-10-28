import { describe, expect, it } from "vitest";
import { getSymbol } from "./symbols";

describe("built-in valve", () => {
  it("uses a valve glyph and stable material connection points", () => {
    const symbol = getSymbol("valve");
    expect(symbol.ports.in).toEqual({ x: 0, y: 40 });
    expect(symbol.ports.out).toEqual({ x: 120, y: 40 });
    expect(
      symbol.shapes.some((shape) => String(shape.attrs.d).includes("60 40V20")),
    ).toBe(true);
  });
});
