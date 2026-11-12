"""Tests for teams, memberships, and team-scoped asset isolation."""

import io
import shutil
import tempfile
from unittest import mock

import requests as requests_lib
from django.contrib.auth.models import Permission, User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image
from rest_framework.test import APITestCase

from documents.models import Category, StoredFile

from .authentik import provision_user
from .models import Membership, Team, UserProfile, get_active_team
from .oidc import CouncilPortalOIDCBackend

TEST_MEDIA_ROOT = tempfile.mkdtemp()


def onboard(user):
    """Clear the first-login password flag on both the DB row and the user's
    cached profile instance. The creation signal caches the profile on the
    user, so a queryset.update() would leave the in-memory object stale and
    PasswordChangeRequired would keep rejecting API calls."""
    profile = user.profile
    profile.must_change_password = False
    profile.save(update_fields=['must_change_password'])
    return user


def make_user(username, **kwargs):
    """Create a user as if they had already onboarded (no forced password
    change) — tests exercise team/ACL logic, not the first-login flow."""
    user = User.objects.create_user(
        username=username, password='pass12345', **kwargs,
    )
    return onboard(user)


def results(response):
    data = response.data
    return data['results'] if isinstance(data, dict) and 'results' in data else data


def grant(user, codename):
    user.user_permissions.add(Permission.objects.get(codename=codename))


# AUTHENTIK_API_URL='' disables provisioning in tests — they must never make
# real HTTP calls to the identity provider (the token comes from authentik/.env).
@override_settings(MEDIA_ROOT=TEST_MEDIA_ROOT, AUTHENTIK_API_URL='')
class TeamApiTestCase(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEST_MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        self.owner = make_user('owner')
        self.member = make_user('member')
        self.outsider = make_user('outsider')
        self.unprivileged = make_user('unprivileged')
        self.admin = onboard(User.objects.create_superuser(
            'root', 'root@example.com', 'pass12345',
        ))
        for user in (self.owner, self.member, self.outsider, self.admin):
            grant(user, 'view_teams')

    def create_team(self, name='Alpha', user=None):
        self.client.force_authenticate(user or self.owner)
        return self.client.post('/api/teams/', {'name': name}, format='json')


class TeamCrudTests(TeamApiTestCase):
    def test_create_makes_creator_owner_and_active_team(self):
        response = self.create_team()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['slug'], 'alpha')
        self.assertEqual(response.data['role'], 'owner')
        self.assertEqual(response.data['member_count'], 1)

        team = Team.objects.get(slug='alpha')
        membership = Membership.objects.get(team=team, user=self.owner)
        self.assertEqual(membership.role, Membership.Role.OWNER)
        self.assertEqual(self.owner.profile.active_team, team)

    def test_duplicate_names_get_unique_slugs(self):
        self.create_team('Alpha')
        response = self.create_team('Alpha')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['slug'], 'alpha-2')

    def test_list_is_scoped_to_memberships(self):
        self.create_team()
        self.client.force_authenticate(self.outsider)
        self.assertEqual(results(self.client.get('/api/teams/')), [])

        self.client.force_authenticate(self.admin)
        self.assertEqual(len(results(self.client.get('/api/teams/'))), 1)

    def test_detail_404_for_non_member(self):
        self.create_team()
        self.client.force_authenticate(self.outsider)
        self.assertEqual(
            self.client.get('/api/teams/alpha/').status_code, 404)

    def test_switch_requires_membership(self):
        self.create_team()
        Membership.objects.create(
            team=Team.objects.get(slug='alpha'), user=self.member,
        )
        self.client.force_authenticate(self.member)
        self.assertEqual(
            self.client.post('/api/teams/alpha/switch/').status_code, 200)
        self.member.profile.refresh_from_db()
        self.assertEqual(self.member.profile.active_team.slug, 'alpha')

        self.client.force_authenticate(self.outsider)
        self.assertEqual(
            self.client.post('/api/teams/alpha/switch/').status_code, 404)

    def test_get_active_team_falls_back_to_membership(self):
        team = Team.objects.create(name='Beta', created_by=self.owner)
        Membership.objects.create(team=team, user=self.member)
        self.assertEqual(get_active_team(self.member), team)

    def test_owner_can_delete_team_member_cannot(self):
        self.create_team()
        Membership.objects.create(
            team=Team.objects.get(slug='alpha'), user=self.member,
        )
        self.client.force_authenticate(self.member)
        self.assertEqual(
            self.client.delete('/api/teams/alpha/').status_code, 403)

        self.client.force_authenticate(self.owner)
        self.assertEqual(
            self.client.delete('/api/teams/alpha/').status_code, 204)
        self.assertFalse(Team.objects.exists())


