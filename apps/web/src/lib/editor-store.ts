"use client";
import { create } from "zustand";
import { equipmentPorts } from "@pfdkit/contracts";
import {
  groupSection,
  extractSection,
  syncBoundaries,
  sectionTemplate,
  insertTemplate,
} from "./hierarchy";
import {
  definitions,
  exampleDocument,
  validateDocument,
  type Document,
  type Equipment,
  type Stream,
} from "@/lib/contract";

export type Selection = { kind: "equipment" | "stream"; id: string } | null;
type HistoryEntry = { document: Document; label: string };
type Clipboard = {
  equipment: Equipment[];
  streams: Stream[];
  nodes: Document["presentation"]["nodes"];
  components: Document["engineering"]["components"];
  styles: Record<string, unknown>;
  count: number;
};
export type EditorStore = {
  document: Document;
  selection: Selection;
  selectionIds: string[];
  lastMessage: string;
  past: HistoryEntry[];
  future: HistoryEntry[];
  transaction: { before: Document; label: string } | null;
  revision: number;
  openGeneration: number;
  clipboard: Clipboard | null;
  explorerId: string | null;
  viewport: { x: number; y: number; zoom: number };
  snapEnabled: boolean;
  currentSectionId: string | null;
  sectionContexts: Record<
    string,
    { viewport: { x: number; y: number; zoom: number }; selectionIds: string[] }
  >;
  enterSection: (id: string | null) => void;
  createSection: (name: string) => void;
  extractSection: (id: string) => void;
  duplicateSection: (id: string) => void;
  insertSectionTemplate: (document: Document) => void;
  updateEducation: (patch: Partial<Document["education"]>) => void;
  replaceDocument: (document: Document) => void;
  setTitle: (title: string) => void;
  select: (selection: Selection, additive?: boolean) => void;
  setSelection: (ids: string[]) => void;
  beginTransaction: (label?: string) => void;
  commitTransaction: () => void;
  cancelTransaction: () => void;
  undo: () => void;
  redo: () => void;
  addEquipment: (type: string, x?: number, y?: number) => void;
  moveEquipment: (id: string, x: number, y: number) => void;
  moveSelection: (dx: number, dy: number) => void;
  updateEquipment: (
    id: string,
    patch: Partial<Pick<Equipment, "tag" | "config">>,
  ) => void;
  updateStream: (id: string, patch: Partial<Stream>) => void;
  updatePresentation: (patch: Partial<Document["presentation"]>) => void;
  setObjectStyle: (ids: string[], patch: Record<string, unknown>) => void;
  canConnect: (
    source: string,
    sourcePort: string,
    target: string,
    targetPort: string,
  ) => boolean;
  connect: (
    source: string,
    sourcePort: string,
    target: string,
    targetPort: string,
  ) => void;
  canReconnect: (
    id: string,
    source: string,
    sourcePort: string,
    target: string,
    targetPort: string,
  ) => boolean;
  reconnectStream: (
    id: string,
    source: string,
    sourcePort: string,
    target: string,
    targetPort: string,
  ) => void;
  removeSelection: () => void;
  removeObjects: (nodes: string[], edges: string[]) => void;
  copySelection: () => void;
  paste: () => void;
  duplicateSelection: () => void;
  openExplorer: (id: string) => void;
  closeExplorer: () => void;
  setViewport: (viewport: { x: number; y: number; zoom: number }) => void;
  setSnapEnabled: (enabled: boolean) => void;
  notify: (message: string) => void;
};
const clone = <T>(value: T): T => structuredClone(value);
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const idsOf = (document: Document) =>
  new Set(
    [...document.engineering.equipment, ...document.engineering.streams].map(
      (item) => item.id,
    ),
  );
const selectionFor = (document: Document, id: string | undefined): Selection =>
  id
    ? {
        kind: document.engineering.equipment.some((item) => item.id === id)
          ? "equipment"
          : "stream",
        id,
      }
    : null;
