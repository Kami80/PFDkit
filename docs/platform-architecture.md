# Platform architecture

The guest editor remains a complete local application. Accounts add private
PostgreSQL storage through a same-origin Django Ninja API; opening or exporting a
guest document does not require an account, email service, database or AI API.

## Boundaries

`pfd-core` owns document schema 1.0.0, equipment definitions, semantic validation
and normalization. The API imports that independently installable package and
validates every document before persistence. Warnings permit incomplete drafts;
structural errors prevent a save. No API adds thermodynamics or process sizing.
Generated schema and TypeScript contracts remain in `contracts/generated`.

Next.js serves the editor, personal dashboard and public library. Its `/api/*`
rewrite targets Django using the server-only `PFDKIT_API_ORIGIN` setting. That
target is captured at build time, so changing it requires a new web build.
Browsers use relative API paths and retain same-origin session and CSRF cookies.
The API and database need no publicly exposed container ports.

Django owns account credentials, recovery, permissions, revisions and publication.
PostgreSQL stores the authoritative JSON snapshots and relational ownership and
publication references. A database outage never changes the guest document
contract. The frontend retains an interrupted account save as a local recovery
draft and reports failures to the user.

## Private projects and revisions

A project belongs to one account. Each accepted document save creates a complete
immutable JSON snapshot with a per-project revision number, author and timestamp.
Project changes and revision creation occur in one database transaction. A save
or restoration submits its expected current revision; a stale request receives
HTTP 409 rather than overwriting the newer document. Restoring an old snapshot
creates a new revision. Revision history is accessible only through the owner
project scope.

Project duplication creates a new private project and document identity. A guest
document enters an account only through an explicit copy action. Local projects
and recovery drafts continue to belong to the current browser origin; JSON export
is the portable local backup.

## Publication boundary

Publication is an owner action against an identified saved revision. It creates
a separate public identity and sanitized snapshot with the chosen title,
description, author credit, license, category, tags, source and template status.
Editing the private document does not update the publication. An owner explicitly
publishes an update or unpublishes the entry. Public viewers never traverse the
private revision endpoints.

Public preview, JSON download and duplication share the same publication snapshot.
Lecture notes and unrecognized private metadata are removed at this boundary.
Visible annotations, equipment names and engineering values are publishable
content; the owner must inspect the preview before confirming. Publication does
not certify academic or engineering correctness.

An attributed reuse creates an owned private copy while retaining the public
source identity, author and content license. Removing an entry disables its live
library page and future platform copies; it cannot retract files already
downloaded or independently licensed copies. Maintainer withdrawal hides an
unsuitable entry without altering its owner's private original.

## Operation

Compose runs PostgreSQL, a one-shot migration service, Django and Next.js. Health
checks gate dependent services. Persistent database volumes outlive container
recreation. Backups must include the complete PostgreSQL database, because JSON
exports alone omit account ownership, revision history and publication state.
See [the platform operation guide](platform-operations.md) and
[the API setup and permissions](../apps/api/README.md).

The repository's MIT source license is separate from the chosen public diagram
license. Existing examples and text retain their declared licenses; imported
content must carry compatible attribution. See [contribution rules](../CONTRIBUTING.md).
