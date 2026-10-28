/* Generated from pfd-core. Run npm run contract:generate; do not edit. */

export type Dimension =
  "massFlow" | "molarFlow" | "volumeFlow" | "temperature" | "pressure" | "power" | "dimensionless";

export interface Document {
  education: Education;
  engineering: Engineering;
  id: string;
  metadata: {
    [k: string]: unknown;
  };
  presentation: Presentation;
  schemaVersion: "1.0.0";
  title: string;
}
export interface Education {
  annotations: Annotation[];
  metadata: {
    [k: string]: unknown;
  };
  notes: string;
  steps: PresentationStep[];
}
export interface Annotation {
  endX: number | null;
  endY: number | null;
  id: string;
  kind: "note" | "callout" | "arrow" | "component";
  provenance: "conceptual" | "manual" | "illustrative" | "calculated";
  targetId: string | null;
  text: string;
  visible: boolean;
  x: number;
  y: number;
}
export interface PresentationStep {
  annotationIds: string[];
  explorerId: string | null;
  id: string;
  notes: string;
  revealIds: string[];
  targetIds: string[];
  title: string;
}
export interface Engineering {
  components: Component[];
  equipment: Equipment[];
  sections: ProcessSection[];
  streams: Stream[];
}
export interface Component {
  formula: string | null;
  id: string;
  metadata: {
    [k: string]: unknown;
  };
  name: string;
}
export interface Equipment {
  config: {
    [k: string]: unknown;
  };
  id: string;
  metadata: {
    [k: string]: unknown;
  };
  tag: string;
  type: string;
}
export interface ProcessSection {
  boundaryPorts: BoundaryPort[];
  equipmentIds: string[];
  id: string;
  name: string;
  parentId: string | null;
}
export interface BoundaryPort {
  direction: "in" | "out";
  id: string;
  internalEndpoint: Endpoint;
  kind: "material" | "energy";
  streamId: string;
}
export interface Endpoint {
  equipmentId: string;
  portId: string;
}
export interface Stream {
  composition: Composition | null;
  flowBasis: "mass" | "molar" | "volume";
  flowRate: Quantity | null;
  id: string;
  kind: "material" | "energy";
  metadata: {
    [k: string]: unknown;
  };
  pressure: Quantity | null;
  properties: {
    [k: string]: Quantity;
  };
  source: Endpoint;
  tag: string;
  target: Endpoint;
  temperature: Quantity | null;
}
export interface Composition {
  basis: "mole" | "mass";
  fractions: ComponentFraction[];
}
export interface ComponentFraction {
  componentId: string;
  value: number | null;
}
export interface Quantity {
  dimension: Dimension;
  unit: string;
  value: number | null;
}
export interface Presentation {
  metadata: {
    [k: string]: unknown;
  };
  nodes: {
    [k: string]: NodeLayout;
  };
  viewport: Viewport;
}
export interface NodeLayout {
  metadata: {
    [k: string]: unknown;
  };
  x: number;
  y: number;
}
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}
