import { parseDocument, serializeDocument, type Document } from "./contract";

export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export type ProjectRecord = {
  formatVersion: 1;
  id: string;
  title: string;
  revision: number;
  writer: string;
  updatedAt: string;
  document: string;
  parentRevision: number;
};
export class PersistenceError extends Error {
  constructor(
    public code:
      "unavailable" | "quota" | "conflict" | "corrupt" | "interrupted",
    message: string,
  ) {
    super(message);
    this.name = "PersistenceError";
  }
}
export const PROJECT_PREFIX = "pfdkit:v1:project:";
export const SNAPSHOT_PREFIX = "pfdkit:v1:snapshot:";
export const ACTIVE_KEY = "pfdkit:v1:active";
function snapshotPrefix(id: string): string {
  let encoded: string;
  try {
    encoded = encodeURIComponent(id);
  } catch {
    encoded =
      "%u" +
      id
        .split("")
        .map((character) =>
          character.charCodeAt(0).toString(16).padStart(4, "0"),
        )
        .join("");
  }
  return `${SNAPSHOT_PREFIX}${encoded}:`;
}
const failure = (error: unknown): PersistenceError =>
  error instanceof PersistenceError
    ? error
    : new PersistenceError(
        error instanceof DOMException && error.name === "QuotaExceededError"
          ? "quota"
          : "unavailable",
        "Browser storage could not save this project. Export JSON to keep your work, then free space or enable storage.",
      );

