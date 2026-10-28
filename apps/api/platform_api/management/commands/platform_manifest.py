import hashlib
import json

from django.contrib.auth import get_user_model
from django.contrib.sessions.models import Session
from django.core.management.base import BaseCommand

from platform_api.models import Project, Publication, Report, Revision


class Command(BaseCommand):
    help = "Print stable integrity hashes for backup/restore verification (contains private IDs; store securely)."

    def handle(self, *args, **options):
        result = {"projects": [], "revisions": [], "publications": []}
        for project in Project.objects.order_by("id"):
            result["projects"].append(
                {
                    "id": str(project.pk),
                    "owner": project.owner_id,
                    "title": project.title,
                    "description": project.description,
                    "currentRevision": project.current_revision,
                }
            )
        for revision in Revision.objects.order_by("project_id", "number"):
            digest = hashlib.sha256(
                json.dumps(revision.document, sort_keys=True, separators=(",", ":")).encode()
            ).hexdigest()
            result["revisions"].append(
                {
                    "project": str(revision.project_id),
                    "number": revision.number,
                    "author": revision.author_id,
                    "schemaVersion": revision.schema_version,
                    "sha256": digest,
                }
            )
        for publication in Publication.objects.order_by("id"):
            digest = hashlib.sha256(
                json.dumps(publication.document, sort_keys=True, separators=(",", ":")).encode()
            ).hexdigest()
            result["publications"].append(
                {
                    "id": str(publication.pk),
                    "project": str(publication.project_id),
                    "revision": publication.revision.number,
                    "active": publication.active,
                    "withdrawn": publication.withdrawn,
                    "license": publication.license,
                    "author": publication.author,
                    "sha256": digest,
                }
            )
        result["tableHashes"] = {}
        for model in [get_user_model(), Session, Project, Revision, Publication, Report]:
            values = list(model.objects.order_by(model._meta.pk.name).values())
            encoded = json.dumps(values, sort_keys=True, separators=(",", ":"), default=str)
            result["tableHashes"][model._meta.label] = {
                "count": len(values),
                "sha256": hashlib.sha256(encoded.encode()).hexdigest(),
            }
        self.stdout.write(json.dumps(result, sort_keys=True, indent=2))
