"""Tests for the complaints gateway (ward → Supabase, server-side only)."""

from unittest import mock

from django.contrib.auth.models import Permission, User
from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.models import UserProfile


def make_user(username, ward=None):
    user = User.objects.create_user(username=username, password='pass12345')
    profile = user.profile
    profile.must_change_password = False
    if ward is not None:
        profile.ward = ward
    profile.save(update_fields=['must_change_password'] + (
        ['ward'] if ward is not None else []
    ))
    return user


@override_settings(
    SUPABASE_URL='https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY='service-role-test-key',
)
class SupabaseClientTests(APITestCase):
    """The client must speak the CMS's actual data format (§6.7)."""

    @mock.patch('complaints.client.requests.get')
    def test_ward_filter_uses_cms_prefix_format(self, get):
        response = mock.Mock()
        response.status_code = 200
        response.raise_for_status.return_value = None
        response.json.return_value = [{'id': 'x', 'ward': 'Ward 12'}]
        get.return_value = response

        from .client import fetch_complaints_for_ward
        rows = fetch_complaints_for_ward(12)

        self.assertEqual(len(rows), 1)
        params = get.call_args.kwargs['params']
        headers = get.call_args.kwargs['headers']
        # CMS stores wards as "Ward 12" — plain "12" would match nothing.
        self.assertEqual(params['ward'], 'eq.Ward 12')
        self.assertIn('Authorization', headers)

    @override_settings(SUPABASE_SERVICE_ROLE_KEY='sb_secret_test-key')
    @mock.patch('complaints.client.requests.get')
    def test_new_secret_key_is_not_sent_as_bearer_token(self, get):
        response = mock.Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = []
        get.return_value = response

        from .client import fetch_complaints_for_ward
        fetch_complaints_for_ward(12)

        headers = get.call_args.kwargs['headers']
        self.assertEqual(headers['apikey'], 'sb_secret_test-key')
        self.assertNotIn('Authorization', headers)

    @override_settings(SUPABASE_SERVICE_ROLE_KEY='')
    def test_unconfigured_returns_none(self):
        from .client import fetch_complaints_for_ward
        self.assertIsNone(fetch_complaints_for_ward(12))


@override_settings(
    SUPABASE_URL='https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY='service-role-test-key',
)
class ComplaintsGatewayTests(APITestCase):
    def test_requires_authentication(self):
        response = self.client.get('/api/complaints/')
        self.assertEqual(response.status_code, 401)

    @override_settings(SUPABASE_SERVICE_ROLE_KEY='')
    def test_unconfigured_gateway_is_503(self):
        user = make_user('councillor', ward=12)
        self.client.force_authenticate(user)
        response = self.client.get('/api/complaints/')
        self.assertEqual(response.status_code, 503)

    def test_user_without_ward_gets_empty_result_with_hint(self):
        user = make_user('norole')
        self.client.force_authenticate(user)
        response = self.client.get('/api/complaints/')

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data['ward'])
        self.assertEqual(response.data['count'], 0)
        self.assertIn('ward', response.data['detail'])

    @mock.patch('complaints.views.fetch_complaints_for_ward')
    def test_ward_councillor_receives_own_complaints(self, fetch):
        fetch.return_value = [
            {'id': 1, 'ward': '12', 'status': 'Received'},
            {'id': 2, 'ward': '12', 'status': 'In Progress'},
        ]
        user = make_user('councillor', ward=12)
        self.client.force_authenticate(user)
        response = self.client.get('/api/complaints/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['ward'], 12)
        self.assertEqual(response.data['count'], 2)
        # Server-side filtering: the gateway only ever asks for own ward.
        fetch.assert_called_once_with(12)

    @mock.patch('complaints.views.fetch_complaints_for_ward')
    def test_refreshes_stale_cached_profile_before_query(self, fetch):
        user = User.objects.create_user(username='councillor', password='pass12345')
        profile = user.profile
        profile.must_change_password = False
        profile.ward = 5
        profile.save(update_fields=['must_change_password', 'ward'])

        stale_profile = UserProfile(user=user, ward=99)
        fresh_profile = UserProfile(user=user, ward=5)
        self.client.force_authenticate(user)

        with mock.patch(
            'complaints.views.UserProfile.objects.get_or_create',
            return_value=(stale_profile, False),
        ), mock.patch(
            'complaints.views.UserProfile.objects.get',
            return_value=fresh_profile,
        ) as get:
            response = self.client.get('/api/complaints/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['ward'], 5)
        get.assert_called_once_with(user=user)
        fetch.assert_called_once_with(5)

    @mock.patch('complaints.views.fetch_complaints_for_ward')
    def test_cms_outage_is_502_not_a_crash(self, fetch):
        fetch.return_value = None
        user = make_user('councillor', ward=7)
        self.client.force_authenticate(user)
        response = self.client.get('/api/complaints/')

        self.assertEqual(response.status_code, 502)

    def test_service_key_never_leaks_to_response(self):
        user = make_user('councillor', ward=12)
        self.client.force_authenticate(user)
        with mock.patch('complaints.views.fetch_complaints_for_ward',
                        return_value=[]):
            response = self.client.get('/api/complaints/')
        self.assertNotIn(b'service-role-test-key', response.content)
