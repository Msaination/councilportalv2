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
    """The client maps the live Supabase schema to the portal response."""

    @mock.patch('complaints.client.requests.get')
    def test_ward_filter_uses_live_ward_number_column(self, get):
        response = mock.Mock()
        response.status_code = 200
        response.raise_for_status.return_value = None
        response.json.return_value = [{
            'id': '00000000-0000-0000-0000-000000000001',
            'subject': 'Pothole',
            'ward': '12',
            'issue_type': 'Roads',
        }]
        get.return_value = response

        from .client import fetch_complaints_for_ward
        rows = fetch_complaints_for_ward(12)

        self.assertEqual(len(rows), 1)
        params = get.call_args.kwargs['params']
        headers = get.call_args.kwargs['headers']
        self.assertEqual(params['ward_number'], 'eq.12')
        self.assertIn('subject:title', params['select'])
        self.assertIn('ward:ward_number', params['select'])
        self.assertIn('issue_type', params['select'])
        self.assertEqual(params['order'], 'created_at.desc')
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
    def test_ward_is_reread_on_every_request(self, fetch):
        """A ward changed mid-session must take effect immediately.

        The user object is cached for the life of the request (and possibly
        longer by the auth layer), so the view re-reads the profile instead
        of trusting `request.user.profile`.
        """
        fetch.return_value = []
        user = make_user('councillor', ward=5)
        self.client.force_authenticate(user)

        self.client.get('/api/complaints/')
        fetch.assert_called_with(5)

        profile = UserProfile.objects.get(user=user)
        profile.ward = 9
        profile.save(update_fields=['ward'])

        self.client.get('/api/complaints/')
        fetch.assert_called_with(9)

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


class EscalationRuleTests(APITestCase):
    """The 72-hour rule is pure logic — verify it without any network."""

    def _complaint(self, hours_old, status='submitted', priority='normal'):
        from datetime import datetime, timedelta, timezone
        created = datetime.now(timezone.utc) - timedelta(hours=hours_old)
        return {'id': 1, 'status': status, 'priority': priority,
                'created_at': created.isoformat()}

    def test_young_complaint_cannot_be_escalated(self):
        from .client import can_escalate
        self.assertFalse(can_escalate(self._complaint(71.5)))

    def test_complaint_past_the_window_can_be_escalated(self):
        from .client import can_escalate
        self.assertTrue(can_escalate(self._complaint(72.5)))

    def test_exactly_at_the_window_is_allowed(self):
        from datetime import datetime, timedelta, timezone
        from .client import can_escalate
        created = datetime(2026, 11, 22, 9, 0, tzinfo=timezone.utc)
        now = created + timedelta(hours=72)
        complaint = {'status': 'submitted', 'priority': 'normal',
                     'created_at': created.isoformat()}
        self.assertTrue(can_escalate(complaint, now=now))

    def test_finished_complaints_cannot_be_escalated(self):
        from .client import can_escalate
        for status in ('resolved', 'closed'):
            with self.subTest(status=status):
                self.assertFalse(can_escalate(self._complaint(100, status)))

    def test_already_urgent_cannot_be_escalated_again(self):
        from .client import can_escalate
        self.assertFalse(
            can_escalate(self._complaint(100, priority='urgent')))

    def test_in_progress_complaint_can_still_be_escalated(self):
        from .client import can_escalate
        self.assertTrue(
            can_escalate(self._complaint(100, status='inProgress')))

    def test_zulu_timestamps_are_parsed(self):
        from .client import escalation_deadline
        deadline = escalation_deadline(
            {'created_at': '2026-11-22T09:00:00Z'})
        self.assertIsNotNone(deadline)
        self.assertEqual(deadline.isoformat(), '2026-11-25T09:00:00+00:00')


@override_settings(
    SUPABASE_URL='https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY='service-role-test-key',
)
class EscalationEndpointTests(APITestCase):
    def setUp(self):
        self.user = make_user('councillor', ward=12)
        self.client.force_authenticate(self.user)

    def test_requires_authentication(self):
        self.client.force_authenticate(None)
        self.assertEqual(
            self.client.post('/api/complaints/1/escalate/').status_code, 401)

    def test_user_without_ward_is_rejected(self):
        someone = make_user('noward')
        self.client.force_authenticate(someone)
        response = self.client.post('/api/complaints/1/escalate/')
        self.assertEqual(response.status_code, 400)

    @mock.patch('complaints.views.escalate_complaint')
    def test_successful_escalation_returns_the_complaint(self, escalate):
        escalate.return_value = ({'id': 1, 'priority': 'urgent'}, None)
        response = self.client.post(
            '/api/complaints/1/escalate/', {'reason': 'No action'}, format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['priority'], 'urgent')
        # URL kwargs arrive as strings; Supabase complaint ids are UUIDs.
        escalate.assert_called_once_with('1', 12, 'No action')

    @mock.patch('complaints.views.escalate_complaint')
    def test_too_early_is_400_with_the_server_message(self, escalate):
        escalate.return_value = (
            None, {'detail': 'A complaint can only be escalated after 72 hours.',
                   'status': 400})
        response = self.client.post('/api/complaints/1/escalate/')
        self.assertEqual(response.status_code, 400)
        self.assertIn('72 hours', response.data['detail'])

    @mock.patch('complaints.views.escalate_complaint')
    def test_other_wards_complaint_is_404(self, escalate):
        escalate.return_value = (
            None, {'detail': 'Complaint not found in your ward.', 'status': 404})
        response = self.client.post('/api/complaints/99/escalate/')
        self.assertEqual(response.status_code, 404)


