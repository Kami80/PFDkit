# PFDkit platform API

Django 5.2, Django Ninja, PostgreSQL and the local `pfd-core` package provide private project storage and deliberate public sharing. Paid services are not required. The browser uses same-origin `/api`; Next.js forwards requests to the API worker. OpenAPI is at `/api/openapi.json`; interactive `/api/docs` is enabled in debug mode.

## Setup

Run from the repository root, using the root virtual environment and a running PostgreSQL instance:

```powershell
.venv/Scripts/python.exe -m pip install -r requirements-dev.lock -r apps/api/requirements.lock
.venv/Scripts/python.exe -m pip install --no-deps -e packages/pfd-core
$env:DATABASE_URL = "postgresql://pfdkit:pfdkit@127.0.0.1:5432/pfdkit"
.venv/Scripts/python.exe apps/api/manage.py migrate
.venv/Scripts/python.exe apps/api/manage.py runserver 127.0.0.1:8000
```

Linux uses `.venv/bin/python`. Production starts `gunicorn config.wsgi:application --bind 0.0.0.0:8000` from `apps/api`. `GET /api/health` probes the database. SQLite URLs are rejected. See [operations](../../docs/platform-operations.md) for Compose, production configuration, migrations and backup/restore.

```powershell
.venv/Scripts/python.exe apps/api/manage.py test platform_api --noinput
.venv/Scripts/python.exe apps/api/manage.py makemigrations --check --dry-run
.venv/Scripts/python.exe -m ruff check apps/api
```

Tests use a separate `test_<database>` PostgreSQL database and require a role with `CREATEDB`. They exercise the real Django HTTP/session/CSRF stack, owner permissions, invalid saves, immutable revisions, actual concurrent writes, public redaction, recovery and moderation.

## Accounts and sessions

All paths below have the `/api` prefix. First fetch `GET /auth/csrf` → `{csrfToken}`. Send same-origin cookies and `X-CSRFToken` on **every** POST/PUT/PATCH/DELETE, including anonymous login, registration, recovery and reports. Missing/invalid CSRF or untrusted origins receive `403 csrf_failed`. Login/register rotate session and CSRF state and return a fresh token. `GET /auth/me` returns `{user:{id,username,email}|null}`.

| Method / endpoint             | Body / result                                                     |
| ----------------------------- | ----------------------------------------------------------------- |
| `POST /auth/register`         | `{username,email,password}` → `{user,csrfToken}`                  |
| `POST /auth/login`            | `{username,password}` → `{user,csrfToken}`                        |
| `POST /auth/logout`           | → `{ok:true,csrfToken}`                                           |
| `POST /auth/recovery`         | `{email}` → identical generic response for known/unknown accounts |
| `POST /auth/recovery/confirm` | `{uid,token,password}` → `{ok:true}`                              |

Database sessions have HttpOnly, SameSite=Lax cookies and expire after 14 days. Hosted HTTPS uses secure cookies. Passwords use Django hashers and validators (minimum 10 characters). Recovery uses Django one-hour, single-use reset tokens; resetting invalidates previous sessions on their next request. Recovery links target `/account?uid=...&token=...`; tokens are never returned through the API. Console email is the local default; links appear in the API terminal. Configure SMTP/another Django backend for hosted delivery and protect console logs. Usernames are unique; an email shared by accounts receives instructions for every active matching account. This release has no MFA or email verification.

Database-backed throttles enforce per-user/direct-peer limits per five minutes: register 10, login 20, recovery 5, reset 10, reports 5 and project creation/duplication 60. Proxy rate limits should supplement these for internet hosting. Client-supplied forwarding headers do not determine throttle identity. All `/api` responses include `Cache-Control: no-store`.

## Projects and revisions

`POST /projects` accepts `{title,description?,document}` and creates a **private** project with revision 1 atomically. Core validation normalizes defaults and checks references, units, configuration, numbers, hierarchy and connections. Warnings remain saveable; errors reject the whole write. Unknown private extension metadata is preserved. Schema `1.0.0` is supported; unsupported versions receive `422 unsupported_version` without migration. Existing additive fields normalize to core defaults.

`GET /projects?q=&sort=updated|title&visibility=private|public&page=1&pageSize=50` returns `{items,total,page,pageSize}` of owned projects only (page size max 100). Metadata includes `id,title,description,visibility,currentRevision,updatedAt,publication`; detail `GET /projects/{uuid}` adds the current `document`. `PATCH` edits `{title?,description?}` independently of the native document title. `DELETE` deliberately removes the original, publication, reports and revision history.

`PUT /projects/{uuid}/document` accepts `{document,expectedRevision}`. A PostgreSQL row lock checks the expected revision before appending a full immutable snapshot with author, schema version and timestamp and advancing the current revision transactionally. A stale save receives `409 revision_conflict` with `error.currentRevision`. Preserve the unsaved document, inspect the new revision, or create a copy; retries never silently overwrite newer content.

`GET /projects/{uuid}/revisions` returns `{items:[{number,author,createdAt}]}`; `GET /projects/{uuid}/revisions/{number}` adds `document`. `POST /projects/{uuid}/restore` takes `{revision,expectedRevision}` and appends a **new** revision. An ORM guard and PostgreSQL trigger prohibit revision UPDATE, including queryset/raw SQL updates. Project deletion is the explicit history-removal operation.

