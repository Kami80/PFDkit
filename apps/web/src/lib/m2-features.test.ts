import { describe, expect, it } from "vitest";
import { exampleDocument, parseDocument } from "./contract";
import {
  DEFAULT_STYLE,
  diagramTextColor,
  getDiagramStyle,
  resolveObjectStyle,
  stylePatch,
} from "./styles";
import {
  ACTIVE_KEY,
  LocalProjectStore,
  PersistenceError,
  PROJECT_PREFIX,
  SNAPSHOT_PREFIX,
  type StorageLike,
} from "./persistence";
import {
  convertOperatingQuantity,
  exchangerRouting,
  exchangerState,
  renderExchangerSvg,
} from "./exchanger-geometry";
import { diagramSvg, textWidth, validatePngSize } from "./export-svg";

class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  fail: ((key: string) => boolean) | null = null;
  get length() {
    return this.values.size;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.fail?.(key)) throw new DOMException("Full", "QuotaExceededError");
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}
const process = () => structuredClone(exampleDocument);

describe("local project durability and recovery", () => {
  it("isolates arbitrary snapshot IDs when one is another's raw prefix", () => {
    const storage = new MemoryStorage(),
      store = new LocalProjectStore(storage),
      a = process(),
      b = process();
    a.id = "A";
    b.id = "A:B";
    store.save(a, 0);
    store.save(b, 0);
    expect(store.snapshots("A").map((item) => item.id)).toEqual(["A"]);
    store.remove("A");
    expect(store.load("A:B").document.id).toBe("A:B");
    expect(store.snapshots("A:B")).toHaveLength(1);
  });
  it("reopens styled values and keeps revisioned immutable snapshots", () => {
    const storage = new MemoryStorage(),
      store = new LocalProjectStore(storage, "tab-a"),
      document = process();
    document.presentation = stylePatch(document, {
      preset: "academicColorful",
    });
    const first = store.save(document, 0);
    document.title = "Edited title";
    const second = store.save(document, first.revision);
    expect(second.revision).toBe(2);
    expect(store.snapshots(document.id)).toHaveLength(2);
    expect(store.load(document.id).document).toEqual(document);
  });
  it("rejects stale writes without replacing the other tab and permits a separate fork", () => {
    const storage = new MemoryStorage(),
      a = new LocalProjectStore(storage, "a"),
      b = new LocalProjectStore(storage, "b"),
      document = process();
    a.save(document, 0);
    document.title = "Tab A";
    a.save(document, 1);
    const stale = process();
    stale.title = "Tab B";
    expect(() => b.save(stale, 1)).toThrow(PersistenceError);
    const fork = b.duplicate(stale, " (recovery)");
    expect(a.load(document.id).document.title).toBe("Tab A");
    expect(b.load(fork.document.id).document.title).toBe("Tab B (recovery)");
    expect(a.list()).toHaveLength(2);
  });
  it("retains a recoverable snapshot when the primary pointer write is interrupted", () => {
    const storage = new MemoryStorage(),
      store = new LocalProjectStore(storage, "a"),
      document = process();
    store.save(document, 0);
    document.title = "Recovered edit";
    storage.fail = (key) => key === PROJECT_PREFIX + document.id;
    expect(() => store.save(document, 1)).toThrow("recovery snapshot");
    expect(store.load(document.id).record.revision).toBe(1);
    expect(
      store
        .snapshots(document.id)
        .some(
          (item) => parseDocument(item.document).title === "Recovered edit",
        ),
    ).toBe(true);
  });
  it("reports quota before changing the primary and keeps current in-memory work intact", () => {
    const storage = new MemoryStorage(),
      store = new LocalProjectStore(storage),
      document = process();
    storage.fail = () => true;
    expect(() => store.save(document, 0)).toThrow("Export JSON");
    expect(storage.values.size).toBe(0);
    expect(document).toEqual(exampleDocument);
  });
  it("corrupt snapshots and recent-project failure do not turn a committed save into a failed revision", () => {
    const storage = new MemoryStorage(),
      store = new LocalProjectStore(storage),
      document = process();
    storage.values.set(SNAPSHOT_PREFIX + document.id + ":1:bad", "{bad}");
    storage.fail = (key) => key === ACTIVE_KEY;
    const saved = store.save(document, 0);
    expect(saved.revision).toBe(1);
    expect(store.lastWarning).toContain("Project saved");
    expect(store.load(document.id).record.revision).toBe(1);
    storage.fail = null;
    document.title = "Next";
    expect(store.save(document, 1).revision).toBe(2);
  });
  it("validates record identity rather than opening a document stored under another ID", () => {
    const storage = new MemoryStorage(),
      store = new LocalProjectStore(storage),
      document = process();
    const record = store.save(document, 0);
    storage.values.set(
      PROJECT_PREFIX + document.id,
      JSON.stringify({ ...record, id: "different" }),
    );
    expect(() => store.load(document.id)).toThrow("damaged");
    expect(store.snapshots(document.id)).toHaveLength(1);
  });
  it("duplicates with a new document identity and deliberately deletes only the requested project", () => {
    const storage = new MemoryStorage(),
      store = new LocalProjectStore(storage),
      document = process();
    store.save(document, 0);
    const copy = store.duplicate(document);
    expect(copy.document.id).not.toBe(document.id);
    store.remove(document.id);
    expect(store.list().map((item) => item.id)).toEqual([copy.document.id]);
    expect(store.snapshots(document.id)).toEqual([]);
  });
});

