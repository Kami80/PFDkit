from django.conf import settings
from django.http import JsonResponse
from django.middleware.csrf import CsrfViewMiddleware


def protected_view(request):
    """Non-exempt callback for Ninja's otherwise exempt endpoint wrappers."""


class ApiProtectionMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path.startswith("/api/"):
            try:
                length = int(request.META.get("CONTENT_LENGTH") or "0")
            except ValueError:
                length = settings.DATA_UPLOAD_MAX_MEMORY_SIZE + 1
            if length > settings.DATA_UPLOAD_MAX_MEMORY_SIZE:
                return self.private_response(
                    JsonResponse(
                        {
                            "error": {
                                "code": "request_too_large",
                                "message": "Requests are limited to 2 MiB.",
                            }
                        },
                        status=413,
                    )
                )
            checker = CsrfViewMiddleware(self.get_response)
            checker.process_request(request)
            if checker.process_view(request, protected_view, (), {}):
                return self.private_response(
                    JsonResponse(
                        {
                            "error": {
                                "code": "csrf_failed",
                                "message": "Refresh the CSRF token and retry.",
                            }
                        },
                        status=403,
                    )
                )
            response = self.get_response(request)
            return self.private_response(checker.process_response(request, response))
        return self.get_response(request)

    @staticmethod
    def private_response(response):
        response["Cache-Control"] = "no-store"
        response["Pragma"] = "no-cache"
        response["X-Content-Type-Options"] = "nosniff"
        return response
