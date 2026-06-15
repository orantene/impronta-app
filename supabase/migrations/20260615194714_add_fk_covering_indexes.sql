-- Migration: add_fk_covering_indexes
-- Covers 44 unindexed foreign-key columns identified by the performance advisor.
-- Tables are ordered by estimated row count (descending), then by table name.
-- NOTE: CONCURRENTLY is intentionally omitted — migrations run inside a transaction.

-- ============================================================
-- agency_taxonomy_settings (~20 262 rows)
-- ============================================================
create index if not exists idx_agency_taxonomy_settings_created_by
  on public.agency_taxonomy_settings (created_by_user_id);

-- ============================================================
-- analytics_events (~1 947 rows)
-- ============================================================
create index if not exists idx_analytics_events_user_id
  on public.analytics_events (user_id);

-- ============================================================
-- media_assets (~1 883 rows)
-- ============================================================
create index if not exists idx_media_assets_created_by
  on public.media_assets (created_by);

create index if not exists idx_media_assets_owner_tenant_id
  on public.media_assets (owner_tenant_id);

create index if not exists idx_media_assets_uploaded_by_user_id
  on public.media_assets (uploaded_by_user_id);

-- ============================================================
-- talent_profile_taxonomy (~666 rows)
-- ============================================================
create index if not exists idx_talent_profile_taxonomy_verified_by_tenant
  on public.talent_profile_taxonomy (verified_by_tenant_id);

-- ============================================================
-- search_queries (~588 rows)
-- ============================================================
create index if not exists idx_search_queries_clicked_talent_id
  on public.search_queries (clicked_talent_id);

create index if not exists idx_search_queries_user_id
  on public.search_queries (user_id);

-- ============================================================
-- cms_page_revisions (~551 rows)
-- ============================================================
create index if not exists idx_cms_page_revisions_created_by
  on public.cms_page_revisions (created_by);

-- ============================================================
-- profile_field_definitions (~310 rows)
-- ============================================================
create index if not exists idx_profile_field_definitions_field_group_id
  on public.profile_field_definitions (field_group_id);

-- ============================================================
-- agency_talent_roster (~209 rows)
-- ============================================================
create index if not exists idx_agency_talent_roster_added_by
  on public.agency_talent_roster (added_by);

create index if not exists idx_agency_talent_roster_archived_for_downgrade_by
  on public.agency_talent_roster (archived_for_downgrade_by);

create index if not exists idx_agency_talent_roster_removed_by
  on public.agency_talent_roster (removed_by);

-- ============================================================
-- inquiry_messages (~161 rows, hot — grows with every message)
-- ============================================================
create index if not exists idx_inquiry_messages_sender_user_id
  on public.inquiry_messages (sender_user_id);

-- ============================================================
-- cms_section_revisions (~157 rows)
-- ============================================================
create index if not exists idx_cms_section_revisions_created_by
  on public.cms_section_revisions (created_by);

-- ============================================================
-- notification_dispatch_log (~146 rows)
-- ============================================================
create index if not exists idx_notification_dispatch_log_inquiry_id
  on public.notification_dispatch_log (inquiry_id);

create index if not exists idx_notification_dispatch_log_tenant_id
  on public.notification_dispatch_log (tenant_id);

-- ============================================================
-- inquiry_participants (~121 rows, hot)
-- ============================================================
create index if not exists idx_inquiry_participants_added_by_user_id
  on public.inquiry_participants (added_by_user_id);

-- ============================================================
-- talent_profiles (~121 rows, hot — core table)
-- ============================================================
create index if not exists idx_talent_profiles_created_by_user_id_provenance
  on public.talent_profiles (created_by_user_id_provenance);

create index if not exists idx_talent_profiles_location_id
  on public.talent_profiles (location_id);

create index if not exists idx_talent_profiles_origin_created_by_user_id
  on public.talent_profiles (origin_created_by_user_id);

-- ============================================================
-- agency_branding_revisions (~113 rows)
-- ============================================================
create index if not exists idx_agency_branding_revisions_created_by
  on public.agency_branding_revisions (created_by);

-- ============================================================
-- notifications (~110 rows)
-- ============================================================
create index if not exists idx_notifications_user_id
  on public.notifications (user_id);

-- ============================================================
-- inquiries (~47 rows, very hot — grows and is heavily queried)
-- ============================================================
create index if not exists idx_inquiries_assigned_staff_id
  on public.inquiries (assigned_staff_id);

create index if not exists idx_inquiries_client_contact_id
  on public.inquiries (client_contact_id);

create index if not exists idx_inquiries_closed_by_user_id
  on public.inquiries (closed_by_user_id);

create index if not exists idx_inquiries_current_offer_id
  on public.inquiries (current_offer_id);

create index if not exists idx_inquiries_duplicate_of_inquiry_id
  on public.inquiries (duplicate_of_inquiry_id);

create index if not exists idx_inquiries_event_type_id
  on public.inquiries (event_type_id);

create index if not exists idx_inquiries_frozen_by_user_id
  on public.inquiries (frozen_by_user_id);

create index if not exists idx_inquiries_last_edited_by
  on public.inquiries (last_edited_by);

-- ============================================================
-- agency_bookings (hot — every active booking lives here)
-- ============================================================
create index if not exists idx_agency_bookings_call_sheet_updated_by_user_id
  on public.agency_bookings (call_sheet_updated_by_user_id);

create index if not exists idx_agency_bookings_client_contact_id
  on public.agency_bookings (client_contact_id);

create index if not exists idx_agency_bookings_client_user_id
  on public.agency_bookings (client_user_id);

create index if not exists idx_agency_bookings_created_by_staff_id
  on public.agency_bookings (created_by_staff_id);

create index if not exists idx_agency_bookings_duplicate_of_booking_id
  on public.agency_bookings (duplicate_of_booking_id);

create index if not exists idx_agency_bookings_event_type_id
  on public.agency_bookings (event_type_id);

create index if not exists idx_agency_bookings_owner_staff_id
  on public.agency_bookings (owner_staff_id);

create index if not exists idx_agency_bookings_updated_by_staff_id
  on public.agency_bookings (updated_by_staff_id);

create index if not exists idx_agency_bookings_venue_location_id
  on public.agency_bookings (venue_location_id);

-- ============================================================
-- booking_transactions (hot — payment lifecycle table)
-- ============================================================
create index if not exists idx_booking_transactions_created_by_profile_id
  on public.booking_transactions (created_by_profile_id);

create index if not exists idx_booking_transactions_payer_user_id
  on public.booking_transactions (payer_user_id);

create index if not exists idx_booking_transactions_refund_of_transaction_id
  on public.booking_transactions (refund_of_transaction_id);

create index if not exists idx_booking_transactions_source_inquiry_id
  on public.booking_transactions (source_inquiry_id);