class CapabilityTests(TeamApiTestCase):
    def test_team_endpoints_require_capability(self):
        self.client.force_authenticate(self.unprivileged)
        self.assertEqual(self.client.get('/api/teams/').status_code, 403)
        self.assertEqual(self.client.post(
            '/api/teams/', {'name': 'X'}, format='json').status_code, 403)

    def test_superadmin_only_access_management(self):
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get('/api/access/users/').status_code, 403)
        self.assertEqual(self.client.patch(
            f'/api/access/users/{self.owner.id}/',
            {'share_files': True}, format='json').status_code, 403)

    def test_superadmin_grants_view_teams(self):
        self.client.force_authenticate(self.admin)
        response = self.client.patch(
            f'/api/access/users/{self.unprivileged.id}/',
            {'view_teams': True}, format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['capabilities']['view_teams'])

        fresh = User.objects.get(pk=self.unprivileged.pk)
        self.client.force_authenticate(fresh)
        self.assertEqual(self.client.get('/api/teams/').status_code, 200)

    def test_superadmin_can_revoke_capability(self):
        self.client.force_authenticate(self.admin)
        response = self.client.patch(
            f'/api/access/users/{self.owner.id}/',
            {'view_teams': False}, format='json',
        )
        self.assertFalse(response.data['capabilities']['view_teams'])

        fresh = User.objects.get(pk=self.owner.pk)
        self.client.force_authenticate(fresh)
        self.assertEqual(self.client.get('/api/teams/').status_code, 403)

    def test_me_reports_capabilities(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get('/api/auth/me/')
        self.assertTrue(response.data['capabilities']['view_teams'])
        self.assertFalse(response.data['capabilities']['share_files'])
        self.assertFalse(response.data['capabilities']['manage_access'])


class EmployeeNumberTests(TeamApiTestCase):
    def test_assigned_user_can_edit_employee_numbers_only(self):
        grant(self.owner, 'edit_employee_numbers')
        self.client.force_authenticate(self.owner)

        response = self.client.patch(
            f'/api/access/users/{self.member.id}/',
            {'employee_number': 'S000123'}, format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['employee_number'], 'S000123')

        denied = self.client.patch(
            f'/api/access/users/{self.member.id}/',
            {'share_files': True}, format='json',
        )
        self.assertEqual(denied.status_code, 403)

    def test_employee_number_must_start_with_s_and_be_short(self):
        self.client.force_authenticate(self.admin)
        for invalid in ('1234567', 'S12345678', 'S-123'):
            with self.subTest(employee_number=invalid):
                response = self.client.patch(
                    f'/api/access/users/{self.member.id}/',
                    {'employee_number': invalid}, format='json',
                )
                self.assertEqual(response.status_code, 400)

    def test_duplicate_employee_number_is_rejected(self):
        self.owner.profile.employee_number = 'S000010'
        self.owner.profile.save(update_fields=['employee_number'])
        self.client.force_authenticate(self.admin)
        response = self.client.patch(
            f'/api/access/users/{self.member.id}/',
            {'employee_number': 'S000010'}, format='json',
        )
        self.assertEqual(response.status_code, 400)


class ForcedPasswordChangeTests(TeamApiTestCase):
    def test_any_new_user_is_forced_to_change_password(self):
        """Created through any path (Django admin, shell, signal) — not just
        the portal API — the first login must force a password change."""
        user = User.objects.create_user('freshguy', 'fresh@example.com',
                                        'Whatever1!')
        profile = UserProfile.objects.get(user=user)
        self.assertTrue(profile.must_change_password)

    def test_create_user_gets_default_password_and_forced_change(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post('/api/access/users/', {
            'username': 'newuser',
            'email': 'newuser@example.com',
            'employee_number': 'S000999',
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['employee_number'], 'S000999')
        self.assertTrue(response.data['must_change_password'])

        new_user = User.objects.get(username='newuser')
        self.assertTrue(new_user.check_password('Password#v2cp2026'))

        self.client.force_authenticate(new_user)
        self.assertEqual(self.client.get('/api/files/').status_code, 403)
        self.assertEqual(self.client.get('/api/profile/').status_code, 200)

        change = self.client.post('/api/profile/password/', {
            'current_password': 'Password#v2cp2026',
            'new_password': 'Zebra#Cloud91',
        }, format='json')
        self.assertEqual(change.status_code, 200)

        fresh = User.objects.get(pk=new_user.pk)
        self.client.force_authenticate(fresh)
        self.assertEqual(self.client.get('/api/files/').status_code, 200)


class OidcUserMappingTests(APITestCase):
    def setUp(self):
        self.owner = make_user('owner')
        grant(self.owner, 'edit_employee_numbers')

    def test_backend_maps_authentik_claims_to_local_user(self):
        backend = CouncilPortalOIDCBackend()
        user = backend.create_user({
            'email': 'alice@example.com',
            'preferred_username': 'alice',
            'given_name': 'Alice',
            'family_name': 'Jones',
            'employee_number': 'S000111',
        })

        self.assertEqual(user.username, 'alice')
        self.assertEqual(user.email, 'alice@example.com')
        self.assertEqual(user.first_name, 'Alice')
        self.assertEqual(user.last_name, 'Jones')
        self.assertEqual(user.profile.employee_number, 'S000111')

    def test_backend_reuses_existing_user_by_email(self):
        existing = make_user('alice@example.com', email='alice@example.com')
        backend = CouncilPortalOIDCBackend()
        match = backend.filter_users_by_claims({
            'email': 'alice@example.com',
            'preferred_username': 'alice',
        })

        self.assertEqual(list(match), [existing])

    def test_jit_user_creation_is_disabled(self):
        """§6.5: Authentik must never mint portal accounts (provisioning is
        portal → Authentik only), so an unknown claim must not match."""
        from django.test import override_settings
        with override_settings(OIDC_CREATE_USER=False):
            backend = CouncilPortalOIDCBackend()
            self.assertEqual(
                list(backend.filter_users_by_claims({'email': 'ghost@x.io'})),
                [],
            )

    def test_assigned_editor_cannot_create_users(self):
        grant(self.owner, 'edit_employee_numbers')
        self.client.force_authenticate(self.owner)
        response = self.client.post('/api/access/users/', {
            'username': 'newuser',
            'email': 'newuser@example.com',
            'employee_number': 'S000998',
        }, format='json')
        self.assertEqual(response.status_code, 403)


@override_settings(
    AUTHENTIK_API_URL='http://authentik.test',
    AUTHENTIK_ADMIN_TOKEN='test-token',
)
class AuthentikProvisioningTests(APITestCase):
    def setUp(self):
        # Fixture creation must not attempt HTTP against the fake broker URL.
        with mock.patch('accounts.signals.provision_user'):
            self.admin = onboard(User.objects.create_superuser(
                'root', 'root@example.com', 'pass12345',
            ))

    @staticmethod
    def _reset_signal_noise(*mocked):
        """make_user() fires the post_save mirror — ignore its HTTP calls so
        each test only counts the explicit provision_user() under test."""
        for m in mocked:
            m.reset_mock()

    def _response(self, payload, status=200):
        response = mock.Mock(spec=requests_lib.Response)
        response.status_code = status
        response.raise_for_status.return_value = None
        response.json.return_value = payload
        return response

    @mock.patch('accounts.authentik.requests.get')
    @mock.patch('accounts.authentik.requests.post')
    @mock.patch('accounts.authentik.requests.patch')
    def test_new_user_is_created_with_password(self, patch, post, get):
        user = make_user('carol', email='carol@example.com')
        get.return_value = self._response({'results': []})
        post.return_value = self._response({'pk': 42})
        self._reset_signal_noise(get, post, patch)

        pk = provision_user(user, temp_password='Temp#Pass123')

        self.assertEqual(pk, 42)
        self.assertEqual(len(post.call_args_list), 2)
        create_call, password_call = post.call_args_list
        payload = create_call.kwargs['json']
        self.assertEqual(payload['username'], 'carol')
        self.assertEqual(payload['email'], 'carol@example.com')
        self.assertIn('/set_password/', password_call.args[0])
        self.assertEqual(password_call.kwargs['json']['password'],
                         'Temp#Pass123')

    @mock.patch('accounts.authentik.requests.get')
    @mock.patch('accounts.authentik.requests.post')
    @mock.patch('accounts.authentik.requests.patch')
    def test_existing_user_is_patched_without_password(
            self, patch, post, get):
        user = make_user('carol', email='carol@example.com')
        get.return_value = self._response({'results': [{'pk': 7}]})
        patch.return_value = self._response({'pk': 7})
        self._reset_signal_noise(get, post, patch)

        pk = provision_user(user)

        self.assertEqual(pk, 7)
        patch.assert_called_once()
        post.assert_not_called()

    @mock.patch('accounts.authentik.requests.get')
    def test_broker_failure_never_raises(self, get):
        get.side_effect = requests_lib.ConnectionError('broker down')
        user = make_user('dave')  # signal's attempt fails harmlessly too

        self.assertIsNone(provision_user(user))

    @override_settings(AUTHENTIK_API_URL='', AUTHENTIK_ADMIN_TOKEN='')
    def test_unconfigured_broker_skips_without_error(self):
        self.assertIsNone(provision_user(make_user('erin')))

    @mock.patch('accounts.authentik.requests.get')
    @mock.patch('accounts.authentik.requests.post')
    @mock.patch('accounts.authentik.requests.patch')
    def test_password_hash_is_mirrored_via_set_password_hash(
            self, patch, post, get):
        """An admin-set (or portal-changed) password must also work for SSO:
        the Django hash is copied verbatim to Authentik."""
        user = make_user('frank')
        get.return_value = self._response({'results': [{'pk': 9}]})
        post.return_value = self._response({}, status=204)
        self._reset_signal_noise(get, post, patch)

        pk = provision_user(user, password_hash=user.password)

        self.assertEqual(pk, 9)
        # Identity still mirrors (PATCH), and the hash rides along after it.
        patch.assert_called_once()
        self.assertEqual(patch.call_args.kwargs['json']['username'], 'frank')
        call = post.call_args
        self.assertIn('/set_password_hash/', call.args[0])
        self.assertEqual(call.kwargs['json']['password'], user.password)

    @mock.patch('accounts.signals.provision_user')
    def test_superadmin_user_creation_provisions(self, provision):
        from .views import DEFAULT_NEW_USER_PASSWORD
        provision.return_value = 1
        self.client.force_authenticate(self.admin)
        response = self.client.post('/api/access/users/', {
            'username': 'provisioned',
            'email': 'prov@example.com',
            'employee_number': 'S000777',
        }, format='json')

        self.assertEqual(response.status_code, 201)
        provision.assert_called_once()
        _, kwargs = provision.call_args
        created = User.objects.get(username='provisioned')
        # The default password's hash is what gets mirrored to Authentik,
        # so Council SSO accepts it too.
        self.assertEqual(kwargs['password_hash'], created.password)
        self.assertTrue(created.check_password(DEFAULT_NEW_USER_PASSWORD))

    @mock.patch('accounts.signals.provision_user')
    def test_password_change_mirrors_via_signal(self, provision):
        """The portal change-password endpoint must reach Authentik without
        an explicit call — the post_save signal owns all credential paths."""
        provision.return_value = 1
        user = make_user('gina', email='gina@example.com')
        provision.reset_mock()

        self.client.force_authenticate(user)
        response = self.client.post('/api/profile/password/', {
            'current_password': 'pass12345',
            'new_password': 'Zebra#Cloud91',
        }, format='json')

        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.check_password('Zebra#Cloud91'))
        provision.assert_called_once()
        self.assertEqual(provision.call_args.kwargs['password_hash'],
                         user.password)


class TeamMemberTests(TeamApiTestCase):
    def setUp(self):
        super().setUp()
        self.create_team()
        self.team = Team.objects.get(slug='alpha')

    def test_owner_adds_member_once(self):
        response = self.client.post(
            '/api/teams/alpha/members/', {'username': 'member'}, format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['role'], Membership.Role.MEMBER)

        again = self.client.post(
            '/api/teams/alpha/members/', {'username': 'member'}, format='json',
        )
        self.assertEqual(again.status_code, 200)
        self.assertEqual(Membership.objects.filter(team=self.team).count(), 2)

    def test_plain_member_cannot_add_members(self):
        Membership.objects.create(team=self.team, user=self.member)
        self.client.force_authenticate(self.member)
        response = self.client.post(
            '/api/teams/alpha/members/', {'username': 'outsider'}, format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_member_list_is_visible_to_members(self):
        Membership.objects.create(team=self.team, user=self.member)
        self.client.force_authenticate(self.member)
        response = self.client.get('/api/teams/alpha/members/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)

    def test_unknown_username_is_404(self):
        response = self.client.post(
            '/api/teams/alpha/members/', {'username': 'ghost'}, format='json',
        )
        self.assertEqual(response.status_code, 404)

    def test_remove_member_and_self_removal_guard(self):
        Membership.objects.create(team=self.team, user=self.member)
        response = self.client.delete(
            f'/api/teams/alpha/members/{self.member.id}/')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Membership.objects.filter(
            team=self.team, user=self.member).exists())

        self_removal = self.client.delete(
            f'/api/teams/alpha/members/{self.owner.id}/')
        self.assertEqual(self_removal.status_code, 400)


class TeamIsolationTests(TeamApiTestCase):
    def setUp(self):
        super().setUp()
        self.team_a = Team.objects.create(name='Team A', created_by=self.owner)
        self.team_b = Team.objects.create(name='Team B', created_by=self.outsider)
        Membership.objects.create(
            team=self.team_a, user=self.owner,
            role=Membership.Role.OWNER,
        )
        Membership.objects.create(
            team=self.team_b, user=self.outsider,
            role=Membership.Role.OWNER,
        )
        self.cat_a = Category.objects.create(
            title='Cat A', slug='cat-a', team=self.team_a,
        )
        self.file_a = StoredFile.objects.create(
            category=self.cat_a, title='File A', slug='file-a',
            team=self.team_a,
            local_file=SimpleUploadedFile('a.txt', b'team a'),
        )
        self.legacy_file = StoredFile.objects.create(
            category=Category.objects.create(title='Legacy', slug='legacy'),
            title='Legacy File', slug='legacy-file',
            local_file=SimpleUploadedFile('legacy.txt', b'legacy'),
        )

    def test_team_content_is_hidden_from_other_teams(self):
        self.assertTrue(self.file_a.can_view(self.owner))
        self.assertFalse(self.file_a.can_view(self.outsider))
        self.assertTrue(self.legacy_file.can_view(self.outsider))

    def test_file_api_404_across_teams(self):
        self.client.force_authenticate(self.outsider)
        response = self.client.get(f'/api/files/{self.file_a.id}/')
        self.assertEqual(response.status_code, 404)
        titles = {f['title'] for f in results(self.client.get('/api/files/'))}
        self.assertNotIn('File A', titles)

    def test_category_api_hides_other_team_categories(self):
        self.client.force_authenticate(self.outsider)
        slugs = {c['slug'] for c in results(self.client.get('/api/categories/'))}
        self.assertNotIn('cat-a', slugs)

    def test_upload_assigns_active_team(self):
        staff_owner = make_user('staffowner', is_staff=True)
        grant(staff_owner, 'view_teams')
        Membership.objects.create(
            team=self.team_a, user=staff_owner,
            role=Membership.Role.MEMBER,
        )
        self.client.force_authenticate(staff_owner)
        self.client.post(f'/api/teams/{self.team_a.slug}/switch/')

        response = self.client.post('/api/files/upload/', {
            'file': SimpleUploadedFile('notes.txt', b'notes'),
            'title': 'Team Notes',
            'slug': 'team-notes',
            'category': self.cat_a.slug,
        }, format='multipart')
        self.assertEqual(response.status_code, 201)
        uploaded = StoredFile.objects.get(title='Team Notes')
        self.assertEqual(uploaded.team, self.team_a)


@override_settings(MEDIA_ROOT=TEST_MEDIA_ROOT, AUTHENTIK_API_URL='')
class ProfileApiTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEST_MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        self.user = make_user('profileuser')
        self.user.email = 'user@example.com'
        self.user.save()
        self.client.force_authenticate(self.user)

    def test_get_creates_and_returns_profile(self):
        response = self.client.get('/api/profile/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['username'], 'profileuser')
        self.assertEqual(response.data['email'], 'user@example.com')
        self.assertTrue(UserProfile.objects.filter(user=self.user).exists())

    def test_update_identity_and_profile_fields(self):
        response = self.client.patch('/api/profile/', {
            'username': 'renameduser',
            'email': 'renamed@example.com',
            'cell_number': '0821234567',
            'bio': 'Municipal official',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.user.profile.refresh_from_db()
        self.assertEqual(self.user.username, 'renameduser')
        self.assertEqual(self.user.email, 'renamed@example.com')
        self.assertEqual(self.user.profile.cell_number, '0821234567')
        self.assertEqual(self.user.profile.bio, 'Municipal official')

    def test_cell_number_must_be_sa_format(self):
        for invalid in ('12345', '082123456', '08212345678', '1821234567', 'abc'):
            with self.subTest(cell=invalid):
                response = self.client.patch(
                    '/api/profile/', {'cell_number': invalid}, format='json',
                )
                self.assertEqual(response.status_code, 400)

    def test_username_must_be_unique(self):
        make_user('taken')
        response = self.client.patch(
            '/api/profile/', {'username': 'taken'}, format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_avatar_upload(self):
        buffer = io.BytesIO()
        Image.new('RGB', (20, 20), 'blue').save(buffer, 'PNG')
        avatar = SimpleUploadedFile(
            'avatar.png', buffer.getvalue(), content_type='image/png',
        )
        response = self.client.patch(
            '/api/profile/', {'avatar': avatar}, format='multipart',
        )
        self.assertEqual(response.status_code, 200)
        self.user.profile.refresh_from_db()
        self.assertTrue(self.user.profile.avatar.name.startswith('avatars/'))

    def test_password_change(self):
        wrong = self.client.post('/api/profile/password/', {
            'current_password': 'wrong',
            'new_password': 'NewPass!234',
        }, format='json')
        self.assertEqual(wrong.status_code, 400)

        weak = self.client.post('/api/profile/password/', {
            'current_password': 'pass12345',
            'new_password': '12345678',
        }, format='json')
        self.assertEqual(weak.status_code, 400)

        ok = self.client.post('/api/profile/password/', {
            'current_password': 'pass12345',
            'new_password': 'NewPass!234',
        }, format='json')
        self.assertEqual(ok.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('NewPass!234'))

    def test_profile_requires_authentication(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api/profile/').status_code, 401)
        self.assertEqual(self.client.post(
            '/api/profile/password/', {}, format='json').status_code, 401)

