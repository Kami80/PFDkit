import uuid

from django.conf import settings
from django.contrib.postgres.indexes import GinIndex
from django.db import models
from django.db.models import Q


class Project(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    title = models.CharField(max_length=200)
    description = models.TextField(default="", max_length=4000)
    current_revision = models.PositiveIntegerField(default=1)
    source_attribution = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=["owner", "-updated_at"])]
        constraints = [
            models.CheckConstraint(
                condition=Q(current_revision__gte=1), name="project_positive_revision"
            )
        ]


class Revision(models.Model):
    project = models.ForeignKey(Project, related_name="revisions", on_delete=models.CASCADE)
    number = models.PositiveIntegerField()
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    document = models.JSONField()
    schema_version = models.CharField(max_length=20)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["project", "number"], name="unique_project_revision"),
            models.CheckConstraint(condition=Q(number__gte=1), name="revision_positive_number"),
        ]

    def save(self, *args, **kwargs):
        if self.pk:
            raise ValueError("Revisions are immutable; create a new revision")
        return super().save(*args, **kwargs)


class Publication(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.OneToOneField(Project, related_name="publication", on_delete=models.CASCADE)
    revision = models.ForeignKey(Revision, on_delete=models.PROTECT)
    document = models.JSONField()
    title = models.CharField(max_length=200, db_index=True)
    description = models.TextField(max_length=4000)
    author = models.CharField(max_length=200)
    license = models.CharField(max_length=30)
    category = models.CharField(max_length=80, db_index=True)
    tags = models.JSONField(default=list)
    source_url = models.URLField(blank=True, max_length=2000)
    is_template = models.BooleanField(default=False, db_index=True)
    active = models.BooleanField(default=True)
    withdrawn = models.BooleanField(default=False)
    moderation_reason = models.TextField(default="", blank=True)
    published_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=["active", "withdrawn", "-updated_at"])]
        indexes.append(GinIndex(fields=["tags"], name="publication_tags_gin"))


class Report(models.Model):
    publication = models.ForeignKey(Publication, on_delete=models.CASCADE, related_name="reports")
    reporter = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    reason = models.TextField(max_length=2000)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved = models.BooleanField(default=False)


class RateBucket(models.Model):
    key = models.CharField(primary_key=True, max_length=64)
    window = models.BigIntegerField()
    count = models.PositiveIntegerField(default=1)
