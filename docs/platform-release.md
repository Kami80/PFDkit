# Platform release procedure and evidence

The repository currently identifies the application and independent Python package as `0.1.0`. M4 adds an independently hostable platform around the guest editor and schema-1.0.0 document contract. These changes are prepared for review; no tag, package publication or external deployment is made by the verification scripts.

## Candidate verification

Use a root virtual environment, Node 24/npm 11 and PostgreSQL 17. Install both locked Python requirements and the local package as described in [operations](platform-operations.md). Set a private isolated `DATABASE_URL`; the database role needs CREATEDB for backend tests and restoration checks.

```sh
npm ci
npm run check
npm run format:check
.venv/bin/python -m ruff check apps/api
.venv/bin/python -m ruff format --check packages/pfd-core scripts apps/api
.venv/bin/python apps/api/manage.py migrate --noinput
.venv/bin/python apps/api/manage.py makemigrations --check --dry-run
.venv/bin/python apps/api/manage.py test platform_api --noinput
.venv/bin/python scripts/platform_restore_check.py --pg-bin /usr/lib/postgresql/17/bin
.venv/bin/python -m build --no-isolation packages/pfd-core
```

The root checks cover frontend lint/types/tests/build, contract regeneration/parity, Python lint/type checks and core tests. The API suite uses real PostgreSQL and Django's HTTP/session/CSRF middleware. Run the API on port 8000, set `PFDKIT_API_ORIGIN=http://127.0.0.1:8000` and `PFDKIT_PLATFORM_E2E=1`, then run `npm run test:e2e` to include account/project/public-reader workflows alongside guest editing/export/explorer checks. CI provisions PostgreSQL 17 and explicitly enables this platform gate for Python 3.11 and 3.14. Browser traces on failure are private operational evidence; remove process data before sharing them.

Install the built wheel into a separate temporary virtual environment and run a native document load/validate/export smoke check to prove independent package use without Django or Node. Review [Python package instructions](../packages/pfd-core/README.md), [API documentation](../apps/api/README.md), [equipment extensions](equipment-catalog.md), [contribution rules](../CONTRIBUTING.md), [architecture](platform-architecture.md) and [operations](platform-operations.md) against the candidate.

## Local evidence

On 2026-10-28 the native PostgreSQL 17 run applied Django and all four platform migrations and passed all 24 backend integration tests, including immutable revisions and competing concurrent saves. The restore verifier created `pfdkit_verify_3ea2ad86234e` and restored into new `pfdkit_restore_3ea2ad86234e`. Exact pre/post manifests matched 2 accounts, 3 projects, 4 revisions, 1 publication and 2 sessions; restored account login, anonymous/unrelated-user denial, revision pinning and required reuse attribution and the restored immutable-revision trigger passed. Private machine artifacts are in `.artifacts/restore-check/3ea2ad86234e/`; the dump and manifest are intentionally excluded from source control.

The manager's milestone acceptance record tracks the final frontend/browser/export and standalone-wheel results. No Docker daemon was available, so container image builds and Compose startup are **unverified** here. Before a hosted release run `docker compose config --quiet`, `docker compose up --build -d`, inspect every health check and verify browser workflows through the actual HTTPS proxy. Configure and test recovery delivery on that host; no real email was sent during acceptance. Keep this deployment check open until it has execution evidence.

## Release and known limitations

Update the [changelog](../CHANGELOG.md), all application/package versions together when selecting a release version, and regenerate affected lock metadata. Record the source revision, Python/Node/PostgreSQL versions, check results, browser/export evidence, migration state and restore result. Review secret handling, debug/host/origin/proxy settings, dedicated runtime database grants, secure cookies and backup retention. Tag and publish only after review and the target-host installation check.

Known limits: recovery email is provider-configurable but local delivery defaults to console; accounts have no email verification or MFA; public search uses bounded database substring matching; project revisions use full snapshots with no retention UI; deletion intentionally removes history; unpublishing cannot recall previously downloaded copies; imported external JSON cannot prove rights. Operator moderation is via management commands and reports, without a web moderation console. Compose's bootstrap database user is a superuser for local development; hosted installations need separate restricted runtime and migrator roles. No paid AI service is required for editing, storage, publication, reuse or academic export.
