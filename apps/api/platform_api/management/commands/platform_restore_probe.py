"""Representative account/project state for the isolated restore verifier."""

import copy
import json
import os
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import DatabaseError, transaction
from django.test import Client

from platform_api.models import Project, Publication, Revision


class Command(BaseCommand):
    help = "Seed/check representative state in a NEW isolated restore-check database only."

    def add_arguments(self, parser):
        parser.add_argument("action", choices=["seed", "check"])

    def handle(self, *args, **options):
        from django.db import connection

        if not connection.settings_dict["NAME"].startswith(("pfdkit_verify_", "pfdkit_restore_")):
            raise CommandError("Only isolated pfdkit_verify_/pfdkit_restore_ databases are allowed")
        password = os.environ["PFDKIT_BACKUP_PASSWORD"]
        owner = Client(enforce_csrf_checks=True)
        other = Client(enforce_csrf_checks=True)

        def request(client, method, path, payload=None, expected=200):
            client.get("/api/auth/csrf")
            response = getattr(client, method)(
                "/api" + path,
                json.dumps(payload or {}),
                content_type="application/json",
                HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value,
            )
            if response.status_code != expected:
                raise CommandError(
                    f"{method} {path}: expected {expected}, got {response.status_code}"
                )
            return response.json()

        if options["action"] == "seed":
            if get_user_model().objects.exists() or Project.objects.exists():
                raise CommandError("Seed requires an empty database")
            for name in ["backup-owner", "backup-other"]:
                get_user_model().objects.create_user(name, f"{name}@example.invalid", password)
        for client, name in [(owner, "backup-owner"), (other, "backup-other")]:
            request(client, "post", "/auth/login", {"username": name, "password": password})

        if options["action"] == "seed":
            root = Path(__file__).resolve().parents[5]
            document = json.loads((root / "examples/valid-process.json").read_text())
            project = request(
                owner,
                "post",
                "/projects",
                {"title": "Backup private original", "document": document},
            )
            path = f"/projects/{project['id']}"
            updated = copy.deepcopy(document)
            updated["education"]["notes"] = "Private revision retained after restore"
            request(owner, "put", path + "/document", {"document": updated, "expectedRevision": 1})
            publication = request(
                owner,
                "post",
                path + "/publish",
                {
                    "revision": 1,
                    "title": "Pinned public revision",
                    "description": "Restore verification fixture",
                    "author": "Backup owner",
                    "license": "CC-BY-4.0",
                    "category": "Teaching",
                    "tags": ["pump"],
                },
            )
            request(other, "post", f"/library/{publication['id']}/duplicate")
            request(owner, "post", "/projects", {"title": "Never published", "document": document})

        original = Project.objects.get(title="Backup private original")
        publication = Publication.objects.get(project=original)
        if original.current_revision != 2 or publication.revision.number != 1:
            raise CommandError("Revision/publication pin was not preserved")
        if Revision.objects.filter(project=original).count() != 2:
            raise CommandError("Revision history was not preserved")
        if options["action"] == "check":
            try:
                with transaction.atomic():
                    Revision.objects.filter(project=original, number=1).update(document={})
            except DatabaseError:
                pass
            else:
                raise CommandError(
                    "Restored database did not preserve the immutable-revision trigger"
                )
        copy_project = Project.objects.get(owner__username="backup-other")
        if copy_project.source_attribution.get("publicationId") != str(publication.pk):
            raise CommandError("Reuse attribution was not preserved")
        if other.get(f"/api/projects/{original.pk}").status_code != 404:
            raise CommandError("Restored ownership isolation failed")
        if Client().get(f"/api/projects/{original.pk}").status_code != 401:
            raise CommandError("Restored anonymous isolation failed")
        public = Client().get(f"/api/library/{publication.pk}")
        if public.status_code != 200 or "Private revision retained" in public.content.decode():
            raise CommandError("Restored publication pin/redaction failed")
        self.stdout.write(
            "Account authentication, ownership, history, publication pin and attribution verified"
        )
