import Ajv2020 from "ajv/dist/2020";
import type { ErrorObject } from "ajv";
import { equipmentPorts, configurationErrors } from "./equipment";
import { validateHierarchy } from "./hierarchy";
export {
  equipmentPorts,
  configurationErrors,
  stageConnections,
} from "./equipment";
import schema from "../../../contracts/generated/document.schema.json";
import registryData from "../../../contracts/generated/registry.json";
import unitData from "../../../contracts/generated/units.json";
import exampleData from "../../../examples/valid-process.json";
import type {
  Document,
  Equipment,
  Quantity,
  Stream,
} from "../../../contracts/generated/document";

export type * from "../../../contracts/generated/document";
export const registry = registryData;
export const units = unitData;
export const exampleDocument = exampleData as Document;
export interface Finding {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  objectId: string | null;
  path: string;
}
export interface ValidationResult {
  valid: boolean;
  issues: Finding[];
  checksPerformed: string[];
  physicalChecksPerformed: string[];
}

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  useDefaults: true,
  coerceTypes: false,
});
const checkSchema = ajv.compile(schema);
const configAjv = new Ajv2020({
  allErrors: true,
  strict: false,
  coerceTypes: false,
});
const configChecks = new Map(
  registry.map((definition) => [
    definition.type,
    configAjv.compile(definition.configSchema),
  ]),
);
const checksPerformed = [
  "schema",
  "identities",
  "equipment_configuration",
  "references",
  "port_direction",
  "stream_kind",
  "port_cardinality",
  "units",
  "composition",
  "draft_completeness",
  "process_hierarchy",
  "teaching_references",
];

export class DocumentImportError extends Error {
  constructor(public issues: Finding[]) {
    super(issues.map((item) => item.message).join("\n"));
    this.name = "DocumentImportError";
  }
}

function finding(
  code: string,
  message: string,
  objectId: string | null = null,
  path = "",
  severity: Finding["severity"] = "error",
): Finding {
  return { code, message, objectId, path, severity };
}

function schemaIssues(errors: ErrorObject[] | null | undefined): Finding[] {
  return (errors || []).map((error) =>
    finding(
      "schema_error",
      `${error.instancePath || "/"}: ${error.message || "Invalid document"}`,
      null,
      error.instancePath,
    ),
  );
}

function finiteJson(value: unknown): boolean {
  if (typeof value === "number")
    return (
      Number.isFinite(value) &&
      (!Number.isInteger(value) || Number.isSafeInteger(value))
    );
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (Array.isArray(value)) return value.every(finiteJson);
  if (typeof value === "object") return Object.values(value).every(finiteJson);
  return false;
}

/** Fill Python default factories after validation; schema literals are filled by AJV. */
function normalize(data: Record<string, unknown>): Document {
  const defaults: Record<string, Record<string, unknown>> = {
    Document: {
      id: "",
      metadata: {},
      engineering: {},
      presentation: {},
      education: {},
    },
    Engineering: { equipment: [], streams: [], components: [], sections: [] },
    Equipment: { id: "", config: {}, metadata: {} },
    Stream: { id: "", properties: {}, metadata: {} },
    Component: { id: "", metadata: {} },
    Composition: { fractions: [] },
    Presentation: { nodes: {}, viewport: {}, metadata: {} },
    NodeLayout: { metadata: {} },
    Education: { metadata: {}, annotations: [], steps: [] },
    ProcessSection: { id: "", equipmentIds: [], boundaryPorts: [] },
    Annotation: { id: "" },
    PresentationStep: {
      id: "",
      targetIds: [],
      revealIds: [],
      annotationIds: [],
    },
  };
  type Shape = {
    $ref?: string;
    title?: string;
    properties?: Record<string, Shape>;
    items?: Shape;
    additionalProperties?: Shape | boolean;
    default?: unknown;
    anyOf?: Shape[];
  };
  const defs = schema.$defs as Record<string, Shape>;
  function fill(value: unknown, shape: Shape): unknown {
    if (shape.$ref) shape = defs[shape.$ref.split("/").at(-1)!];
    if (value === undefined && "default" in shape)
      value = structuredClone(shape.default);
    if (shape.anyOf) {
      if (value === null) return null;
      const branch = shape.anyOf.find((item) => item.$ref || item.properties);
      return branch ? fill(value, branch) : value;
    }
    if (shape.properties) {
      const object = (value ?? {}) as Record<string, unknown>;
      for (const [key, fallback] of Object.entries(
        defaults[shape.title || ""] || {},
      )) {
        if (object[key] === undefined)
          object[key] =
            key === "id" ? crypto.randomUUID() : structuredClone(fallback);
      }
      for (const [key, property] of Object.entries(shape.properties)) {
        const field = fill(object[key], property);
        if (field !== undefined) object[key] = field;
      }
      return object;
    }
    if (shape.items && Array.isArray(value))
      return value.map((item) => fill(item, shape.items!));
    if (
      shape.additionalProperties &&
      typeof shape.additionalProperties === "object" &&
      value &&
      typeof value === "object"
    ) {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          fill(item, shape.additionalProperties as Shape),
        ]),
      );
    }
    return value;
  }
  return fill(data, schema as Shape) as Document;
}

