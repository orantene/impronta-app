# FOR ALL is_staff_of_tenant inventory and decisions

Why this exists: `is_staff_of_tenant` admits every role (viewer included), `pending_acceptance` memberships and platform admins.
A `FOR ALL` policy gated on it therefore lets a viewer or a pending invitee write directly over PostgREST. Latent today
(prod has only owners and admins), live with the first viewer/editor/manager seat or pending invite.

Rules (PM):
1. `is_staff_of_tenant` is NOT changed. It keeps gating legitimate SELECTs.
2. New helpers require `status = 'active'`: `is_tenant_writer` (owner, admin, manager, coordinator, editor) and `is_tenant_admin` (owner, admin). Both also admit platform admins, like `is_staff_of_tenant`.
3. Money and access tables: admin+ or service-role-only. Content and operational tables: editor+.
4. Mixed policies (own talent OR staff) are decided per table after reading who writes; never a blanket rewrite.
5. Each wave ships as its own held migration with a version issued by the PM.

Wave 1 (this PR, held `_pending_pm/20261231424000_rls_tenant_writer_wave1.sql`): settings, ai_provider_instances, tenant_integrations,
team_invite_tokens, agency_entitlements (service-role-only writes); payout_accounts, booking_transactions, client_trust_state,
agency_business_identity (admin+ writes).

How the list below was produced: every `CREATE POLICY ... FOR ALL` whose statement mentions `is_staff_of_tenant` across
`supabase/migrations` and `_pending_pm`, keyed table.policy. It is a "ever created" list: a few may have been dropped later,
and prod's count (78 tables) can differ because some policies are created dynamically or were hand-applied. The static test
`src/lib/rls/for-all-staff-policy-inventory.static.test.ts` fails on any key not listed here.

Open product questions:
- booking_transactions: wave 1 gives writes to admin+ only. Manager-role POS cashiers and order flows that write on a user session would stop working once a manager seat exists. Confirm manager should not write the ledger directly (the alternative is to move those writers to the service role).
- client_trust_state: the trust evaluator can take a user-session client; confirm it only runs as owner/admin or on the service role.
- cms_section_comments: should a viewer be able to comment?
- booking_transactions_coordinator_all (20260615025530) is a separate delegated-access policy, not an is_staff_of_tenant policy, and is out of scope here.

