/** Original PFDkit schematics (MIT), not certified ISO/ISA symbols.
 * All artwork lives in a 120 × 80 unit viewBox. Paint comes from presentation.
 */
import { equipmentPorts } from "@pfdkit/contracts";

export const SYMBOL_WIDTH = 120;
export const SYMBOL_HEIGHT = 80;
export const NODE_WIDTH = 140;
export const NODE_HEIGHT = 140;
export const SYMBOL_OFFSET_X = 10;
export const SYMBOL_OFFSET_Y = 28;

export type Point = { x: number; y: number };
export type SymbolShape = {
  tag: "path" | "circle" | "rect" | "ellipse" | "line";
  attrs: Record<string, string | number>;
  fill: "body" | "none";
  stroke: boolean;
};
export type SymbolDefinition = {
  width: number;
  height: number;
  shapes: SymbolShape[];
  ports: Record<string, Point>;
};

const path = (d: string, fill: SymbolShape["fill"] = "none"): SymbolShape => ({
  tag: "path",
  attrs: { d },
  fill,
  stroke: true,
});
const circle = (cx: number, cy: number, r: number): SymbolShape => ({
  tag: "circle",
  attrs: { cx, cy, r },
  fill: "body",
  stroke: true,
});
const ellipse = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): SymbolShape => ({
  tag: "ellipse",
  attrs: { cx, cy, rx, ry },
  fill: "none",
  stroke: true,
});

