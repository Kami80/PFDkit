"use client";
import { useState } from "react";
import { useLocalProjects } from "@/lib/use-local-projects";
import { useEditorStore } from "@/lib/editor-store";
import css from "./m2.module.css";

/** Mount once for the editor lifetime; hiding the library leaves autosave active. */
export function ProjectLibrary() {
  const local = useLocalProjects();
  const [expanded, setExpanded] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { document, setTitle } = useEditorStore();
  return (
    <div className={css.panel} aria-label="Local projects">
      <div className={css.row}>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          Local projects
        </button>
        <button
          type="button"
          onClick={() => void local.save()}
          disabled={!local.ready}
        >
          Save now
        </button>
      </div>
      <p role="status" aria-live="polite" className={css.muted}>
        {local.status}
      </p>
      {expanded && (
        <>
          <label>
            Project name
            <input
              aria-label="Local project name"
              value={document.title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <div className={css.row}>
            <button type="button" onClick={local.create}>
              Create project
            </button>
            <button type="button" onClick={() => local.duplicate()}>
              Duplicate current
            </button>
          </div>
          <ul className={css.list}>
            {local.projects.map((project) => (
              <li key={project.id}>
                <strong>{project.title || "Untitled process"}</strong>
                <p className={css.muted}>
                  Revision {project.revision} ·{" "}
                  {new Date(project.updatedAt).toLocaleString()}
                </p>
                <div className={css.row}>
                  <button type="button" onClick={() => local.open(project)}>
                    Reopen {project.title || "project"}
                  </button>
                  <button type="button" onClick={() => setDeleteId(project.id)}>
                    Delete {project.title || "project"}
                  </button>
                </div>
                {deleteId === project.id && (
                  <div className={css.error}>
                    <p>
                      Delete this project and its snapshots from this browser?
                      The active project will close. Export JSON first if
                      needed.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        local.remove(project.id);
                        setDeleteId(null);
                      }}
                    >
                      Confirm deletion
                    </button>
                    <button type="button" onClick={() => setDeleteId(null)}>
                      Cancel deletion
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {!local.projects.length && (
            <p>
              No local projects yet. Save now or edit the diagram to start
              autosave.
            </p>
          )}
          <details>
            <summary>
              Recover autosave snapshots ({local.snapshots.length})
            </summary>
            <ul className={css.list}>
              {local.snapshots.map((snapshot, index) => (
                <li key={`${snapshot.id}-${snapshot.revision}-${index}`}>
                  <span>
                    {snapshot.title} · revision {snapshot.revision}
                  </span>
                  <button type="button" onClick={() => local.recover(snapshot)}>
                    Recover snapshot
                  </button>
                </li>
              ))}
            </ul>
          </details>
          <p className={css.muted}>
            Projects stay in this browser. Keep exported JSON backups before
            clearing browser data. Conflicts create separate recovery projects;
            storage failures keep the current document open.
          </p>
        </>
      )}
    </div>
  );
}
