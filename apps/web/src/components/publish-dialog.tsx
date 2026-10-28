"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  api,
  errorMessage,
  type Account,
  type Project,
} from "@/lib/platform-api";
import { Modal } from "./modal";
import { DocumentPreview } from "./document-preview";
import css from "./platform.module.css";

export function PublishDialog({
  project,
  user,
  onClose,
  onChange,
}: {
  project: Project;
  user: Account;
  onClose: () => void;
  onChange: (project: Project) => void;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const publication = project.publication;
  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      await api(`/projects/${project.id}/publish`, "POST", {
        revision: project.currentRevision,
        title: data.get("title"),
        description: data.get("description"),
        author: data.get("author"),
        license: data.get("license"),
        category: data.get("category"),
        tags: String(data.get("tags") ?? "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        sourceUrl: data.get("sourceUrl") || "",
        isTemplate: data.get("isTemplate") === "on",
      });
      onChange(await api<Project>(`/projects/${project.id}`));
      setMessage(
        `Published revision ${project.currentRevision}. Later account edits stay private until you confirm another public update.`,
      );
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Publish and sharing" onClose={onClose}>
      <p>
        This publishes a fixed copy of revision{" "}
        <strong>{project.currentRevision}</strong> to the academic library.
        Inspect the diagram and attribution below. Private lecture notes and
        account fields are excluded by the server.
      </p>
      {publication && (
        <div className={css.card}>
          <p>
            Currently public: revision {publication.revision} ·{" "}
            {publication.license}
          </p>
          <Link href={`/library/${publication.id}`}>
            Open public diagram / share link
          </Link>
          <p>
            Unpublishing removes library discovery and public access. Copies and
            exports already obtained by others remain available to them under
            their license.
          </p>
          <button
            disabled={busy}
            type="button"
            onClick={async () => {
              setBusy(true);
              try {
                await api(`/projects/${project.id}/publish`, "DELETE");
                onChange(await api<Project>(`/projects/${project.id}`));
                setMessage(
                  "Unpublished. The public link is no longer accessible.",
                );
              } catch (error) {
                setMessage(errorMessage(error));
              } finally {
                setBusy(false);
              }
            }}
          >
            Unpublish diagram
          </button>
        </div>
      )}
      {project.document && (
        <DocumentPreview
          document={{
            ...project.document,
            education: {
              ...project.document.education,
              notes: "",
              steps: (project.document.education.steps ?? []).map((step) => ({
                ...step,
                notes: "",
              })),
            },
          }}
        />
      )}
      <form className={css.form} onSubmit={publish}>
        <label>
          Public title
          <input
            name="title"
            defaultValue={publication?.title ?? project.title}
            required
            maxLength={200}
          />
        </label>
        <label>
          Public description
          <textarea
            name="description"
            defaultValue={publication?.description ?? project.description}
            required
            maxLength={4000}
          />
        </label>
        <label>
          Author attribution
          <input
            name="author"
            defaultValue={publication?.author ?? user.username}
            required
            maxLength={200}
          />
        </label>
        <label>
          Content license
          <select
            name="license"
            defaultValue={publication?.license ?? ""}
            required
          >
            <option value="" disabled>
              Choose permission deliberately
            </option>
            <option value="CC-BY-4.0">
              CC BY 4.0 — reuse with attribution
            </option>
            <option value="CC0-1.0">CC0 1.0 — public domain dedication</option>
          </select>
        </label>
        <label>
          Process category
          <input
            name="category"
            defaultValue={publication?.category ?? ""}
            placeholder="e.g. Separation"
            required
            maxLength={80}
          />
        </label>
        <label>
          Equipment tags (comma separated)
          <input
            name="tags"
            defaultValue={publication?.tags.join(", ") ?? ""}
            maxLength={800}
          />
        </label>
        <label>
          Source / provenance URL
          <input
            name="sourceUrl"
            type="url"
            pattern="https?://.*"
            defaultValue={publication?.sourceUrl ?? ""}
            placeholder="https://…"
          />
        </label>
        <label>
          <input
            name="isTemplate"
            type="checkbox"
            defaultChecked={publication?.isTemplate}
          />{" "}
          Offer this diagram as an educational template
        </label>
        <label>
          <input type="checkbox" required /> I have the rights to contribute
          this content and approve publishing the displayed revision and
          attribution under the selected license.
        </label>
        <button disabled={busy} type="submit">
          {busy
            ? "Publishing…"
            : publication
              ? `Confirm public update to revision ${project.currentRevision}`
              : `Confirm publish revision ${project.currentRevision}`}
        </button>
      </form>
      <p role="status">{message}</p>
    </Modal>
  );
}
