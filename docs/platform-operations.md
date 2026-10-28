# Platform operation

The guest editor needs only the web app. Accounts, private storage and the public library additionally need PostgreSQL 17 and the Django API. All core workflows run without AI services, cloud accounts or paid providers. See the [API reference](../apps/api/README.md) and [release procedure](platform-release.md).

## Local Compose installation

Install Docker Engine/Desktop with Compose v2, Node 24/npm 11 for contributor checks, and Python 3.11–3.14 for native development. Copy `.env.example` to ignored `.env`. Generate separate random secrets; a 32-byte hex database password is safe in the Compose-interpolated database URL. A native `DATABASE_URL` must percent-encode reserved characters in username/password. Django does not automatically load `.env` outside Compose.

```sh
cp .env.example .env
# Edit .env before starting: POSTGRES_PASSWORD and DJANGO_SECRET_KEY are required.
docker compose config --quiet
docker compose up --build -d
docker compose ps
docker compose logs --tail=100 migrate api web
curl --fail http://localhost:3000/api/health
```

Open `http://localhost:3000`. Compose starts a persistent PostgreSQL volume, waits for database health, applies migrations once, starts the API after successful migration, then starts the web app after API health. Only the web port is exposed, bound to loopback by default. The API image runs as a dedicated unprivileged OS user; the web image runs as Node's unprivileged user. The frontend builds its server-only API proxy origin into Next.js configuration. Rebuild when changing it.

`POSTGRES_USER` in this local Compose example is the image's bootstrap **database superuser**. This is a development convenience. For production provision separate least-privileged application and schema-owner/migrator roles; run migrations as the schema owner, and grant the runtime app only CONNECT, schema USAGE, required table SELECT/INSERT/UPDATE/DELETE and sequence USAGE/SELECT, including default privileges for new tables/sequences. Do not give the runtime role CREATEDB, CREATEROLE, superuser, schema ownership or trigger-altering rights. The immutable-revision trigger must remain enabled. The test/restore-verification role needs CREATEDB and is separate from production runtime credentials.

## Native setup and examples

```sh
python -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.lock -r apps/api/requirements.lock
.venv/bin/python -m pip install --no-deps --no-build-isolation -e packages/pfd-core
# Set DATABASE_URL and DJANGO_* in your shell using .env.example as a reference.
.venv/bin/python apps/api/manage.py migrate --noinput
.venv/bin/python apps/api/manage.py runserver 127.0.0.1:8000
```

Windows uses `.venv/Scripts/python.exe`. Set `PFDKIT_API_ORIGIN=http://127.0.0.1:8000` before `npm run dev` or `npm run build`. Registration creates ordinary user accounts; maintenance is via authenticated operator shell access rather than an exposed admin panel.

```sh
docker compose exec api python manage.py seed_examples --owner maintainer
# Review examples and rights before deliberately publishing new imports:
docker compose exec api python manage.py seed_examples --owner maintainer --publish
```

The owner must already exist. The first command is private by default; repeated imports do not duplicate fixtures or silently republish existing projects. Curated fixtures live in `examples/`; licensing and extension review are covered in [contribution guidance](../CONTRIBUTING.md).

## Hosted configuration

Use HTTPS at a reverse proxy. Set debug false, a strong unique secret, explicit allowed hosts, the actual public origin, exact CSRF trusted origins, secure cookies true and SSL redirect as appropriate. Include the internal `api` health-check hostname in allowed hosts when using Compose. Set `DJANGO_TRUST_PROXY=true` only if a trusted proxy overwrites `X-Forwarded-Proto` and direct untrusted access to the API is blocked. Configure TLS/HSTS and request limits at the public proxy, and verify no redirect loop. PostgreSQL URLs support `sslmode`, `sslrootcert` and `connect_timeout`; require certificate verification for remote databases. Do not expose the database port publicly.

The platform uses Django database sessions, HttpOnly/SameSite=Lax cookies, CSRF on every mutation and `Cache-Control: no-store` on API responses. Sessions expire after 14 days; password reset expires after one hour and invalidates old sessions. Request bodies are limited to 2 MiB and documents to 1 MiB. Account/request throttles persist in PostgreSQL; supplement them at the public proxy. The API uses the direct peer address for anonymous throttles; hosts with a shared Next.js proxy should consider per-client proxy limits. Do not trust user-supplied forwarding headers for identity.

Configure an email backend for recovery. Console delivery is suitable locally and writes recovery links to protected operator logs. For SMTP set the backend, host, port, TLS flag, sender and credentials; credentials belong in secret storage. No SMTP delivery or external deployment was performed in the local acceptance run. Avoid collecting cookies, authorization headers, passwords, native documents or recovery query strings in public logs.

