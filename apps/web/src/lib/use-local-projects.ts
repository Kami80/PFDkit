"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useEditorStore } from "./editor-store";
import {
  LocalProjectStore,
  PersistenceError,
  PROJECT_PREFIX,
  type ProjectRecord,
} from "./persistence";
import { exampleDocument, parseDocument, type Document } from "./contract";
import { isAccountDocument } from "./account-document-scope";

let activeFlusher: () => Promise<boolean> = async () => true;
export function flushLocalProject(): Promise<boolean> {
  return activeFlusher();
}

export function blankProject(): Document {
  const document = structuredClone(exampleDocument);
  document.id = crypto.randomUUID();
  document.title = "Untitled process";
  document.metadata = {};
  document.education = { notes: "", metadata: {}, annotations: [], steps: [] };
  document.engineering = {
    equipment: [],
    streams: [],
    components: [],
    sections: [],
  };
  document.presentation = {
    nodes: {},
    viewport: { x: 0, y: 0, zoom: 1 },
    metadata: {},
  };
  return document;
}
export function useLocalProjects() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]),
    [snapshots, setSnapshots] = useState<ProjectRecord[]>([]),
    [status, setStatus] = useState("Preparing local storage…"),
    [ready, setReady] = useState(false);
  const initial = useRef(useEditorStore.getState().document);
  const storage = useRef<LocalProjectStore | null>(null),
    revisions = useRef(new Map<string, number>()),
    saved = useRef(new Map<string, string>());
  const queue = useRef<Promise<boolean>>(Promise.resolve(true)),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    navigation = useRef(0);
  const refresh = useCallback(() => {
    if (storage.current) {
      setProjects(storage.current.list());
      setSnapshots(storage.current.snapshots());
    }
  }, []);
  const save = useCallback(
    (
      captured: Document = useEditorStore.getState().document,
      force = false,
    ): Promise<boolean> => {
      if (isAccountDocument(captured.id)) return Promise.resolve(true);
      // Capture the exact document before queuing a Web Lock. Its identity never comes from a later project.
      const snapshot = structuredClone(captured),
        serialized = JSON.stringify(snapshot);
      const operation = async () => {
        const store = storage.current;
        if (!store) {
          setStatus(
            "Storage unavailable. Export JSON before switching projects.",
          );
          return false;
        }
        if (saved.current.get(snapshot.id) === serialized) {
          if (!force) return true;
          try {
            if (
              store.load(snapshot.id).record.revision ===
              revisions.current.get(snapshot.id)
            )
              return true;
          } catch {
            /* An explicit save must detect a removed or damaged primary record. */
          }
        }
        const action = (): boolean => {
          try {
            const record = store.save(
              snapshot,
              revisions.current.get(snapshot.id) || 0,
            );
            revisions.current.set(snapshot.id, record.revision);
            saved.current.set(snapshot.id, serialized);
            setStatus(store.lastWarning || "Saved locally");
            refresh();
            return true;
          } catch (error) {
            if (
              error instanceof PersistenceError &&
              error.code === "conflict"
            ) {
              try {
                const fork = store.duplicate(snapshot, " (conflict recovery)");
                revisions.current.set(fork.document.id, fork.record.revision);
                saved.current.set(
                  fork.document.id,
                  JSON.stringify(fork.document),
                );
                if (useEditorStore.getState().document === captured)
                  useEditorStore.getState().replaceDocument(fork.document);
                setStatus(
                  "Conflict: your edits were saved as a separate recovery project. Reopen either version from Local projects.",
                );
                refresh();
                return true;
              } catch (forkError) {
                setStatus(
                  (forkError instanceof Error
                    ? forkError.message
                    : "Storage unavailable.") +
                    " Current edits remain open; export JSON before switching.",
                );
                return false;
              }
            }
            setStatus(
              error instanceof Error
                ? error.message
                : "Storage unavailable. Export JSON.",
            );
            return false;
          }
        };
        try {
          return navigator.locks
            ? await navigator.locks.request("pfdkit-local-save", action)
            : action();
        } catch {
          setStatus(
            "Local save lock unavailable. Export JSON to preserve this document.",
          );
          return false;
        }
      };
      queue.current = queue.current.catch(() => false).then(operation);
      return queue.current;
    },
    [refresh],
  );
  const flush = async () => {
    clearTimeout(timer.current);
    return save(useEditorStore.getState().document);
  };
  useEffect(() => {
    let mounted = true;
    activeFlusher = () => {
      clearTimeout(timer.current);
      return save(useEditorStore.getState().document, true);
    };
    const initialize = () => {
      if (!mounted) return;
      try {
        const store = new LocalProjectStore(window.localStorage);
        storage.current = store;
        const id = store.activeId();
        if (id && useEditorStore.getState().document === initial.current) {
          try {
            const loaded = store.load(id);
            revisions.current.set(id, loaded.record.revision);
            saved.current.set(id, JSON.stringify(loaded.document));
            useEditorStore.getState().replaceDocument(loaded.document);
            setStatus("Reopened local project");
          } catch (error) {
            saved.current.set(
              initial.current.id,
              JSON.stringify(initial.current),
            );
            setStatus(
              (error instanceof Error ? error.message : "Recovery required.") +
                " Recover snapshots from Local projects.",
            );
          }
        } else {
          if (useEditorStore.getState().document === initial.current)
            saved.current.set(
              initial.current.id,
              JSON.stringify(initial.current),
            );
          setStatus("Autosave ready");
        }
        refresh();
      } catch {
        setStatus("Storage unavailable. Export JSON to keep your work.");
      }
      setReady(true);
    };
    queueMicrotask(initialize);
    const unsubscribe = useEditorStore.subscribe((state, previous) => {
      if (isAccountDocument(state.document.id)) {
        clearTimeout(timer.current);
        return;
      }
      if (
        state.document === previous.document ||
        JSON.stringify(state.document) === saved.current.get(state.document.id)
      )
        return;
      if (
        state.document.id !== previous.document.id &&
        !isAccountDocument(previous.document.id) &&
        JSON.stringify(previous.document) !==
          saved.current.get(previous.document.id)
      )
        void save(previous.document);
      setStatus("Unsaved changes…");
      clearTimeout(timer.current);
      const captured = state.document;
      timer.current = setTimeout(() => void save(captured), 600);
    });
    const visibility = () => {
      if (document.visibilityState === "hidden") {
        clearTimeout(timer.current);
        void save(useEditorStore.getState().document);
      }
    };
    const crossTab = (event: StorageEvent) => {
      if (!event.key?.startsWith(PROJECT_PREFIX)) return;
      try {
        refresh();
        const active = useEditorStore.getState().document.id;
        if (event.key === PROJECT_PREFIX + active && event.newValue) {
          const record = JSON.parse(event.newValue) as ProjectRecord;
          if (
            record.writer !== storage.current?.writer &&
            record.revision >= (revisions.current.get(active) || 0)
          )
            setStatus(
              "Another tab changed this project. Save creates a recovery copy; Reopen loads its current version.",
            );
        }
        if (event.key === PROJECT_PREFIX + active && !event.newValue)
          setStatus(
            "This project was deleted in another tab. Export JSON or use Save now to create a separate recovery copy.",
          );
      } catch {
        setStatus(
          "Another tab wrote unreadable storage. Current edits remain open; export JSON or recover a snapshot.",
        );
      }
    };
    let preference = "system";
    try {
      preference = localStorage.getItem("pfdkit:ui-theme") || "system";
    } catch {
      /* Optional UI preference. */
    }
    const media = matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const choice = document.documentElement.dataset.preference || preference;
      document.documentElement.dataset.theme =
        choice === "system" ? (media.matches ? "dark" : "light") : choice;
    };
    applyTheme();
    media.addEventListener("change", applyTheme);
    window.addEventListener("storage", crossTab);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      mounted = false;
      unsubscribe();
      clearTimeout(timer.current);
      window.removeEventListener("storage", crossTab);
      document.removeEventListener("visibilitychange", visibility);
      media.removeEventListener("change", applyTheme);
    };
  }, [refresh, save]);
  const install = (document: Document, record?: ProjectRecord) => {
    clearTimeout(timer.current);
    if (record) {
      revisions.current.set(document.id, record.revision);
      saved.current.set(document.id, JSON.stringify(document));
      storage.current?.activate(document.id);
    }
    useEditorStore.getState().replaceDocument(document);
  };
  const open = async (record: ProjectRecord) => {
    const token = ++navigation.current;
    if (record.id !== useEditorStore.getState().document.id && !(await flush()))
      return;
    if (token !== navigation.current) return;
    try {
      const loaded = storage.current!.load(record.id);
      install(loaded.document, loaded.record);
      setStatus(storage.current?.lastWarning || "Project reopened locally");
    } catch (error) {
      setStatus(String(error));
    }
  };
  const create = async () => {
    const token = ++navigation.current;
    if (!(await flush()) || token !== navigation.current) return;
    install(blankProject());
  };
  const duplicate = async (
    document: Document = useEditorStore.getState().document,
  ) => {
    const captured = structuredClone(document),
      token = ++navigation.current;
    if (!(await flush()) || token !== navigation.current) return false;
    try {
      if (!storage.current)
        throw new Error("Storage unavailable. Export JSON instead.");
      const copy = storage.current.duplicate(captured);
      install(copy.document, copy.record);
      refresh();
      setStatus("Local project duplicated");
      return true;
    } catch (error) {
      setStatus(String(error));
      return false;
    }
  };
  const recover = async (record: ProjectRecord) => {
    try {
      if (await duplicate(parseDocument(record.document)))
        setStatus("Snapshot recovered into a separate project");
    } catch (error) {
      setStatus(String(error));
    }
  };
  const remove = async (id: string) => {
    clearTimeout(timer.current);
    await queue.current;
    try {
      const current = useEditorStore.getState().document;
      if (current.id === id) saved.current.set(id, JSON.stringify(current));
      storage.current?.remove(id);
      revisions.current.delete(id);
      if (useEditorStore.getState().document.id === id) install(blankProject());
      saved.current.delete(id);
      refresh();
      setStatus("Local project deleted");
    } catch (error) {
      setStatus(String(error));
    }
  };
  return {
    projects,
    snapshots,
    status,
    ready,
    save: () => save(useEditorStore.getState().document, true),
    open,
    create,
    duplicate,
    recover,
    remove,
  };
}