export function getSymbol(
  type: string,
  config: Record<string, unknown> = {},
): SymbolDefinition {
  let shapes: SymbolShape[];
  switch (type) {
    case "feed":
      shapes = [path("M15 25h53l27 15-27 15H15z", "body"), path("M95 40h25")];
      break;
    case "product":
      shapes = [
        path("M25 25h53l27 15-27 15H25l12-15z", "body"),
        path("M0 40h37"),
      ];
      break;
    case "pump":
      shapes = [
        circle(60, 40, 27),
        path(
          "m40 57 38-17-38-17M43 64l-7 10h49l-8-10M87 40h33M0 40h33M60 67v13",
        ),
      ];
      break;
    case "checkValve":
      shapes = [
        path("M0 40h35M85 40h35M35 20l40 20-40 20z", "body"),
        path("M80 18v44M40 18l30-8"),
      ];
      break;
    case "pressureReliefValve":
      shapes = [
        path(
          "M60 80V55M60 55l30-15H120M45 55h30M60 55V30M60 30l-10-5 20-7-20-7 10-5M45 5h30",
        ),
      ];
      break;
    case "pressureRegulator":
      shapes = [
        path("M0 40h30M90 40h30M30 20l60 40V20L30 60z", "body"),
        path("M60 40V18M40 18a20 12 0 0 1 40 0zM100 40V8H80"),
      ];
      break;
    case "valve":
      shapes = [
        path("M0 40h30M90 40h30M30 20l60 40V20L30 60z", "body"),
        path("M60 40V10M44 10h32"),
      ];
      break;
    case "heatExchanger":
      shapes = [
        circle(60, 40, 30),
        path(
          config.flowArrangement === "crossFlow"
            ? "M0 40h120M45 20v40M60 20v40M75 20v40M60 0v10M60 70v10"
            : "M0 40h37l12-15 17 30 13-15h41M60 0v10M60 70v10",
        ),
        path("m56 5 4 5 4-5m-8 65 4 5 4-5"),
      ];
      break;
    case "separator":
      shapes =
        config.orientation === "horizontal"
          ? [
              path("M32 20h56a20 20 0 0 1 0 40H32a20 20 0 0 1 0-40z", "body"),
              path("M0 40h12M60 0v20M60 60v20M25 60v10M95 60v10"),
              path("M25 44h70"),
            ]
          : [
              path("M40 20a20 12 0 0 1 40 0v40a20 12 0 0 1-40 0z", "body"),
              path("M0 40h40M60 0v8M60 72v8M44 45h32"),
            ];
      break;
    case "tank":
      shapes =
        config.orientation === "horizontal"
          ? [
              path("M30 20h60a20 20 0 0 1 0 40H30a20 20 0 0 1 0-40z", "body"),
              ellipse(30, 40, 8, 20),
              path("M0 40h10M110 40h10M60 0v20M25 60v10M95 60v10"),
            ]
          : [
              path("M32 18v45c0 14 56 14 56 0V18", "body"),
              ellipse(60, 18, 28, 10),
              path("M0 40h32M88 40h32M60 0v8"),
              ...(config.roof === "open" ? [] : [path("M32 18 60 5l28 13")]),
            ];
      break;
    case "mixer":
      shapes = [
        path("M35 10 95 40 35 70z", "body"),
        path("M0 20h35M0 40h35M0 60h35M95 40h25"),
        ...(config.mixingMethod === "agitated"
          ? [path("M50 30v20m-6-15 12 10m-12 0 12-10")]
          : []),
      ];
      break;
    case "splitter":
      shapes = [
        path("M25 40 85 10v60z", "body"),
        path("M0 40h25M85 20h35M85 40h35M85 60h35"),
      ];
      break;
    case "column":
      shapes = [
        path("M43 15a17 10 0 0 1 34 0v50a17 10 0 0 1-34 0z", "body"),
        path("M60 0v5M60 75v5"),
        ...equipmentPorts(type, config)
          .filter((port) => port.side === "left" || port.side === "right")
          .map((port) => {
            const y = port.offset * SYMBOL_HEIGHT,
              bodyY = Math.max(15, Math.min(65, y));
            return path(
              port.side === "left"
                ? `M0 ${y}L43 ${bodyY}`
                : `M77 ${bodyY}L120 ${y}`,
            );
          }),
        path(
          config.internals === "packing"
            ? "M47 20 73 55M47 35l20 25M53 15l20 25M73 20 47 55M73 35 53 60M67 15 47 40"
            : "M44 25h25M51 35h25M44 45h25M51 55h25",
        ),
      ];
      break;
    case "reactor":
      shapes =
        config.reactorType === "plugFlow"
          ? [
              path("M20 22h80v36H20z", "body"),
              path(
                "M0 40h20M100 40h20M60 58v22M30 40h10l6-10 12 20 12-20 6 10h14",
              ),
            ]
          : [
              path("M35 22a25 13 0 0 1 50 0v36a25 13 0 0 1-50 0z", "body"),
              path("M0 40h35M85 40h35M60 5v45m-12-8 24 12m-24 0 24-12M60 71v9"),
            ];
      break;
    default:
      shapes = [path("M25 15h70v50H25z", "body")];
  }
  const ports: Record<string, Point> = {};
  for (const port of equipmentPorts(type, config)) {
    const offset = port.offset ?? 0.5;
    ports[port.id] =
      port.side === "left"
        ? { x: 0, y: offset * SYMBOL_HEIGHT }
        : port.side === "right"
          ? { x: SYMBOL_WIDTH, y: offset * SYMBOL_HEIGHT }
          : port.side === "top"
            ? { x: offset * SYMBOL_WIDTH, y: 0 }
            : { x: offset * SYMBOL_WIDTH, y: SYMBOL_HEIGHT };
  }
  return { width: SYMBOL_WIDTH, height: SYMBOL_HEIGHT, shapes, ports };
}

/** Port center in node-local document coordinates, shared by canvas and exports. */
export function getPortPosition(
  type: string,
  portId: string,
  config: Record<string, unknown> = {},
): Point {
  const port = getSymbol(type, config).ports[portId];
  if (!port) throw new Error(`Unknown port ${type}.${portId}`);
  return { x: SYMBOL_OFFSET_X + port.x, y: SYMBOL_OFFSET_Y + port.y };
}