const history = (entries: HistoryEntry[], entry: HistoryEntry) =>
  [...entries, entry].slice(-100);

export function makeStream(
  document: Document,
  source: string,
  sourcePort: string,
  target: string,
  targetPort: string,
): Stream {
  const equipment = document.engineering.equipment.find(
    (item) => item.id === source,
  );
  const port = equipment
    ? equipmentPorts(equipment.type, equipment.config).find(
        (item) => item.id === sourcePort,
      )
    : undefined;
  const used = new Set(document.engineering.streams.map((item) => item.tag));
  let number = 1;
  while (used.has(`S-${String(number).padStart(3, "0")}`)) number++;
  return {
    id: crypto.randomUUID(),
    tag: `S-${String(number).padStart(3, "0")}`,
    kind: port?.kind === "energy" ? "energy" : "material",
    source: { equipmentId: source, portId: sourcePort },
    target: { equipmentId: target, portId: targetPort },
    flowBasis: "mass",
    flowRate: null,
    temperature: null,
    pressure: null,
    composition: null,
    properties: {},
    metadata: {},
  };
}

export const useEditorStore = create<EditorStore>((set, get) => {
  const commit = (document: Document, label = "Edit properties") => {
    syncBoundaries(document);
    const result = validateDocument(document);
    if (!result.valid) {
      set({
        lastMessage: result.issues
          .filter((issue) => issue.severity === "error")
          .map((issue) => issue.message)
          .join(" "),
      });
      return false;
    }
    const state = get();
    if (equal(document, state.document)) return true;
    set({
      document,
      past: state.transaction
        ? state.past
        : history(state.past, { document: clone(state.document), label }),
      future: state.transaction ? state.future : [],
      revision: state.revision + 1,
      lastMessage: label,
    });
    return true;
  };
  const setSelection = (ids: string[]) => {
    const document = get().document;
    const valid = idsOf(document);
    const selectionIds = [...new Set(ids.filter((id) => valid.has(id)))];
    set({
      selectionIds,
      selection: selectionFor(document, selectionIds.at(-1)),
    });
  };
  const prune = (document: Document) => {
    const selectionIds = get().selectionIds.filter((id) =>
      idsOf(document).has(id),
    );
    return {
      selectionIds,
      selection: selectionFor(document, selectionIds.at(-1)),
      explorerId: document.engineering.equipment.some(
        (item) => item.id === get().explorerId,
      )
        ? get().explorerId
        : null,
      currentSectionId: document.engineering.sections?.some(
        (s) => s.id === get().currentSectionId,
      )
        ? get().currentSectionId
        : null,
    };
  };
  const removeObjects = (nodes: string[], edges: string[]) => {
    const document = clone(get().document);
    const removed = new Set([...nodes, ...edges]);
    document.engineering.equipment = document.engineering.equipment.filter(
      (item) => !nodes.includes(item.id),
    );
    document.engineering.streams = document.engineering.streams.filter(
      (item) => {
        const remove =
          edges.includes(item.id) ||
          nodes.includes(item.source.equipmentId) ||
          nodes.includes(item.target.equipmentId);
        if (remove) removed.add(item.id);
        return !remove;
      },
    );
    nodes.forEach((id) => delete document.presentation.nodes[id]);
    if (Object.hasOwn(document.presentation.metadata, "objectStyles"))
      document.presentation.metadata.objectStyles = Object.fromEntries(
        Object.entries(
          record(document.presentation.metadata.objectStyles),
        ).filter(([id]) => !removed.has(id)),
      );
    if (commit(document, "Delete selection and attached streams"))
      set(prune(document));
  };
  const reconnected = (
    id: string,
    source: string,
    sourcePort: string,
    target: string,
    targetPort: string,
  ) => {
    const document = clone(get().document);
    const stream = document.engineering.streams.find((item) => item.id === id);
    if (!stream) return null;
    stream.source = { equipmentId: source, portId: sourcePort };
    stream.target = { equipmentId: target, portId: targetPort };
    return document;
  };
  return {
    document: clone(exampleDocument),
    selection: null,
    selectionIds: [],
    lastMessage: "Example loaded. Select equipment or a stream to inspect it.",
    past: [],
    future: [],
    transaction: null,
    revision: 0,
    openGeneration: 0,
    clipboard: null,
    explorerId: null,
    viewport: { x: 0, y: 0, zoom: 1 },
    snapEnabled: true,
    currentSectionId: null,
    sectionContexts: {},
    enterSection(id) {
      get().commitTransaction();
      const state = get();
      if (
        id !== null &&
        !state.document.engineering.sections.some((s) => s.id === id)
      )
        return;
      const contexts = {
        ...state.sectionContexts,
        [state.currentSectionId === null
          ? "root"
          : `section:${state.currentSectionId}`]: {
          viewport: clone(state.viewport),
          selectionIds: [...state.selectionIds],
        },
      };
      const key = id === null ? "root" : `section:${id}`;
      const saved = Object.hasOwn(contexts, key) ? contexts[key] : undefined;
      set({
        currentSectionId: id,
        sectionContexts: contexts,
        viewport: saved?.viewport ?? { x: 0, y: 0, zoom: 1 },
        explorerId: null,
      });
      setSelection(saved?.selectionIds ?? []);
    },
    createSection(name) {
      const document = clone(get().document);
      try {
        const section = groupSection(
          document,
          get().selectionIds,
          name,
          get().currentSectionId,
        );
        if (commit(document, "Create process section"))
          set({
            lastMessage: `Created ${section.name}. Open it in Process sections.`,
          });
      } catch (error) {
        set({
          lastMessage:
            error instanceof Error ? error.message : "Could not group section.",
        });
      }
    },
    extractSection(id) {
      const document = clone(get().document);
      const parentId =
        document.engineering.sections.find((s) => s.id === id)?.parentId ??
        null;
      extractSection(document, id);
      if (commit(document, "Extract process section")) {
        if (get().currentSectionId === id) get().enterSection(parentId);
        set(prune(document));
      }
    },
    duplicateSection(id) {
      if (!get().document.engineering.sections.some((s) => s.id === id)) return;
      const template = sectionTemplate(get().document, id);
      const document = clone(get().document);
      const parent =
        document.engineering.sections.find((s) => s.id === id)?.parentId ??
        null;
      const ids = insertTemplate(document, template, parent);
      if (commit(document, "Duplicate process section")) setSelection(ids);
    },
    insertSectionTemplate(template) {
      const document = clone(get().document);
      try {
        const ids = insertTemplate(document, template, get().currentSectionId);
        if (commit(document, "Insert process section template"))
          setSelection(ids);
      } catch (error) {
        set({
          lastMessage:
            error instanceof Error
              ? error.message
              : "Could not insert template.",
        });
      }
    },
    updateEducation(patch) {
      const document = clone(get().document);
      document.education = { ...document.education, ...clone(patch) };
      commit(document, "Edit teaching content");
    },
    replaceDocument(document) {
      const result = validateDocument(document);
      if (!result.valid) {
        set({
          lastMessage: result.issues
            .filter((item) => item.severity === "error")
            .map((item) => item.message)
            .join(" "),
        });
        return;
      }
      set({
        document: clone(document),
        selection: null,
        selectionIds: [],
        past: [],
        future: [],
        transaction: null,
        explorerId: null,
        currentSectionId: null,
        sectionContexts: {},
        revision: get().revision + 1,
        openGeneration: get().openGeneration + 1,
        lastMessage: "Document opened successfully.",
      });
    },
    setTitle(title) {
      const document = clone(get().document);
      document.title = title;
      commit(document, "Rename document");
    },
    select(selection, additive = false) {
      if (!selection) {
        setSelection([]);
        return;
      }
      const ids = get().selectionIds;
      setSelection(
        additive
          ? ids.includes(selection.id)
            ? ids.filter((id) => id !== selection.id)
            : [...ids, selection.id]
          : [selection.id],
      );
    },
    setSelection,
    beginTransaction(label = "Edit properties") {
      if (!get().transaction)
        set({ transaction: { before: clone(get().document), label } });
    },
    commitTransaction() {
      const state = get();
      if (!state.transaction) return;
      const changed = !equal(state.document, state.transaction.before);
      set({
        transaction: null,
        ...(changed
          ? {
              past: history(state.past, {
                document: state.transaction.before,
                label: state.transaction.label,
              }),
              future: [],
            }
          : {}),
      });
    },
    cancelTransaction() {
      const state = get();
      if (!state.transaction) return;
      const document = state.transaction.before;
      set({
        document,
        transaction: null,
        revision: state.revision + 1,
        lastMessage: "Edit canceled.",
        ...prune(document),
      });
    },
    undo() {
      get().commitTransaction();
      const state = get();
      const entry = state.past.at(-1);
      if (!entry) return;
      const document = clone(entry.document);
      set({
        document,
        past: state.past.slice(0, -1),
        future: history(state.future, {
          document: clone(state.document),
          label: entry.label,
        }),
        revision: state.revision + 1,
        lastMessage: `Undo: ${entry.label}`,
        ...prune(document),
      });
    },
    redo() {
      get().commitTransaction();
      const state = get();
      const entry = state.future.at(-1);
      if (!entry) return;
      const document = clone(entry.document);
      set({
        document,
        future: state.future.slice(0, -1),
        past: history(state.past, {
          document: clone(state.document),
          label: entry.label,
        }),
        revision: state.revision + 1,
        lastMessage: `Redo: ${entry.label}`,
        ...prune(document),
      });
    },
    addEquipment(type, x, y) {
      const definition = definitions.find((item) => item.type === type);
      if (!definition) return;
      const document = clone(get().document);
      const id = crypto.randomUUID();
      const used = new Set(
        document.engineering.equipment.map((item) => item.tag),
      );
      let number = 1;
      while (
        used.has(`${definition.tagPrefix}-${String(number).padStart(3, "0")}`)
      )
        number++;
      document.engineering.equipment.push({
        id,
        type,
        tag: `${definition.tagPrefix}-${String(number).padStart(3, "0")}`,
        config: clone(definition.defaultConfig),
        metadata: {},
      });
      document.engineering.sections
        ?.find((s) => s.id === get().currentSectionId)
        ?.equipmentIds.push(id);
      document.presentation.nodes = {
        ...document.presentation.nodes,
        [id]: {
          x: x ?? 80 + (document.engineering.equipment.length % 4) * 180,
          y:
            y ??
            320 + Math.floor(document.engineering.equipment.length / 4) * 160,
          metadata: {},
        },
      };
      if (commit(document, `Add ${definition.name}`)) setSelection([id]);
    },
    moveEquipment(id, x, y) {
      const document = clone(get().document);
      if (!document.engineering.equipment.some((item) => item.id === id))
        return;
      document.presentation.nodes = {
        ...document.presentation.nodes,
        [id]: {
          ...(Object.hasOwn(document.presentation.nodes, id)
            ? document.presentation.nodes[id]
            : { metadata: {} }),
          x,
          y,
        },
      };
      commit(document, "Move equipment");
    },
    moveSelection(dx, dy) {
      const document = clone(get().document);
      for (const item of document.engineering.equipment.filter((item) =>
        get().selectionIds.includes(item.id),
      )) {
        const position = Object.hasOwn(document.presentation.nodes, item.id)
          ? document.presentation.nodes[item.id]
          : { x: 0, y: 0, metadata: {} };
        document.presentation.nodes = {
          ...document.presentation.nodes,
          [item.id]: { ...position, x: position.x + dx, y: position.y + dy },
        };
      }
      commit(document, "Move selection");
    },
    updateEquipment(id, patch) {
      const document = clone(get().document);
      const item = document.engineering.equipment.find(
        (item) => item.id === id,
      );
      if (!item) return;
      if (patch.tag !== undefined) item.tag = patch.tag;
      if (patch.config !== undefined)
        item.config = { ...item.config, ...patch.config };
      commit(document);
    },
    updateStream(id, patch) {
      const document = clone(get().document);
      const item = document.engineering.streams.find((item) => item.id === id);
      if (item) {
        Object.assign(item, patch);
        commit(document);
      }
    },
    updatePresentation(patch) {
      const document = clone(get().document);
      document.presentation = {
        ...document.presentation,
        ...clone(patch),
        metadata: {
          ...document.presentation.metadata,
          ...clone(patch.metadata ?? {}),
        },
      };
      commit(document, "Edit diagram style");
    },
    setObjectStyle(ids, patch) {
      const document = clone(get().document);
      const styles = record(document.presentation.metadata.objectStyles);
      const valid = idsOf(document);
      const next = { ...styles };
      for (const id of ids.filter((id) => valid.has(id))) {
        if (!Object.keys(patch).length) delete next[id];
        else
          Object.defineProperty(next, id, {
            value: {
              ...record(Object.hasOwn(styles, id) ? styles[id] : {}),
              ...clone(patch),
            },
            enumerable: true,
            writable: true,
            configurable: true,
          });
      }
      document.presentation.metadata.objectStyles = next;
      commit(document, "Style selection");
    },
    canConnect(source, sourcePort, target, targetPort) {
      const document = clone(get().document);
      document.engineering.streams.push(
        makeStream(document, source, sourcePort, target, targetPort),
      );
      return validateDocument(document).valid;
    },
    connect(source, sourcePort, target, targetPort) {
      const document = clone(get().document);
      const stream = makeStream(
        document,
        source,
        sourcePort,
        target,
        targetPort,
      );
      document.engineering.streams.push(stream);
      if (commit(document, "Connect stream")) setSelection([stream.id]);
    },
    canReconnect(id, source, sourcePort, target, targetPort) {
      const document = reconnected(id, source, sourcePort, target, targetPort);
      return document !== null && validateDocument(document).valid;
    },
    reconnectStream(id, source, sourcePort, target, targetPort) {
      const document = reconnected(id, source, sourcePort, target, targetPort);
      if (document && commit(document, "Reconnect stream")) setSelection([id]);
    },
    removeSelection() {
      const selected = get().selectionIds;
      removeObjects(
        get()
          .document.engineering.equipment.filter((item) =>
            selected.includes(item.id),
          )
          .map((item) => item.id),
        get()
          .document.engineering.streams.filter((item) =>
            selected.includes(item.id),
          )
          .map((item) => item.id),
      );
    },
    removeObjects,
    copySelection() {
      const document = get().document;
      const selected = new Set(get().selectionIds);
      for (const stream of document.engineering.streams.filter((item) =>
        selected.has(item.id),
      )) {
        selected.add(stream.source.equipmentId);
        selected.add(stream.target.equipmentId);
      }
      const equipment = document.engineering.equipment.filter((item) =>
        selected.has(item.id),
      );
      const equipmentIds = new Set(equipment.map((item) => item.id));
      const streams = document.engineering.streams.filter(
        (item) =>
          equipmentIds.has(item.source.equipmentId) &&
          equipmentIds.has(item.target.equipmentId),
      );
      if (!equipment.length) {
        set({ lastMessage: "Select equipment or a stream to copy." });
        return;
      }
      const copiedIds = new Set(
        [...equipment, ...streams].map((item) => item.id),
      );
      const components = document.engineering.components.filter((component) =>
        streams.some((stream) =>
          stream.composition?.fractions.some(
            (part) => part.componentId === component.id,
          ),
        ),
      );
      set({
        clipboard: clone({
          equipment,
          streams,
          components,
          nodes: Object.fromEntries(
            Object.entries(document.presentation.nodes).filter(([id]) =>
              equipmentIds.has(id),
            ),
          ),
          styles: Object.fromEntries(
            Object.entries(
              record(document.presentation.metadata.objectStyles),
            ).filter(([id]) => copiedIds.has(id)),
          ),
          count: 0,
        }),
        lastMessage: `Copied ${equipment.length} equipment and ${streams.length} internal streams.`,
      });
    },
    paste() {
      const clipboard = get().clipboard;
      if (!clipboard) {
        set({ lastMessage: "Copy a selection first." });
        return;
      }
      const document = clone(get().document);
      const remap = new Map(
        [...clipboard.equipment, ...clipboard.streams].map((item) => [
          item.id,
          crypto.randomUUID(),
        ]),
      );
      const componentRemap = new Map<string, string>();
      for (const component of clipboard.components) {
        const existing = document.engineering.components.find(
          (item) => item.id === component.id,
        );
        if (!existing) {
          const collision = [
            ...document.engineering.equipment,
            ...document.engineering.streams,
          ].some((item) => item.id === component.id);
          const id = collision ? crypto.randomUUID() : component.id;
          document.engineering.components.push({ ...clone(component), id });
          if (collision) componentRemap.set(component.id, id);
        } else if (!equal(existing, component)) {
          const id = crypto.randomUUID();
          document.engineering.components.push({ ...clone(component), id });
          componentRemap.set(component.id, id);
        }
      }
      const usedTags = new Set(
        [
          ...document.engineering.equipment,
          ...document.engineering.streams,
        ].map((item) => item.tag),
      );
      const copiedTag = (original: string) => {
        let tag = `${original || "Object"} copy`;
        let number = 2;
        while (usedTags.has(tag))
          tag = `${original || "Object"} copy ${number++}`;
        usedTags.add(tag);
        return tag;
      };
      const offset = (clipboard.count + 1) * 20;
      for (const item of clipboard.equipment) {
        const id = remap.get(item.id)!;
        document.engineering.equipment.push({
          ...clone(item),
          id,
          tag: copiedTag(item.tag),
        });
        document.engineering.sections
          ?.find((s) => s.id === get().currentSectionId)
          ?.equipmentIds.push(id);
        const position = Object.hasOwn(clipboard.nodes, item.id)
          ? clipboard.nodes[item.id]
          : { x: 0, y: 0, metadata: {} };
        document.presentation.nodes = {
          ...document.presentation.nodes,
          [id]: {
            ...clone(position),
            x: position.x + offset,
            y: position.y + offset,
          },
        };
      }
      for (const item of clipboard.streams) {
        const stream = clone(item);
        stream.id = remap.get(item.id)!;
        stream.tag = copiedTag(item.tag);
        stream.source.equipmentId = remap.get(item.source.equipmentId)!;
        stream.target.equipmentId = remap.get(item.target.equipmentId)!;
        if (stream.composition)
          for (const part of stream.composition.fractions)
            part.componentId =
              componentRemap.get(part.componentId) ?? part.componentId;
        document.engineering.streams.push(stream);
      }
      if (Object.keys(clipboard.styles).length)
        document.presentation.metadata.objectStyles = {
          ...record(document.presentation.metadata.objectStyles),
          ...Object.fromEntries(
            Object.entries(clipboard.styles).map(([id, style]) => [
              remap.get(id)!,
              clone(style),
            ]),
          ),
        };
      if (commit(document, "Paste selection")) {
        set({ clipboard: { ...clipboard, count: clipboard.count + 1 } });
        setSelection([...remap.values()]);
      }
    },
    duplicateSelection() {
      get().copySelection();
      get().paste();
    },
    openExplorer(id) {
      if (
        ["heatExchanger", "column"].includes(
          get().document.engineering.equipment.find((item) => item.id === id)
            ?.type ?? "",
        )
      ) {
        get().commitTransaction();
        set({ explorerId: id });
      }
    },
    closeExplorer() {
      get().commitTransaction();
      set({ explorerId: null });
    },
    setViewport(viewport) {
      set({ viewport });
    },
    setSnapEnabled(snapEnabled) {
      set({ snapEnabled });
    },
    notify(lastMessage) {
      set({ lastMessage });
    },
  };
});
