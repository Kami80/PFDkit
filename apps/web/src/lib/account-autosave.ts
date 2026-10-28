import {
  api,
  ApiError,
  forgetDraft,
  pendingDraft,
  rememberDraft,
  type PendingDraft,
  type Project,
} from "./platform-api";
import type { Document } from "./contract";
import { setAccountDocumentScope } from "./account-document-scope";

export type SaveState =
  "saved" | "pending" | "saving" | "failed" | "conflict" | "expired";
export type Binding = {
  project: Project;
  accountId: number;
  saved: string;
  state: SaveState;
  message: string;
};

/** Each controller belongs to one editor mount. Saves are serialized and scoped to the captured project. */
export class AccountAutosave {
  binding: Binding | null = null;
  private queue: Promise<boolean> = Promise.resolve(true);
  private timer?: ReturnType<typeof setTimeout>;
  private latest?: Document;
  private inFlight: Binding | null = null;
  private readonly draftId = crypto.randomUUID();
  private recovery?: PendingDraft;
  constructor(
    private changed: (binding: Binding | null) => void,
    private request = api,
  ) {}
  attach(accountId: number, project: Project, recovery?: PendingDraft) {
    this.detach();
    this.recovery = recovery;
    this.binding = {
      project: {
        ...project,
        currentRevision: recovery?.expectedRevision ?? project.currentRevision,
      },
      accountId,
      saved: recovery ? "" : JSON.stringify(project.document),
      state: recovery ? "pending" : "saved",
      message: recovery
        ? "Recovered browser draft. Save checks its original revision before writing."
        : `Saved to account · revision ${project.currentRevision}`,
    };
    this.latest = structuredClone(recovery?.document ?? project.document!);
    setAccountDocumentScope(this.latest.id);
    this.changed(this.binding);
  }
  detach() {
    clearTimeout(this.timer);
    this.latest = undefined;
    this.binding = null;
    setAccountDocumentScope(null);
    this.changed(null);
  }
  observe(document: Document) {
    const binding = this.binding;
    if (!binding || document.id !== binding.project.document?.id) return;
    clearTimeout(this.timer);
    this.latest = structuredClone(document);
    if (
      JSON.stringify(document) === binding.saved &&
      this.inFlight !== binding &&
      !["conflict", "expired"].includes(binding.state)
    ) {
      const obsolete = pendingDraft(
        binding.accountId,
        binding.project.id,
        this.draftId,
      );
      if (obsolete)
        forgetDraft(
          binding.accountId,
          binding.project.id,
          obsolete.document,
          this.draftId,
        );
      binding.state = "saved";
      binding.message = `Saved to account · revision ${binding.project.currentRevision}`;
      this.changed({ ...binding });
      return;
    }
    const retained = rememberDraft(binding.accountId, {
      draftId: this.draftId,
      projectId: binding.project.id,
      document,
      expectedRevision: binding.project.currentRevision,
      savedAt: new Date().toISOString(),
    });
    if (["conflict", "expired"].includes(binding.state)) return;
    binding.state = "pending";
    binding.message = retained
      ? "Unsaved account changes · browser recovery draft retained"
      : "Unsaved changes · browser storage unavailable; export JSON before leaving";
    this.changed({ ...binding });
    this.schedule();
  }
  private schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.latest) void this.save(this.latest);
    }, 800);
  }
  save(document: Document): Promise<boolean> {
    clearTimeout(this.timer);
    const binding = this.binding;
    const recovery = this.recovery;
    if (!binding || document.id !== binding.project.document?.id)
      return Promise.resolve(true);
    this.latest = structuredClone(document);
    const operation = async () => {
      if (
        this.binding !== binding ||
        ["conflict", "expired"].includes(binding.state)
      )
        return false;
      const captured = structuredClone(this.latest!);
      if (JSON.stringify(captured) === binding.saved) return true;
      this.inFlight = binding;
      binding.state = "saving";
      binding.message = "Saving to account…";
      this.changed({ ...binding });
      try {
        const project = await this.request<Project>(
          `/projects/${binding.project.id}/document`,
          "PUT",
          {
            document: captured,
            expectedRevision: binding.project.currentRevision,
          },
        );
        binding.project = {
          ...binding.project,
          ...project,
          document: captured,
        };
        binding.saved = JSON.stringify(captured);
        forgetDraft(
          binding.accountId,
          binding.project.id,
          captured,
          this.draftId,
        );
        if (recovery)
          forgetDraft(
            binding.accountId,
            binding.project.id,
            captured,
            recovery.draftId,
          );
        const newer =
          this.binding === binding &&
          JSON.stringify(this.latest) !== binding.saved;
        binding.state = newer ? "pending" : "saved";
        binding.message = newer
          ? "Newer edits pending · browser recovery draft retained"
          : `Saved to account · revision ${project.currentRevision}`;
        if (this.binding === binding) this.changed({ ...binding });
        if (newer) this.schedule();
        return true;
      } catch (error) {
        binding.state =
          error instanceof ApiError && error.status === 409
            ? "conflict"
            : error instanceof ApiError && error.status === 401
              ? "expired"
              : "failed";
        binding.message =
          error instanceof Error
            ? error.message
            : "Save interrupted. Retry; your edits remain open.";
        if (this.binding === binding) this.changed({ ...binding });
        return false;
      } finally {
        if (this.inFlight === binding) this.inFlight = null;
      }
    };
    this.queue = this.queue.catch(() => false).then(operation);
    return this.queue;
  }
}