describe("visual style independence and safety", () => {
  it("preserves engineering and unknown style fields while switching presets", () => {
    const document = process(),
      original = structuredClone(document.engineering);
    document.presentation.metadata.style = { futureExtension: { value: true } };
    document.presentation = stylePatch(document, {
      preset: "academicColorful",
    });
    expect(document.engineering).toEqual(original);
    expect(document.presentation.metadata.style).toMatchObject({
      version: 1,
      futureExtension: { value: true },
    });
    expect(
      getDiagramStyle(parseDocument(JSON.stringify(document))).preset,
    ).toBe("academicColorful");
  });
  it("sanitizes tokens for drawing without dropping raw extension metadata", () => {
    const document = process();
    document.presentation.metadata.style = {
      background: "url(evil)",
      fontFamily: "<script>",
      lineWidth: 999,
    };
    document.presentation.metadata.objectStyles = {
      "pump-1": { stroke: "javascript:alert(1)", fontSize: -4 },
    };
    expect(getDiagramStyle(document).background).toBe(DEFAULT_STYLE.background);
    expect(resolveObjectStyle(document, "pump-1", "pump")).toMatchObject({
      fontFamily: "Arial",
      lineWidth: 8,
      fontSize: 8,
    });
    expect(JSON.stringify(document)).toContain("url(evil)");
  });
  it("uses a meaningful alternate palette and contrasting defaults; energy always has a shape cue", () => {
    const document = process();
    document.presentation = stylePatch(document, {
      preset: "academicColorful",
      colorblind: false,
    });
    const regular = resolveObjectStyle(document, "pump-1", "pump").stroke;
    document.presentation = stylePatch(document, {
      colorblind: true,
      background: "#102030",
    });
    expect(resolveObjectStyle(document, "pump-1", "pump").stroke).not.toBe(
      regular,
    );
    expect(resolveObjectStyle(document, "s", "energy").dasharray).toBeTruthy();
    expect(diagramTextColor("#102030")).toBe("#f1f5f9");
  });
});

