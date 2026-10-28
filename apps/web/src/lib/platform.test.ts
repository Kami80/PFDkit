import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { AccountAutosave } from "./account-autosave";
import {
  api,
  ApiError,
  ACCOUNT_REQUEST_TIMEOUT_MS,
  pendingDraft,
  pendingDrafts,
  rememberDraft,
  type Project,
} from "./platform-api";
import { exampleDocument } from "./contract";
import { diagramSvg } from "./export-svg";
import { isAccountDocument } from "./account-document-scope";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  };
}
const project = (): Project => ({
  id: "account-project",
  title: "Private",
  description: "",
  visibility: "private",
  currentRevision: 1,
  updatedAt: "2026-10-28T00:00:00Z",
  document: structuredClone(exampleDocument),
});
beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Account recovery and optimistic saves", () => {
  it("marks bound account documents so guest autosave cannot fork their identity", () => {
    const p = project(),
      controller = new AccountAutosave(() => {});
    controller.attach(7, p);
    expect(isAccountDocument(p.document!.id)).toBe(true);
    expect(isAccountDocument("different-guest-document")).toBe(false);
    controller.detach();
    expect(isAccountDocument(p.document!.id)).toBe(false);
  });
  it("preserves both editor branches in shared same-origin storage and undo only removes its own draft", async () => {
    const p = project(),
      request = vi
        .fn()
        .mockRejectedValue(
          new ApiError(409, "revision_conflict", "Newer revision exists"),
        );
    const first = new AccountAutosave(() => {}, request),
      second = new AccountAutosave(() => {}, request);
    first.attach(7, p);
    second.attach(7, p);
    const firstEdit = { ...p.document!, title: "First tab branch" },
      secondEdit = { ...p.document!, title: "Second tab branch" };
    first.observe(firstEdit);
    second.observe(secondEdit);
    expect(
      pendingDrafts(7, p.id)
        .map((d) => d.document.title)
        .sort(),
    ).toEqual(["First tab branch", "Second tab branch"]);
    first.observe(p.document!);
    expect(pendingDrafts(7, p.id).map((d) => d.document.title)).toEqual([
      "Second tab branch",
    ]);
    first.observe(firstEdit);
    await first.save(firstEdit);
    await second.save(secondEdit);
    expect(pendingDrafts(7, p.id)).toHaveLength(2);
    const recovered = new AccountAutosave(
      () => {},
      vi.fn().mockResolvedValue({ ...p, currentRevision: 2 }),
    );
    const branch = pendingDrafts(7, p.id).find(
      (d) => d.document.title === firstEdit.title,
    )!;
    recovered.attach(7, p, branch);
    recovered.observe(branch.document);
    await recovered.save(branch.document);
    expect(pendingDrafts(7, p.id).map((d) => d.document.title)).toEqual([
      "Second tab branch",
    ]);
  });
  it("cancels a pending edit when undo returns to the saved document", async () => {
    const request = vi.fn(),
      p = project(),
      controller = new AccountAutosave(() => {}, request);
    controller.attach(7, p);
    controller.observe({ ...p.document!, title: "Undone edit" });
    controller.observe(p.document!);
    await vi.runAllTimersAsync();
    expect(request).not.toHaveBeenCalled();
    expect(pendingDraft(7, p.id)).toBeNull();
    expect(controller.binding?.state).toBe("saved");
  });
  it("saves an undo made during an in-flight edit even when it matches the previous saved revision", async () => {
    let acknowledge!: (value: Project) => void;
    const p = project(),
      edited = { ...p.document!, title: "Inflight edit" };
    const request = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Project>((resolve) => {
            acknowledge = resolve;
          }),
      )
      .mockResolvedValueOnce({ ...p, currentRevision: 3 });
    const controller = new AccountAutosave(() => {}, request);
    controller.attach(7, p);
    controller.observe(edited);
    const saving = controller.save(edited);
    await Promise.resolve();
    await Promise.resolve();
    controller.observe(p.document!);
    expect(pendingDraft(7, p.id)?.document).toEqual(p.document);
    acknowledge({ ...p, currentRevision: 2 });
    await saving;
    expect(controller.binding?.state).toBe("pending");
    await vi.runAllTimersAsync();
    expect(request.mock.calls.map((call) => call[2])).toEqual([
      { document: edited, expectedRevision: 1 },
      { document: p.document, expectedRevision: 2 },
    ]);
    expect(controller.binding?.saved).toBe(JSON.stringify(p.document));
    expect(controller.binding?.state).toBe("saved");
    expect(pendingDraft(7, p.id)).toBeNull();
  });
  it("serializes in-flight saves and retains a newer pending draft until acknowledged", async () => {
    let acknowledge!: (value: unknown) => void;
    const calls: unknown[] = [];
    const request = vi.fn((path, method, body) => {
      calls.push(body);
      return new Promise((resolve) => {
        acknowledge = resolve;
      });
    }) as typeof api;
    const p = project(),
      controller = new AccountAutosave(() => {}, request);
    controller.attach(7, p);
    const first = { ...p.document!, title: "First edit" },
      second = { ...first, title: "Second edit" };
    controller.observe(first);
    const savingFirst = controller.save(first);
    await Promise.resolve();
    await Promise.resolve();
    controller.observe(second);
    const savingSecond = controller.save(second);
    acknowledge({ ...p, currentRevision: 2, document: first });
    await savingFirst;
    expect(pendingDraft(7, p.id)?.document.title).toBe("Second edit");
    await Promise.resolve();
    acknowledge({ ...p, currentRevision: 3, document: second });
    await savingSecond;
    expect(calls).toEqual([
      { document: first, expectedRevision: 1 },
      { document: second, expectedRevision: 2 },
    ]);
    expect(pendingDraft(7, p.id)).toBeNull();
    expect(controller.binding?.state).toBe("saved");
  });
  it("stops after a stale revision without silently overwriting and preserves edits", async () => {
    const request = vi
      .fn()
      .mockRejectedValue(
        new ApiError(409, "revision_conflict", "Newer revision exists", 3),
      );
    const p = project(),
      controller = new AccountAutosave(() => {}, request);
    controller.attach(7, p);
    const edit = { ...p.document!, title: "My unsaved edits" };
    controller.observe(edit);
    expect(await controller.save(edit)).toBe(false);
    expect(await controller.save(edit)).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
    expect(controller.binding?.state).toBe("conflict");
    expect(pendingDraft(7, p.id)?.document.title).toBe(edit.title);
    expect(pendingDraft(8, p.id)).toBeNull();
  });
  it("recovers interrupted requests with the original revision and allows retry", async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Network interrupted"))
      .mockResolvedValueOnce({ ...project(), currentRevision: 2 });
    const p = project(),
      edit = { ...p.document!, title: "Recovered edit" };
    const draft = {
      projectId: p.id,
      expectedRevision: 1,
      document: edit,
      savedAt: "2026-10-28T00:00:00Z",
    };
    rememberDraft(7, draft);
    const controller = new AccountAutosave(() => {}, request);
    controller.attach(7, { ...p, currentRevision: 4 }, draft);
    expect(await controller.save(edit)).toBe(false);
    expect(controller.binding?.state).toBe("failed");
    expect(pendingDraft(7, p.id)).not.toBeNull();
    expect(await controller.save(edit)).toBe(true);
    expect(request.mock.calls[1][2].expectedRevision).toBe(1);
    expect(pendingDraft(7, p.id)).toBeNull();
  });
  it("does not write an unrelated local project into an account binding", async () => {
    const request = vi.fn();
    const p = project(),
      controller = new AccountAutosave(() => {}, request);
    controller.attach(7, p);
    const unrelated = { ...p.document!, id: "another-local-document" };
    controller.observe(unrelated);
    await controller.save(unrelated);
    await vi.runAllTimersAsync();
    expect(request).not.toHaveBeenCalled();
  });
});