Monitor `/api/health` through the frontend and directly within the private network. Preserve API/Gunicorn access and error logs, migration failures, database disk/connection health, backup failures and publication/moderation audit events. Current logs identify account creation and publication actions without document bodies. Reports and moderation reasons remain private. Bound log retention and access according to your deployment needs. Periodically remove expired Django sessions with `python manage.py clearsessions`; rate buckets are bounded by throttle identities but may also need an operator retention policy on high-traffic hosts.

## Backup and safe restore

Use matching PostgreSQL 17 client utilities and store backups encrypted with restricted access; dumps contain accounts, password hashes, sessions, private diagrams and reports. Back up configuration secrets separately, especially `DJANGO_SECRET_KEY`; losing it invalidates sessions and recovery tokens. Use `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE` and a protected password file or `PGPASSWORD`; avoid putting passwords in command arguments or shell history.

```sh
pg_dump --format=custom --no-owner --no-acl --file=platform.dump
.venv/bin/python apps/api/manage.py platform_manifest > platform-manifest.json
# Create a NEW, empty database. Never restore over a running deployment.
createdb pfdkit_restore_review
pg_restore --exit-on-error --no-owner --no-acl --dbname=pfdkit_restore_review platform.dump
```

Quiesce application writes while capturing the dump and comparison manifest so they describe the same state. `pg_dump` itself gives a consistent transaction snapshot. Set the restored `DATABASE_URL` privately and run `platform_manifest` again; compare JSON exactly before serving traffic. The manifest includes stable ownership, revision/document hashes, publication state and full-row hashes covering users, sessions, projects, revisions, publications and reports. Treat manifests as private data. Reapply production runtime grants and check migrations, role ownership and trigger permissions before switching traffic. A restore verifier must never use `--clean` on a live database.

The repeatable acceptance check below creates **two new randomly named databases** in the configured PostgreSQL cluster, migrates a fresh source, creates representative private/public/reused projects, performs `pg_dump` and `pg_restore`, compares manifests, then logs in to restored accounts and checks private permissions, immutable history, publication pinning and attribution. It retains both databases and the dump for review; it never deletes or overwrites an existing database. Use an isolated verification cluster with a CREATEDB-capable operator, not production runtime credentials.

```sh
.venv/bin/python scripts/platform_restore_check.py --pg-bin /usr/lib/postgresql/17/bin
# Windows: --pg-bin C:/path/to/postgresql/bin
```

Results and private dumps are under ignored `.artifacts/restore-check/<random-id>/`. Inspect the exact database names in `result.json`; after review, an operator can explicitly remove those two databases and securely expire the retained files according to policy. A failed run also retains its databases for diagnosis.

## Upgrade and rollback

1. Announce maintenance, stop writes and capture a tested backup plus the current image/source version and configuration.
2. Build candidate images and run checks on an isolated restored database. Inspect pending migrations and take particular care with destructive schema changes.
3. Stop web/API writers, run `docker compose run --rm migrate`, then start the updated API/web with `docker compose up --build -d`.
4. Check health, sign-in, owned project round trip, history and public links before reopening writes. Confirm a prior private edit has not changed a pinned public revision.

Migrations are versioned and existing schema-1.0.0 documents are validated on writes. Unsupported document schema versions receive an explicit error rather than a guessed migration. Do not delete the database volume to upgrade. If rollback needs a previous schema, restore the pre-upgrade backup into a **new** database and select the compatible previous application version; avoid running old code against an incompatible schema. Keep the failed database for investigation. `docker compose down` stops services while preserving the named volume; `down --volumes` destroys persistent data and is not an upgrade step.

## Verification evidence and limits

The local milestone run on 2026-10-28 applied migrations on PostgreSQL 17. Actual custom dump/restore succeeded with equal table manifests for 2 accounts, 3 owned projects, 4 revisions, 1 pinned publication and 2 sessions; restored login, anonymous/nonowner isolation and reuse credit passed. Backend tests cover permissions, CSRF, expiry, concurrency, schema/size rejection, publication redaction, withdrawal and recovery. The [release record](platform-release.md) separates native verification from container acceptance.

No Docker daemon/Compose runtime is available in this environment. The Compose and Dockerfiles are supplied for installation; image builds, health-gated container startup and production proxy/email delivery still require verification on the target host. Native PostgreSQL tests and backup/restore do not substitute for that container check.
