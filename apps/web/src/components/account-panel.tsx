"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  api,
  errorMessage,
  pendingDrafts,
  type PendingDraft,
  type Account,
  type Project,
  type Revision,
} from "@/lib/platform-api";
import { AccountAutosave, type Binding } from "@/lib/account-autosave";
import { useEditorStore } from "@/lib/editor-store";
import { blankProject, flushLocalProject } from "@/lib/use-local-projects";
import { parseDocument } from "@/lib/contract";
import { Modal } from "./modal";
import { DocumentPreview } from "./document-preview";
import { PublishDialog } from "./publish-dialog";
import css from "./platform.module.css";

type Dialog = "account" | "projects" | "history" | "publish" | null;
export function AccountPanel({
  initialAccount = false,
  recovery,
}: {
  initialAccount?: boolean;
  recovery?: { uid: string; token: string };
} = {}) {
  const router = useRouter();
  const [user, setUser] = useState<Account | null>(null),
    [dialog, setDialog] = useState<Dialog>(initialAccount ? "account" : null);
  const [binding, setBinding] = useState<Binding | null>(null),
    [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false),
    [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("updated");
  const [visibility, setVisibility] = useState("all"),
    [deleteId, setDeleteId] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<Project | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]),
    [inspection, setInspection] = useState<Revision | null>(null);
  const [authMode, setAuthMode] = useState(recovery ? "reset" : "login");
  const controller = useRef<AccountAutosave | null>(null);
  if (controller.current === null)
    controller.current = new AccountAutosave(setBinding);
  const document = useEditorStore((s) => s.document);
  const active =
    binding && binding.project.document?.id === document.id ? binding : null;
  useEffect(() => {
    let mounted = true;
    if (window.location.pathname === "/account" && window.location.search)
      window.history.replaceState(window.history.state, "", "/account");
    void api<{ user: Account | null }>("/auth/me")
      .then((result) => {
        if (mounted) setUser(result.user);
      })
      .catch(() => {});
    const unsubscribe = useEditorStore.subscribe((state, previous) => {
      if (state.document !== previous.document)
        controller.current?.observe(state.document);
    });
    const beforeUnload = (event: BeforeUnloadEvent) => {
      const current = controller.current?.binding;
      if (current && !["saved"].includes(current.state)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      mounted = false;
      unsubscribe();
      window.removeEventListener("beforeunload", beforeUnload);
      controller.current?.detach();
    };
  }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setLoaded(false);
    let page = 1;
    const all: Project[] = [];
    for (;;) {
      const result = await api<{ items: Project[]; total: number }>(
        `/projects?page=${page}&pageSize=100`,
      );
      all.push(...result.items);
      if (all.length >= result.total || !result.items.length) break;
      page++;
    }
    setProjects(all);
    setLoaded(true);
  }
  async function safeToSwitch() {
    if (!(await flushLocalProject())) {
      setMessage("Save or export the open local document before switching.");
      return false;
    }
    if (!(await controller.current!.save(useEditorStore.getState().document))) {
      setMessage(
        "Account save needs recovery. Retry, export JSON, or keep your edits as a new private copy before switching.",
      );
      return false;
    }
    return true;
  }
  function install(project: Project, recovery?: PendingDraft) {
    if (!user || !project.document)
      throw new Error("The server did not return a project document.");
    const opened = parseDocument(
      JSON.stringify(recovery?.document ?? project.document),
    );
    controller.current!.attach(user.id, project, recovery);
    useEditorStore.getState().replaceDocument(opened);
    if (recovery) controller.current!.observe(opened);
    setDialog(null);
  }
  async function openProject(project: Project, recovery?: PendingDraft) {
    if (!(await safeToSwitch())) return;
    const detail = await api<Project>(`/projects/${project.id}`);
    install(detail, recovery);
  }
  async function copyCurrent() {
    if (!user) return;
    if (!(await flushLocalProject()))
      throw new Error(
        "Save or export your local document before copying it to the account.",
      );
    const captured = structuredClone(useEditorStore.getState().document);
    captured.id = crypto.randomUUID();
    const copy = await api<Project>("/projects", "POST", {
      title: captured.title,
      description: "",
      document: captured,
    });
    // Creation is an explicit copy: the existing local record remains available.
    install(copy);
    setMessage(
      "Created a private account copy. The original remains in Local projects.",
    );
    await refresh();
  }
  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      if (authMode === "recovery") {
        await api("/auth/recovery", "POST", { email: form.get("email") });
        setMessage(
          "If this account exists, recovery instructions will be delivered through the configured email service. Local development prints the message to the API console.",
        );
        return;
      }
      if (authMode === "reset") {
        await api("/auth/recovery/confirm", "POST", {
          uid: form.get("uid"),
          token: form.get("token"),
          password: form.get("password"),
        });
        setAuthMode("login");
        setMessage("Password reset. Sign in with your new password.");
        return;
      }
      await api(`/auth/${authMode}`, "POST", Object.fromEntries(form));
      const session = await api<{ user: Account }>("/auth/me");
      setUser(session.user);
      if (controller.current!.binding?.state === "expired") {
        controller.current!.detach();
        setMessage(
          "Signed in. Open My projects and choose Recover browser draft to resume interrupted edits.",
        );
      }
      setDialog("projects");
      await refresh();
    });
  }
  const visible = projects
    .filter(
      (p) =>
        `${p.title} ${p.description}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (visibility === "all" || p.visibility === visibility),
    )
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title)
        : b.updatedAt.localeCompare(a.updatedAt),
    );
  return (
    <section className={css.panel} aria-label="Account projects">
      <div className={css.row}>
        <button
          type="button"
          onClick={() => {
            setDialog(user ? "projects" : "account");
            if (user) void run(refresh);
          }}
        >
          {user ? "My projects" : "Sign in / register"}
        </button>
        <Link
          href="/library"
          onClick={(event) => {
            event.preventDefault();
            void run(async () => {
              if (await safeToSwitch()) router.push("/library");
            });
          }}
        >
          Academic library
        </Link>
      </div>
      <p>
        {user
          ? `Signed in as ${user.username}`
          : "Guest · diagrams stay usable locally without an account."}
      </p>
      {active && (
        <>
          <p role="status" aria-live="polite" data-testid="account-save-status">
            {active.message}
          </p>
          <div className={css.row}>
            <button
              type="button"
              disabled={busy || active.state === "saving"}
              onClick={() =>
                void run(async () => {
                  await controller.current!.save(
                    useEditorStore.getState().document,
                  );
                })
              }
            >
              Save to account
            </button>
            <button
              type="button"
              onClick={() =>
                void run(async () => {
                  if (!(await safeToSwitch())) return;
                  const data = await api<{ items: Revision[] }>(
                    `/projects/${active.project.id}/revisions`,
                  );
                  setRevisions(data.items);
                  setInspection(null);
                  setDialog("history");
                })
              }
            >
              Revision history
            </button>
            <button
              type="button"
              onClick={() =>
                void run(async () => {
                  if (!(await safeToSwitch())) return;
                  const latest = await api<Project>(
                    `/projects/${active.project.id}`,
                  );
                  controller.current!.binding!.project = latest;
                  setBinding({ ...controller.current!.binding! });
                  setDialog("publish");
                })
              }
            >
              Publish / sharing
            </button>
          </div>
          {["conflict", "failed", "expired"].includes(active.state) && (
            <div className={css.error}>
              <p>
                Your open edits are preserved. A conflict never replaces the
                newer server revision.
              </p>
              <div className={css.row}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(copyCurrent)}
                >
                  Keep edits as a new private copy
                </button>
                {active.state === "expired" && (
                  <button
                    type="button"
                    onClick={() => {
                      setUser(null);
                      setDialog("account");
                    }}
                  >
                    Sign in again
                  </button>
                )}
              </div>
              <details>
                <summary>
                  Discard open edits and load latest server revision
                </summary>
                <p>
                  Use an exported JSON or private recovery copy first if you
                  need these edits.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    void run(async () =>
                      install(
                        await api<Project>(`/projects/${active.project.id}`),
                      ),
                    )
                  }
                >
                  Confirm discard and load latest
                </button>
              </details>
            </div>
          )}
        </>
      )}
      {user && !active && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(copyCurrent)}
        >
          Copy local document to my account
        </button>
      )}
      {message && (
        <p role="status" className={css.error}>
          {message}
        </p>
      )}
      {dialog === "account" && (
        <Modal title="Account" onClose={() => setDialog(null)}>
          <div className={css.row}>
            {["login", "register", "recovery", "reset"].map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={authMode === mode}
                onClick={() => setAuthMode(mode)}
              >
                {
                  {
                    login: "Sign in",
                    register: "Register",
                    recovery: "Recover account",
                    reset: "Use recovery token",
                  }[mode]
                }
              </button>
            ))}
          </div>
          <form className={css.form} onSubmit={authenticate}>
            {["login", "register"].includes(authMode) && (
              <label>
                Username
                <input
                  name="username"
                  autoComplete="username"
                  required
                  maxLength={150}
                />
              </label>
            )}
            {["register", "recovery"].includes(authMode) && (
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </label>
            )}
            {authMode === "reset" && (
              <>
                <label>
                  Recovery user ID
                  <input name="uid" defaultValue={recovery?.uid} required />
                </label>
                <label>
                  Recovery token
                  <input name="token" defaultValue={recovery?.token} required />
                </label>
              </>
            )}
            {authMode !== "recovery" && (
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  required
                  minLength={authMode === "login" ? 1 : 8}
                  autoComplete={
                    authMode === "login" ? "current-password" : "new-password"
                  }
                />
              </label>
            )}
            <button disabled={busy} type="submit">
              {busy
                ? "Working…"
                : {
                    login: "Sign in to account",
                    register: "Create account",
                    recovery: "Send recovery instructions",
                    reset: "Reset password",
                  }[authMode]}
            </button>
          </form>
          <p role="status">{message}</p>
        </Modal>
      )}
      {dialog === "projects" && (
        <Modal title="My projects" onClose={() => setDialog(null)}>
          <p>
            New projects and duplicates are private. Publishing requires a
            separate confirmation.
          </p>
          <div className={css.row}>
            <button
              disabled={busy}
              type="button"
              onClick={() =>
                void run(async () => {
                  if (!(await safeToSwitch())) return;
                  const doc = blankProject();
                  install(
                    await api<Project>("/projects", "POST", {
                      title: doc.title,
                      document: doc,
                    }),
                  );
                  await refresh();
                })
              }
            >
              New private project
            </button>
            <button
              disabled={busy}
              type="button"
              onClick={() => void run(copyCurrent)}
            >
              Copy current document to account
            </button>
            <button
              disabled={busy}
              type="button"
              onClick={() => void run(refresh)}
            >
              Refresh projects
            </button>
            <button
              disabled={busy}
              type="button"
              onClick={() =>
                void run(async () => {
                  if (!(await safeToSwitch())) return;
                  await api("/auth/logout", "POST", {});
                  controller.current!.detach();
                  setUser(null);
                  setDialog(null);
                })
              }
            >
              Sign out
            </button>
          </div>
          <div className={css.row}>
            <input
              aria-label="Search my projects"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title or description"
            />
            <select
              aria-label="Sort my projects"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="updated">Recently updated</option>
              <option value="title">Title</option>
            </select>
            <select
              aria-label="Project visibility"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
            >
              <option value="all">All visibility</option>
              <option value="private">Private</option>
              <option value="public">Published</option>
            </select>
          </div>
          {!loaded && <p role="status">Loading account projects…</p>}
          {loaded && !visible.length && (
            <p>
              No matching projects. Create a private project or copy your local
              diagram.
            </p>
          )}
          {visible.map((project) => (
            <article key={project.id} className={css.card}>
              <h3>{project.title}</h3>
              <p>{project.description || "No description"}</p>
              <p className={css.muted}>
                {project.visibility} · revision {project.currentRevision} ·{" "}
                {new Date(project.updatedAt).toLocaleString()}
              </p>
              <div className={css.row}>
                <button
                  disabled={busy}
                  type="button"
                  onClick={() => void run(() => openProject(project))}
                >
                  Open {project.title}
                </button>
                {user &&
                  pendingDrafts(user.id, project.id).map(
                    (draft, index, drafts) => (
                      <button
                        key={draft.draftId ?? "legacy"}
                        disabled={busy}
                        type="button"
                        onClick={() =>
                          void run(() => openProject(project, draft))
                        }
                      >
                        {drafts.length === 1
                          ? "Recover browser draft"
                          : `Recover browser draft ${index + 1}: ${draft.document.title}`}
                      </button>
                    ),
                  )}
                <button
                  disabled={busy}
                  type="button"
                  onClick={() => setMetadata(project)}
                >
                  Edit project metadata
                </button>
                <button
                  disabled={busy}
                  type="button"
                  onClick={() =>
                    void run(async () => {
                      await api(
                        `/projects/${project.id}/duplicate`,
                        "POST",
                        {},
                      );
                      await refresh();
                    })
                  }
                >
                  Duplicate project
                </button>
                <button
                  disabled={busy}
                  type="button"
                  onClick={() => setDeleteId(project.id)}
                >
                  Delete project
                </button>
              </div>
              {deleteId === project.id && (
                <div className={css.error}>
                  <p>
                    Delete this account project, its revision history, and its
                    publication? This cannot be undone.
                  </p>
                  <div className={css.row}>
                    <button
                      disabled={busy}
                      type="button"
                      onClick={() =>
                        void run(async () => {
                          await api(`/projects/${project.id}`, "DELETE");
                          if (binding?.project.id === project.id)
                            controller.current!.detach();
                          setDeleteId(null);
                          await refresh();
                        })
                      }
                    >
                      Confirm account project deletion
                    </button>
                    <button type="button" onClick={() => setDeleteId(null)}>
                      Cancel deletion
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))}
          {metadata && (
            <form
              className={css.form}
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                void run(async () => {
                  if (
                    active?.project.id === metadata.id &&
                    !(await safeToSwitch())
                  )
                    return;
                  const updated = await api<Project>(
                    `/projects/${metadata.id}`,
                    "PATCH",
                    {
                      title: data.get("title"),
                      description: data.get("description"),
                    },
                  );
                  if (active?.project.id === metadata.id)
                    install(await api<Project>(`/projects/${updated.id}`));
                  setMetadata(null);
                  await refresh();
                  setDialog("projects");
                });
              }}
            >
              <h3>Edit metadata for {metadata.title}</h3>
              <label>
                Project title
                <input
                  name="title"
                  defaultValue={metadata.title}
                  required
                  maxLength={200}
                />
              </label>
              <label>
                Project description
                <textarea
                  name="description"
                  defaultValue={metadata.description}
                  maxLength={4000}
                />
              </label>
              <button disabled={busy} type="submit">
                Save metadata
              </button>
              <button type="button" onClick={() => setMetadata(null)}>
                Cancel metadata editing
              </button>
            </form>
          )}
          <p role="status">{message}</p>
        </Modal>
      )}
      {dialog === "history" && active && (
        <Modal title="Revision history" onClose={() => setDialog(null)}>
          <p>
            Inspect immutable snapshots. Restoration appends a new revision and
            preserves later history.
          </p>
          {revisions.map((revision) => (
            <div className={css.card} key={revision.number}>
              <p>
                Revision {revision.number} · {revision.author} ·{" "}
                {new Date(revision.createdAt).toLocaleString()}
              </p>
              <button
                disabled={busy}
                type="button"
                onClick={() =>
                  void run(async () =>
                    setInspection(
                      await api<Revision>(
                        `/projects/${active.project.id}/revisions/${revision.number}`,
                      ),
                    ),
                  )
                }
              >
                Inspect revision {revision.number}
              </button>
            </div>
          ))}
          {inspection?.document && (
            <>
              <h3>Read-only revision {inspection.number}</h3>
              <DocumentPreview document={inspection.document} />
              <button
                disabled={busy}
                type="button"
                onClick={() =>
                  void run(async () => {
                    if (!(await safeToSwitch())) return;
                    const restored = await api<Project>(
                      `/projects/${active.project.id}/restore`,
                      "POST",
                      {
                        revision: inspection.number,
                        expectedRevision:
                          controller.current!.binding!.project.currentRevision,
                      },
                    );
                    install(restored);
                  })
                }
              >
                Restore revision {inspection.number} as new revision
              </button>
            </>
          )}
          <p role="status">{message}</p>
        </Modal>
      )}
      {dialog === "publish" && active && (
        <PublishDialog
          project={active.project}
          user={user!}
          onClose={() => setDialog(null)}
          onChange={(project) => {
            controller.current!.binding!.project = project;
            setBinding({ ...controller.current!.binding! });
          }}
        />
      )}
    </section>
  );
}
