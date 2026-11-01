"""Tests for the calendar meetings API."""

from datetime import timedelta

from django.contrib.auth.models import Group, User
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import Membership, Team

from .models import Meeting


def make_user(username, **kwargs):
    return User.objects.create_user(
        username=username, password='pass12345', **kwargs,
    )


def results(response):
    data = response.data
    return data['results'] if isinstance(data, dict) and 'results' in data else data


class MeetingApiTests(APITestCase):
    def setUp(self):
        self.alice = make_user('alice')
        self.bob = make_user('bob')
        self.admin = User.objects.create_superuser(
            'root', 'root@example.com', 'pass12345',
        )

        self.team_a = Team.objects.create(name='Team A', created_by=self.admin)
        self.team_b = Team.objects.create(name='Team B', created_by=self.admin)
        Membership.objects.create(team=self.team_a, user=self.alice)
        Membership.objects.create(team=self.team_b, user=self.bob)

        self.councillors = Group.objects.create(name='Councillors')
        self.alice.groups.add(self.councillors)

        now = timezone.now()
        self.global_meeting = Meeting.objects.create(
            title='All-staff briefing', starts_at=now + timedelta(days=1),
            created_by=self.admin,
        )
        self.team_meeting = Meeting.objects.create(
            title='Team A sync', starts_at=now + timedelta(days=2),
            team=self.team_a, created_by=self.admin,
        )
        self.attendee_meeting = Meeting.objects.create(
            title='Bob one-on-one', starts_at=now + timedelta(days=3),
            created_by=self.admin,
        )
        self.attendee_meeting.attendees.add(self.bob)
        self.group_meeting = Meeting.objects.create(
            title='Councillors caucus', starts_at=now + timedelta(days=4),
            created_by=self.admin,
        )
        self.group_meeting.groups.add(self.councillors)
        self.past_meeting = Meeting.objects.create(
            title='Past meeting', starts_at=now - timedelta(days=2),
            created_by=self.admin,
        )

    def titles(self, response):
        return [m['title'] for m in results(response)]

    def test_list_requires_authentication(self):
        self.assertEqual(self.client.get('/api/meetings/').status_code, 401)

    def test_visibility_filters_by_team_and_attendee(self):
        self.client.force_authenticate(self.alice)
        titles = self.titles(self.client.get('/api/meetings/'))
        self.assertIn('All-staff briefing', titles)
        self.assertIn('Team A sync', titles)
        self.assertIn('Councillors caucus', titles)
        self.assertNotIn('Bob one-on-one', titles)

        self.client.force_authenticate(self.bob)
        titles = self.titles(self.client.get('/api/meetings/'))
        self.assertIn('Bob one-on-one', titles)
        self.assertNotIn('Team A sync', titles)
        self.assertNotIn('Councillors caucus', titles)

    def test_scope_mine_excludes_global_meetings(self):
        self.client.force_authenticate(self.alice)
        titles = self.titles(self.client.get('/api/meetings/?scope=mine'))
        self.assertNotIn('All-staff briefing', titles)
        self.assertIn('Team A sync', titles)
        self.assertIn('Councillors caucus', titles)

    def test_scope_mine_includes_attendee_meetings(self):
        self.client.force_authenticate(self.bob)
        titles = self.titles(self.client.get('/api/meetings/?scope=mine'))
        self.assertEqual(titles, ['Bob one-on-one'])

    def test_upcoming_excludes_past_by_default(self):
        self.client.force_authenticate(self.alice)
        titles = self.titles(self.client.get('/api/meetings/'))
        self.assertNotIn('Past meeting', titles)

        titles = self.titles(self.client.get('/api/meetings/?include_past=1'))
        self.assertIn('Past meeting', titles)

    def test_meetings_are_ordered_by_start(self):
        self.client.force_authenticate(self.alice)
        starts = [m['starts_at'] for m in results(self.client.get('/api/meetings/'))]
        self.assertEqual(starts, sorted(starts))

    def test_is_mine_flag(self):
        self.client.force_authenticate(self.alice)
        by_title = {
            m['title']: m['is_mine']
            for m in results(self.client.get('/api/meetings/?scope=mine'))
        }
        self.assertTrue(by_title['Team A sync'])
        self.assertTrue(by_title['Councillors caucus'])

    def test_regular_user_cannot_create_meeting(self):
        self.client.force_authenticate(self.alice)
        response = self.client.post('/api/meetings/', {
            'title': 'Nope',
            'starts_at': (timezone.now() + timedelta(days=5)).isoformat(),
        }, format='json')
        self.assertEqual(response.status_code, 403)

    def test_staff_can_create_meeting(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post('/api/meetings/', {
            'title': 'Budget sitting',
            'location': 'Chamber',
            'starts_at': (timezone.now() + timedelta(days=5)).isoformat(),
            'ends_at': (timezone.now() + timedelta(days=5, hours=2)).isoformat(),
            'team': self.team_a.id,
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['team_name'], 'Team A')

    def test_end_must_be_after_start(self):
        self.client.force_authenticate(self.admin)
        now = timezone.now() + timedelta(days=5)
        response = self.client.post('/api/meetings/', {
            'title': 'Bad timing',
            'starts_at': now.isoformat(),
            'ends_at': (now - timedelta(hours=1)).isoformat(),
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_staff_can_delete_meeting(self):
        self.client.force_authenticate(self.admin)
        response = self.client.delete(
            f'/api/meetings/{self.global_meeting.id}/')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(
            Meeting.objects.filter(pk=self.global_meeting.pk).exists())

    def test_staff_can_delete_past_meeting(self):
        self.client.force_authenticate(self.admin)
        response = self.client.delete(
            f'/api/meetings/{self.past_meeting.id}/')
        self.assertEqual(response.status_code, 204)

    def test_date_filter_returns_only_that_day(self):
        self.client.force_authenticate(self.alice)
        day = self.team_meeting.starts_at.date().isoformat()
        response = self.client.get(
            f'/api/meetings/?include_past=1&date={day}')
        titles = self.titles(response)
        self.assertEqual(titles, ['Team A sync'])

    def test_invalid_date_filter_is_rejected(self):
        self.client.force_authenticate(self.alice)
        self.assertEqual(
            self.client.get('/api/meetings/?date=not-a-date').status_code, 400)

    def test_related_collection_and_file_are_serialized(self):
        from documents.models import Category, StoredFile

        category = Category.objects.create(title='Agenda', slug='agenda')
        file_obj = StoredFile.objects.create(
            category=category, title='Agenda PDF', slug='agenda-pdf',
            storage=StoredFile.StorageKind.EXTERNAL,
            external_url='https://example.com/agenda.pdf',
        )
        meeting = Meeting.objects.create(
            title='Linked meeting',
            starts_at=timezone.now() + timedelta(days=6),
            category=category, file=file_obj, created_by=self.admin,
        )
        self.client.force_authenticate(self.alice)
        response = self.client.get(f'/api/meetings/{meeting.id}/')
        self.assertEqual(response.data['category_slug'], 'agenda')
        self.assertEqual(response.data['category_title'], 'Agenda')
        self.assertEqual(response.data['file_title'], 'Agenda PDF')

    def test_regular_user_cannot_delete_meeting(self):
        self.client.force_authenticate(self.alice)
        response = self.client.delete(
            f'/api/meetings/{self.global_meeting.id}/')
        self.assertEqual(response.status_code, 403)
