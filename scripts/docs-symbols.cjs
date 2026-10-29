// Use the editor's original vector artwork in documentation previews.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const input = JSON.parse(fs.readFileSync(0, "utf8"));
const code = ts.transpileModule(
  fs.readFileSync(
    path.join(__dirname, "../apps/web/src/lib/symbols.ts"),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
let ports = [];
const context = {
  exports: {},
  require(name) {
    if (name !== "@pfdkit/contracts") throw new Error("Unexpected dependency");
    return { equipmentPorts: () => ports };
  },
};
vm.runInNewContext(code, context);
const result = {};
for (const item of input) {
  ports = item.ports;
  const symbol = context.exports.getSymbol(
    item.type,
    item.config,
    item.symbolSet,
  );
  if (item.type === "teachingValve")
    symbol.shapes = [
      {
        tag: "path",
        attrs: { d: "M0 40H30M90 40H120M30 20L90 60V20L30 60ZM60 40V8H76" },
        fill: "none",
        stroke: true,
      },
    ];
  if (item.type === "examplePowerSource")
    symbol.shapes = [
      {
        tag: "path",
        attrs: { d: "M10 40L60 5L110 40L60 75ZM64 17L45 43H67L55 64" },
        fill: "none",
        stroke: true,
      },
    ];
  result[item.id] = symbol;
}
process.stdout.write(JSON.stringify(result));
