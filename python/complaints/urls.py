"""URLs for the complaints gateway."""

from django.urls import path

from .views import my_complaints

urlpatterns = [
    path('complaints/', my_complaints, name='my-complaints'),
]