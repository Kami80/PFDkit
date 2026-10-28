# Milestone 4 acceptance record

M4 is complete and verified on 2026-10-28. All 40 detailed actions and five work packages have implementation and execution evidence. Container execution and target-host delivery checks have the specific operational limits recorded below.

## Implemented scope

| Work package  | Implementation and acceptance boundary                                                                                                                                                                                                                                |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 Backend   | Django 5.2/Django Ninja, PostgreSQL, versioned migrations, owned documents, authoritative `pfd-core` validation, sessions/CSRF, registration/sign-in/sign-out and one-hour password recovery. Requests are limited to 2 MiB; documents to 1 MiB.                      |
| 4.2 Projects  | Personal dashboard, metadata, private creation/duplication/deletion, debounced autosave, browser recovery, explicit guest copy, immutable snapshots, history inspection and restoration, transaction locks and revision conflicts.                                    |
| 4.3 Privacy   | Every private operation scopes the owner. Explicit publication pins an identified revision and sanitizes metadata/configuration, hidden annotations and lecture notes. Public updates/unpublication are deliberate; private changes do not alter the public snapshot. |
| 4.4 Library   | Search, pagination/category/tag/template filters, shared read-only diagram/explorer, public exports, attributed private reuse, retained provenance, licensing rules, contribution guidance, issue reports and operator withdrawal/restoration.                        |
| 4.5 Operation | Compose services and health checks, native installation, migrations/upgrades, PostgreSQL dump/restore verifier, CI, independent package documentation, release procedure and changelog. Container execution has a specific verification limitation below.             |

## Decisions

The schema remains 1.0.0; additive defaults normalize older supported documents.
Invalid references, incompatible equipment values, unsupported versions and size
violations return structured errors without creating a revision. Draft warnings
are accepted. UUID project/publication identities are separate from document
identities; internal equipment/port references remain under the shared contract.

Browser recovery drafts use separate editor branch identities within account/project scopes. Two pages sharing the same storage retained both unsaved branches across failure, undo, reload and selective recovery. Bound account documents bypass guest persistence so local store conflicts cannot fork their identities. Pending and in-flight undo races and 15-second account request deadlines have regression coverage.

Revision numbers are per project. Saves/restorations require the expected current
revision and lock the project in a database transaction. A PostgreSQL trigger
rejects updates to existing revision rows. Restore creates a new snapshot; it does
not erase later history. Deleting a project deliberately removes its publication
and history after confirmation.

Publications store a sanitized fixed snapshot and an explicit revision reference.
Public preview, export and reuse use that snapshot. Generic private metadata,
account fields, hidden annotations, education notes and step notes are removed;
visible descriptions, labels, annotations and entered engineering values remain
publishable content. Author credit is supplied deliberately rather than exposing
the account email. Reuse retains the source/author/license chain; a CC BY source
cannot be republished under CC0. Unpublishing/withdrawal blocks live access and
future platform copies, without recalling already obtained licensed files.

The backend uses database sessions with HttpOnly/SameSite=Lax cookies and CSRF
checks on all mutations, including anonymous authentication and recovery requests.
Production secure-cookie/host/origin/proxy settings are configurable. API responses
are non-cacheable. Recovery tokens expire after an hour and password changes
invalidate existing sessions. Local recovery delivery uses console email; tests
use local memory delivery. No real email, external deployment, repository
publication or remote release was performed.

The guest editor and academic exports remain usable without an API, account,
database or paid AI service. Engineering values remain manually entered or
explicitly illustrative; this platform adds no physical solver.

## Executed verification

The native environment uses Windows, Node 24.16.0/npm 11.13.0, Python 3.11.4 in
the project `.venv`, installed Chromium-compatible Chrome and PostgreSQL 17.11.
PostgreSQL was acquired from its official distributor, checked against the
published full-archive SHA-256 and started in an isolated ignored workspace
cluster on loopback. No existing PostgreSQL installation, service or data was
modified. Python dependencies/tools were installed only using the project
environment; private runtime credentials remain outside source control.

