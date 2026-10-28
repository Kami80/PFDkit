"""Real PostgreSQL integration tests through Django's HTTP/session/CSRF stack."""

import copy
import json
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from io import StringIO
from pathlib import Path
from threading import Barrier

from django.contrib.auth import get_user_model
from django.contrib.sessions.models import Session
from django.core import mail
from django.core.management import call_command
from django.db import DatabaseError, close_old_connections, connection, transaction
from django.test import Client, TestCase, TransactionTestCase, override_settings
from django.utils import timezone

from .models import Project, Publication, RateBucket, Revision
from .services import ApiError, append_revision, check_revision, owned

PASSWORD = "correct-horse-argon-plant-829!"
ROOT = Path(__file__).resolve().parents[3]


class ApiTestCase(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user("owner", "owner@example.org", PASSWORD)
        self.other = get_user_model().objects.create_user("other", "other@example.org", PASSWORD)
        self.client = Client(enforce_csrf_checks=True)
        self.client.force_login(self.owner)
        self.document = json.loads((ROOT / "examples" / "valid-process.json").read_text())

    def request(self, method, path, body=None, client=None):
        client = client or self.client
        client.get("/api/auth/csrf")
        return getattr(client, method)(
            "/api" + path,
            data=json.dumps(body or {}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value,
        )

    def create(self, document=None):
        response = self.request(
            "post",
            "/projects",
            {
                "title": "Private plant",
                "description": "Owner description",
                "document": document or self.document,
            },
        )
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def publish(self, project, **changes):
        payload = {
            "revision": project["currentRevision"],
            "title": "Public teaching plant",
            "description": "Illustrative process explanation",
            "author": "Diagram author",
            "license": "CC-BY-4.0",
            "category": "Separation",
            "tags": ["pump", "heat exchanger"],
            "sourceUrl": "https://example.org/teaching",
            "isTemplate": True,
            **changes,
        }
        response = self.request("post", f"/projects/{project['id']}/publish", payload)
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def test_postgresql_health_and_roundtrip(self):
        self.assertEqual(connection.vendor, "postgresql")
        self.assertEqual(self.client.get("/api/health").json()["database"], "postgresql")
        project = self.create()
        loaded = self.client.get(f"/api/projects/{project['id']}").json()
        self.assertEqual(loaded["document"], self.document)
        self.assertEqual(loaded["visibility"], "private")
        self.assertEqual(self.client.get("/api/library").json()["total"], 0)

    def test_invalid_schema_and_semantics_do_not_create_or_save(self):
        project = self.create()
        for filename, code in [
            ("unsupported-version.json", "unsupported_version"),
            ("broken-reference.json", "invalid_document"),
            ("unknown-equipment.json", "invalid_document"),
            ("unsafe-integer.json", "invalid_document"),
        ]:
            raw = json.loads((ROOT / "examples" / filename).read_text())
            response = self.request(
                "put",
                f"/projects/{project['id']}/document",
                {"document": raw, "expectedRevision": 1},
            )
            self.assertEqual(response.status_code, 422)
            self.assertEqual(response.json()["error"]["code"], code)
        self.assertEqual(Revision.objects.count(), 1)
        self.assertEqual(Project.objects.get().current_revision, 1)

    def test_incomplete_draft_allowed(self):
        document = json.loads((ROOT / "examples" / "incomplete-draft.json").read_text())
        self.create(document)

    def test_revision_save_conflict_restore_and_history(self):
        project = self.create()
        updated = copy.deepcopy(self.document)
        updated["education"]["notes"] = "Second revision"
        path = f"/projects/{project['id']}"
        response = self.request(
            "put", path + "/document", {"document": updated, "expectedRevision": 1}
        )
        self.assertEqual(response.json()["currentRevision"], 2)
        response = self.request(
            "put", path + "/document", {"document": self.document, "expectedRevision": 1}
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["error"]["currentRevision"], 2)
        response = self.request("post", path + "/restore", {"revision": 1, "expectedRevision": 2})
        self.assertEqual(response.json()["currentRevision"], 3)
        self.assertEqual(response.json()["document"], self.document)
        self.assertEqual(
            self.client.get("/api" + path + "/revisions/2").json()["document"], updated
        )
        self.assertEqual(
            [
                item["number"]
                for item in self.client.get("/api" + path + "/revisions").json()["items"]
            ],
            [3, 2, 1],
        )

    def test_revision_is_immutable_in_orm_and_database(self):
        self.create()
        revision = Revision.objects.get()
        with self.assertRaises(ValueError):
            revision.save()
        with self.assertRaises(DatabaseError), transaction.atomic():
            Revision.objects.filter(pk=revision.pk).update(document={})

    def test_owner_only_for_every_private_operation(self):
        project = self.create()
        self.publish(project)
        self.client.force_login(self.other)
        path = f"/projects/{project['id']}"
        self.assertEqual(self.client.get("/api/projects").json()["total"], 0)
        for suffix in ["", "/revisions", "/revisions/1"]:
            self.assertEqual(self.client.get("/api" + path + suffix).status_code, 404)
        requests = [
            ("patch", "", {"title": "hijack"}),
            ("delete", "", {}),
            ("put", "/document", {"document": self.document, "expectedRevision": 1}),
            ("post", "/duplicate", {}),
            ("post", "/restore", {"revision": 1, "expectedRevision": 1}),
            ("delete", "/publish", {}),
        ]
        for method, suffix, payload in requests:
            self.assertEqual(self.request(method, path + suffix, payload).status_code, 404)
        self.assertEqual(Revision.objects.count(), 1)

    def test_anonymous_private_access_is_401(self):
        project = self.create()
        self.client.logout()
        self.assertEqual(self.client.get(f"/api/projects/{project['id']}").status_code, 401)
        self.assertIsNone(self.client.get("/api/auth/me").json()["user"])

    def test_expired_session_loses_private_access_without_changing_projects(self):
        project = self.create()
        Session.objects.filter(session_key=self.client.cookies["sessionid"].value).update(
            expire_date=timezone.now() - timedelta(seconds=1)
        )
        self.assertIsNone(self.client.get("/api/auth/me").json()["user"])
        self.assertEqual(self.client.get(f"/api/projects/{project['id']}").status_code, 401)
        self.assertEqual(Project.objects.count(), 1)
        self.assertEqual(Revision.objects.count(), 1)

    @override_settings(SESSION_COOKIE_SECURE=True, CSRF_COOKIE_SECURE=True)
    def test_https_login_issues_secure_session_and_csrf_cookies(self):
        anonymous = Client(enforce_csrf_checks=True)
        response = self.request(
            "post", "/auth/login", {"username": "owner", "password": PASSWORD}, anonymous
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(anonymous.cookies["sessionid"]["secure"])
        self.assertTrue(anonymous.cookies["sessionid"]["httponly"])
        self.assertEqual(anonymous.cookies["sessionid"]["samesite"], "Lax")
        self.assertTrue(anonymous.cookies["csrftoken"]["secure"])

    def test_publication_pinned_revision_and_deliberate_update(self):
        project = self.create()
        publication = self.publish(project)
        self.document["engineering"]["equipment"][0]["tag"] = "PRIVATE-LATEST"
        self.request(
            "put",
            f"/projects/{project['id']}/document",
            {"document": self.document, "expectedRevision": 1},
        )
        anonymous = Client()
        response = anonymous.get(f"/api/library/{publication['id']}")
        self.assertEqual(response.json()["revision"], 1)
        self.assertNotIn("PRIVATE-LATEST", response.content.decode())
        project["currentRevision"] = 2
        self.publish(project)
        self.assertIn(
            "PRIVATE-LATEST", anonymous.get(f"/api/library/{publication['id']}").content.decode()
        )

    def test_publication_redacts_all_private_metadata_and_hidden_notes(self):
        raw = copy.deepcopy(self.document)
        secret = "SECRET-OWNER-DATA"
        raw["metadata"] = {
            "privateNotes": secret,
            "account": secret,
            "attribution": {"creator": "Original", "license": "CC-BY-4.0", "privateNotes": secret},
        }
        raw["education"]["notes"] = secret
        raw["education"]["metadata"] = {"private": secret}
        raw["education"]["annotations"] = [{"id": "hidden", "text": secret, "visible": False}]
        raw["education"]["steps"] = [{"id": "step", "notes": secret, "annotationIds": ["hidden"]}]
        raw["presentation"]["metadata"] = {
            "private": secret,
            "style": {"preset": "academicColorful", "secret": secret},
            "objectStyles": {"feed-1": {"fill": "#ffffff", "secret": secret}},
        }
        for item in raw["engineering"]["equipment"]:
            item["metadata"] = {"private": secret}
            item["config"]["privateNotes"] = secret
        for item in raw["engineering"]["streams"]:
            item["metadata"] = {"private": secret, "valueStatus": "illustrative"}
        for item in raw["presentation"]["nodes"].values():
            item["metadata"] = {"private": secret}
        raw["engineering"]["components"] = [
            {"id": "c-secret", "name": "Water", "metadata": {"private": secret}}
        ]
        project = self.create(raw)
        publication = self.publish(project)
        for endpoint in [
            f"/api/library/{publication['id']}",
            f"/api/library/{publication['id']}/document",
            "/api/library",
        ]:
            self.assertNotIn(secret, self.client.get(endpoint).content.decode())
        copied = self.request("post", f"/library/{publication['id']}/duplicate").json()
        self.assertNotIn(secret, json.dumps(copied))
        self.assertIn(
            secret, json.dumps(Revision.objects.get(project_id=project["id"], number=1).document)
        )
        self.assertEqual(
            publication["document"]["metadata"]["attribution"]["previous"]["creator"], "Original"
        )

    def test_library_search_filters_private_exclusion_and_pagination(self):
        self.create()
        project = self.create()
        publication = self.publish(project)
        for suffix in [
            "?q=teaching",
            "?tag=pump",
            "?category=Separation",
            "?template=true",
            "?q=heat%20exchanger",
        ]:
            response = self.client.get("/api/library" + suffix)
            self.assertEqual(response.status_code, 200, response.content)
            self.assertEqual(response.json()["total"], 1)
            self.assertEqual(response.json()["items"][0]["id"], publication["id"])
            self.assertNotIn("document", response.json()["items"][0])
        self.assertEqual(self.client.get("/api/library?page=2&pageSize=1").json()["items"], [])
        self.assertEqual(self.client.get("/api/library?template=false").json()["total"], 0)

    def test_public_duplicate_preserves_provenance_even_if_removed_from_save(self):
        publication = self.publish(self.create())
        self.client.force_login(self.other)
        copied = self.request("post", f"/library/{publication['id']}/duplicate").json()
        self.assertEqual(copied["visibility"], "private")
        self.assertNotEqual(copied["document"]["id"], publication["document"]["id"])
        copied["document"]["metadata"] = {}
        response = self.request(
            "put",
            f"/projects/{copied['id']}/document",
            {"document": copied["document"], "expectedRevision": 1},
        )
        self.assertEqual(
            response.json()["document"]["metadata"]["attribution"]["publicationId"],
            publication["id"],
        )
        bad = {
            "revision": 2,
            "title": "Reused",
            "description": "Must retain credit",
            "author": "Other",
            "category": "Examples",
            "license": "CC0-1.0",
        }
        self.assertEqual(
            self.request("post", f"/projects/{copied['id']}/publish", bad).status_code, 422
        )

    def test_unpublish_blocks_view_export_duplicate_and_search(self):
        project = self.create()
        publication = self.publish(project)
        self.request("delete", f"/projects/{project['id']}/publish")
        self.assertEqual(self.client.get("/api/library").json()["total"], 0)
        for suffix in ["", "/document"]:
            self.assertEqual(
                self.client.get(f"/api/library/{publication['id']}" + suffix).status_code, 404
            )
        self.assertEqual(
            self.request("post", f"/library/{publication['id']}/duplicate").status_code, 404
        )
        republished = self.publish(project)
        self.assertEqual(publication["id"], republished["id"])

    def test_reports_withdraw_restore_and_republish_block(self):
        project = self.create()
        publication = self.publish(project)
        self.assertEqual(
            self.request(
                "post",
                f"/library/{publication['id']}/reports",
                {"reason": "Please review this attribution"},
            ).status_code,
            200,
        )
        call_command(
            "moderate_publication",
            "withdraw",
            publication=publication["id"],
            reason="Review requested",
            stdout=StringIO(),
        )
        self.assertEqual(self.client.get(f"/api/library/{publication['id']}").status_code, 404)
        payload = {
            "revision": 1,
            "title": "Again",
            "description": "A new description",
            "author": "Owner",
            "license": "CC-BY-4.0",
            "category": "Examples",
        }
        self.assertEqual(
            self.request("post", f"/projects/{project['id']}/publish", payload).status_code, 403
        )
        self.assertEqual(Revision.objects.count(), 1)
        call_command(
            "moderate_publication",
            "restore",
            publication=publication["id"],
            reason="Review completed",
            stdout=StringIO(),
        )
        self.assertEqual(self.client.get(f"/api/library/{publication['id']}").status_code, 200)

    def test_delete_published_project_and_private_duplicate(self):
        project = self.create()
        publication = self.publish(project)
        copied = self.request("post", f"/projects/{project['id']}/duplicate").json()
        self.assertEqual(copied["visibility"], "private")
        response = self.request("delete", f"/projects/{project['id']}")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(Publication.objects.filter(pk=publication["id"]).exists())
        self.assertTrue(Project.objects.filter(pk=copied["id"]).exists())

    def test_csrf_required_on_registration_login_and_every_mutation(self):
        anonymous = Client(enforce_csrf_checks=True)
        for path, payload in [
            ("/auth/login", {"username": "owner", "password": PASSWORD}),
            (
                "/auth/register",
                {"username": "new", "email": "new@example.org", "password": PASSWORD},
            ),
            ("/auth/recovery", {"email": "owner@example.org"}),
        ]:
            response = anonymous.post(
                "/api" + path, json.dumps(payload), content_type="application/json"
            )
            self.assertEqual(response.status_code, 403)
        self.assertEqual(
            self.client.post("/api/projects", "{}", content_type="application/json").status_code,
            403,
        )
        anonymous.get("/api/auth/csrf")
        response = anonymous.post(
            "/api/auth/login",
            json.dumps({"username": "owner", "password": PASSWORD}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=anonymous.cookies["csrftoken"].value,
            HTTP_ORIGIN="https://attacker.example",
        )
        self.assertEqual(response.status_code, 403)

    def test_register_login_logout_session_rotation_and_password_validation(self):
        anonymous = Client(enforce_csrf_checks=True)
        payload = {"username": "new-user", "email": "new@example.org", "password": "123"}
        self.assertEqual(
            self.request("post", "/auth/register", payload, anonymous).status_code, 422
        )
        payload["password"] = PASSWORD
        response = self.request("post", "/auth/register", payload, anonymous)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(anonymous.get("/api/auth/me").json()["user"]["username"], "new-user")
        self.assertIn("csrfToken", response.json())
        self.assertTrue(anonymous.cookies["sessionid"]["httponly"])
        self.request("post", "/auth/logout", client=anonymous)
        self.assertIsNone(anonymous.get("/api/auth/me").json()["user"])
        response = self.request(
            "post", "/auth/login", {"username": "new-user", "password": PASSWORD}, anonymous
        )
        self.assertEqual(response.status_code, 200)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_account_recovery_expiry_reuse_and_session_invalidation(self):
        anonymous = Client(enforce_csrf_checks=True)
        known = self.request("post", "/auth/recovery", {"email": "owner@example.org"}, anonymous)
        unknown = self.request(
            "post", "/auth/recovery", {"email": "missing@example.org"}, anonymous
        )
        self.assertEqual(known.json(), unknown.json())
        match = re.search(r"uid=([^&\s]+)&token=([^\s]+)", mail.outbox[0].body)
        uid, token = match.groups()
        payload = {"uid": uid, "token": token, "password": "updated-password-argon-827!"}
        with override_settings(PASSWORD_RESET_TIMEOUT=-1):
            self.assertEqual(
                self.request("post", "/auth/recovery/confirm", payload, anonymous).status_code, 400
            )
        self.assertEqual(
            self.request("post", "/auth/recovery/confirm", payload, anonymous).status_code, 200
        )
        self.assertEqual(
            self.request("post", "/auth/recovery/confirm", payload, anonymous).status_code, 400
        )
        self.assertIsNone(self.client.get("/api/auth/me").json()["user"])
        response = self.request(
            "post", "/auth/login", {"username": "owner", "password": payload["password"]}, anonymous
        )
        self.assertEqual(response.status_code, 200)

    def test_limits_and_bad_identifiers(self):
        project = self.create()
        raw = copy.deepcopy(self.document)
        raw["metadata"]["large"] = "x" * (1024 * 1024)
        self.assertEqual(
            self.request(
                "put",
                f"/projects/{project['id']}/document",
                {"document": raw, "expectedRevision": 1},
            ).status_code,
            413,
        )
        response = self.client.post(
            "/api/projects", "x" * (2 * 1024 * 1024 + 1), content_type="application/json"
        )
        self.assertEqual(response.status_code, 413)
        self.assertEqual(self.client.get("/api/projects/not-a-uuid").status_code, 422)
        self.assertEqual(Revision.objects.count(), 1)

    def test_rate_limit_survives_between_requests(self):
        anonymous = Client(enforce_csrf_checks=True)
        for _ in range(5):
            self.assertEqual(
                self.request(
                    "post", "/auth/recovery", {"email": "missing@example.org"}, anonymous
                ).status_code,
                200,
            )
        self.assertEqual(
            self.request(
                "post", "/auth/recovery", {"email": "missing@example.org"}, anonymous
            ).status_code,
            429,
        )
        self.assertTrue(RateBucket.objects.exists())

    def test_safe_source_and_license_validation(self):
        project = self.create()
        payload = {
            "revision": 1,
            "title": "Example",
            "description": "Attribution test",
            "author": "Owner",
            "license": "CC-BY-4.0",
            "category": "Teaching",
            "sourceUrl": "javascript:alert(1)",
        }
        self.assertEqual(
            self.request("post", f"/projects/{project['id']}/publish", payload).status_code, 422
        )
        self.assertFalse(Publication.objects.exists())

    def test_seed_private_default_idempotent_and_manifest(self):
        call_command("seed_examples", owner="owner", stdout=StringIO())
        count = Project.objects.count()
        self.assertGreaterEqual(count, 5)
        self.assertFalse(Publication.objects.exists())
        call_command("seed_examples", owner="owner", stdout=StringIO())
        self.assertEqual(Project.objects.count(), count)
        output = StringIO()
        call_command("platform_manifest", stdout=output)
        manifest = json.loads(output.getvalue())
        self.assertEqual(len(manifest["projects"]), count)
        self.assertEqual(len(manifest["revisions"][0]["sha256"]), 64)


class ConcurrentRevisionTests(TransactionTestCase):
    def test_two_concurrent_writers_have_one_winner(self):
        from .services import new_project

        owner = get_user_model().objects.create_user("concurrent", password=PASSWORD)
        document = json.loads((ROOT / "examples" / "valid-process.json").read_text())
        project = new_project(owner, "Concurrent plant", "", document)
        barrier = Barrier(2)

        def write():
            close_old_connections()
            try:
                request = type("Request", (), {"user": owner})()
                barrier.wait(timeout=10)
                with transaction.atomic():
                    locked = owned(request, project.pk, True)
                    check_revision(locked, 1)
                    append_revision(locked, owner, document)
                return 200
            except ApiError as exc:
                return exc.status
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(lambda _: write(), range(2)))
        self.assertEqual(sorted(results), [200, 409])
        self.assertEqual(Revision.objects.filter(project=project).count(), 2)
