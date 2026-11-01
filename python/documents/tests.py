"""
Tests for the documents app: ACL rules, category/file API, uploads,
downloads, comments, ratings, and client share links.

Run with: docker compose exec web python manage.py test documents
"""

import shutil
import tempfile
from datetime import timedelta

from django.contrib.auth.models import Group, Permission, User
from django.contrib.contenttypes.models import ContentType
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import (
    Category, StoredFile, SharedLink, Comment, Rating, DownloadLog, UploadLog,
)

TEST_MEDIA_ROOT = tempfile.mkdtemp()


def make_user(username, **kwargs):
    return User.objects.create_user(
        username=username, password='pass12345', **kwargs,
    )


def results(response):
    """Unwrap DRF paginated list responses."""
    data = response.data
    return data['results'] if isinstance(data, dict) and 'results' in data else data


def grant(user, codename):
    user.user_permissions.add(Permission.objects.get(codename=codename))


@override_settings(MEDIA_ROOT=TEST_MEDIA_ROOT)
class PortalTestCase(APITestCase):
    """Shared fixtures: users, groups, ACL categories, and files."""

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEST_MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        self.admin = make_user('admin', is_staff=True, is_superuser=True)
        self.alice = make_user('alice')
        self.bob = make_user('bob')
        self.council_group = Group.objects.create(name='Councillors')
        self.alice.groups.add(self.council_group)

        self.public_cat = Category.objects.create(title='Public', slug='public')
        self.restricted_cat = Category.objects.create(
            title='Restricted', slug='restricted',
        )
        self.restricted_cat.access_groups.add(self.council_group)

        self.public_file = self.make_file(self.public_cat, 'public-file')
        self.restricted_file = self.make_file(
            self.restricted_cat, 'restricted-file',
        )
        self.unpublished_file = self.make_file(
            self.public_cat, 'draft-file', published=False,
        )

    def make_file(self, category, title, published=True, external=False):
        kwargs = {
            'title': title,
            'slug': title,
            'category': category,
            'is_published': published,
        }
        if external:
            kwargs.update(storage=StoredFile.StorageKind.EXTERNAL,
                          external_url='https://example.com/file.pdf')
        else:
            kwargs['local_file'] = SimpleUploadedFile(
                f'{title}.txt', b'hello world', content_type='text/plain',
            )
        return StoredFile.objects.create(**kwargs)


class AclRuleTests(PortalTestCase):
    def test_unrestricted_object_is_visible_to_authenticated_users(self):
        self.assertTrue(self.public_file.can_view(self.bob))

    def test_unpublished_object_is_hidden_except_from_superuser(self):
        self.assertFalse(self.unpublished_file.can_view(self.bob))
        self.assertTrue(self.unpublished_file.can_view(self.admin))

    def test_group_restriction_allows_members_only(self):
        self.assertTrue(self.restricted_file.can_view(self.alice))
        self.assertFalse(self.restricted_file.can_view(self.bob))

    def test_user_whitelist_grants_access(self):
        self.restricted_file.access_users.add(self.bob)
        self.restricted_cat.access_users.add(self.bob)
        self.assertTrue(self.restricted_file.can_view(self.bob))

    def test_category_acl_cascades_to_files(self):
        self.assertFalse(self.restricted_cat.can_view(self.bob))
        self.assertFalse(self.restricted_file.can_view(self.bob))


class CategoryApiTests(PortalTestCase):
    def test_list_returns_only_visible_roots(self):
        self.client.force_authenticate(self.bob)
        response = self.client.get('/api/categories/')
        slugs = {c['slug'] for c in results(response)}
        self.assertEqual(slugs, {'public'})

    def test_detail_404_for_hidden_category(self):
        self.client.force_authenticate(self.bob)
        response = self.client.get('/api/categories/restricted/')
        self.assertEqual(response.status_code, 404)

    def test_files_action_filters_by_acl(self):
        self.client.force_authenticate(self.bob)
        response = self.client.get('/api/categories/public/files/')
        titles = {f['title'] for f in results(response)}
        self.assertEqual(titles, {'public-file'})

    def test_anonymous_access_is_rejected(self):
        response = self.client.get('/api/categories/')
        self.assertEqual(response.status_code, 401)


