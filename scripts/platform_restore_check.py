"""Verify a custom PostgreSQL dump in two newly created, isolated databases.

Run with the root virtual environment. DATABASE_URL is read only from the
environment; passwords never appear in subprocess arguments or output.
No existing database is ever dropped, cleaned, or restored over.
"""

import argparse
import json
import os
import secrets
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit, urlunsplit

import psycopg
from psycopg import sql

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--pg-bin", type=Path, help="Directory containing pg_dump/pg_restore"
    )
    parser.add_argument(
        "--output-dir", type=Path, default=ROOT / ".artifacts" / "restore-check"
    )
    args = parser.parse_args()
    original = os.environ["DATABASE_URL"]
    parsed = urlsplit(original)
    suffix = secrets.token_hex(6)
    source, target = f"pfdkit_verify_{suffix}", f"pfdkit_restore_{suffix}"
    output = args.output_dir.resolve() / suffix
    output.mkdir(parents=True, exist_ok=False)
    environment = dict(os.environ)
    environment.update(
        DJANGO_DEBUG="true",
        DJANGO_ALLOWED_HOSTS="testserver,localhost,127.0.0.1",
        DJANGO_SECURE_COOKIES="false",
        PFDKIT_BACKUP_PASSWORD=secrets.token_urlsafe(30),
    )

    def database_url(name):
        return urlunsplit(parsed._replace(path="/" + quote(name, safe="")))

    def django(name, *arguments):
        environment["DATABASE_URL"] = database_url(name)
        return subprocess.run(
            [sys.executable, str(ROOT / "apps/api/manage.py"), *arguments],
            cwd=ROOT,
            env=environment,
            check=True,
            capture_output=True,
            text=True,
        ).stdout

    def pg(tool, *arguments):
        executable = str(args.pg_bin / tool) if args.pg_bin else tool
        pg_environment = dict(environment)
        pg_environment.update(
            PGHOST=parsed.hostname or "localhost",
            PGPORT=str(parsed.port or 5432),
            PGUSER=unquote(parsed.username or ""),
            PGPASSWORD=unquote(parsed.password or ""),
        )
        # Let libpq parse supported SSL options without exposing URL credentials.
        from urllib.parse import parse_qs

        for key, values in parse_qs(parsed.query).items():
            if key in {"sslmode", "sslrootcert", "connect_timeout"}:
                pg_environment["PG" + key.upper().replace("_", "")] = values[-1]
        subprocess.run(
            [executable, *arguments],
            env=pg_environment,
            check=True,
            capture_output=True,
        )

    # CREATE DATABASE refuses an existing name. Deliberately retain both databases
    # for inspection and let operators remove these exact names after review.
    with psycopg.connect(original, autocommit=True) as admin:
        for name in [source, target]:
            admin.execute(
                sql.SQL("CREATE DATABASE {} TEMPLATE template0").format(
                    sql.Identifier(name)
                )
            )
    django(source, "migrate", "--noinput")
    django(source, "platform_restore_probe", "seed")
    before = json.loads(django(source, "platform_manifest"))
    dump = output / "platform.dump"
    pg(
        "pg_dump",
        "--format=custom",
        "--no-owner",
        "--no-acl",
        "--file",
        str(dump),
        source,
    )
    pg(
        "pg_restore",
        "--exit-on-error",
        "--no-owner",
        "--no-acl",
        "--dbname",
        target,
        str(dump),
    )
    after = json.loads(django(target, "platform_manifest"))
    if before != after:
        raise RuntimeError("Restored manifest differs from source")
    django(target, "platform_restore_probe", "check")
    django(target, "makemigrations", "--check", "--dry-run")
    summary = {
        "sourceDatabase": source,
        "restoredDatabase": target,
        "manifestEqual": True,
        "restoredAccountAndPermissions": True,
        "projects": len(before["projects"]),
        "revisions": len(before["revisions"]),
        "publications": len(before["publications"]),
        "tables": before["tableHashes"],
    }
    (output / "manifest.json").write_text(
        json.dumps(before, indent=2), encoding="utf-8"
    )
    (output / "result.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as exc:
        # Child stderr could contain connection credentials; retain it privately.
        print(
            f"Verification subprocess failed (exit {exc.returncode}); databases retained.",
            file=sys.stderr,
        )
        sys.exit(1)