export function validateDocument(document: Document): ValidationResult {
  const issues: Finding[] = [];
  const issue = (
    code: string,
    message: string,
    objectId: string | null = null,
    path = "",
    severity: Finding["severity"] = "error",
  ) => issues.push(finding(code, message, objectId, path, severity));
  if (!finiteJson(document))
    return {
      valid: false,
      issues: [
        finding(
          "schema_error",
          "Numbers must be finite; integers must fit the JavaScript safe integer range.",
        ),
      ],
      checksPerformed: ["schema"],
      physicalChecksPerformed: [],
    };
  const candidate = structuredClone(document);
  if (!checkSchema(candidate))
    return {
      valid: false,
      issues: schemaIssues(checkSchema.errors),
      checksPerformed: ["schema"],
      physicalChecksPerformed: [],
    };
  document = normalize(candidate as unknown as Record<string, unknown>);
  const equipment = new Map(
    document.engineering.equipment.map((item) => [item.id, item]),
  );
  const components = new Set(
    document.engineering.components.map((item) => item.id),
  );
  const identities = new Set<string>();
  for (const item of [
    ...document.engineering.equipment,
    ...document.engineering.streams,
    ...document.engineering.components,
  ]) {
    if (identities.has(item.id))
      issue(
        "duplicate_id",
        "Object identifiers must be unique across the engineering document.",
        item.id,
      );
    identities.add(item.id);
  }
  const tags = new Set<string>();
  const definitions = new Map<
    string,
    { ports: ReturnType<typeof equipmentPorts> }
  >();
  for (const item of document.engineering.equipment) {
    if (item.tag && tags.has(item.tag))
      issue(
        "duplicate_tag",
        `Equipment tag '${item.tag}' is repeated.`,
        null,
        "",
        "warning",
      );
    tags.add(item.tag);
    const definition = registry.find(
      (definition) => definition.type === item.type,
    );
    if (!definition)
      issue(
        "unsupported_equipment",
        `Unsupported equipment type '${item.type}'. Install its extension before editing.`,
        item.id,
        "type",
      );
    else {
      definitions.set(item.id, {
        ...definition,
        ports: equipmentPorts(item.type, item.config),
      });
      if (!configChecks.get(item.type)!(structuredClone(item.config)))
        issue(
          "invalid_configuration",
          `Configuration for '${item.tag || item.id}' is invalid: ${ajv.errorsText(configChecks.get(item.type)!.errors)}`,
          item.id,
          "config",
        );
      for (const message of configurationErrors(item.type, item.config))
        issue(
          item.type === "heatExchanger"
            ? "unsupported_illustration"
            : "invalid_configuration",
          message,
          item.id,
          "config",
          item.type === "heatExchanger" ? "warning" : "error",
        );
    }
  }
  const counts = new Map<string, number>();
  function quantity(
    value: Quantity | null,
    expected: string | null,
    objectId: string,
    path: string,
  ) {
    if (!value) return;
    const unit = units[value.unit as keyof typeof units];
    if (!unit || unit.dimension !== value.dimension)
      issue(
        "invalid_unit",
        `Unit '${value.unit}' is unsupported or incompatible with ${value.dimension}.`,
        objectId,
        path,
      );
    if (expected && value.dimension !== expected)
      issue(
        "quantity_dimension",
        `Expected ${expected}, received ${value.dimension}.`,
        objectId,
        path,
      );
  }
  for (const stream of document.engineering.streams) {
    for (const [label, endpoint, direction] of [
      ["source", stream.source, "out"],
      ["target", stream.target, "in"],
    ] as const) {
      if (!equipment.has(endpoint.equipmentId)) {
        issue(
          "missing_equipment",
          `The ${label} equipment does not exist.`,
          stream.id,
          label,
        );
        continue;
      }
      const definition = definitions.get(endpoint.equipmentId);
      if (!definition) continue;
      const port = definition.ports.find((item) => item.id === endpoint.portId);
      if (!port) {
        issue(
          "missing_port",
          `Port '${endpoint.portId}' does not exist on the ${label} equipment.`,
          stream.id,
          label,
        );
        continue;
      }
      const key = `${endpoint.equipmentId}/${endpoint.portId}`;
      counts.set(key, (counts.get(key) || 0) + 1);
      if (port.direction !== direction)
        issue(
          "port_direction",
          `The ${label} must use an ${direction === "out" ? "outlet" : "inlet"} port.`,
          stream.id,
          label,
        );
      if (port.kind !== stream.kind)
        issue(
          "stream_kind",
          `A ${stream.kind} stream cannot connect to a ${port.kind} port.`,
          stream.id,
          label,
        );
    }
    if (
      stream.kind === "energy" &&
      (stream.flowRate !== null || stream.composition !== null)
    )
      issue(
        "energy_material_property",
        "Energy streams use properties.power and cannot contain material flow or composition.",
        stream.id,
      );
    quantity(
      stream.flowRate,
      { mass: "massFlow", molar: "molarFlow", volume: "volumeFlow" }[
        stream.flowBasis
      ],
      stream.id,
      "flowRate",
    );
    quantity(stream.temperature, "temperature", stream.id, "temperature");
    quantity(stream.pressure, "pressure", stream.id, "pressure");
    for (const [key, value] of Object.entries(stream.properties))
      quantity(
        value,
        stream.kind === "energy" && key === "power" ? "power" : null,
        stream.id,
        `properties.${key}`,
      );
    if (stream.composition) {
      const fractions = stream.composition.fractions;
      if (
        new Set(fractions.map((part) => part.componentId)).size !==
        fractions.length
      )
        issue(
          "duplicate_component",
          "A composition component can appear only once.",
          stream.id,
          "composition",
        );
      for (const part of fractions)
        if (!components.has(part.componentId))
          issue(
            "missing_component",
            `Component '${part.componentId}' does not exist.`,
            stream.id,
            "composition",
          );
      const total = fractions.reduce((sum, part) => sum + (part.value ?? 0), 0);
      const known = fractions.every((part) => part.value !== null);
      if (
        fractions.length &&
        (total > 1 + 1e-6 || (known && Math.abs(total - 1) > 1e-6))
      )
        issue(
          "composition_sum",
          `Known fractions must sum to 1; received ${total}.`,
          stream.id,
          "composition",
        );
      if (fractions.length && !known)
        issue(
          "unknown_composition",
          "Composition contains unknown fractions.",
          stream.id,
          "composition",
          "warning",
        );
    }
  }
  for (const [identity, definition] of definitions)
    for (const port of definition.ports) {
      const count = counts.get(`${identity}/${port.id}`) || 0;
      if (count > port.maxConnections)
        issue(
          "port_capacity",
          `Port '${port.id}' permits ${port.maxConnections} connection(s), received ${count}.`,
          identity,
          `ports.${port.id}`,
        );
      else if (port.required && count === 0)
        issue(
          "unconnected_port",
          `Port '${port.name}' is not connected; this is an editable draft.`,
          identity,
          `ports.${port.id}`,
          "warning",
        );
    }
  for (const identity of Object.keys(document.presentation.nodes))
    if (!equipment.has(identity))
      issue(
        "orphan_layout",
        "Layout refers to equipment that does not exist.",
        identity,
        "presentation.nodes",
      );
  issues.push(...validateHierarchy(document));
  return {
    valid: !issues.some((item) => item.severity === "error"),
    issues,
    checksPerformed,
    physicalChecksPerformed: [],
  };
}