| Verification                      | Result                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PostgreSQL migrations             | All Django and four platform migrations applied; `makemigrations --check --dry-run` reports no drift.                                                                                                                                                                                                                                                                                                                          |
| Backend integration               | All 24 real PostgreSQL/Django HTTP tests passed. Covers account/session/recovery expiry and reuse, CSRF/origin checks, secure cookies, owner/nonowner/anonymous permissions, document round trips and rejected saves, immutable trigger, concurrent writer conflict, public pinning/redaction, licensing/reuse and moderation.                                                                                                 |
| Real backup/restore               | A custom `pg_dump` was restored with `pg_restore` into a newly created separate database. Exact table manifests matched for 2 accounts, 2 sessions, 3 projects, 4 revisions and 1 publication. Restored login, ownership, anonymous denial, revision pinning, attribution and the immutable trigger were exercised again.                                                                                                      |
| Independent HTTP audit            | Six real HTTP scenarios passed: private/revision denial, rejected-save atomicity, publication privacy, pinned public revision and stale-save rejection, attributed owned reuse, and unpublication denying view/export/reuse while preserving the copied project. The six scenarios passed again through the production Next.js proxy.                                                                                          |
| Shared contract/core              | Generated schema/types current; all 69 Python core tests, Ruff and mypy passed.                                                                                                                                                                                                                                                                                                                                                |
| Independent Python package        | Built wheel and sdist, installed the wheel into an isolated target using `.venv`, imported that target and validated/round-tripped all five teaching examples.                                                                                                                                                                                                                                                                 |
| Frontend and production workflows | All 98 frontend unit tests, lint and TypeScript passed. The production Next.js 16.4.3 build passed separately after a restricted build stalled and was stopped. All 18 guest/teaching/export and account/library/shared-tab browser workflows passed against that production build in 21.5 seconds. An additional production browser test blocked every API request and passed guest drawing, local reopening and JSON export. |
| Compose structure                 | Existing `js-yaml` parsed all four services and health-check definitions. Docker image builds/startup were not executed.                                                                                                                                                                                                                                                                                                       |

Restore evidence is in ignored
`.artifacts/restore-check/3ea2ad86234e/result.json`; it records the fresh source and
restore database names and equality checks. The verifier never overwrites or
deletes an existing database. Other evidence includes
`.artifacts/m4-postgres-runtime.json`, `.artifacts/m4-python-package-report.json`,
`.artifacts/m4-independent-api-report.json` and
`.artifacts/m4-compose-structure.json`, `.artifacts/m4-final-check.log`, `.artifacts/m4-production-build.log` and `.artifacts/m4-production-e2e.log`. The combined check passed its lint/types/unit/core/contract phases but its restricted build was interrupted; the separate production build exited successfully. Dumps, native manifests, browser traces,
credentials and machine logs are private local artifacts, not release inputs.

## Operational limits

No Docker daemon was installed. A request to download the official standalone
Compose configuration validator was rejected because automatic approval review
could not complete after a usage limit; the rejection was not a determination
that the download was unsafe. The download was not retried through another path.
YAML structure validation and native PostgreSQL operation do not claim container
execution. Run the documented container build/health/startup checks on a host with
Docker before selecting that deployment route. Hosted HTTPS and actual recovery
mail delivery likewise require configuration and target-host testing.

Accounts have no email verification or MFA. Revisions use full snapshots without
a retention UI. Substring search is intentionally simple; tags have a PostgreSQL
GIN index and browse/sort fields have relational indexes. Operator moderation
uses management commands rather than a web console. Existing M3 engineering and
academic-export limitations continue to apply. The changelog is unreleased;
version 0.1.0 remains unchanged until an operator selects and reviews a release.

See [operations](platform-operations.md), [API/permissions](../apps/api/README.md),
[architecture](platform-architecture.md) and [release procedure](platform-release.md).
