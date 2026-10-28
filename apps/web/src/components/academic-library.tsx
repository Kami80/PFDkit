"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  api,
  errorMessage,
  type Publication,
  type Project,
} from "@/lib/platform-api";
import { DocumentPreview } from "./document-preview";
import css from "./platform.module.css";

export function AcademicLibrary({ id }: { id?: string }) {
  const [items, setItems] = useState<Publication[]>([]),
    [publication, setPublication] = useState<Publication | null>(null);
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState(""),
    [tag, setTag] = useState("");
  const [sort, setSort] = useState("updated"),
    [template, setTemplate] = useState(false),
    [page, setPage] = useState(1);
  const [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState("");
  const [refresh, setRefresh] = useState(0),
    [busy, setBusy] = useState(false);
  const [copy, setCopy] = useState<Project | null>(null);
  useEffect(() => {
    let mounted = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setMessage("");
      const search = new URLSearchParams({
        q: query,
        category,
        tag,
        sort,
        page: String(page),
        pageSize: "12",
      });
      if (template) search.set("template", "true");
      const request = id
        ? api<Publication>(`/library/${encodeURIComponent(id)}`)
        : api<{ items: Publication[]; total: number }>(`/library?${search}`);
      void request
        .then((result) => {
          if (!mounted) return;
          if ("items" in result) {
            setItems(result.items);
            setTotal(result.total);
          } else setPublication(result);
        })
        .catch((error) => {
          if (mounted) {
            setPublication(null);
            setItems([]);
            setMessage(errorMessage(error));
          }
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });
    }, 200);
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [id, query, category, tag, sort, template, page, refresh]);
  async function duplicate() {
    if (!publication) return;
    setBusy(true);
    setMessage("");
    try {
      setCopy(
        await api<Project>(`/library/${publication.id}/duplicate`, "POST", {}),
      );
      setMessage(
        "Created a private account copy with source attribution. Open My projects in the editor to customize it.",
      );
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function report(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await api(`/library/${publication!.id}/reports`, "POST", {
        reason: data.get("reason"),
      });
      setMessage("Report received for maintainer review.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={css.page}>
      <header>
        <div>
          <h1>{id ? "Public diagram" : "Academic library"}</h1>
          <p>
            Educational process diagrams with explicit authorship, content
            licensing, and revision identity.
          </p>
        </div>
        <nav className={css.row}>
          <Link href="/">Open editor / account</Link>
          {id && <Link href="/library">Browse library</Link>}
        </nav>
      </header>
      {!id && (
        <>
          <div className={css.row}>
            <input
              aria-label="Search public diagrams"
              placeholder="Search title, description, author"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
            <input
              aria-label="Filter process category"
              placeholder="Process category"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
            />
            <input
              aria-label="Filter equipment tag"
              placeholder="Equipment tag"
              value={tag}
              onChange={(e) => {
                setTag(e.target.value);
                setPage(1);
              }}
            />
            <select
              aria-label="Sort library"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
            >
              <option value="updated">Recently published / updated</option>
              <option value="title">Title</option>
            </select>
            <label>
              <input
                type="checkbox"
                checked={template}
                onChange={(e) => {
                  setTemplate(e.target.checked);
                  setPage(1);
                }}
              />{" "}
              Templates only
            </label>
          </div>
          <p className={css.muted}>
            Diagrams carry their displayed content license. Application code,
            educational text, and symbols have separate licensing described in
            the contribution guide.
          </p>
        </>
      )}
      {loading && (
        <p role="status">Loading {id ? "public diagram" : "library"}…</p>
      )}
      {message && (
        <div role="status" className={css.error}>
          {message}{" "}
          <button type="button" onClick={() => setRefresh(refresh + 1)}>
            Refresh
          </button>
        </div>
      )}
      {!loading && !id && !items.length && !message && (
        <p>
          No public diagrams match these filters. Private and unpublished
          projects are excluded.
        </p>
      )}
      {!id && (
        <>
          <div className={css.grid}>
            {items.map((item) => (
              <article key={item.id} className={css.card}>
                <span className={css.badge}>
                  {item.isTemplate ? "Template" : item.category}
                </span>
                <h2>
                  <Link href={`/library/${item.id}`}>{item.title}</Link>
                </h2>
                <p>{item.description}</p>
                <p>
                  {item.author} · {item.license} · revision {item.revision}
                </p>
                <p className={css.muted}>{item.tags.join(" · ")}</p>
              </article>
            ))}
          </div>
          <div className={css.row}>
            <button
              disabled={loading || page <= 1}
              type="button"
              onClick={() => setPage(page - 1)}
            >
              Previous page
            </button>
            <span>
              Page {page} · {total} public diagrams
            </span>
            <button
              disabled={loading || page * 12 >= total}
              type="button"
              onClick={() => setPage(page + 1)}
            >
              Next page
            </button>
          </div>
        </>
      )}
      {id && !loading && publication && (
        <article>
          <h2>{publication.title}</h2>
          <p>{publication.description}</p>
          <p>
            By {publication.author} ·{" "}
            <a
              href={
                publication.license === "CC-BY-4.0"
                  ? "https://creativecommons.org/licenses/by/4.0/"
                  : "https://creativecommons.org/publicdomain/zero/1.0/"
              }
              rel="noreferrer"
            >
              {publication.license}
            </a>{" "}
            · published revision {publication.revision}
          </p>
          <p className={css.muted}>
            {publication.category} · {publication.tags.join(" · ")} · updated{" "}
            {new Date(publication.updatedAt).toLocaleString()}
          </p>
          {/^https?:\/\//i.test(publication.sourceUrl) && (
            <p>
              Provenance:{" "}
              <a href={publication.sourceUrl} rel="noreferrer">
                {publication.sourceUrl}
              </a>
            </p>
          )}
          {publication.document && (
            <DocumentPreview
              document={publication.document}
              attribution={`${publication.title} — ${publication.author}; ${publication.license}; public revision ${publication.revision}; /library/${publication.id}`}
            />
          )}
          <div className={css.row}>
            <button
              disabled={busy}
              type="button"
              onClick={() => void duplicate()}
            >
              {publication.isTemplate
                ? "Use template as private account copy"
                : "Duplicate and customize in my account"}
            </button>
            <Link href="/">Sign in / open account editor</Link>
          </div>
          <p>
            Reuse keeps source attribution and provenance. Sign in to create an
            owned private copy; changes to your copy do not change this
            publication.
          </p>
          {copy && (
            <p role="status">
              Private copy created: <strong>{copy.title}</strong>.{" "}
              <Link href="/">Open My projects to customize</Link>.
            </p>
          )}
          <details>
            <summary>Report unsuitable content or a licensing issue</summary>
            <form className={css.form} onSubmit={report}>
              <label>
                Issue for maintainers
                <textarea
                  name="reason"
                  required
                  minLength={10}
                  maxLength={2000}
                />
              </label>
              <button disabled={busy} type="submit">
                Submit content report
              </button>
            </form>
          </details>
        </article>
      )}
    </main>
  );
}
