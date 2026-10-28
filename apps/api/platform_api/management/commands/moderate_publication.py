from uuid import UUID

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from platform_api.models import Publication, Report


class Command(BaseCommand):
    help = (
        "Withdraw/restore a publication or list outstanding reports (trusted maintainer operation)."
    )

    def add_arguments(self, parser):
        parser.add_argument("action", choices=["withdraw", "restore", "reports", "resolve"])
        parser.add_argument("--publication")
        parser.add_argument("--reason", default="")
        parser.add_argument("--report", type=int)

    def handle(self, *args, **options):
        action = options["action"]
        if action == "reports":
            for report in Report.objects.filter(resolved=False).order_by("created_at"):
                self.stdout.write(f"{report.pk}\t{report.publication_id}\t{report.reason}")
            return
        if action == "resolve":
            if not options["report"] or not Report.objects.filter(pk=options["report"]).update(
                resolved=True
            ):
                raise CommandError("Select an existing --report ID")
            return
        try:
            identity = UUID(options["publication"] or "")
        except ValueError:
            raise CommandError("Select an existing --publication UUID") from None
        if not options["reason"].strip():
            raise CommandError("Provide --reason for the maintenance record")
        with transaction.atomic():
            try:
                publication = Publication.objects.select_for_update().get(pk=identity)
            except Publication.DoesNotExist:
                raise CommandError("Publication not found") from None
            publication.withdrawn = action == "withdraw"
            publication.moderation_reason = options["reason"]
            publication.save(update_fields=["withdrawn", "moderation_reason", "updated_at"])
        self.stdout.write(
            f"Publication {identity}: {action}; private original and revisions unchanged."
        )
