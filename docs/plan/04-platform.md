# M4 — Accounts, Storage, and Public Library

[Project overview](../../PROJECT_PLAN.md) · Previous: [Teaching](03-teaching.md)

Status: complete and verified on 2026-10-28. Model: **GPT-6.1 Sol throughout**. See [the M4 acceptance record](../m4-acceptance.md) for executed verification and the explicit container/target-host testing limits.

Goal: add an independently hostable platform where users keep private projects, deliberately publish diagrams, and reuse attributed educational content.

## 4.1 Backend foundation

Purpose: introduce server persistence and accounts around the established document format.

Dependencies: M3 and the validated `pfd-core` document contract.

- [x] **4.1.1** Establish the Django/Django Ninja application layout, API boundary, environment settings, development configuration, and PostgreSQL connection setup.
- [x] **4.1.2** Define user/project ownership, document storage, schema/version metadata, timestamps, and database constraints through migrations.
- [x] **4.1.3** Add settings and environment examples for local and hosted operation, including configurable external services without requiring paid providers.
- [x] **4.1.4** Implement project document endpoints using `pfd-core` for authoritative validation and consistent structured error responses.
- [x] **4.1.5** Implement registration, sign-in, sign-out, and the chosen account-recovery workflow; document session and recovery delivery choices.
- [x] **4.1.6** Integrate frontend authentication and API access with appropriate request/session protections and clear expired-session behavior.
- [x] **4.1.7** Define request/document size limits, identifier/reference handling, migration behavior, and useful responses to invalid or unsupported documents.
- [x] **4.1.8** Verify migrations, account flows, document round trips, rejected saves, and basic owner/non-owner access through backend integration checks.

Expected outputs: Django API, PostgreSQL schema, authentication integration, document persistence, and backend setup documentation.

Complete when: an authenticated owner can save and reload a valid document, invalid saves receive clear feedback, and unrelated users cannot access the private document.

Additional requests, decisions, and evidence: Django session authentication with
CSRF protection on every mutation, including sign-in/registration. Recovery uses
one-hour Django signed tokens delivered by configurable email; local development
uses console delivery. PostgreSQL stores full schema-1.0.0 snapshots validated by
`pfd-core`. API requests are capped at 2 MiB and individual documents at 1 MiB.
The same-origin Next.js API proxy is configured at build time. All 24 API integration tests passed on isolated PostgreSQL 17.11; migrations and schema drift checks passed.

## 4.2 Personal projects

Purpose: give signed-in users a reliable workspace for ongoing diagram work.

Dependencies: 4.1.

- [x] **4.2.1** Build a personal dashboard with project title, description, last update, visibility, useful sorting/filtering, and empty/loading/error states.
- [x] **4.2.2** Add project creation, metadata editing, duplication, and deliberate deletion with consistent document and ownership handling.
- [x] **4.2.3** Store saves and revision records transactionally; define revision identity, author, timestamp, and the selected snapshot/storage strategy.
- [x] **4.2.4** Implement signed-in autosave with debouncing, pending/saved/failed states, recoverable retries, and preservation of unsaved changes after an interrupted request.
- [x] **4.2.5** Provide an explicit path to copy a guest's local document into their account while keeping local and server versions understandable.
- [x] **4.2.6** Add revision history, read-only inspection, and restoration as a new revision rather than destructive replacement of history.
- [x] **4.2.7** Detect stale saves and concurrent-tab conflicts using an agreed revision check; provide a clear recovery path without silently discarding a newer version.
- [x] **4.2.8** Verify create/edit/autosave/reopen, guest-to-account copying, duplication, revision restore, interrupted saves, and concurrent-edit conflicts.

Expected outputs: project dashboard, signed-in save workflow, immutable revision history, restoration, and conflict handling.

Complete when: a user can resume work across visits and recover earlier revisions or unsaved changes after the representative failure/conflict scenarios.

Additional requests, decisions, and evidence: Full immutable JSON snapshots have
per-project revision numbers, author and UTC timestamp. Transactional saves lock
the project and require its expected current revision; stale requests return 409.
Restoration appends a revision. Browser recovery drafts are scoped to an account
and project and retained until the captured document saves successfully.

## 4.3 Privacy and publishing

Purpose: make visibility and ownership explicit for every project operation.

Dependencies: 4.1–4.2.

- [x] **4.3.1** Define owner/private/public permissions for project metadata, documents, revisions, exports, publication, duplication, and deletion.
- [x] **4.3.2** Enforce ownership and visibility in backend queries and endpoints, including revision access and indirect object references.
- [x] **4.3.3** Keep new projects private and build an explicit publication flow showing the content, attribution, description, and selected license being published.
- [x] **4.3.4** Define and implement publication against an identified revision so later private edits require an intentional public update.
- [x] **4.3.5** Support owner-controlled public updates, unpublishing, and sharing; document the behavior of links, library entries, and previously obtained copies.
- [x] **4.3.6** Exclude private notes/account data from public representations and validate user-authored descriptions, annotations, links, and rendered text for their display context.
- [x] **4.3.7** Apply permission rules consistently to public preview, export, duplication, and template use, preserving required attribution.
- [x] **4.3.8** Verify anonymous, owner, and unrelated-user behavior across private/public/unpublished states and past revisions, including failed access attempts and republishing.

