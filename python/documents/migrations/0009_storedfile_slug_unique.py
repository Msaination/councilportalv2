"""Make file slugs unique, de-duplicating any existing collisions first."""

from django.db import migrations, models


SLUG_MAX = 50


def dedupe_file_slugs(apps, schema_editor):
    """Suffix duplicate slugs (oldest keeps the plain name) before UNIQUE."""
    StoredFile = apps.get_model('documents', 'StoredFile')
    for file_obj in StoredFile.objects.order_by('id'):
        base = (file_obj.slug or 'file')[:SLUG_MAX]
        candidate = base
        suffix = 1
        while StoredFile.objects.filter(slug=candidate).exclude(
                pk=file_obj.pk).exists():
            suffix += 1
            tail = f'-{suffix}'
            candidate = f'{base[:SLUG_MAX - len(tail)]}{tail}'
        if candidate != file_obj.slug:
            file_obj.slug = candidate
            file_obj.save(update_fields=['slug'])


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0008_alter_storedfile_category'),
    ]

    operations = [
        migrations.RunPython(dedupe_file_slugs, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='storedfile',
            name='slug',
            field=models.SlugField(unique=True),
        ),
    ]
