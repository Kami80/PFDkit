from django.urls import path

from platform_api.api import api

urlpatterns = [path("api/", api.urls)]
