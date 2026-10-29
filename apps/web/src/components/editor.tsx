"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Background,
  BackgroundVariant,
  Controls,
  ControlButton,
  getViewportForBounds,
  MarkerType,
  Position,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useNodesInitialized,
  type Connection,
  type NodeChange,
  type EdgeChange,
  SelectionMode,
  ViewportPortal,
} from "@xyflow/react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  CircleHelp,
  FilePlus2,
  FlaskConical,
  MousePointer2,
  Plus,
  RotateCcw,
  Undo2,
  Redo2,
  Copy,
  ClipboardPaste,
  CopyPlus,
  Palette,
  ImageDown,
  Search,
  Grid2X2,
  Maximize,
  Unplug,
  Workflow,
} from "lucide-react";
import {
  definitions,
  exampleDocument,
  parseDocument,
  serializeDocument,
  validateDocument,
} from "@/lib/contract";
import { useEditorStore } from "@/lib/editor-store";
import { EquipmentNode, EquipmentSymbol } from "./equipment-node";
import { Properties } from "./properties";
import { Button } from "./ui/button";
import {
  diagramTextColor,
  getDiagramStyle,
  symbolAccent,
  resolveObjectStyle,
} from "@/lib/styles";
import { ProjectLibrary } from "./project-library";
import { AccountPanel } from "./account-panel";
import { StylePanel } from "./style-panel";
import { EquipmentExplorer } from "./equipment-explorer";
import { TeachingPanel } from "./teaching-panel";
import { Presentation } from "./presentation";
import { sectionEquipmentIds } from "@/lib/hierarchy";
import { equipmentPorts } from "@pfdkit/contracts";
import { ExportDialog } from "./export-dialog";
import { flushLocalProject } from "@/lib/use-local-projects";
import { getPortPosition, NODE_HEIGHT, NODE_WIDTH } from "@/lib/symbols";

const nodeTypes = { equipment: EquipmentNode };
const portSides: Record<string, Position> = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
};