Expected outputs: documented permission matrix, enforced access controls, explicit publishing workflow, and public-revision handling.

Complete when: private content stays inaccessible to unrelated users, and a deliberate publish/update/unpublish action controls the corresponding public representation.

Additional requests, decisions, and evidence: Publication has a separate UUID and
is pinned to an explicitly selected saved revision. The owner chooses credit,
description and content license and confirms publication. Private notes, hidden
annotations and unrecognized metadata/configuration are excluded from its
sanitized snapshot; public preview/download/reuse share that snapshot. Updates
require a new owner action. Unpublishing disables future access, while already
obtained copies retain their license. Independent real HTTP permission review passed all six scenarios again through the production Next.js proxy.

## 4.4 Academic library

Purpose: make reusable educational diagrams discoverable with clear authorship and contribution rules.

Dependencies: 4.3 and reviewed examples from 3.5.

- [x] **4.4.1** Define public diagram metadata, process categories, equipment tags, author attribution, content license, and source/provenance fields.
- [x] **4.4.2** Add public browse/search with pagination, useful sorting/filtering, and database indexes appropriate to the supported queries.
- [x] **4.4.3** Build public diagram pages using the shared read-only renderer, available equipment exploration, descriptions, attribution, and publication revision.
- [x] **4.4.4** Add duplicate-and-customize and template use, creating an owned copy with consistent references and retained attribution/provenance where required.
- [x] **4.4.5** Distinguish source-code, contributed diagram, educational text, and symbol licensing; document contribution requirements and handling of missing licensing information.
- [x] **4.4.6** Establish a maintainable initial contribution workflow for diagrams and equipment models, with review criteria, examples, and installation/extension guidance.
- [x] **4.4.7** Define basic maintenance tools for withdrawing unsuitable public content, handling reported issues, and updating curated examples without changing private originals.
- [x] **4.4.8** Verify discovery, read-only viewing, permitted duplication, retained attribution, withdrawal/unpublication, and the exclusion of private projects from library queries.

Expected outputs: searchable academic library, public diagram pages, reusable templates, attribution handling, and contribution documentation.

Complete when: users can find, inspect, and reuse public examples with the intended license/provenance information while private content remains excluded.

Additional requests, decisions, and evidence: Library entries carry author,
CC BY 4.0 or CC0 1.0, category, equipment tags, source URL and template status.
Reuse creates an owned private copy and preserves a sanitized attribution chain;
CC BY material cannot be relicensed as CC0. Maintainer withdrawal hides public
content without modifying the private original. Search, pagination and filtering
operate only on active, non-withdrawn publications.

## 4.5 Platform release

Purpose: make the full platform repeatable to install, maintain, extend, and verify.

Dependencies: 4.1–4.4 and the earlier milestone completion checks.

- [x] **4.5.1** Build Docker Compose services for the frontend, Django API, and PostgreSQL with documented configuration, health checks, and startup commands.
- [x] **4.5.2** Document database initialization, migrations, example-data loading, production configuration, and a repeatable upgrade path that preserves existing projects.
- [x] **4.5.3** Provide database backup/restore instructions and verify restoration of representative projects, revisions, ownership, and publication state.
- [x] **4.5.4** Complete CI coverage for the Python package, shared contract, frontend, APIs, migrations, permissions, and representative export/interaction workflows.
- [x] **4.5.5** Finish installation, API, architecture, independent Python-package, equipment-extension, and contribution documentation with working examples.
- [x] **4.5.6** Review production settings, session/cookie behavior, input limits, user-authored rendering, dependency configuration, and required operational logs.
- [x] **4.5.7** Run end-to-end workflows for a guest, signed-in owner, public reader, and contributor; inspect academic exports and confirm core use without paid AI services.
- [x] **4.5.8** Prepare versioning, changelog, known limitations, sample projects, release instructions, and the verification evidence for a reviewable platform release.

Expected outputs: self-hosting configuration, operational guidance, completed documentation, representative verification evidence, and release materials.

Complete when: another developer can install the documented platform, restore a backup, exercise the supported user workflows, and install/use the Python package independently.

Additional requests, decisions, and evidence: Compose defines PostgreSQL 17,
one-shot migrations, Django and Next.js, with health-gated startup and persistent
database storage. No Docker daemon is installed in the verification environment;
actual PostgreSQL testing ran in a separate workspace-local cluster. Actual PostgreSQL dump/restore preserved all account/session/project/revision/publication table hashes and restored permissions. All 19 production browser workflows passed across the complete suite plus the API-offline guest test. YAML structure was parsed, but container image execution and hosted HTTPS/mail delivery remain explicitly unverified operational checks. See the acceptance record for the distinction.

## Milestone checkpoint

- All work packages 4.1–4.5 are complete and have verification evidence.
- Private storage, revisions, deliberate publishing, and attributed reuse work end to end.
- The full platform is documented for local operation and self-hosting.
- The project overview reflects completed scope and any explicitly recorded future work.