@override_settings(
    SUPABASE_URL='https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY='service-role-test-key',
)
class ComplaintCreateEndpointTests(APITestCase):
    def setUp(self):
        self.user = make_user('councillor', ward=12)
        self.client.force_authenticate(self.user)

    def test_ward_is_stamped_from_the_profile_not_the_request(self):
        with mock.patch('complaints.views.create_complaint') as create:
            create.return_value = ({'id': 1, 'reference_number': 'CMP-1'}, None)
            response = self.client.post('/api/complaints/', {
                'title': 'Burst pipe',
                'description': 'Water everywhere',
                'category': 'Water',
                'location_address': '12 Kromdraai Road',
                'ward_number': '99',  # ignored
            }, format='json')

        self.assertEqual(response.status_code, 201)
        fields = create.call_args.args[0]
        self.assertEqual(fields['ward_number'], '12')
        self.assertEqual(fields['status'], 'submitted')
        # complaints_received_via_check allows website|app|phone|whatsapp
        self.assertEqual(fields['received_via'], 'website')
        self.assertEqual(fields['category'], 'Water')
        self.assertEqual(fields['location_address'], '12 Kromdraai Road')

    def test_reporter_is_recorded_in_a_text_column(self):
        """`user_id` and `logged_by` are uuids owned by Supabase auth, so the
        portal cannot write its own user id there (Postgres 22P02). The
        councillor is recorded in `caller_name` instead."""
        user = self.user
        user.first_name = 'Simon Fanie'
        user.last_name = 'Sithole'
        user.save()

        with mock.patch('complaints.views.create_complaint') as create:
            create.return_value = ({'id': 1}, None)
            self.client.post('/api/complaints/', {
                'title': 'Burst pipe',
                'description': 'Water',
                'category': 'Water',
                'location_address': '12 Kromdraai Road',
            }, format='json')

        fields = create.call_args.args[0]
        self.assertEqual(fields['caller_name'],
                         'Simon Fanie Sithole (councillor)')
        # uuid columns must never be populated with a Django integer id
        self.assertNotIn('user_id', fields)
        self.assertNotIn('logged_by', fields)

    def test_title_and_description_are_required(self):
        response = self.client.post('/api/complaints/', {
            'title': '   ',
            'description': 'x',
            'category': 'Water',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('title', response.data)

    def test_category_is_required(self):
        """The Supabase column is NOT NULL with no default."""
        response = self.client.post('/api/complaints/', {
            'title': 'Burst pipe',
            'description': 'Water',
            'location_address': '12 Kromdraai Road',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('category', response.data)

    def test_location_address_is_required(self):
        """Also NOT NULL in Supabase — omitting it is a 400, not a 502."""
        response = self.client.post('/api/complaints/', {
            'title': 'Burst pipe',
            'description': 'Water',
            'category': 'Water',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('location_address', response.data)

    def test_priority_only_accepts_live_values(self):
        response = self.client.post('/api/complaints/', {
            'title': 'Burst pipe',
            'description': 'Water',
            'category': 'Water',
            'location_address': '12 Kromdraai Road',
            'priority': 'High',  # the CMS uses normal|urgent
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('priority', response.data)

    def test_user_without_ward_cannot_create(self):
        someone = make_user('noward')
        self.client.force_authenticate(someone)
        response = self.client.post('/api/complaints/', {
            'title': 'Burst pipe', 'description': 'Water', 'category': 'Water',
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_unconfigured_gateway_is_reported(self):
        with mock.patch('complaints.views.create_complaint') as create:
            create.return_value = (
                None, {'detail': 'Complaints gateway is not configured.',
                       'status': 503})
            response = self.client.post('/api/complaints/', {
                'title': 'Burst pipe', 'description': 'Water',
                'category': 'Water',
                'location_address': '12 Kromdraai Road',
            }, format='json')
        self.assertEqual(response.status_code, 503)