| Table | Policy | Wave | Decision |
|---|---|---|---|
| agencies | agencies_tenant_staff | wave 2 | access/identity/config table: is_tenant_admin writes, or service-role-only after a writer audit |
| agency_branding | agency_branding_tenant_staff | wave 2 | access/identity/config table: is_tenant_admin writes, or service-role-only after a writer audit |
| agency_business_identity | agency_business_identity_staff_all | wave 1 | admin+ writes (held 20261231424000) |
| agency_client_relationships | agency_client_relationships_tenant_staff | wave 2 | access/identity/config table: is_tenant_admin writes, or service-role-only after a writer audit |
| agency_domains | agency_domains_tenant_staff | wave 2 | access/identity/config table: is_tenant_admin writes, or service-role-only after a writer audit |
| agency_entitlements | agency_entitlements_tenant_staff | wave 1 | service-role-only writes (held 20261231424000) |
| agency_inquiry_coordinators | agency_inquiry_coordinators_staff_all | wave 2 | access/identity/config table: is_tenant_admin writes, or service-role-only after a writer audit |
| agency_memberships | agency_memberships_tenant_staff | wave 2 | access/identity/config table: is_tenant_admin writes, or service-role-only after a writer audit |
| agency_talent_media | atm_all_tenant_staff | wave 3 | content or operational table: is_tenant_writer (editor+) for writes, is_staff_of_tenant for SELECT |
| agency_talent_overlays | agency_talent_overlays_tenant_staff | wave 3 | content or operational table: is_tenant_writer (editor+) for writes, is_staff_of_tenant for SELECT |
| agency_talent_roster | agency_talent_roster_tenant_staff | wave 3 | content or operational table: is_tenant_writer (editor+) for writes, is_staff_of_tenant for SELECT |
| agency_talent_skill_overrides | atso_all_tenant_staff | wave 3 | content or operational table: is_tenant_writer (editor+) for writes, is_staff_of_tenant for SELECT |
| agency_taxonomy_settings | agency_taxonomy_settings_staff_write | wave 3 | content or operational table: is_tenant_writer (editor+) for writes, is_staff_of_tenant for SELECT |
| agency_taxonomy_terms | agency_taxonomy_terms_staff_write | wave 3 | content or operational table: is_tenant_writer (editor+) for writes, is_staff_of_tenant for SELECT |
| agency_usage_counters | agency_usage_counters_tenant_staff | wave 2 | access/identity/config table: is_tenant_admin writes, or service-role-only after a writer audit |
| ai_provider_instances | ai_provider_instances_staff | wave 1 | service-role-only writes (held 20261231424000) |
| ai_tenant_controls | ai_tenant_controls_staff | wave 1 (separate PR) | covered by PR #4287 (select-only, held 20261231423600) |
| ai_usage_monthly | ai_usage_monthly_staff | wave 1 (separate PR) | covered by PR #4287 (select-only, held 20261231423600) |
| booking_transactions | booking_transactions_staff_write | wave 1 | admin+ writes (held 20261231424000) |
| client_trust_state | client_trust_state_staff_write | wave 1 | admin+ writes (held 20261231424000) |
| cms_builder_components | cms_builder_components_staff_write | wave 3 | content or operational table: is_tenant_writer (editor+) for writes, is_staff_of_tenant for SELECT |
| cms_code_snippets | cms_code_snippets_tenant_staff | wave 3 | content or operational table: is_tenant_writer (editor+) for writes, is_staff_of_tenant for SELECT |
| cms_navigation_menus | cms_navigation_menus_tenant_staff | wave 3 | content or operational table: is_tenant_writer (editor+) for writes, is_staff_of_tenant for SELECT |
| cms_page_sections | cms_page_sections_staff_all | wave 3 | content or operational table: is_tenant_writer (editor+) for writes, is_staff_of_tenant for SELECT |
| cms_section_comments | cms_section_comments_staff_all | product question | viewer commenting on CMS sections may be intended; PM to decide viewer vs editor+, then is_tenant_writer |
| cms_sections | cms_sections_staff_all | wave 3 | content or operational table: is_tenant_writer (editor+) for writes, is_staff_of_tenant for SELECT |
| cms_workspace_templates | cms_workspace_templates_staff_write | wave 3 | content or operational table: is_tenant_writer (editor+) for writes, is_staff_of_tenant for SELECT |
| field_definitions | field_definitions_write_tenant | wave 3 | content or operational table: is_tenant_writer (editor+) for writes, is_staff_of_tenant for SELECT |
| field_groups | field_groups_merged_all_public | wave 3 | content or operational table: is_tenant_writer (editor+) for writes, is_staff_of_tenant for SELECT |
| field_groups | field_groups_write_tenant | wave 3 | content or operational table: is_tenant_writer (editor+) for writes, is_staff_of_tenant for SELECT |
| inquiry_alternates | inquiry_alternates_merged_all_public | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| inquiry_alternates | inquiry_alternates_staff_all | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| inquiry_attachments | inquiry_attachments_staff_all | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| inquiry_drafts | inquiry_drafts_merged_all_public | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| inquiry_drafts | inquiry_drafts_tenant_staff | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| inquiry_message_reads | inquiry_message_reads_merged_all_public | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| inquiry_message_reads | inquiry_message_reads_tenant_staff | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| inquiry_messages | inquiry_messages_tenant_staff | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| inquiry_offer_line_items | inquiry_offer_line_items_merged_all_public | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| inquiry_participants | inquiry_participants_merged_all_public | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| inquiry_participants | inquiry_participants_nontalent_tenant_staff | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| inquiry_participants | inquiry_participants_talent_legacy_tenant_staff | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| inquiry_participants | inquiry_participants_talent_owning_party_staff | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| inquiry_reports | inquiry_reports_staff | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| lesson_package_consumptions | lesson_package_consumptions_staff | wave 2 | access/identity/config table: is_tenant_admin writes, or service-role-only after a writer audit |
| media_assets | media_assets_tenant_staff_all | wave 3 | content or operational table: is_tenant_writer (editor+) for writes, is_staff_of_tenant for SELECT |
| media_assets | media_write_staff | wave 3 | content or operational table: is_tenant_writer (editor+) for writes, is_staff_of_tenant for SELECT |
| media_grants | mg_all_owner_tenant_staff | wave 2 | access/identity/config table: is_tenant_admin writes, or service-role-only after a writer audit |
| media_release_bake_failures | mrbf_all_owner_tenant_staff | wave 3 | content or operational table: is_tenant_writer (editor+) for writes, is_staff_of_tenant for SELECT |
| notifications | notifications_merged_all_public | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| payout_accounts | payout_accounts_staff_write | wave 1 | admin+ writes (held 20261231424000) |
| pitch_attachments | pitch_attachments_staff_all | wave 3 | content or operational table: is_tenant_writer (editor+) for writes, is_staff_of_tenant for SELECT |
| pitch_events | pitch_events_staff_all | wave 3 | content or operational table: is_tenant_writer (editor+) for writes, is_staff_of_tenant for SELECT |
| pitch_talents | pitch_talents_staff_all | wave 3 | content or operational table: is_tenant_writer (editor+) for writes, is_staff_of_tenant for SELECT |
| pitches | pitches_staff_all | wave 3 | content or operational table: is_tenant_writer (editor+) for writes, is_staff_of_tenant for SELECT |
| print_designs | print_designs_staff_all | wave 3 | content or operational table: is_tenant_writer (editor+) for writes, is_staff_of_tenant for SELECT |
| roster_import_jobs | roster_import_jobs_staff_all | wave 3 | content or operational table: is_tenant_writer (editor+) for writes, is_staff_of_tenant for SELECT |
| settings | settings_staff | wave 1 | service-role-only writes (held 20261231424000) |
| talent_booking_hours | talent_booking_hours_staff | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| talent_booking_hours | talent_booking_hours_staff_write | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| talent_bookings | talent_bookings_write_staff | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| talent_claim_invitations | talent_claim_invitations_staff_all | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| talent_contact_preferences | talent_contact_preferences_merged_all_public | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| talent_contact_preferences | talent_contact_prefs_staff | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| talent_holds | talent_holds_write_staff | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| talent_languages | talent_languages_write_own_or_staff | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| talent_page_revisions | talent_page_revisions_merged_all_public | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| talent_page_revisions | talent_page_revisions_staff | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| talent_pages | talent_pages_merged_all_public | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| talent_pages | talent_pages_staff | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| talent_profile_change_requests | profile_change_requests_staff_all | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| talent_profile_field_values | tpfv_write_own_or_staff | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| talent_profile_trust_badges | talent_profile_trust_badges_merged_all_public | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| talent_profile_trust_badges | tptb_write_agency_scoped | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| talent_review_media | talent_review_media_staff_all | wave 3 | content or operational table: is_tenant_writer (editor+) for writes, is_staff_of_tenant for SELECT |
| talent_service_areas | talent_service_areas_write_own_or_staff | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| team_invite_tokens | team_invite_tokens_staff_all | wave 1 | service-role-only writes (held 20261231424000) |
| tenant_guest_chat_settings | guest_chat_settings_staff_write | wave 2 | access/identity/config table: is_tenant_admin writes, or service-role-only after a writer audit |
| tenant_integrations | tenant_integrations_staff_all | wave 1 | service-role-only writes (held 20261231424000) |
| tenant_registration_settings | tenant_registration_settings_staff_all | wave 2 | access/identity/config table: is_tenant_admin writes, or service-role-only after a writer audit |
| tenant_social_feed_items | tenant_social_feed_items_staff_all | wave 3 | content or operational table: is_tenant_writer (editor+) for writes, is_staff_of_tenant for SELECT |
| user_blocks | user_blocks_staff | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
| workspace_field_group_settings | wfgs_all_tenant_staff | wave 3 | content or operational table: is_tenant_writer (editor+) for writes, is_staff_of_tenant for SELECT |
| workspace_page_revisions | workspace_page_revisions_staff | wave 3 | content or operational table: is_tenant_writer (editor+) for writes, is_staff_of_tenant for SELECT |
| workspace_pages | workspace_pages_staff | wave 3 | content or operational table: is_tenant_writer (editor+) for writes, is_staff_of_tenant for SELECT |
| workspace_profile_field_settings | wpfs_write_tenant_or_platform | mixed (per-table read) | talent/client/participant also write legitimately; needs a per-table read of who writes before any change |
