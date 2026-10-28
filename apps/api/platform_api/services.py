import copy
import hashlib
import hmac
import json
import time
import uuid

from django.conf import settings
from django.db import transaction
from pfd_core import Document, registry, validate_document
from pydantic import ValidationError

from .models import Project, RateBucket, Revision


class ApiError(Exception):
    def __init__(self, status, code, message, **details):
        self.status = status
        self.payload = {"error": {"code": code, "message": message, **details}}


def throttle(request, scope, limit=20, period=300):
    # REMOTE_ADDR is the trusted peer. Configure a real reverse-proxy rate limiter
    # too; never trust a client-supplied Forwarded header here.
    identity = (
        str(request.user.pk)
        if request.user.is_authenticated
        else request.META.get("REMOTE_ADDR", "unknown")
    )
    key = hmac.new(
        settings.SECRET_KEY.encode(), f"{scope}:{identity}".encode(), hashlib.sha256
    ).hexdigest()
    window = int(time.time()) // period
    with transaction.atomic():
        bucket, _ = RateBucket.objects.get_or_create(
            key=key, defaults={"window": window, "count": 0}
        )
        bucket = RateBucket.objects.select_for_update().get(pk=bucket.pk)
        bucket.count = bucket.count + 1 if bucket.window == window else 1
        bucket.window = window
        bucket.save()
        exceeded = bucket.count > limit
    if exceeded:
        raise ApiError(429, "rate_limited", "Too many requests; please retry later.")


def validate(raw):
    try:
        size = len(json.dumps(raw, allow_nan=False).encode())
    except (ValueError, TypeError):
        raise ApiError(
            422, "schema_error", "The document must contain finite JSON values."
        ) from None
    if size > settings.DOCUMENT_MAX_BYTES:
        raise ApiError(413, "document_too_large", "Documents are limited to 1 MiB.")
    if raw.get("schemaVersion", "1.0.0") != "1.0.0":
        raise ApiError(
            422,
            "unsupported_version",
            "Only document schemaVersion 1.0.0 is supported; no migration was applied.",
        )
    try:
        document = Document.model_validate(raw)
    except ValidationError as exc:
        issues = [
            {
                "code": "schema_error",
                "path": ".".join(map(str, e["loc"])),
                "message": e["msg"],
                "severity": "error",
            }
            for e in exc.errors(include_input=False, include_context=False)
        ]
        raise ApiError(
            422, "invalid_document", "The document schema is invalid.", issues=issues
        ) from None
    result = validate_document(document)
    if not result.valid:
        raise ApiError(
            422,
            "invalid_document",
            "The document has invalid references or engineering values.",
            issues=result.model_dump(mode="json", by_alias=True)["issues"],
        )
    return document.model_dump(mode="json", by_alias=True)


def owned(request, project_id, lock=False):
    query = Project.objects.filter(owner=request.user)
    if lock:
        query = query.select_for_update()
    project = query.filter(pk=project_id).first()
    if not project:
        raise ApiError(404, "not_found", "Project not found.")
    return project


def check_revision(project, expected):
    if expected != project.current_revision:
        raise ApiError(
            409,
            "revision_conflict",
            "A newer revision exists. Reload it or save your work as a copy.",
            currentRevision=project.current_revision,
        )


def append_revision(project, author, document):
    if project.source_attribution:
        document = copy.deepcopy(document)
        document["metadata"]["attribution"] = project.source_attribution
    project.current_revision += 1
    Revision.objects.create(
        project=project,
        author=author,
        number=project.current_revision,
        document=document,
        schema_version=document["schemaVersion"],
    )
    project.save(update_fields=["current_revision", "updated_at"])


def new_project(owner, title, description, document, source_attribution=None):
    with transaction.atomic():
        source_attribution = source_attribution or public_attribution(
            document.get("metadata", {}).get("attribution")
        )
        project = Project.objects.create(
            owner=owner, title=title, description=description, source_attribution=source_attribution
        )
        Revision.objects.create(
            project=project,
            number=1,
            author=owner,
            document=document,
            schema_version=document["schemaVersion"],
        )
        return project


def public_document(raw, attribution):
    """Publish an allowlisted snapshot; arbitrary metadata and lecture notes stay private."""
    document = copy.deepcopy(raw)
    document["metadata"] = {"attribution": attribution}
    for collection in ["equipment", "streams", "components"]:
        for item in document["engineering"][collection]:
            status = item["metadata"].get("valueStatus")
            item["metadata"] = (
                {"valueStatus": status}
                if isinstance(status, str)
                and status in {"manual", "illustrative", "conceptual", "calculated"}
                else {}
            )
            if collection == "equipment":
                properties = registry.get(item["type"]).config_schema.get("properties", {})
                config = item["config"]
                item["config"] = {key: value for key, value in config.items() if key in properties}
                if isinstance(config.get("valueStatus"), str) and config["valueStatus"] in {
                    "manual",
                    "illustrative",
                }:
                    item["config"]["valueStatus"] = config["valueStatus"]
    for node in document["presentation"]["nodes"].values():
        node["metadata"] = {}
    visual = document["presentation"]["metadata"]
    style = visual.get("style", {})
    objects = visual.get("objectStyles", {})
    permitted_style = {
        "version",
        "preset",
        "background",
        "fontFamily",
        "fontSize",
        "lineWidth",
        "showTitle",
        "showLegend",
        "colorblind",
    }
    permitted_object = {"stroke", "fill", "textColor", "lineWidth", "fontSize", "labelVisible"}
    identities = {
        item["id"]
        for item in [*document["engineering"]["equipment"], *document["engineering"]["streams"]]
    }
    document["presentation"]["metadata"] = {
        "style": {
            key: value
            for key, value in style.items()
            if key in permitted_style and isinstance(value, (str, int, float, bool))
        }
        if isinstance(style, dict)
        else {},
        "objectStyles": {
            identity: {
                key: value
                for key, value in values.items()
                if key in permitted_object and isinstance(value, (str, int, float, bool))
            }
            for identity, values in objects.items()
            if identity in identities and isinstance(values, dict)
        }
        if isinstance(objects, dict)
        else {},
    }
    document["education"]["metadata"] = {}
    document["education"]["notes"] = ""
    visible_ids = {item["id"] for item in document["education"]["annotations"] if item["visible"]}
    document["education"]["annotations"] = [
        item for item in document["education"]["annotations"] if item["visible"]
    ]
    for step in document["education"]["steps"]:
        step["notes"] = ""
        step["annotationIds"] = [value for value in step["annotationIds"] if value in visible_ids]
    return validate(document)


def copy_document(document):
    result = copy.deepcopy(document)
    result["id"] = str(uuid.uuid4())
    return result


def public_attribution(raw, depth=0):
    if not isinstance(raw, dict) or depth > 8:
        return {}
    result = {
        key: value[:2000]
        for key, value in raw.items()
        if key in {"creator", "author", "license", "source", "modifications", "publicationId"}
        and isinstance(value, str)
    }
    if isinstance(raw.get("revision"), int):
        result["revision"] = raw["revision"]
    if isinstance(raw.get("previous"), dict):
        result["previous"] = public_attribution(raw["previous"], depth + 1)
    return result


def requires_attribution(raw):
    if not isinstance(raw, dict):
        return False
    return raw.get("license") == "CC-BY-4.0" or requires_attribution(raw.get("previous"))