class FileApiTests(PortalTestCase):
    def test_list_filters_acl_and_drafts(self):
        self.client.force_authenticate(self.bob)
        response = self.client.get('/api/files/')
        titles = {f['title'] for f in results(response)}
        self.assertEqual(titles, {'public-file'})

    def test_detail_404_when_not_visible(self):
        self.client.force_authenticate(self.bob)
        response = self.client.get(f'/api/files/{self.restricted_file.id}/')
        self.assertEqual(response.status_code, 404)

    def test_local_download_increments_count_and_logs(self):
        self.client.force_authenticate(self.alice)
        response = self.client.get(f'/api/files/{self.restricted_file.id}/download/')
        self.assertEqual(response.status_code, 200)
        self.restricted_file.refresh_from_db()
        self.assertEqual(self.restricted_file.download_count, 1)
        self.assertEqual(DownloadLog.objects.filter(
            file=self.restricted_file, user=self.alice).count(), 1)

    def test_external_download_returns_url(self):
        external = self.make_file(self.public_cat, 'external', external=True)
        self.client.force_authenticate(self.bob)
        response = self.client.get(f'/api/files/{external.id}/download/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['url'], 'https://example.com/file.pdf')

    def test_download_of_hidden_file_is_404(self):
        self.client.force_authenticate(self.bob)
        response = self.client.get(f'/api/files/{self.restricted_file.id}/download/')
        self.assertEqual(response.status_code, 404)


class UploadApiTests(PortalTestCase):
    def _upload(self, name='notes.txt'):
        return self.client.post('/api/files/upload/', {
            'file': SimpleUploadedFile(name, b'content', content_type='text/plain'),
            'title': 'Notes',
            'slug': 'notes',
            'category': self.public_cat.slug,
        }, format='multipart')

    def test_non_staff_cannot_upload(self):
        self.client.force_authenticate(self.alice)
        self.assertEqual(self._upload().status_code, 403)

    def test_disallowed_extension_is_rejected(self):
        self.client.force_authenticate(self.admin)
        response = self._upload('malware.exe')
        self.assertEqual(response.status_code, 400)

    def test_upload_creates_file_and_log(self):
        self.client.force_authenticate(self.admin)
        response = self._upload()
        self.assertEqual(response.status_code, 201)
        uploaded = StoredFile.objects.get(title='Notes')
        self.assertTrue(UploadLog.objects.filter(
            file=uploaded, action=UploadLog.Action.CREATED).exists())

    def test_replace_writes_replaced_log(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            f'/api/files/{self.public_file.id}/replace/',
            {'file': SimpleUploadedFile('new.txt', b'new content')},
            format='multipart',
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(UploadLog.objects.filter(
            file=self.public_file, action=UploadLog.Action.REPLACED).exists())


class SocialApiTests(PortalTestCase):
    def test_comment_on_visible_file_is_created(self):
        self.client.force_authenticate(self.bob)
        response = self.client.post('/api/comments/', {
            'content_type': ContentType.objects.get_for_model(StoredFile).id,
            'object_id': self.public_file.id,
            'text': 'Nice document',
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Comment.objects.count(), 1)

    def test_comment_on_hidden_file_is_rejected(self):
        self.client.force_authenticate(self.bob)
        response = self.client.post('/api/comments/', {
            'content_type': ContentType.objects.get_for_model(StoredFile).id,
            'object_id': self.restricted_file.id,
            'text': 'Should fail',
        })
        self.assertEqual(response.status_code, 400)

    def test_comment_with_invalid_content_type_is_rejected(self):
        self.client.force_authenticate(self.bob)
        response = self.client.post('/api/comments/', {
            'content_type': 999999,
            'object_id': 1,
            'text': 'Bad target',
        })
        self.assertEqual(response.status_code, 400)

    def test_rating_upserts_single_row(self):
        self.client.force_authenticate(self.bob)
        payload = {
            'content_type': ContentType.objects.get_for_model(StoredFile).id,
            'object_id': self.public_file.id,
            'value': 5,
        }
        self.assertEqual(self.client.post('/api/ratings/', payload).status_code, 201)
        payload['value'] = 3
        self.assertEqual(self.client.post('/api/ratings/', payload).status_code, 201)
        rating = Rating.objects.get(user=self.bob)
        self.assertEqual(rating.value, 3)
        self.assertEqual(Rating.objects.count(), 1)

    def test_rating_hidden_file_is_rejected(self):
        self.client.force_authenticate(self.bob)
        response = self.client.post('/api/ratings/', {
            'content_type': ContentType.objects.get_for_model(StoredFile).id,
            'object_id': self.restricted_file.id,
            'value': 4,
        })
        self.assertEqual(response.status_code, 400)


class SharedLinkApiTests(PortalTestCase):
    def setUp(self):
        super().setUp()
        grant(self.alice, 'share_files')

    def create_link(self, **overrides):
        payload = {'expires_in_hours': 24, 'password': ''}
        payload.update(overrides)
        self.client.force_authenticate(self.alice)
        return self.client.post(
            f'/api/files/{self.public_file.id}/share/', payload, format='json',
        )

    def test_creation_requires_authentication(self):
        response = self.client.post(
            f'/api/files/{self.public_file.id}/share/', {},
        )
        self.assertEqual(response.status_code, 401)

    def test_requires_share_files_capability(self):
        self.client.force_authenticate(self.bob)
        self.assertEqual(self.client.get('/api/shared-links/').status_code, 403)
        self.assertEqual(self.client.post(
            f'/api/files/{self.public_file.id}/share/', {},
        ).status_code, 403)

    def test_non_shareable_category_blocks_link_creation(self):
        Category.objects.filter(pk=self.public_cat.pk).update(is_shareable=False)
        self.assertEqual(self.create_link().status_code, 403)

    def test_disabling_sharing_kills_existing_link(self):
        token = self.create_link().data['token']
        Category.objects.filter(pk=self.public_cat.pk).update(is_shareable=False)
        self.assertEqual(self.client.get(f'/api/shared/{token}/').status_code, 404)

    def test_creation_returns_token_and_expiry(self):
        response = self.create_link(password='council')
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data['has_password'])
        self.assertTrue(response.data['is_active'])
        self.assertIsNotNone(response.data['expires_at'])
        self.assertEqual(len(response.data['token']), 43)

    def test_blank_expiry_means_never(self):
        response = self.create_link(expires_in_hours=None)
        self.assertEqual(response.status_code, 201)
        self.assertIsNone(response.data['expires_at'])

    def test_invalid_expiry_is_rejected(self):
        self.assertEqual(self.create_link(expires_in_hours='abc').status_code, 400)
        self.assertEqual(self.create_link(expires_in_hours=-5).status_code, 400)

    def test_public_detail_is_accessible_without_auth(self):
        token = self.create_link().data['token']
        response = self.client.get(f'/api/shared/{token}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['file']['id'], self.public_file.id)

    def test_password_gate(self):
        token = self.create_link(password='council').data['token']
        self.assertEqual(self.client.get(f'/api/shared/{token}/').status_code, 401)
        self.assertEqual(self.client.get(
            f'/api/shared/{token}/?password=wrong').status_code, 401)
        self.assertEqual(self.client.get(
            f'/api/shared/{token}/?password=council').status_code, 200)
        self.assertEqual(self.client.get(
            f'/api/shared/{token}/', HTTP_X_SHARE_PASSWORD='council',
        ).status_code, 200)

    def test_expired_link_is_gone(self):
        token = self.create_link().data['token']
        SharedLink.objects.filter(token=token).update(
            expires_at=timezone.now() - timedelta(minutes=1),
        )
        self.assertEqual(self.client.get(f'/api/shared/{token}/').status_code, 404)

    def test_revoked_link_is_gone(self):
        token = self.create_link().data['token']
        SharedLink.objects.filter(token=token).update(is_revoked=True)
        self.assertEqual(self.client.get(f'/api/shared/{token}/').status_code, 404)

    def test_public_download_logs_and_increments(self):
        token = self.create_link().data['token']
        response = self.client.get(f'/api/shared/{token}/download/')
        self.assertEqual(response.status_code, 200)
        self.public_file.refresh_from_db()
        self.assertEqual(self.public_file.download_count, 1)
        self.assertTrue(DownloadLog.objects.filter(
            file=self.public_file, user=None).exists())

    def test_external_shared_download_returns_url(self):
        external = self.make_file(self.public_cat, 'shared-external', external=True)
        self.client.force_authenticate(self.alice)
        token = self.client.post(
            f'/api/files/{external.id}/share/', {'expires_in_hours': 24},
        ).data['token']
        response = self.client.get(f'/api/shared/{token}/download/')
        self.assertEqual(response.data['url'], 'https://example.com/file.pdf')

    def test_list_is_scoped_to_owner(self):
        self.create_link()
        grant(self.bob, 'share_files')
        self.client.force_authenticate(self.bob)
        self.assertEqual(results(self.client.get('/api/shared-links/')), [])
        self.client.force_authenticate(self.admin)
        self.assertEqual(len(results(self.client.get('/api/shared-links/'))), 1)

    def test_delete_revokes_instead_of_deleting(self):
        token = self.create_link().data['token']
        response = self.client.delete(f'/api/shared-links/{token}/')
        self.assertEqual(response.status_code, 204)
        link = SharedLink.objects.get(token=token)
        self.assertTrue(link.is_revoked)

