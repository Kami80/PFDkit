import type { Document } from "./contract";

export type Account = { id: number; username: string; email: string };
export type Publication = {
  id: string;
  title: string;
  description: string;
  author: string;
  license: "CC-BY-4.0" | "CC0-1.0";
  category: string;
  tags: string[];
  sourceUrl: string;
  isTemplate: boolean;
  revision: number;
  publishedAt: string;
  updatedAt: string;
  document?: Document;
};
export type Project = {
  id: string;
  title: string;
  description: string;
  visibility: "private" | "public";
  updatedAt: string;
  currentRevision: number;
  document?: Document;
  publication?: Publication | null;
};
export type Revision = {
  number: number;
  author: string;
  createdAt: string;
  document?: Document;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public currentRevision?: number,
  ) {
    super(message);
  }
}

export const ACCOUNT_REQUEST_TIMEOUT_MS = 15_000;

/** Bound the whole operation, including CSRF and response body reads. */
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(
        new ApiError(
          408,
          "request_timeout",
          "Account request timed out. Retry; your open edits and browser recovery draft are preserved.",
        ),
      );
      controller.abort();
    }, ACCOUNT_REQUEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      request<T>(path, method, body, controller.signal),
      deadline,
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

/** Fetch a fresh CSRF token for each mutation; Django rotates it after login. */
async function request<T>(
  path: string,
  method: string,
  body: unknown,
  signal: AbortSignal,
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (method !== "GET") {
    const response = await fetch("/api/auth/csrf", {
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
    if (!response.ok)
      throw new ApiError(
        response.status,
        "csrf_unavailable",
        "Account service unavailable. Your local document is still available.",
      );
    const token = (await response.json()) as { csrfToken: string };
    headers["X-CSRFToken"] = token.csrfToken;
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers,
    signal,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data =
    response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = data?.error;
    const issues = error?.issues ? ` ${JSON.stringify(error.issues)}` : "";
    throw new ApiError(
      response.status,
      error?.code ?? "request_failed",
      response.status === 401
        ? "Your session expired. Sign in again; unsaved edits remain in this browser."
        : (error?.message ??
            `Account request failed (${response.status}). Retry when the service is available.`) +
            issues,
      error?.currentRevision,
    );
  }
  return data as T;
}

export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Request failed. Your open document is preserved.";
}

export type PendingDraft = {
  draftId?: string;
  projectId: string;
  expectedRevision: number;
  document: Document;
  savedAt: string;
};
export const pendingKey = (
  accountId: number,
  projectId: string,
  draftId?: string,
) =>
  `pfdkit:account:${accountId}:pending:${projectId}${draftId ? `:${draftId}` : ""}`;
export function rememberDraft(accountId: number, draft: PendingDraft) {
  try {
    localStorage.setItem(
      pendingKey(accountId, draft.projectId, draft.draftId),
      JSON.stringify(draft),
    );
    return true;
  } catch {
    return false;
  }
}
export function pendingDraft(
  accountId: number,
  projectId: string,
  draftId?: string,
): PendingDraft | null {
  if (draftId === undefined)
    return pendingDrafts(accountId, projectId)[0] ?? null;
  try {
    return JSON.parse(
      localStorage.getItem(pendingKey(accountId, projectId, draftId)) ?? "null",
    );
  } catch {
    return null;
  }
}

/** Keep separate editor branches, including drafts left by closed tabs and legacy drafts. */
export function pendingDrafts(
  accountId: number,
  projectId: string,
): PendingDraft[] {
  const prefix = pendingKey(accountId, projectId);
  const drafts: PendingDraft[] = [];
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key || (key !== prefix && !key.startsWith(`${prefix}:`))) continue;
      try {
        const draft = JSON.parse(
          localStorage.getItem(key) ?? "null",
        ) as PendingDraft | null;
        if (
          draft?.projectId === projectId &&
          draft.document &&
          Number.isInteger(draft.expectedRevision)
        )
          drafts.push({
            ...draft,
            draftId: key === prefix ? undefined : key.slice(prefix.length + 1),
          });
      } catch {
        /* One damaged branch must not hide other recoverable drafts. */
      }
    }
  } catch {
    /* Browser storage may be unavailable. */
  }
  return drafts.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
export function forgetDraft(
  accountId: number,
  projectId: string,
  captured: Document,
  draftId?: string,
) {
  const key = pendingKey(accountId, projectId, draftId);
  let pending: PendingDraft | null = null;
  try {
    pending = JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return;
  }
  // A newer edit made during the request must survive its completion.
  if (
    pending &&
    JSON.stringify(pending.document) === JSON.stringify(captured)
  ) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* Keep the recovery draft. */
    }
  }
}
