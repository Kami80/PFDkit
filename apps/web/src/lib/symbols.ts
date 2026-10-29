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
export type SymbolSet = "legacy" | "precision" | "teaching";
export type SymbolShape = {
  tag: "path" | "circle" | "rect" | "ellipse" | "line";
  attrs: Record<string, string | number>;
  fill: "body" | "none";
  stroke: boolean;
  accent?: boolean;
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
const detail = (d: string): SymbolShape => ({ ...path(d), accent: true });
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
  symbolSet: SymbolSet = "legacy",
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
    case "flowRestriction":
      shapes = [path("M0 40h55M65 40h55M55 12v18m0 20v18M65 12v18m0 20v18")];
      break;
    case "checkValve":
      shapes = [
        path("M0 40h35M85 40h35M35 20l40 20-40 20z", "body"),
        path("M80 18v44M40 18l30-8"),
      ];
      break;
    case "compressor":
      shapes =
        config.machineType === "reciprocating"
          ? [
              path("M30 18h60v44H30z", "body"),
              path("M0 40h30M90 40h30M55 18v44M55 40h25M60 62v18"),
            ]
          : [
              circle(60, 40, 30),
              path("M0 40h30M90 40h30M40 20l40 10v20L40 60zM60 70v10"),
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
  if (symbolSet !== "legacy") {
    const teaching = symbolSet === "teaching";
    switch (type) {
      case "pump":
        shapes = [
          circle(60, 40, 24),
          path("M0 40h36M84 40h36M60 64v16M44 63l-7 9h46l-7-9"),
          ...(teaching
            ? [
                detail(
                  "M60 27c-10 0-14 8-11 15l11-2 5-10M60 40c8 0 13 8 10 15l-10-5-9 3M60 40c-3-8 1-14 8-14",
                ),
              ]
            : [circle(60, 40, 6)]),
        ];
        break;
      case "compressor":
        shapes =
          config.machineType === "reciprocating"
            ? [
                path("M32 18h56v44H32z", "body"),
                path("M0 40h32M88 40h32M55 18v44M55 40h25M60 62v18"),
                ...(teaching ? [detail("M35 24h16M35 56h16")] : []),
              ]
            : [
                path("M35 17l50 11v24L35 63z", "body"),
                path("M0 40h35M85 40h35M60 58v22M46 65l-5 8h38l-4-8"),
                ...(teaching ? [detail("M46 23v34M56 25v30M66 27v26")] : []),
              ];
        break;
      case "heatExchanger":
        shapes = [
          path("M28 20h64a20 20 0 0 1 0 40H28a20 20 0 0 1 0-40z", "body"),
          path(
            config.flowArrangement === "crossFlow"
              ? "M0 40h8M112 40h8M60 0v20M60 60v20M25 17v46M95 17v46M42 24v32M54 24v32M66 24v32M78 24v32"
              : "M0 40h8M112 40h8M60 0v20M60 60v20M25 17v46M95 17v46M29 29h62M29 38h62M29 47h62",
          ),
          ...(teaching
            ? [
                detail(
                  config.flowArrangement === "crossFlow"
                    ? "M42 24v32M54 24v32M66 24v32M78 24v32"
                    : "M42 22v36M79 22v36",
                ),
              ]
            : []),
        ];
        break;
      case "column":
        shapes = [
          path("M43 15a17 10 0 0 1 34 0v50a17 10 0 0 1-34 0z", "body"),
          path("M60 0v5M60 75v5"),
          ...equipmentPorts(type, config)
            .filter((port) => port.side === "left" || port.side === "right")
            .map((port) => {
              const y = (port.offset ?? 0.5) * 80,
                bodyY = Math.max(15, Math.min(65, y));
              return path(
                port.side === "left"
                  ? `M0 ${y}L43 ${bodyY}`
                  : `M77 ${bodyY}L120 ${y}`,
              );
            }),
          (teaching ? detail : path)(
            config.internals === "packing"
              ? "M47 20l26 35M47 35l20 25M73 20L47 55M73 35L53 60"
              : teaching
                ? "M44 25h12v-3h7v3h13M44 35h12v-3h7v3h13M44 45h12v-3h7v3h13M44 55h12v-3h7v3h13"
                : "M44 25h32M44 35h32M44 45h32M44 55h32",
          ),
        ];
        break;
      case "reactor":
        shapes =
          config.reactorType === "plugFlow"
            ? [
                path("M22 22h76v36H22z", "body"),
                path(
                  "M0 40h22M98 40h22M60 58v22M32 40h8l7-10 12 20 12-20 7 10h10",
                ),
              ]
            : [
                path("M35 22a25 13 0 0 1 50 0v36a25 13 0 0 1-50 0z", "body"),
                path(
                  "M0 40h35M85 40h35M60 0v53M60 71v9M48 43l24 12M48 55l24-12",
                ),
                ...(teaching ? [detail("M30 27v30c0 18 60 18 60 0V27")] : []),
              ];
        break;
      case "feed":
        shapes = [
          path("M12 27h55l27 13-27 13H12z", "body"),
          path("M94 40h26"),
          ...(teaching ? [path("M22 34h32M22 46h32")] : []),
        ];
        break;
      case "product":
        shapes = [
          path("M26 27h51l27 13-27 13H26l10-13z", "body"),
          path("M0 40h36"),
          ...(teaching ? [path("M49 34h25M49 46h25")] : []),
        ];
        break;
      case "separator":
        shapes =
          config.orientation === "horizontal"
            ? [
                path("M32 20h56a20 20 0 0 1 0 40H32a20 20 0 0 1 0-40z", "body"),
                path("M0 40h12M60 0v20M60 60v20M27 60v10M93 60v10"),
                ...(teaching ? [path("M22 46h76")] : []),
              ]
            : [
                path("M40 20a20 12 0 0 1 40 0v40a20 12 0 0 1-40 0z", "body"),
                path("M0 40h40M60 0v8M60 72v8"),
                ...(teaching ? [path("M43 46h34")] : []),
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
        if (teaching)
          shapes.push(
            path(
              config.orientation === "horizontal" ? "M43 26h34" : "M39 55h42",
            ),
          );
        break;
      case "mixer":
        shapes = [
          path("M35 12 94 40 35 68z", "body"),
          path("M0 20h35M0 40h35M0 60h35M94 40h26"),
          ...(config.mixingMethod === "agitated"
            ? [path("M50 30v20m-6-15 12 10m-12 0 12-10")]
            : teaching
              ? [path("M44 33l10 7-10 7")]
              : []),
        ];
        break;
      case "splitter":
        shapes = [
          path("M26 40 85 12v56z", "body"),
          path("M0 40h26M85 20h35M85 40h35M85 60h35"),
          ...(teaching ? [path("M64 34l-10 6 10 6")] : []),
        ];
        break;
      case "valve":
      case "pressureRegulator":
        shapes = [
          path("M0 40h30M90 40h30M30 20l60 40V20L30 60z", "body"),
          type === "valve"
            ? path(
                teaching
                  ? "M60 40V10M44 10h32M48 6v8M72 6v8"
                  : "M60 40V10M44 10h32",
              )
            : path("M60 40V18M40 18a20 12 0 0 1 40 0zM100 40V8H80"),
        ];
        break;
      case "checkValve":
        shapes = [
          path("M0 40h35M85 40h35M35 20l40 20-40 20z", "body"),
          path(
            teaching
              ? "M80 18v44M40 18l30-8M43 29l20 11-20 11"
              : "M80 18v44M40 18l30-8",
          ),
        ];
        break;
      case "pressureReliefValve":
        shapes = [
          path(
            "M60 80V55M60 55l30-15H120M45 55h30M60 55V30M60 30l-10-5 20-7-20-7 10-5M45 5h30",
          ),
          ...(teaching ? [path("M43 50h34")] : []),
        ];
        break;
      case "flowRestriction":
        shapes = [
          path("M0 40h55M65 40h55M55 12v18m0 20v18M65 12v18m0 20v18"),
          ...(teaching ? [path("M49 19h22M49 61h22")] : []),
        ];
        break;
    }
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
