import { compile } from "json-schema-to-typescript";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const schema = JSON.parse(
  await readFile(
    new URL("contracts/generated/document.normalized.schema.json", root),
    "utf8",
  ),
);
function stripFieldTitles(value) {
  if (value && typeof value === "object") {
    if (typeof value.title === "string") delete value.title;
    for (const child of Object.values(value)) stripFieldTitles(child);
  }
}
stripFieldTitles(schema);
const result = await compile(schema, "Document", {
  bannerComment:
    "/* Generated from pfd-core. Run npm run contract:generate; do not edit. */",
  additionalProperties: false,
  style: { singleQuote: false },
});
const target = new URL("contracts/generated/document.ts", root);
if (process.argv.includes("--check")) {
  if ((await readFile(target, "utf8").catch(() => "")) !== result)
    throw new Error(`Stale generated types: ${fileURLToPath(target)}`);
  console.log("Generated TypeScript is current.");
} else {
  await writeFile(target, result, "utf8");
  console.log("TypeScript generated.");
}
