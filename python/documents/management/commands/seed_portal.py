"""
Management command: seed_portal

Creates the default council roles (Councillors, TopManagement, Admin — no
Public group), sample categories/files, and a development superuser so the
portal is immediately usable after a fresh migration.
"""

from io import BytesIO

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

from ...models import (
    Category, StoredFile, UploadLog,
)

User = get_user_model()


class Command(BaseCommand):
    help = "Seed the Emalahleni Council Portal with roles, sample data, and a dev superuser."

    def add_arguments(self, parser):
        parser.add_argument(
            '--superuser', action='store_true',
            help='Create a superuser (admin / admin123) if none exists.',
        )
        parser.add_argument(
            '--clear', action='store_true',
            help='Delete all existing portal data before seeding.',
        )

    def handle(self, *args, **options):
        if options['clear']:
            self._clear()
            self.stdout.write(self.style.WARNING('Cleared existing portal data.'))

        self._seed_roles()
        self._seed_categories()
        self._seed_files()

        if options['superuser']:
            self._seed_superuser()

        self.stdout.write(self.style.SUCCESS('Portal seeded successfully.'))

    # ─── Seeders ─────────────────────────────────────────────

    def _clear(self):
        from django.contrib.auth.models import Group
        from ...models import Comment, Rating, DownloadLog
        Comment.objects.all().delete()
        Rating.objects.all().delete()
        DownloadLog.objects.all().delete()
        StoredFile.objects.all().delete()
        Category.objects.all().delete()
        Group.objects.filter(
            name__in=['Councillors', 'TopManagement', 'Admin'],
        ).delete()

    def _seed_roles(self):
        from django.contrib.auth.models import Group
        roles = [
            ('Councillors', 'Councillors — can view and comment on council documents'),
            ('TopManagement', 'Top Management — full read access, can upload'),
            ('Admin', 'Administrators — full access including file upload/replace'),
        ]
        for name, desc in roles:
            g, created = Group.objects.get_or_create(name=name)
            if created:
                self.stdout.write(self.style.SUCCESS(f'Created role: {name}'))

    def _seed_categories(self):
        categories = [
            {
                'title': 'Council Meetings',
                'slug': 'council-meetings',
                'description': 'Meeting agendas, minutes, and resolutions.',
                'ordering': 0,
            },
            {
                'title': 'Policies & Bylaws',
                'slug': 'policies',
                'description': 'Official policies, bylaws, and regulatory documents.',
                'ordering': 1,
            },
            {
                'title': 'Financial Reports',
                'slug': 'financial-reports',
                'description': 'Budget documents, financial statements, and audit reports.',
                'ordering': 2,
            },
            {
                'title': 'Infrastructure',
                'slug': 'infrastructure',
                'description': 'Public works, roads, utilities, and capital projects.',
                'ordering': 3,
            },
        ]
        for cat_data in categories:
            cat, created = Category.objects.get_or_create(
                slug=cat_data['slug'],
                defaults={
                    'title': cat_data['title'],
                    'description': cat_data['description'],
                    'ordering': cat_data['ordering'],
                    'is_published': True,
                },
            )
            if created:
                self.stdout.write(self.style.SUCCESS(f'Created category: {cat.title}'))

        # Subcategory: Council Meetings > Minutes (ACL-restricted)
        parent = Category.objects.get(slug='council-meetings')
        sub, created = Category.objects.get_or_create(
            slug='minutes',
            defaults={
                'title': 'Meeting Minutes',
                'description': 'Minutes from past council sessions.',
                'parent': parent,
                'ordering': 0,
                'is_published': True,
            },
        )
        if created:
            from django.contrib.auth.models import Group
            sub.access_groups.set(Group.objects.filter(name__in=[
                'Councillors', 'TopManagement', 'Admin',
            ]))
            sub.save()
            self.stdout.write(
                self.style.SUCCESS('Created subcategory: Meeting Minutes (ACL-restricted)')
            )

    def _seed_files(self):
        from django.core.files.base import ContentFile

        cat = Category.objects.get(slug='council-meetings')
        if not StoredFile.objects.filter(slug='sample-agenda').exists():
            sample_content = (
                "Emalahleni Council Portal — Sample Document\n\n"
                "This is a sample document created by the seed_portal command.\n"
                "Replace it with real council documents via the admin interface."
            )
            f = StoredFile(
                category=cat,
                title='Sample Council Agenda',
                slug='sample-agenda',
                description='Placeholder document for testing the file management system.',
                storage=StoredFile.StorageKind.LOCAL,
                mime_type='text/plain',
                filesize=len(sample_content),
                is_published=True,
            )
            f.local_file.save(
                'sample-agenda.txt',
                ContentFile(sample_content),
                save=True,
            )
            UploadLog.objects.create(
                file=f, user=None,
                action=UploadLog.Action.CREATED,
            )
            self.stdout.write(self.style.SUCCESS(f'Created file: {f.title}'))

        # External-link file
        policies_cat = Category.objects.get(slug='policies')
        if not StoredFile.objects.filter(slug='external-policy').exists():
            f = StoredFile(
                category=policies_cat,
                title='Municipal Code of Conduct',
                slug='external-policy',
                description='External link to the official municipal code of conduct.',
                storage=StoredFile.StorageKind.EXTERNAL,
                external_url='https://www.emalahleni.gov.za/code-of-conduct',
                filesize=0,
                mime_type='text/html',
                is_published=True,
            )
            f.save()
            UploadLog.objects.create(
                file=f, user=None,
                action=UploadLog.Action.CREATED,
            )
            self.stdout.write(self.style.SUCCESS(f'Created external file: {f.title}'))

    def _seed_superuser(self):
        if User.objects.filter(username='admin').exists():
            self.stdout.write('Superuser already exists.')
            return
        from django.contrib.auth.models import Group
        u = User.objects.create_superuser(
            username='admin',
            email='admin@emalahleni.gov.za',
            password='admin123',
            first_name='Admin',
            last_name='User',
        )
        u.groups.add(Group.objects.get(name='Admin'))
        self.stdout.write(
            self.style.SUCCESS('Created superuser: admin (password: admin123)')
        )