it.each(["csrf", "save", "body"])(
  "bounds a hung %s request and allows account-save retry",
  async (phase) => {
    const never = () => new Promise<Response>(() => {});
    const fetch = vi.fn();
    if (phase === "csrf") fetch.mockImplementationOnce(never);
    else {
      fetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ csrfToken: "token" })),
      );
      if (phase === "save") fetch.mockImplementationOnce(never);
      else
        fetch.mockResolvedValueOnce({
          status: 200,
          ok: true,
          json: () => new Promise(() => {}),
        });
    }
    vi.stubGlobal("fetch", fetch);
    const p = project(),
      edit = { ...p.document!, title: "Retained after timeout" };
    const controller = new AccountAutosave(() => {});
    controller.attach(7, p);
    controller.observe(edit);
    const saving = controller.save(edit);
    await vi.advanceTimersByTimeAsync(ACCOUNT_REQUEST_TIMEOUT_MS);
    expect(await saving).toBe(false);
    expect(controller.binding?.state).toBe("failed");
    expect(controller.binding?.message).toContain("timed out");
    expect(pendingDraft(7, p.id)?.document.title).toBe(edit.title);
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    fetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ csrfToken: "fresh" })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...p, currentRevision: 2 })),
      );
    expect(await controller.save(edit)).toBe(true);
    expect(controller.binding?.state).toBe("saved");
  },
);

it("fetches fresh CSRF for each mutation and keeps same-origin session credentials", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "first" })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ csrfToken: "rotated" })),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
  vi.stubGlobal("fetch", fetch);
  await api("/auth/login", "POST", { username: "student", password: "secret" });
  await api("/projects", "POST", {});
  expect(fetch.mock.calls[1][1].headers["X-CSRFToken"]).toBe("first");
  expect(fetch.mock.calls[3][1].headers["X-CSRFToken"]).toBe("rotated");
  expect(fetch.mock.calls[3][1].credentials).toBe("same-origin");
});

it("retains escaped attribution in SVG figures and equipment details", () => {
  const document = structuredClone(exampleDocument);
  document.title = '<img src=x onerror="alert(1)">';
  document.metadata.attribution = {
    creator: '<script>alert("x")</script>',
    license: "CC-BY-4.0",
    source: "https://example.edu/diagram?a=1&b=2",
    publicationId: "abc",
    revision: 2,
  };
  const svg = diagramSvg(document).svg;
  expect(svg).not.toContain("<script>");
  expect(svg).not.toContain("<img");
  expect(svg).toContain("&lt;script&gt;");
  expect(svg).toContain("CC-BY-4.0");
  expect(svg).toContain('data-attribution="true"');
  expect(svg).toContain("<metadata>");
  const exchanger = document.engineering.equipment.find(
    (e) => e.type === "heatExchanger",
  )!;
  expect(
    diagramSvg(document, { target: "equipment", equipmentId: exchanger.id })
      .svg,
  ).toContain("CC-BY-4.0");
});