/** Transactional import: callers replace their active state only after this succeeds. */
export function parseDocument(text: string): Document {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new DocumentImportError([
      finding(
        "json_parse",
        "The file is not valid JSON. Check its syntax and try again.",
      ),
    ]);
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new DocumentImportError([
      finding("schema_error", "The document must be a JSON object."),
    ]);
  const data = value as Record<string, unknown>;
  if (data.schemaVersion !== undefined && data.schemaVersion !== "1.0.0")
    throw new DocumentImportError([
      finding(
        "unsupported_version",
        `Document version '${String(data.schemaVersion)}' is unsupported. This editor supports 1.0.0; no migration is available.`,
      ),
    ]);
  if (!finiteJson(data))
    throw new DocumentImportError([
      finding(
        "schema_error",
        "Numbers must be finite; integers must fit the JavaScript safe integer range.",
      ),
    ]);
  if (!checkSchema(data))
    throw new DocumentImportError(schemaIssues(checkSchema.errors));
  const document = normalize(data);
  const result = validateDocument(document);
  if (!result.valid) throw new DocumentImportError(result.issues);
  return document;
}

export function serializeDocument(document: Document): string {
  const result = validateDocument(document);
  if (!result.valid) throw new DocumentImportError(result.issues);
  function sorted(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sorted);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, item]) => [key, sorted(item)]),
      );
    return value;
  }
  return JSON.stringify(sorted(document), null, 2) + "\n";
}

export type { Document, Equipment, Stream, Quantity };