/** Immutable snapshots precede the current pointer, so interrupted/conflicting writes retain recovery data. */
export class LocalProjectStore {
  public lastWarning: string | null = null;
  constructor(
    private storage: StorageLike,
    public readonly writer = crypto.randomUUID(),
  ) {}
  private read(key: string): ProjectRecord | null {
    const text = this.storage.getItem(key);
    if (!text) return null;
    try {
      const record = JSON.parse(text) as ProjectRecord;
      if (
        record.formatVersion !== 1 ||
        !Number.isSafeInteger(record.revision) ||
        typeof record.id !== "string" ||
        typeof record.document !== "string" ||
        typeof record.updatedAt !== "string" ||
        !Number.isFinite(Date.parse(record.updatedAt)) ||
        record.revision < 1 ||
        record.parentRevision !== record.revision - 1 ||
        typeof record.writer !== "string" ||
        !record.writer ||
        typeof record.title !== "string" ||
        (key.startsWith(PROJECT_PREFIX) &&
          key !== PROJECT_PREFIX + record.id) ||
        (key.startsWith(SNAPSHOT_PREFIX) &&
          !key.startsWith(snapshotPrefix(record.id)))
      )
        throw new Error();
      const document = parseDocument(record.document);
      if (document.id !== record.id || document.title !== record.title)
        throw new Error();
      return record;
    } catch {
      throw new PersistenceError(
        "corrupt",
        "A local project is damaged or uses an unsupported format. Recover a snapshot or import an exported JSON file.",
      );
    }
  }
  list(): ProjectRecord[] {
    const projects: ProjectRecord[] = [];
    try {
      for (let index = 0; index < this.storage.length; index++) {
        const key = this.storage.key(index);
        if (key?.startsWith(PROJECT_PREFIX)) {
          try {
            const record = this.read(key);
            if (record) projects.push(record);
          } catch {
            /* Recovery snapshots remain independently accessible. */
          }
        }
      }
    } catch (error) {
      throw failure(error);
    }
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  load(id: string): { record: ProjectRecord; document: Document } {
    try {
      const record = this.read(PROJECT_PREFIX + id);
      if (!record)
        throw new PersistenceError(
          "corrupt",
          "This local project no longer exists. Try recovering its snapshots.",
        );
      return { record, document: parseDocument(record.document) };
    } catch (error) {
      throw failure(error);
    }
  }
  save(document: Document, expectedRevision: number): ProjectRecord {
    this.lastWarning = null;
    try {
      const current = this.read(PROJECT_PREFIX + document.id);
      if ((current?.revision || 0) !== expectedRevision)
        throw new PersistenceError(
          "conflict",
          "This project changed in another tab. Save a separate recovery copy; no existing data was replaced.",
        );
      const record: ProjectRecord = {
        formatVersion: 1,
        id: document.id,
        title: document.title,
        revision: expectedRevision + 1,
        parentRevision: expectedRevision,
        writer: this.writer,
        updatedAt: new Date().toISOString(),
        document: serializeDocument(document),
      };
      const snapshotKey = `${snapshotPrefix(document.id)}${record.revision}:${crypto.randomUUID()}`;
      this.storage.setItem(snapshotKey, JSON.stringify(record));
      // Recheck after snapshot creation; never replace a revision observed from another writer.
      if (
        (this.read(PROJECT_PREFIX + document.id)?.revision || 0) !==
        expectedRevision
      )
        throw new PersistenceError(
          "conflict",
          "A concurrent edit was detected. Your immutable snapshot is available for recovery.",
        );
      try {
        this.storage.setItem(
          PROJECT_PREFIX + document.id,
          JSON.stringify(record),
        );
      } catch {
        throw new PersistenceError(
          "interrupted",
          "Save was interrupted after a recovery snapshot was written. Recover it from Local projects, or export JSON now.",
        );
      }
      try {
        this.storage.setItem(ACTIVE_KEY, document.id);
        this.trimSnapshots(document.id, 8);
      } catch {
        this.lastWarning =
          "Project saved, but recent-project preference or snapshot cleanup failed. Keep a JSON backup.";
      }
      return record;
    } catch (error) {
      throw failure(error);
    }
  }
  snapshots(id?: string): ProjectRecord[] {
    const records: ProjectRecord[] = [];
    try {
      for (let index = 0; index < this.storage.length; index++) {
        const key = this.storage.key(index);
        if (key?.startsWith(id ? snapshotPrefix(id) : SNAPSHOT_PREFIX)) {
          try {
            const record = this.read(key);
            if (record && (!id || record.id === id)) records.push(record);
          } catch {
            /* A bad snapshot cannot hide others. */
          }
        }
      }
      return records.sort(
        (a, b) =>
          b.updatedAt.localeCompare(a.updatedAt) || b.revision - a.revision,
      );
    } catch (error) {
      throw failure(error);
    }
  }
  duplicate(
    document: Document,
    suffix = " copy",
  ): { record: ProjectRecord; document: Document } {
    const copy = structuredClone(document);
    copy.id = crypto.randomUUID();
    copy.title += suffix;
    return { record: this.save(copy, 0), document: copy };
  }
  remove(id: string): void {
    try {
      this.storage.removeItem(PROJECT_PREFIX + id);
      const keys: string[] = [];
      for (let index = 0; index < this.storage.length; index++) {
        const key = this.storage.key(index);
        if (key?.startsWith(snapshotPrefix(id))) keys.push(key);
      }
      keys.forEach((key) => this.storage.removeItem(key));
      if (this.storage.getItem(ACTIVE_KEY) === id)
        this.storage.removeItem(ACTIVE_KEY);
    } catch (error) {
      throw failure(error);
    }
  }
  activeId(): string | null {
    try {
      return this.storage.getItem(ACTIVE_KEY);
    } catch (error) {
      throw failure(error);
    }
  }
  activate(id: string): boolean {
    try {
      this.load(id);
      this.storage.setItem(ACTIVE_KEY, id);
      return true;
    } catch {
      this.lastWarning =
        "Project opened, but its recent-project preference could not be saved. Export JSON before closing.";
      return false;
    }
  }
  private trimSnapshots(id: string, retain: number): void {
    const snapshots: { key: string; record: ProjectRecord }[] = [];
    for (let index = 0; index < this.storage.length; index++) {
      const key = this.storage.key(index);
      if (key?.startsWith(snapshotPrefix(id))) {
        try {
          const record = this.read(key);
          if (record && record.id === id) snapshots.push({ key, record });
        } catch {
          /* Corrupt snapshots do not invalidate a committed primary revision. */
        }
      }
    }
    // Only prune this writer's old, non-branch snapshots. Other tab recovery copies remain.
    snapshots
      .sort((a, b) => b.record.revision - a.record.revision)
      .filter((item) => item.record.writer === this.writer)
      .slice(retain)
      .forEach((item) => this.storage.removeItem(item.key));
  }
}