function ConnectionComposer() {
  const document = useEditorStore((state) => state.document);
  const connect = useEditorStore((state) => state.connect);
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const options = document.engineering.equipment.flatMap((equipment) =>
    equipmentPorts(equipment.type, equipment.config).map((port) => ({
      value: JSON.stringify([equipment.id, port.id]),
      label: `${equipment.tag} · ${port.name}`,
      direction: port.direction,
    })),
  );
  return (
    <details className="connection-composer">
      <summary>
        <Unplug size={15} />
        Connect ports
        <ChevronDown size={14} />
      </summary>
      <div className="composer-content">
        <label className="field">
          <span>Source outlet</span>
          <select
            aria-label="Source outlet"
            value={source}
            onChange={(event) => setSource(event.target.value)}
          >
            <option value="">Choose outlet…</option>
            {options
              .filter((port) => port.direction === "out")
              .map((port) => (
                <option key={port.value} value={port.value}>
                  {port.label}
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          <span>Target inlet</span>
          <select
            aria-label="Target inlet"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
          >
            <option value="">Choose inlet…</option>
            {options
              .filter((port) => port.direction === "in")
              .map((port) => (
                <option key={port.value} value={port.value}>
                  {port.label}
                </option>
              ))}
          </select>
        </label>
        <Button
          disabled={!source || !target}
          onClick={() => {
            const [sourceId, sourcePort] = JSON.parse(source) as [
              string,
              string,
            ];
            const [targetId, targetPort] = JSON.parse(target) as [
              string,
              string,
            ];
            connect(sourceId, sourcePort, targetId, targetPort);
          }}
        >
          Connect stream
        </Button>
      </div>
    </details>
  );
}

function EditorWorkspace() {
  const {
    document,
    currentSectionId,
    enterSection,
    openGeneration,
    selectionIds,
    setSelection,
    past,
    future,
    undo,
    redo,
    copySelection,
    paste,
    duplicateSelection,
    beginTransaction,
    commitTransaction,
    moveSelection,
    snapEnabled,
    setSnapEnabled,
    canReconnect,
    reconnectStream,
    explorerId,
    openExplorer,
    closeExplorer,
    setViewport,
    lastMessage,
    setTitle,
    addEquipment,
    moveEquipment,
    select,
    connect,
    canConnect,
    replaceDocument,
    notify,
    removeSelection,
  } = useEditorStore();
  const input = useRef<HTMLInputElement>(null);
  const flow = useReactFlow();
  const canvasRef = useRef<HTMLDivElement>(null);
  const fitCanvas = useCallback(() => {
    const current = useEditorStore.getState().document;
    const members = new Set(
      sectionEquipmentIds(current, useEditorStore.getState().currentSectionId),
    );
    const visible = new Set(members);
    for (const stream of current.engineering.streams)
      if (
        members.has(stream.source.equipmentId) !==
        members.has(stream.target.equipmentId)
      ) {
        visible.add(stream.source.equipmentId);
        visible.add(stream.target.equipmentId);
      }
    const positions = current.engineering.equipment
      .filter((item) => visible.has(item.id))
      .map((item) =>
        Object.hasOwn(current.presentation.nodes, item.id)
          ? current.presentation.nodes[item.id]
          : { x: 0, y: 0 },
      );
    if (!positions.length || !canvasRef.current || !flow.viewportInitialized)
      return Promise.resolve(false);
    const x = Math.min(...positions.map((point) => point.x)),
      y = Math.min(...positions.map((point) => point.y));
    const width =
        Math.max(...positions.map((point) => point.x + NODE_WIDTH)) - x,
      height = Math.max(...positions.map((point) => point.y + NODE_HEIGHT)) - y;
    return flow.setViewport(
      getViewportForBounds(
        { x, y, width, height },
        canvasRef.current.clientWidth,
        canvasRef.current.clientHeight,
        0.25,
        1.15,
        0.3,
      ),
      { duration: 0 },
    );
  }, [flow]);
  const nodesInitialized = useNodesInitialized();
  const observedGeneration = useRef(openGeneration);
  const pendingFit = useRef<string | null>(document.id);
  const skipNextFit = useRef(false);
  const [navigating, setNavigating] = useState(false);
  const [fitting, setFitting] = useState(true);
  const canvasBusy =
    navigating ||
    fitting ||
    (document.engineering.equipment.length > 0 && !nodesInitialized);
  useEffect(() => {
    if (observedGeneration.current !== openGeneration) {
      observedGeneration.current = openGeneration;
      pendingFit.current = skipNextFit.current ? null : document.id;
      skipNextFit.current = false;
      queueMicrotask(() => setFitting(pendingFit.current !== null));
    }
    if (!document.engineering.equipment.length) {
      pendingFit.current = null;
      queueMicrotask(() => setFitting(false));
      return;
    }
    if (
      nodesInitialized &&
      flow.viewportInitialized &&
      pendingFit.current === document.id
    ) {
      pendingFit.current = null;
      void fitCanvas().then(() => {
        if (useEditorStore.getState().openGeneration === openGeneration)
          setFitting(false);
      });
    }
  }, [
    document.id,
    document.engineering.equipment.length,
    openGeneration,
    nodesInitialized,
    flow,
    fitCanvas,
  ]);
  const gestureObject = useRef(false);
  const gestureMultiple = useRef(false);
  const gestureNode = useRef<{
    id: string;
    x: number;
    y: number;
    time: number;
  } | null>(null);
  const [showTeaching, setShowTeaching] = useState(false);
  const [showPresentation, setShowPresentation] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [showStyle, setShowStyle] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const reconnecting = useRef<string | null>(null);
  const diagramStyle = getDiagramStyle(document);
  const categories = [...new Set(definitions.map((item) => item.category))];
  const filteredDefinitions = definitions.filter(
    (item) =>
      (category === "All" || item.category === category) &&
      `${item.name} ${item.type} ${item.description} ${item.keywords.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const snap = (value: number) =>
    snapEnabled ? Math.round(value / 20) * 20 : value;
  const result = useMemo(() => validateDocument(document), [document]);
  const memberIds = useMemo(
    () => new Set(sectionEquipmentIds(document, currentSectionId)),
    [document, currentSectionId],
  );
  const scopedIds = useMemo(() => {
    const ids = new Set(sectionEquipmentIds(document, currentSectionId));
    const members = new Set(ids);
    if (currentSectionId)
      for (const stream of document.engineering.streams) {
        if (
          members.has(stream.source.equipmentId) !==
          members.has(stream.target.equipmentId)
        ) {
          ids.add(stream.source.equipmentId);
          ids.add(stream.target.equipmentId);
        }
      }
    return ids;
  }, [document, currentSectionId]);
  useEffect(() => {
    const saved = useEditorStore.getState().viewport;
    void flow.setViewport(saved);
  }, [currentSectionId, flow]);
  const nodes = useMemo(
    () =>
      document.engineering.equipment
        .filter((e) => scopedIds.has(e.id))
        .map((equipment) => ({
          id: equipment.id,
          type: "equipment",
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          measured: { width: NODE_WIDTH, height: NODE_HEIGHT },
          handles: equipmentPorts(equipment.type, equipment.config).map(
            (port) => {
              const position = getPortPosition(
                equipment.type,
                port.id,
                equipment.config,
              );
              return {
                id: port.id,
                type:
                  port.direction === "in"
                    ? ("target" as const)
                    : ("source" as const),
                position: portSides[port.side],
                x: position.x - 4,
                y: position.y - 4,
                width: 8,
                height: 8,
              };
            },
          ),
          position: Object.hasOwn(document.presentation.nodes, equipment.id)
            ? document.presentation.nodes[equipment.id]
            : { x: 0, y: 0 },
          data: { equipment },
          selected: selectionIds.includes(equipment.id),
          draggable: memberIds.has(equipment.id),
          selectable: memberIds.has(equipment.id),
          ariaLabel: `${equipment.tag}, ${equipment.type}${memberIds.has(equipment.id) ? "" : ", read-only boundary context"}`,
        })),
    [document, selectionIds, scopedIds, memberIds],
  );
  const edges = useMemo(
    () =>
      document.engineering.streams
        .filter(
          (s) =>
            scopedIds.has(s.source.equipmentId) &&
            scopedIds.has(s.target.equipmentId) &&
            (memberIds.has(s.source.equipmentId) ||
              memberIds.has(s.target.equipmentId)),
        )
        .map((stream) => {
          const style = resolveObjectStyle(document, stream.id, stream.kind);
          return {
            id: stream.id,
            source: stream.source.equipmentId,
            target: stream.target.equipmentId,
            sourceHandle: stream.source.portId,
            targetHandle: stream.target.portId,
            label: style.labelVisible ? stream.tag : undefined,
            type: "smoothstep",
            pathOptions: { borderRadius: 0, offset: 24 },
            selected: selectionIds.includes(stream.id),
            reconnectable: true,
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: style.stroke,
              width: 17,
              height: 17,
            },
            style: {
              stroke: style.stroke,
              strokeWidth: style.lineWidth,
              strokeDasharray: style.dasharray,
            },
            labelStyle: {
              fill: style.textColor,
              fontSize: style.fontSize,
              fontFamily: style.fontFamily,
            },
            labelBgPadding: [7, 4] as [number, number],
            labelBgBorderRadius: 2,
            labelBgStyle: { fill: diagramStyle.background },
            ariaLabel: `${stream.tag}, stream`,
          };
        }),
    [document, selectionIds, diagramStyle.background, scopedIds, memberIds],
  );
  const onConnect = (connection: Connection) =>
    connection.sourceHandle &&
    connection.targetHandle &&
    connect(
      connection.source,
      connection.sourceHandle,
      connection.target,
      connection.targetHandle,
    );
  const applySelectionChanges = (changes: (NodeChange | EdgeChange)[]) => {
    const ids = new Set(useEditorStore.getState().selectionIds);
    for (const change of changes)
      if (change.type === "select") {
        if (change.selected) ids.add(change.id);
        else if (!gestureObject.current || gestureMultiple.current)
          ids.delete(change.id);
      }
    if (changes.some((change) => change.type === "select"))
      setSelection([...ids]);
  };
  const onNodesChange = (changes: NodeChange[]) => {
    for (const change of changes)
      if (change.type === "position" && change.position)
        moveEquipment(change.id, change.position.x, change.position.y);
    applySelectionChanges(changes);
  };
  const download = () => {
    const blob = new Blob([serializeDocument(document)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${document.title.replace(/[^a-z0-9-_]/gi, "-") || "process"}.pfd.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify("Document exported with engineering data, properties, and layout.");
  };
  return (
    <main
      className={`editor-shell ${showPresentation ? "is-presenting" : ""}`}
      onKeyDownCapture={(event) => {
        const target = event.target as HTMLElement;
        if (showPresentation) return;
        if (navigating) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (target.closest('[role="dialog"]')) return;
        if (event.key === "Enter" || event.key === " ")
          gestureObject.current = false;
        const editing = !!target.closest(
          "input,textarea,select,[contenteditable=true]",
        );
        const command = event.ctrlKey || event.metaKey;
        if (
          command &&
          (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y")
        ) {
          event.preventDefault();
          event.stopPropagation();
          target.blur();
          if (event.shiftKey || event.key.toLowerCase() === "y") redo();
          else undo();
          return;
        }
        if (editing) return;
        if (command && ["c", "v", "d", "a"].includes(event.key.toLowerCase())) {
          event.preventDefault();
          event.stopPropagation();
          const key = event.key.toLowerCase();
          if (key === "c") copySelection();
          if (key === "v") paste();
          if (key === "d") duplicateSelection();
          if (key === "a")
            setSelection(
              [
                ...document.engineering.equipment.filter((item) =>
                  memberIds.has(item.id),
                ),
                ...document.engineering.streams.filter(
                  (item) =>
                    memberIds.has(item.source.equipmentId) ||
                    memberIds.has(item.target.equipmentId),
                ),
              ].map((item) => item.id),
            );
          return;
        }
        if (["Delete", "Backspace"].includes(event.key)) {
          event.preventDefault();
          removeSelection();
        }
        if (event.key === "Escape") select(null);
        if (
          target.closest(".react-flow__node") &&
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
            event.key,
          )
        ) {
          event.preventDefault();
          event.stopPropagation();
          beginTransaction("Move selection");
          const step = snapEnabled ? 20 : 1;
          moveSelection(
            event.key === "ArrowLeft"
              ? -step
              : event.key === "ArrowRight"
                ? step
                : 0,
            event.key === "ArrowUp"
              ? -step
              : event.key === "ArrowDown"
                ? step
                : 0,
          );
        }
      }}
      onKeyUp={(event) => {
        if (
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
            event.key,
          )
        )
          commitTransaction();
      }}
    >
      <header className="app-header">
        <Link href="/" className="brand" aria-label="PFDkit home">
          <span className="brand-mark">
            <Workflow size={23} />
          </span>
          <span>
            PFD<span className="brand-light">kit</span>
          </span>
        </Link>
        <span className="header-divider" />
        <div className="document-heading">
          <label className="sr-only" htmlFor="document-title">
            Document title
          </label>
          <input
            id="document-title"
            value={document.title}
            onFocus={() => beginTransaction("Rename document")}
            onBlur={commitTransaction}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                useEditorStore.getState().cancelTransaction();
                event.currentTarget.blur();
              }
            }}
            onChange={(event) => setTitle(event.target.value)}
          />
          <span>
            <span className="status-dot" />
            Local workspace <span className="dot-separator">·</span> Account
            controls in sidebar
          </span>
        </div>
        <div className="header-actions">
          <Button
            variant="ghost"
            size="small"
            onClick={() => input.current?.click()}
          >
            <ArrowUpFromLine size={15} />
            Import
          </Button>
          <Button variant="outline" size="small" onClick={download}>
            <ArrowDownToLine size={15} />
            Export JSON
          </Button>
          <Button
            variant="ghost"
            size="small"
            onClick={() => setShowStyle(!showStyle)}
          >
            <Palette size={15} />
            Style
          </Button>
          <Button
            variant="default"
            size="small"
            onClick={() => setShowExport(true)}
          >
            <ImageDown size={15} />
            Export figure
          </Button>
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            aria-label="Import process document"
            className="sr-only"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                const text = await file.text();
                const imported = parseDocument(text);
                setNavigating(true);
                if (!(await flushLocalProject())) {
                  setNavigating(false);
                  return;
                }
                replaceDocument(imported);
              } catch (error) {
                notify(
                  `Import rejected. ${error instanceof Error ? error.message : "Invalid document."}`,
                );
              }
              setNavigating(false);
              event.target.value = "";
            }}
          />
          <span className="avatar" title="Guest workspace">
            G
          </span>
        </div>
      </header>
      <div className="workspace-body">
        <aside className="equipment-palette" aria-label="Equipment palette">
          <div className="panel-heading">
            <span className="eyebrow">BUILD YOUR PROCESS</span>
            <h2>Equipment</h2>
            <p>Click to add, or drag onto the canvas.</p>
          </div>
          <div className="palette-search">
            <label className="field">
              <span>
                <Search size={13} /> Find equipment
              </span>
              <input
                aria-label="Find equipment"
                value={query}
                placeholder="Search name or service... "
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Category</span>
              <select
                aria-label="Equipment category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option>All</option>
                {categories.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
          <div
            className="palette-items"
            onKeyDown={(event) => {
              if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key))
                return;
              const buttons = [
                ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "button.palette-item",
                ),
              ];
              const index = buttons.indexOf(event.target as HTMLButtonElement);
              if (index < 0) return;
              event.preventDefault();
              buttons[
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? buttons.length - 1
                    : (index +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        buttons.length) %
                      buttons.length
              ]?.focus();
            }}
          >
            {filteredDefinitions.map((definition) => (
              <button
                key={definition.type}
                className="palette-item"
                disabled={canvasBusy}
                draggable
                onDragStart={(event) => {
                  pendingFit.current = null;
                  event.dataTransfer.setData(
                    "application/pfdkit-equipment",
                    definition.type,
                  );
                  event.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => {
                  pendingFit.current = null;
                  const position = flow.screenToFlowPosition({
                    x:
                      (canvasRef.current?.getBoundingClientRect().left ?? 0) +
                      (canvasRef.current?.clientWidth ?? window.innerWidth) / 2,
                    y:
                      (canvasRef.current?.getBoundingClientRect().top ?? 0) +
                      (canvasRef.current?.clientHeight ?? window.innerHeight) /
                        2,
                  });
                  const count = document.engineering.equipment.length;
                  addEquipment(
                    definition.type,
                    snap(position.x - 170 + (count % 3) * 170),
                    snap(position.y - 75 + (Math.floor(count / 3) % 3) * 160),
                  );
                }}
                aria-label={`Add ${definition.name}`}
              >
                <span className={`palette-symbol symbol-${definition.type}`}>
                  <EquipmentSymbol
                    type={definition.type}
                    symbolSet={diagramStyle.symbolSet}
                    paint={{ accent: symbolAccent(diagramStyle) }}
                  />
                </span>
                <span>
                  <strong>{definition.name}</strong>
                  <small>{definition.category}</small>
                </span>
                <Plus size={15} />
              </button>
            ))}
          </div>
          {!filteredDefinitions.length && (
            <p className="palette-no-results" role="status">
              No equipment matches. Try another name or category.
            </p>
          )}
          <div className="palette-section">
            <span className="eyebrow">DOCUMENT</span>
            <Button
              variant="ghost"
              disabled={canvasBusy}
              onClick={async () => {
                setNavigating(true);
                if (!(await flushLocalProject())) {
                  setNavigating(false);
                  return;
                }
                replaceDocument(structuredClone(exampleDocument));
                setNavigating(false);
              }}
            >
              <RotateCcw size={15} />
              Load example
            </Button>
            <Button
              variant="ghost"
              disabled={canvasBusy}
              onClick={async () => {
                setNavigating(true);
                if (!(await flushLocalProject())) {
                  setNavigating(false);
                  return;
                }
                const empty = structuredClone(exampleDocument);
                empty.id = crypto.randomUUID();
                empty.title = "Untitled process";
                empty.metadata = {};
                empty.education = {
                  notes: "",
                  metadata: {},
                  annotations: [],
                  steps: [],
                };
                empty.engineering = {
                  equipment: [],
                  streams: [],
                  components: [],
                  sections: [],
                };
                empty.presentation = {
                  nodes: {},
                  viewport: { x: 0, y: 0, zoom: 1 },
                  metadata: {},
                };
                skipNextFit.current = true;
                pendingFit.current = null;
                replaceDocument(empty);
                void flow.setViewport({ x: 0, y: 0, zoom: 1 });
                setViewport({ x: 0, y: 0, zoom: 1 });
                setNavigating(false);
              }}
            >
              <FilePlus2 size={15} />
              New diagram
            </Button>
          </div>
          <ProjectLibrary />
          <AccountPanel />
          <div className="palette-foot">
            <FlaskConical size={16} />
            <span>
              Made for engineering.
              <br />
              <small>Built for understanding.</small>
            </span>
          </div>
        </aside>
        <section className="canvas-section" aria-label="Process canvas">
          <div className="canvas-toolbar">
            <nav
              className="section-breadcrumb"
              aria-label="Process section breadcrumbs"
            >
              <Workflow size={15} />
              <button onClick={() => enterSection(null)}>Flowsheet</button>
              {(() => {
                const chain: typeof document.engineering.sections = [];
                let id = currentSectionId;
                const visited = new Set<string>();
                while (id && !visited.has(id)) {
                  visited.add(id);
                  const section = document.engineering.sections.find(
                    (s) => s.id === id,
                  );
                  if (!section) break;
                  chain.unshift(section);
                  id = section.parentId;
                }
                return chain.map((section) => (
                  <span key={section.id}>
                    {" "}
                    /{" "}
                    <button
                      aria-current={
                        section.id === currentSectionId ? "page" : undefined
                      }
                      onClick={() => enterSection(section.id)}
                    >
                      {section.name}
                    </button>
                  </span>
                ));
              })()}
            </nav>
            <div className="canvas-toolbar-actions">
              <div
                className="history-controls"
                role="group"
                aria-label="Edit commands"
              >
                <Button
                  variant="ghost"
                  size="icon"
                  title="Undo (Ctrl+Z)"
                  aria-label="Undo"
                  disabled={!past.length}
                  onClick={undo}
                >
                  <Undo2 size={16} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Redo (Ctrl+Shift+Z)"
                  aria-label="Redo"
                  disabled={!future.length}
                  onClick={redo}
                >
                  <Redo2 size={16} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Copy (Ctrl+C)"
                  aria-label="Copy selection"
                  disabled={!selectionIds.length}
                  onClick={copySelection}
                >
                  <Copy size={16} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Paste (Ctrl+V)"
                  aria-label="Paste selection"
                  onClick={paste}
                >
                  <ClipboardPaste size={16} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Duplicate (Ctrl+D)"
                  aria-label="Duplicate selection"
                  disabled={!selectionIds.length}
                  onClick={duplicateSelection}
                >
                  <CopyPlus size={16} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Snap to 20 unit grid"
                  aria-label="Snap to grid"
                  aria-pressed={snapEnabled}
                  onClick={() => setSnapEnabled(!snapEnabled)}
                >
                  <Grid2X2 size={16} />
                </Button>
              </div>
              <Button
                variant="ghost"
                size="small"
                onClick={() => setShowTeaching(true)}
              >
                Teaching and sections
              </Button>
              <Button
                variant="ghost"
                size="small"
                onClick={() => {
                  commitTransaction();
                  setShowPresentation(true);
                }}
              >
                Present
              </Button>
              <span className="tool-indicator">
                <MousePointer2 size={14} />
                Select
              </span>
              <ConnectionComposer />
              <Button
                variant="ghost"
                size="small"
                onClick={() => setShowValidation(!showValidation)}
              >
                <Check size={15} />
                {result.issues.length
                  ? `${result.issues.length} notices`
                  : "Validated"}
              </Button>
            </div>
          </div>
          <div
            ref={canvasRef}
            className="flow-container"
            aria-busy={canvasBusy}
            style={{
              background: diagramStyle.background,
              pointerEvents: canvasBusy ? "none" : undefined,
            }}
            onDoubleClickCapture={(event) => {
              const origin = gestureNode.current;
              if (
                origin &&
                Date.now() - origin.time < 1000 &&
                memberIds.has(origin.id) &&
                Math.hypot(origin.x - event.clientX, origin.y - event.clientY) <
                  5
              ) {
                setViewport(flow.getViewport());
                openExplorer(origin.id);
              }
            }}
            onPointerDownCapture={(event) => {
              pendingFit.current = null;
              const target = event.target as Element;
              const node = target.closest<HTMLElement>(".react-flow__node");
              const edge = target.closest<HTMLElement>(".react-flow__edge");
              gestureObject.current = !!node || !!edge;
              gestureMultiple.current =
                event.ctrlKey || event.metaKey || event.shiftKey;
              if (gestureObject.current) {
                const active = window.document.activeElement;
                if (
                  active instanceof HTMLElement &&
                  active.closest(".properties-panel")
                )
                  active.blur();
              }
              // Handle gestures belong to React Flow's connection controller.
              if (target.closest(".react-flow__handle")) return;
              if (event.ctrlKey || event.metaKey || event.shiftKey) return;
              // React Flow can retarget rapid clicks to its pane after selection.
              if (node?.dataset.id)
                gestureNode.current = {
                  id: node.dataset.id,
                  x: event.clientX,
                  y: event.clientY,
                  time: Date.now(),
                };
              const id = node?.dataset.id ?? edge?.dataset.id;
              if (
                id &&
                (!node || memberIds.has(id)) &&
                !useEditorStore.getState().selectionIds.includes(id)
              )
                select({ kind: node ? "equipment" : "stream", id });
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDrop={(event) => {
              event.preventDefault();
              const type = event.dataTransfer.getData(
                "application/pfdkit-equipment",
              );
              if (type) {
                const position = flow.screenToFlowPosition({
                  x: event.clientX,
                  y: event.clientY,
                });
                addEquipment(type, snap(position.x), snap(position.y));
              }
            }}
          >
            {currentSectionId && (
              <details className="section-boundaries">
                <summary>Section boundary streams</summary>
                <ul>
                  {document.engineering.sections
                    .find((s) => s.id === currentSectionId)
                    ?.boundaryPorts.map((port) => {
                      const stream = document.engineering.streams.find(
                        (s) => s.id === port.streamId,
                      );
                      const internal = document.engineering.equipment.find(
                        (e) => e.id === port.internalEndpoint.equipmentId,
                      );
                      return (
                        <li key={port.id}>
                          {port.direction === "in" ? "Entering" : "Leaving"}{" "}
                          {stream?.tag} to {internal?.tag} /{" "}
                          {port.internalEndpoint.portId} ({port.kind})
                        </li>
                      );
                    })}
                </ul>
                <small>Outside equipment is read-only boundary context.</small>
              </details>
            )}
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onNodeDragStart={() =>
                beginTransaction("Move equipment selection")
              }
              onNodeDragStop={commitTransaction}
              onSelectionDragStart={() =>
                beginTransaction("Move equipment selection")
              }
              onSelectionDragStop={commitTransaction}
              onMoveEnd={(_, viewport) => setViewport(viewport)}
              snapToGrid={snapEnabled}
              snapGrid={[20, 20]}
              selectionOnDrag={false}
              selectionKeyCode="Shift"
              selectionMode={SelectionMode.Partial}
              multiSelectionKeyCode={["Control", "Meta"]}
              zoomOnDoubleClick={false}
              onNodeDoubleClick={(_, node) => {
                if (!memberIds.has(node.id)) return;
                setViewport(flow.getViewport());
                openExplorer(node.id);
              }}
              onReconnectStart={(_, edge) => {
                reconnecting.current = edge.id;
              }}
              onReconnect={(edge, connection) => {
                if (connection.sourceHandle && connection.targetHandle)
                  reconnectStream(
                    edge.id,
                    connection.source,
                    connection.sourceHandle,
                    connection.target,
                    connection.targetHandle,
                  );
              }}
              onReconnectEnd={() => {
                reconnecting.current = null;
              }}
              onConnect={onConnect}
              onConnectEnd={(_, connection) => {
                if (connection.toNode && !connection.isValid)
                  notify(
                    "Connection rejected. Choose an outlet and an available inlet of the same material or energy kind.",
                  );
              }}
              isValidConnection={(connection) =>
                !!connection.source &&
                !!connection.target &&
                !!connection.sourceHandle &&
                !!connection.targetHandle &&
                (reconnecting.current
                  ? canReconnect(
                      reconnecting.current,
                      connection.source,
                      connection.sourceHandle,
                      connection.target,
                      connection.targetHandle,
                    )
                  : canConnect(
                      connection.source,
                      connection.sourceHandle,
                      connection.target,
                      connection.targetHandle,
                    ))
              }
              onEdgesChange={applySelectionChanges}
              onPaneClick={() => {
                if (!gestureObject.current) select(null);
              }}
              minZoom={0.25}
              maxZoom={2.5}
              deleteKeyCode={null}
              nodesFocusable
              autoPanOnNodeFocus={false}
              edgesFocusable
              nodesConnectable={nodesInitialized}
              elementsSelectable
              proOptions={{ hideAttribution: false }}
              defaultEdgeOptions={{ interactionWidth: 24 }}
            >
              <ViewportPortal>
                {(document.education.annotations ?? [])
                  .filter(
                    (a) =>
                      a.visible &&
                      (currentSectionId === null ||
                        a.targetId === null ||
                        memberIds.has(a.targetId) ||
                        a.targetId === currentSectionId ||
                        document.engineering.streams.some(
                          (s) =>
                            s.id === a.targetId &&
                            (memberIds.has(s.source.equipmentId) ||
                              memberIds.has(s.target.equipmentId)),
                        )),
                  )
                  .map((a) => (
                    <div
                      key={a.id}
                      className="canvas-annotation"
                      style={{
                        position: "absolute",
                        left: a.x,
                        top: a.y,
                        pointerEvents: "none",
                        zIndex: 10,
                        maxWidth: 220,
                        fontSize: 12,
                        color: "#493900",
                        background: "#fff7d7",
                        border: "1px solid #c1a45d",
                        padding: 6,
                      }}
                    >
                      <strong>{a.kind}: </strong>
                      {a.text}
                      <small style={{ display: "block" }}>{a.provenance}</small>
                      {a.kind === "arrow" &&
                        a.endX !== null &&
                        a.endY !== null && (
                          <svg
                            width="1"
                            height="1"
                            style={{
                              position: "absolute",
                              left: 0,
                              top: 0,
                              overflow: "visible",
                            }}
                            aria-label="Annotation arrow"
                          >
                            <defs>
                              <marker
                                id={`arrow-${a.id}`}
                                markerWidth="8"
                                markerHeight="8"
                                refX="7"
                                refY="4"
                                orient="auto"
                              >
                                <path d="M0 0L8 4L0 8Z" fill="#785900" />
                              </marker>
                            </defs>
                            <line
                              x1="0"
                              y1="0"
                              x2={a.endX - a.x}
                              y2={a.endY - a.y}
                              stroke="#785900"
                              strokeWidth="2"
                              markerEnd={`url(#arrow-${a.id})`}
                            />
                          </svg>
                        )}
                    </div>
                  ))}
              </ViewportPortal>
              <Background
                variant={BackgroundVariant.Dots}
                gap={20}
                size={1}
                color="#d7dee5"
              />
              <Controls showInteractive={false} showFitView={false}>
                <ControlButton
                  title="Fit View"
                  aria-label="Fit View"
                  onClick={() => void fitCanvas()}
                >
                  <Maximize size={16} />
                </ControlButton>
              </Controls>
              <MiniMap
                nodeColor="#bccbd4"
                nodeBorderRadius={5}
                maskColor="rgba(243,246,248,.7)"
              />
            </ReactFlow>
            {nodes.length === 0 && (
              <div className="empty-canvas">
                <Workflow size={40} />
                <h2>A new process starts here</h2>
                <p>Add equipment from the palette to start your flowsheet.</p>
                <Button onClick={() => addEquipment("feed", 100, 180)}>
                  <Plus size={15} />
                  Add a feed
                </Button>
              </div>
            )}
            {diagramStyle.showTitle && (
              <div
                className="canvas-figure-title"
                title={document.title}
                style={{
                  color: diagramTextColor(diagramStyle.background),
                  fontFamily: diagramStyle.fontFamily,
                  background: diagramStyle.background,
                }}
              >
                {document.title}
              </div>
            )}
            {diagramStyle.showLegend && (
              <div
                className="canvas-figure-legend"
                aria-label="Diagram legend"
                style={{
                  color: diagramTextColor(diagramStyle.background),
                  fontFamily: diagramStyle.fontFamily,
                  background: diagramStyle.background,
                }}
              >
                <span>
                  <svg viewBox="0 0 44 12" aria-hidden="true">
                    <path d="M0 6h38m-5-4 5 4-5 4" />
                  </svg>
                  Material stream
                </span>
                <span>
                  <svg viewBox="0 0 44 12" aria-hidden="true">
                    <path d="M0 6h34" strokeDasharray="6 3" />
                    <path d="m33 2 5 4-5 4" />
                  </svg>
                  Energy stream
                </span>
              </div>
            )}
            <div className="canvas-caption">
              <span className="caption-line" />
              PROCESS FLOW DIAGRAM
              <span className="caption-version">PFDkit · v0.1</span>
            </div>
            {showValidation && (
              <div
                className="validation-popover"
                aria-label="Validation findings"
              >
                <div>
                  <h3>Document validation</h3>
                  <button
                    aria-label="Close validation"
                    onClick={() => setShowValidation(false)}
                  >
                    ×
                  </button>
                </div>
                <p>
                  Structural checks only. No process calculations are performed.
                </p>
                {result.issues.length ? (
                  <ul>
                    {result.issues.map((issue, index) => (
                      <li key={index}>
                        <span className={`issue-severity ${issue.severity}`}>
                          {issue.severity}
                        </span>
                        <button
                          onClick={() =>
                            issue.objectId &&
                            select({
                              kind: document.engineering.equipment.some(
                                (item) => item.id === issue.objectId,
                              )
                                ? "equipment"
                                : "stream",
                              id: issue.objectId,
                            })
                          }
                        >
                          {issue.message}
                        </button>
                        <code>{issue.code}</code>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="valid-message">All structural checks pass.</p>
                )}
              </div>
            )}
          </div>
          <footer className="canvas-status">
            <span role="status" aria-live="polite">
              {lastMessage}
            </span>
            <span>
              {document.engineering.equipment.length} equipment
              <span className="dot-separator">·</span>
              {document.engineering.streams.length} streams
            </span>
          </footer>
        </section>
        {showStyle ? (
          <aside className="properties-panel">
            <StylePanel onClose={() => setShowStyle(false)} />
          </aside>
        ) : (
          <Properties />
        )}
      </div>
      {explorerId && (
        <EquipmentExplorer
          equipmentId={explorerId}
          onClose={() => {
            const saved = useEditorStore.getState().viewport;
            closeExplorer();
            void flow.setViewport(saved);
          }}
        />
      )}
      {showTeaching && (
        <TeachingPanel
          onClose={() => setShowTeaching(false)}
          onPresent={() => {
            commitTransaction();
            setShowTeaching(false);
            setShowPresentation(true);
          }}
        />
      )}
      {showPresentation && (
        <Presentation
          document={document}
          onClose={() => setShowPresentation(false)}
        />
      )}
      {showExport && (
        <ExportDialog
          onClose={() => setShowExport(false)}
          selectionIds={
            selectionIds.length
              ? selectionIds
              : currentSectionId
                ? [currentSectionId]
                : []
          }
          equipmentId={explorerId ?? undefined}
        />
      )}
      <footer className="app-footer">
        <span>
          <CircleHelp size={13} />
          Drag to pan · Scroll to zoom · Delete to remove selection
        </span>
        <span>Operating values are entered manually. No simulation.</span>
      </footer>
    </main>
  );
}

export function Editor() {
  return (
    <ReactFlowProvider>
      <EditorWorkspace />
    </ReactFlowProvider>
  );
}