`POST /projects/{uuid}/duplicate` takes `{title?}` and creates a private project, new native document ID, revision 1 and retained provenance. Internal object IDs/references remain consistent. Guest copying uses `POST /projects` and keeps the separate browser document available.

## Permission matrix

| Operation                                     | Anonymous       | Other user             | Owner                           |
| --------------------------------------------- | --------------- | ---------------------- | ------------------------------- |
| Private metadata/document/history             | 401             | 404                    | Read                            |
| Edit/save/restore/duplicate original          | 401             | 404                    | Allowed                         |
| Publish/update/unpublish/delete original      | 401             | 404                    | Allowed                         |
| Active public preview/JSON export             | Read            | Read                   | Read                            |
| Duplicate/use active public template          | 401             | New owned private copy | New owned private copy          |
| Withdrawn/unpublished public view/export/copy | 404             | 404                    | 404; private original available |
| Report active publication                     | CSRF + throttle | CSRF + throttle        | CSRF + throttle                 |

Every private query includes ownership, including revision access. Public UUIDs identify separate publication records. Private project IDs, emails, private history, reports and moderation reasons do not appear in public representations.

## Publishing and public data

`POST /projects/{uuid}/publish` takes `{revision,title,description,author,license,category,tags,sourceUrl?,isTemplate?}`. Licenses are `CC-BY-4.0` or `CC0-1.0`; source links must be absolute HTTP(S), without credentials. The publication stores an identified revision, independent metadata and a sanitized snapshot. Later private edits do not update it. Another deliberate publish call updates the snapshot. `DELETE /projects/{uuid}/publish` removes it from search, preview, export and reuse. Republishing keeps its public UUID/link; previously obtained copies cannot be recalled.

Sanitization strips arbitrary metadata throughout the document, unknown equipment-config keys, lecture notes, step notes and invisible annotations. It retains known registry config fields, allowlisted public attribution, value-status enums, and known primitive style/object-style fields. Visible annotations, tags, operating quantities, equipment descriptions and section/step titles remain public and must be reviewed before publication. User-authored text is plain text; render it through escaped text nodes, never raw HTML. Frontend SVG output escapes text and validates supported styles.

Public duplication retains author, license, source, publication UUID, revision and a modification notice. A separate server-owned project provenance field restores credit on future saves/restores even if editable JSON removes it. Public updates preserve the source chain and cannot relicense CC BY content as CC0. Contributors must honor externally imported content rights; manually modified external JSON cannot prove authorship.

## Library and maintenance

`GET /library?q=&category=&tag=&template=true&sort=updated|title&page=1&pageSize=20` searches titles, descriptions, authors, categories and equipment tags, excluding private/unpublished/withdrawn records. Pagination max is 100. PostgreSQL indexes cover ownership/update, title, category, template and publication visibility/update. Search uses bounded `icontains` matching.

`GET /library/{uuid}` returns public metadata plus `document`; `/library/{uuid}/document` returns the same sanitized native JSON. `POST /library/{uuid}/duplicate` takes `{title?}` and creates the signed-in user's private copy. Template use uses the same endpoint. `POST /library/{uuid}/reports` takes `{reason}` of 10–2000 characters. Reports stay private maintenance data.

```powershell
.venv/Scripts/python.exe apps/api/manage.py seed_examples --owner maintainer
# --publish deliberately publishes newly imported fixtures after review:
.venv/Scripts/python.exe apps/api/manage.py seed_examples --owner maintainer --publish
.venv/Scripts/python.exe apps/api/manage.py moderate_publication reports
.venv/Scripts/python.exe apps/api/manage.py moderate_publication withdraw --publication UUID --reason "Attribution review"
.venv/Scripts/python.exe apps/api/manage.py moderate_publication restore --publication UUID --reason "Attribution confirmed"
.venv/Scripts/python.exe apps/api/manage.py moderate_publication resolve --report 1
.venv/Scripts/python.exe apps/api/manage.py platform_manifest
```

Seeding is idempotent per owner/fixture ID, defaults private and never silently republishes existing imports. Use the owner publication UI for already imported projects. Withdrawal is separate from owner unpublication: the owner cannot bypass it by publishing again, and maintenance restoration does not override the owner's unpublish choice. Originals/revisions remain untouched. The manifest prints stable ownership/revision hashes/publication state for backup comparisons; store it privately.

## Limits and errors

Request bodies are limited to 2 MiB; documents to 1 MiB. Titles/authors max 200 characters, descriptions 4000, categories/tags 80 (30 tags), source URLs 2000, passwords 1024. UUIDs are validated before querying and positive integer revision checks reject wrong types. Core validates internal identifiers/references.

Errors use `{error:{code,message,issues?,currentRevision?}}`: `400` malformed request/invalid recovery; `401` session/credentials; `403` CSRF/withdrawal; `404` unavailable record; `409` stale revision/username conflict; `413` size; `422` request/document/license validation; `429` throttle; `503` database probe. Unknown Django routes may return ordinary 404 pages. A rejected save never advances revision state.