describe("configuration-driven exchanger", () => {
  it("draws exactly two tube axial passes in opposite directions and maps its physical left outlet", () => {
    const route = exchangerRouting(2, "counterCurrent");
    expect(route.tubeSegments).toHaveLength(2);
    expect(route.tubeSegments[0].to.x).toBeGreaterThan(
      route.tubeSegments[0].from.x,
    );
    expect(route.tubeSegments[1].to.x).toBeLessThan(
      route.tubeSegments[1].from.x,
    );
    expect(route.tubeOut.x).toBe(route.tubeIn.x);
    const svg = renderExchangerSvg(process(), "exchanger-1");
    expect(svg.match(/data-circuit="tube" data-pass=/g)).toHaveLength(2);
    expect(svg).toContain('data-header-partition="left"');
    expect(svg.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")).toContain(
      "LEFT physical nozzle",
    );
  });
  it("keeps shell paths between the tube sheets and changes co/counter/cross directions", () => {
    const co = exchangerRouting(1, "coCurrent"),
      counter = exchangerRouting(1, "counterCurrent"),
      cross = exchangerRouting(1, "crossFlow");
    expect(co.shellSegments[0].from.x).toBeGreaterThan(155);
    expect(co.shellSegments[0].to.x).toBeLessThan(605);
    expect(
      co.shellSegments[0].to.x - co.shellSegments[0].from.x,
    ).toBeGreaterThan(0);
    expect(
      counter.shellSegments[0].to.x - counter.shellSegments[0].from.x,
    ).toBeLessThan(0);
    expect(cross.shellSegments[0].to.x).toBe(cross.shellSegments[0].from.x);
    expect(cross.shellSegments[0].to.y).toBeGreaterThan(
      cross.shellSegments[0].from.y,
    );
  });
  it("shows unknown roles and preserves unsupported configurations without claiming routing", () => {
    const document = process(),
      equipment = document.engineering.equipment.find(
        (item) => item.id === "exchanger-1",
      )!;
    expect(exchangerState(document, equipment).role).toContain("unknown");
    equipment.config.tubePasses = 16;
    const svg = renderExchangerSvg(document, equipment.id);
    expect(svg).toContain("routing unavailable");
    expect(svg).not.toContain('data-circuit-path="tube"');
    expect(equipment.config.tubePasses).toBe(16);
  });
  it("converts operating units with offsets and preserves unknown and zero", () => {
    expect(() =>
      convertOperatingQuantity(
        { value: 1e15, unit: "bar", dimension: "pressure" },
        "Pa",
      ),
    ).toThrow("portable numeric range");
    expect(
      convertOperatingQuantity(
        { value: 273.15, unit: "K", dimension: "temperature" },
        "degC",
      ).value,
    ).toBe(0);
    expect(
      convertOperatingQuantity(
        { value: null, unit: "K", dimension: "temperature" },
        "degC",
      ).value,
    ).toBeNull();
    expect(
      convertOperatingQuantity(
        { value: 0, unit: "bar", dimension: "pressure" },
        "kPa",
      ).value,
    ).toBe(0);
  });
});

describe("portable vector export", () => {
  it("escapes content and expands bounds for wide labels/title without editor artifacts", () => {
    const document = process();
    document.title = "WWW".repeat(60) + ' <script>&"';
    document.engineering.equipment[0].tag = "W".repeat(90);
    const figure = diagramSvg(document);
    expect(figure.width).toBeGreaterThan(textWidth(document.title, 18));
    expect(figure.svg).toContain("&lt;script&gt;&amp;&quot;");
    expect(figure.svg).not.toContain("react-flow__handle");
    expect(figure.svg).not.toContain("context-stroke");
    expect(figure.svg).toContain('id="arrow-stream-0"');
  });
  it("selection includes selected stream endpoints, and rejects an empty selection", () => {
    const figure = diagramSvg(process(), {
      target: "selection",
      selectionIds: ["stream-1"],
    });
    expect(figure.svg).toContain("F-101");
    expect(figure.svg).toContain("P-101");
    expect(figure.svg).not.toContain("PR-101 (");
    expect(() => diagramSvg(process(), { target: "selection" })).toThrow(
      "Select equipment",
    );
  });
  it("supports transparent figures and standalone detail with long identifiers", () => {
    const document = process();
    const equipment = document.engineering.equipment.find(
      (item) => item.id === "exchanger-1",
    )!;
    equipment.tag = "W".repeat(180);
    const detail = diagramSvg(document, {
      target: "equipment",
      equipmentId: equipment.id,
      transparent: true,
    });
    expect(detail.width).toBeGreaterThan(180 * 13);
    expect(detail.svg).toContain(equipment.tag);
    expect(detail.svg).not.toContain('fill="#ffffff"');
  });
  it("handles special object IDs without inherited layout lookup", () => {
    const document = process();
    document.engineering.equipment = [
      { ...document.engineering.equipment[0], id: "__proto__" },
    ];
    document.engineering.streams = [];
    document.presentation.nodes = {};
    expect(diagramSvg(document).svg).not.toContain("undefined");
  });
  it("rejects unusable PNG allocation requests", () => {
    for (const [width, height] of [
      [0, 800],
      [8193, 800],
      [8000, 8000],
      [100.5, 800],
    ])
      expect(() => validatePngSize(width, height)).toThrow("PNG dimensions");
    expect(() => validatePngSize(1600, 1000)).not.toThrow();
  });
});
