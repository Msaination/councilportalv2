from django.contrib import admin

from .models import Membership, Team, UserProfile

# User admin stays stock: the post_save signal in accounts.signals mirrors
# every user save (including the admin's "set password" view) to Authentik.


@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'created_by', 'is_active', 'created_at')
    list_filter = ('is_active', 'created_at')
    search_fields = ('name', 'slug')
    raw_id_fields = ('created_by',)
    prepopulated_fields = {'slug': ('name',)}


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ('team', 'user', 'role', 'joined_at')
    list_filter = ('role', 'joined_at')
    search_fields = ('team__name', 'user__username')
    raw_id_fields = ('team', 'user')


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'employee_number', 'cell_number',
                    'must_change_password', 'active_team')
    list_filter = ('must_change_password',)
    search_fields = ('user__username', 'user__email', 'cell_number',
                     'employee_number')
    raw_id_fields = ('user', 'active_team')
