import logging
from uuid import UUID, uuid4

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.core.validators import validate_email
from django.db import IntegrityError, connection, transaction
from django.db.models import Q
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from ninja import NinjaAPI
from ninja.errors import AuthenticationError, HttpError, ValidationError

from .models import Publication, Report
from .schemas import (
    CreateProject,
    Duplicate,
    EditProject,
    Login,
    Publish,
    Recovery,
    Register,
    ReportInput,
    Reset,
    Restore,
    Save,
)
from .services import (
    ApiError,
    append_revision,
    check_revision,
    copy_document,
    new_project,
    owned,
    public_attribution,
    public_document,
    requires_attribution,
    throttle,
    validate,
)

logger = logging.getLogger(__name__)
User = get_user_model()


def session_auth(request):
    if request.user.is_authenticated:
        return request.user
    raise ApiError(
        401,
        "authentication_required",
        "Sign in to continue; your local changes have not been discarded.",
    )


api = NinjaAPI(
    title="PFDkit platform API",
    version="1.0.0",
    auth=session_auth,
    docs_url="/docs" if settings.DEBUG else None,
)


@api.exception_handler(ApiError)
def api_error(request, exc):
    return JsonResponse(exc.payload, status=exc.status)


@api.exception_handler(ValidationError)
def validation_error(request, exc):
    issues = [
        {"path": ".".join(map(str, item["loc"])), "message": item["msg"], "code": "schema_error"}
        for item in exc.errors
    ]
    return JsonResponse(
        {
            "error": {
                "code": "invalid_request",
                "message": "Check the request fields.",
                "issues": issues,
            }
        },
        status=422,
    )


@api.exception_handler(AuthenticationError)
def authentication_error(request, exc):
    return JsonResponse(
        {"error": {"code": "authentication_required", "message": "Sign in to continue."}},
        status=401,
    )


@api.exception_handler(HttpError)
def http_error(request, exc):
    return JsonResponse(
        {"error": {"code": "invalid_request", "message": str(exc)}}, status=exc.status_code
    )


def user_data(user):
    return {"id": user.pk, "username": user.username, "email": user.email}


def publication_data(publication, detail=False):
    value = {
        "id": str(publication.pk),
        "title": publication.title,
        "description": publication.description,
        "author": publication.author,
        "license": publication.license,
        "category": publication.category,
        "tags": publication.tags,
        "sourceUrl": publication.source_url,
        "isTemplate": publication.is_template,
        "revision": publication.revision.number,
        "publishedAt": publication.published_at.isoformat(),
        "updatedAt": publication.updated_at.isoformat(),
    }
    if detail:
        value["document"] = publication.document
    return value


def project_data(project, detail=True):
    publication = Publication.objects.filter(project=project, active=True, withdrawn=False).first()
    value = {
        "id": str(project.pk),
        "title": project.title,
        "description": project.description,
        "visibility": "public" if publication else "private",
        "currentRevision": project.current_revision,
        "updatedAt": project.updated_at.isoformat(),
        "publication": publication_data(publication) if publication else None,
    }
    if detail:
        value["document"] = project.revisions.get(number=project.current_revision).document
    return value


def public(publication_id, lock=False):
    query = Publication.objects.filter(active=True, withdrawn=False)
    if lock:
        query = query.select_for_update()
    publication = query.filter(pk=publication_id).first()
    if not publication:
        raise ApiError(404, "not_found", "Public diagram not found.")
    return publication


