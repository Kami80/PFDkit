import json
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from platform_api.api import publish
from platform_api.models import Project
from platform_api.schemas import Publish
from platform_api.services import new_project, validate


class Command(BaseCommand):
    help = "Import reviewed teaching fixtures as private projects; publication requires --publish."

    def add_arguments(self, parser):
        parser.add_argument("--owner", required=True, help="Existing maintainer username")
        parser.add_argument("--publish", action="store_true")

    def handle(self, *args, **options):
        try:
            owner = get_user_model().objects.get(username=options["owner"])
        except get_user_model().DoesNotExist:
            raise CommandError("Create the named maintainer account first") from None
        root = Path(__file__).resolve().parents[5]
        for path in sorted((root / "examples").glob("teaching-*.json")):
            raw = validate(json.loads(path.read_text(encoding="utf-8")))
            # Stable fixture document IDs make repeated loading idempotent per owner.
            if Project.objects.filter(
                owner=owner, revisions__number=1, revisions__document__id=raw["id"]
            ).exists():
                self.stdout.write(f"Already imported: {path.name}")
                continue
            with transaction.atomic():
                project = new_project(
                    owner,
                    raw["title"],
                    "Reviewed PFDkit teaching example. Values are illustrative; no process simulation is performed.",
                    raw,
                )
                if options["publish"]:
                    from django.test import RequestFactory

                    request = RequestFactory().post("/api/")
                    request.user = owner
                    publish(
                        request,
                        project.pk,
                        Publish(
                            revision=1,
                            title=project.title,
                            description=project.description,
                            author="PFDkit contributors",
                            license="CC-BY-4.0",
                            category="Teaching examples",
                            tags=["reviewed", "illustrative"],
                            isTemplate=True,
                        ),
                    )
            self.stdout.write(
                f"Imported {path.name}: {project.pk} ({'public' if options['publish'] else 'private'})"
            )
