from django.contrib import admin

from .models import Membership, Team, UserProfile

# User admin stays stock: the post_save signal in accounts.signals mirrors
# every user save (including the admin's "set password" view) to Authentik.


@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    verbose_name = 'Committee'
    list_display = ('name', 'slug', 'created_by', 'is_active', 'created_at')
    list_filter = ('is_active', 'created_at')
    search_fields = ('name', 'slug')
    raw_id_fields = ('created_by',)
    prepopulated_fields = {'slug': ('name',)}


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    verbose_name = 'Committee membership'
    list_display = ('team', 'user', 'role', 'joined_at')
    list_filter = ('role', 'joined_at')
    search_fields = ('team__name', 'user__username')
    raw_id_fields = ('team', 'user')


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    verbose_name = 'User profile'
    list_display = ('user', 'employee_number', 'ward', 'representation',
                    'political_party', 'cell_number',
                    'must_change_password', 'active_team')
    list_filter = ('must_change_password', 'representation', 'ward',
                   'political_party')
    search_fields = ('user__username', 'user__email', 'user__first_name',
                     'user__last_name', 'cell_number', 'employee_number',
                     'political_party', 'ward_code')
    raw_id_fields = ('user', 'active_team')
    fieldsets = (
        ('Committee', {
            'fields': ('user', 'active_team'),
        }),
        ('Identity', {
            'fields': ('employee_number', 'ward', 'cell_number'),
        }),
        ('Councillor (gazette)', {
            'fields': ('representation', 'political_party', 'pr_seat',
                       'ward_code'),
            'description': 'Sourced from the MP312 gazette. These describe '
                           'who the person is, not what they may access.',
        }),
        ('Profile', {
            'fields': ('bio', 'avatar', 'must_change_password'),
        }),
    )