@api.get("/health", auth=None)
def health(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception:
        logger.exception("database_health_failed")
        return JsonResponse(
            {"error": {"code": "database_unavailable", "message": "Database unavailable."}},
            status=503,
        )
    return {"status": "ok", "database": "postgresql"}


@api.get("/auth/csrf", auth=None)
def csrf(request):
    return {"csrfToken": get_token(request)}


@api.get("/auth/me", auth=None)
def me(request):
    return {"user": user_data(request.user) if request.user.is_authenticated else None}


def password_check(password, user):
    try:
        validate_password(password, user)
    except DjangoValidationError as exc:
        raise ApiError(422, "weak_password", " ".join(exc.messages)) from None


@api.post("/auth/register", auth=None)
def register(request, payload: Register):
    throttle(request, "register", 10)
    try:
        validate_email(payload.email)
    except DjangoValidationError:
        raise ApiError(422, "invalid_email", "Enter a valid email address.") from None
    user = User(username=payload.username, email=payload.email.strip().lower())
    password_check(payload.password, user)
    try:
        with transaction.atomic():
            # Email uniqueness is not required: recovery handles every matching account.
            user.set_password(payload.password)
            user.save()
    except IntegrityError:
        raise ApiError(409, "username_taken", "This username is already in use.") from None
    login(request, user)
    logger.info("account_registered user=%s", user.pk)
    return {"user": user_data(user), "csrfToken": get_token(request)}


@api.post("/auth/login", auth=None)
def sign_in(request, payload: Login):
    throttle(request, "login", 20)
    user = authenticate(request, username=payload.username, password=payload.password)
    if not user:
        raise ApiError(401, "invalid_credentials", "The username or password is incorrect.")
    login(request, user)
    return {"user": user_data(user), "csrfToken": get_token(request)}


@api.post("/auth/logout")
def sign_out(request):
    logout(request)
    return {"ok": True, "csrfToken": get_token(request)}


@api.post("/auth/recovery", auth=None)
def recovery(request, payload: Recovery):
    throttle(request, "recovery", 5)
    for user in User.objects.filter(email__iexact=payload.email.strip(), is_active=True):
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        link = f"{settings.PUBLIC_ORIGIN}/account?uid={uid}&token={token}"
        try:
            send_mail(
                "Reset your PFDkit password",
                f"Hello {user.username},\n\nReset your password within one hour:\n{link}\n\nIgnore this message if you did not request a reset.",
                settings.DEFAULT_FROM_EMAIL,
                [user.email],
            )
        except Exception:
            logger.exception("recovery_delivery_failed user=%s", user.pk)
    return {
        "ok": True,
        "message": "If an active account matches, recovery instructions have been sent.",
    }


@api.post("/auth/recovery/confirm", auth=None)
def reset(request, payload: Reset):
    throttle(request, "reset", 10)
    try:
        uid = force_str(urlsafe_base64_decode(payload.uid))
    except (ValueError, OverflowError, UnicodeDecodeError):
        raise ApiError(400, "invalid_reset", "The recovery link is invalid or expired.") from None
    with transaction.atomic():
        user = (
            User.objects.select_for_update().filter(pk=uid, is_active=True).first()
            if uid.isdigit()
            else None
        )
        if not user or not default_token_generator.check_token(user, payload.token):
            raise ApiError(400, "invalid_reset", "The recovery link is invalid or expired.")
        password_check(payload.password, user)
        user.set_password(payload.password)
        user.save(update_fields=["password"])
    return {"ok": True}


@api.get("/projects")
def projects(
    request,
    q: str = "",
    sort: str = "updated",
    visibility: str = "",
    page: int = 1,
    pageSize: int = 50,
):
    from .models import Project

    query = Project.objects.filter(owner=request.user)
    if q:
        query = query.filter(Q(title__icontains=q[:200]) | Q(description__icontains=q[:200]))
    if visibility in {"private", "public"}:
        published = Publication.objects.filter(active=True, withdrawn=False).values("project_id")
        query = (
            query.filter(pk__in=published)
            if visibility == "public"
            else query.exclude(pk__in=published)
        )
    query = query.order_by("title" if sort == "title" else "-updated_at", "id")
    page, pageSize = max(1, page), max(1, min(100, pageSize))
    return {
        "items": [
            project_data(item, False) for item in query[(page - 1) * pageSize : page * pageSize]
        ],
        "total": query.count(),
        "page": page,
        "pageSize": pageSize,
    }


@api.post("/projects")
def create(request, payload: CreateProject):
    throttle(request, "project-create", 60)
    project = new_project(
        request.user, payload.title, payload.description, validate(payload.document)
    )
    return project_data(project)


@api.get("/projects/{project_id}")
def get_project(request, project_id: UUID):
    return project_data(owned(request, project_id))


@api.patch("/projects/{project_id}")
def edit_project(request, project_id: UUID, payload: EditProject):
    with transaction.atomic():
        project = owned(request, project_id, True)
        for key, value in payload.model_dump(exclude_none=True).items():
            setattr(project, key, value)
        project.save()
        return project_data(project)


@api.delete("/projects/{project_id}")
def delete_project(request, project_id: UUID):
    with transaction.atomic():
        project = owned(request, project_id, True)
        # Remove the publication's PROTECT reference before cascading revision history.
        Publication.objects.filter(project=project).delete()
        project.delete()
    return {"ok": True}


@api.put("/projects/{project_id}/document")
def save(request, project_id: UUID, payload: Save):
    document = validate(payload.document)
    with transaction.atomic():
        project = owned(request, project_id, True)
        check_revision(project, payload.expectedRevision)
        append_revision(project, request.user, document)
        return project_data(project)


@api.post("/projects/{project_id}/duplicate")
def duplicate(request, project_id: UUID, payload: Duplicate):
    throttle(request, "project-create", 60)
    original = owned(request, project_id)
    raw = original.revisions.get(number=original.current_revision).document
    project = new_project(
        request.user,
        payload.title or f"{original.title[:190]} (copy)",
        original.description,
        copy_document(raw),
        original.source_attribution,
    )
    return project_data(project)


def revision_data(revision, detail=False):
    value = {
        "number": revision.number,
        "author": revision.author.username,
        "createdAt": revision.created_at.isoformat(),
    }
    if detail:
        value["document"] = revision.document
    return value


@api.get("/projects/{project_id}/revisions")
def revisions(request, project_id: UUID):
    project = owned(request, project_id)
    return {
        "items": [
            revision_data(item)
            for item in project.revisions.select_related("author").order_by("-number")
        ]
    }


@api.get("/projects/{project_id}/revisions/{number}")
def revision(request, project_id: UUID, number: int):
    project = owned(request, project_id)
    item = project.revisions.filter(number=number).first()
    if not item:
        raise ApiError(404, "not_found", "Revision not found.")
    return revision_data(item, True)


@api.post("/projects/{project_id}/restore")
def restore(request, project_id: UUID, payload: Restore):
    with transaction.atomic():
        project = owned(request, project_id, True)
        check_revision(project, payload.expectedRevision)
        item = project.revisions.filter(number=payload.revision).first()
        if not item:
            raise ApiError(404, "not_found", "Revision not found.")
        append_revision(project, request.user, validate(item.document))
        return project_data(project)


@api.post("/projects/{project_id}/publish")
def publish(request, project_id: UUID, payload: Publish):
    with transaction.atomic():
        project = owned(request, project_id, True)
        revision = project.revisions.filter(number=payload.revision).first()
        if not revision:
            raise ApiError(404, "not_found", "Revision not found.")
        existing = Publication.objects.filter(project=project).first()
        if existing and existing.withdrawn:
            raise ApiError(
                403,
                "publication_withdrawn",
                "A maintainer withdrew this contribution. Contact the maintainer before republishing.",
            )
        publication_id = existing.pk if existing else uuid4()
        attribution = {
            "creator": payload.author,
            "license": payload.license,
            "source": payload.sourceUrl or f"{settings.PUBLIC_ORIGIN}/library/{publication_id}",
            "publicationId": str(publication_id),
            "revision": revision.number,
        }
        prior = project.source_attribution or public_attribution(
            revision.document.get("metadata", {}).get("attribution")
        )
        if requires_attribution(prior) and payload.license == "CC0-1.0":
            raise ApiError(
                422,
                "attribution_required",
                "A CC BY source must retain attribution and cannot be published as CC0.",
            )
        if prior:
            attribution["previous"] = prior
        document = public_document(revision.document, attribution)
        document["title"] = payload.title
        publication, _ = Publication.objects.update_or_create(
            project=project,
            defaults={
                "id": publication_id,
                "revision": revision,
                "document": document,
                "title": payload.title,
                "description": payload.description,
                "author": payload.author,
                "license": payload.license,
                "category": payload.category,
                "tags": payload.tags,
                "source_url": payload.sourceUrl,
                "is_template": payload.isTemplate,
                "active": True,
            },
        )
        logger.info(
            "publication_updated project=%s publication=%s revision=%s",
            project.pk,
            publication.pk,
            revision.number,
        )
        return publication_data(publication, True)


@api.delete("/projects/{project_id}/publish")
def unpublish(request, project_id: UUID):
    with transaction.atomic():
        project = owned(request, project_id, True)
        Publication.objects.filter(project=project).update(active=False)
    return {"ok": True}


@api.get("/library", auth=None)
def library(
    request,
    q: str = "",
    category: str = "",
    tag: str = "",
    template: bool | None = None,
    sort: str = "updated",
    page: int = 1,
    pageSize: int = 20,
):
    query = Publication.objects.filter(active=True, withdrawn=False).select_related("revision")
    if q:
        query = query.filter(
            Q(title__icontains=q[:200])
            | Q(description__icontains=q[:200])
            | Q(author__icontains=q[:200])
            | Q(category__icontains=q[:200])
            | Q(tags__icontains=q[:200])
        )
    if category:
        query = query.filter(category=category[:80])
    if tag:
        query = query.filter(tags__contains=[tag[:80]])
    if template is not None:
        query = query.filter(is_template=template)
    query = query.order_by("title" if sort == "title" else "-updated_at", "id")
    page, pageSize = max(1, page), max(1, min(100, pageSize))
    return {
        "items": [
            publication_data(item) for item in query[(page - 1) * pageSize : page * pageSize]
        ],
        "total": query.count(),
        "page": page,
        "pageSize": pageSize,
    }


@api.get("/library/{publication_id}", auth=None)
def public_detail(request, publication_id: UUID):
    return publication_data(public(publication_id), True)


@api.get("/library/{publication_id}/document", auth=None)
def public_export(request, publication_id: UUID):
    return JsonResponse(public(publication_id).document)


@api.post("/library/{publication_id}/duplicate")
def public_duplicate(request, publication_id: UUID, payload: Duplicate):
    throttle(request, "project-create", 60)
    with transaction.atomic():
        publication = public(publication_id, True)
        document = copy_document(publication.document)
        document["metadata"]["attribution"]["publicationId"] = str(publication.pk)
        document["metadata"]["attribution"]["source"] = (
            f"{settings.PUBLIC_ORIGIN}/library/{publication.pk}"
        )
        document["metadata"]["attribution"]["modifications"] = "Duplicated for customization"
        return project_data(
            new_project(
                request.user, payload.title or publication.title, publication.description, document
            )
        )


@api.post("/library/{publication_id}/reports", auth=None)
def report(request, publication_id: UUID, payload: ReportInput):
    throttle(request, "report", 5)
    publication = public(publication_id)
    Report.objects.create(
        publication=publication,
        reason=payload.reason,
        reporter=request.user if request.user.is_authenticated else None,
    )
    return {"ok": True}
