-- Drop genuinely unused indexes (idx_scan = 0, non-constraint, non-PK, non-unique)
-- Excluded:
--   • All 44 indexes added by migration 20260615194714 (new FK covering indexes, intentionally 0 scans)
--   • talent_embeddings_hnsw_cosine (HNSW vector index — expensive to rebuild, reserved for semantic search)
-- Dropped: 91 indexes
-- Source: pg_stat_user_indexes WHERE idx_scan = 0 AND indisprimary = false AND indisunique = false
--         AND no pg_constraint backed by the index AND not in the new-FK exclusion set above

-- agency_taxonomy_settings (non-FK, older index)
drop index if exists public.idx_agency_taxonomy_settings_directory;

-- media_assets
drop index if exists public.media_assets_tenant_purpose_created_idx;
drop index if exists public.media_assets_tags_gin;

-- talent_profiles (FTS / trgm search indexes — planner never chose them)
drop index if exists public.idx_talent_profiles_directory_fts;
drop index if exists public.idx_talent_profiles_display_name_trgm;
drop index if exists public.idx_talent_profiles_profile_code_trgm;
drop index if exists public.idx_talent_profiles_hidden_at;
drop index if exists public.idx_talent_profiles_origin_country;
drop index if exists public.idx_talent_profiles_public_recent;
drop index if exists public.idx_talent_profiles_residence_city;
drop index if exists public.talent_profiles_origin_kind_idx;

-- talent_profile_field_values (duplicate GIN indexes — both 0 scans)
drop index if exists public.idx_tpfv_value_gin;
drop index if exists public.talent_profile_field_values_value_gin;

-- platform_audit_log
drop index if exists public.platform_audit_log_action_idx;
drop index if exists public.platform_audit_log_target_kind_id_idx;
drop index if exists public.platform_audit_log_severity_idx;

-- inquiry_messages
drop index if exists public.inquiry_messages_body_tsv_idx;
drop index if exists public.idx_inquiry_messages_target_owning_party;

-- notification_dispatch_log
drop index if exists public.notification_dispatch_log_catalog_idx;

-- taxonomy_terms
drop index if exists public.idx_taxonomy_terms_ai_keywords;
drop index if exists public.idx_taxonomy_terms_search_synonyms;

-- agencies
drop index if exists public.agencies_kind_hub_idx;
drop index if exists public.agencies_status_idx;

-- agency_bookings (non-FK, older indexes)
drop index if exists public.idx_agency_bookings_deposit_paid;
drop index if exists public.agency_bookings_call_sheet_updated_idx;

-- agency_client_relationships
drop index if exists public.agency_client_relationships_client_idx;
drop index if exists public.agency_client_relationships_tenant_idx;
drop index if exists public.idx_agency_client_relationships_origin_domain;
drop index if exists public.idx_agency_client_relationships_source_workspace_id;

-- agency_domains
drop index if exists public.agency_domains_active_custom_idx;

-- agency_talent_roster (non-FK older indexes)
drop index if exists public.idx_agency_talent_roster_origin_domain;
drop index if exists public.idx_agency_talent_roster_pending_exclusivity;
drop index if exists public.idx_agency_talent_roster_archive_event;

-- ai_provider_audit
drop index if exists public.ai_provider_audit_tenant_created;

-- app_locales
drop index if exists public.idx_app_locales_sort;

-- booking_activity_log
drop index if exists public.booking_activity_log_tenant_id_created_idx;

-- booking_commission_snapshot
drop index if exists public.booking_commission_snapshot_created_at_idx;

-- booking_transactions (non-FK older indexes)
drop index if exists public.idx_booking_transactions_receiver;

-- client_accounts
drop index if exists public.client_accounts_tenant_id_idx;
drop index if exists public.idx_client_accounts_name;

-- client_profiles
drop index if exists public.client_profiles_trust_tier_idx;

-- cms_collection_items
drop index if exists public.cms_collection_items_tenant_idx;

-- cms_posts
drop index if exists public.cms_posts_tenant_id_idx;

-- directory_sidebar_layout
drop index if exists public.directory_sidebar_layout_tenant_id_idx;

-- email_suppressions
drop index if exists public.email_suppressions_address_idx;

-- engine_audit_log
drop index if exists public.engine_audit_log_subject_idx;

-- inquiries (non-FK older indexes)
drop index if exists public.idx_inquiries_origin_domain;
drop index if exists public.idx_inquiries_trust_level_submission;
drop index if exists public.inquiries_initiator_role_idx;

-- inquiry_action_log
drop index if exists public.inquiry_action_log_created_at_brin;

-- inquiry_approvals
drop index if exists public.inquiry_approvals_tenant_id_idx;

-- inquiry_attachments
drop index if exists public.inquiry_attachments_kind_idx;

-- inquiry_coordinators
drop index if exists public.inquiry_coordinators_tenant_id_idx;
drop index if exists public.inquiry_coordinators_user_idx;

-- inquiry_drafts
drop index if exists public.inquiry_drafts_open_for_user_idx;

-- inquiry_events
drop index if exists public.inquiry_events_tenant_id_created_idx;
drop index if exists public.ix_inquiry_events_global_type;

-- inquiry_message_reads
drop index if exists public.idx_inquiry_message_reads_target_owning_party;

-- inquiry_participants (non-FK older index)
drop index if exists public.idx_inquiry_participants_owning_party;

-- inquiry_user_flags
drop index if exists public.inquiry_user_flags_profile_archived_idx;
drop index if exists public.inquiry_user_flags_profile_pinned_idx;
drop index if exists public.inquiry_user_flags_profile_unread_idx;

-- locations
drop index if exists public.idx_locations_country_id_active;

-- notifications (non-FK older index — same name not in 20260615194714 list)
-- NOTE: idx_notifications_user_id IS in 20260615194714, skipping

-- pitches
drop index if exists public.pitches_share_token_idx;

-- platform_alerts
drop index if exists public.platform_alerts_severity_idx;

-- platform_media_settings
drop index if exists public.platform_media_settings_tenant_id_idx;

-- product_discounts
drop index if exists public.idx_product_discounts_active;

-- product_packages
drop index if exists public.idx_product_packages_family;

-- product_prices
drop index if exists public.idx_product_prices_stripe;

-- product_tiers
drop index if exists public.idx_product_tiers_stripe_product;

-- profile_editor_sections
drop index if exists public.ix_profile_editor_sections_group_sort;

-- profile_field_definitions (non-FK older index)
drop index if exists public.idx_profile_field_definitions_searchable;

-- profile_field_recommendations
drop index if exists public.idx_profile_field_recommendations_required;

-- saas_marketing_signups
drop index if exists public.saas_marketing_signups_audience_idx;
drop index if exists public.saas_marketing_signups_claimed_by_idx;
drop index if exists public.saas_marketing_signups_email_lower_idx;
drop index if exists public.saas_marketing_signups_provisioned_tenant_idx;
drop index if exists public.saas_marketing_signups_status_idx;

-- saas_subdomain_reservations
drop index if exists public.saas_subdomain_reservations_expires_at_idx;

-- saved_talent
drop index if exists public.saved_talent_in_cart_idx;
drop index if exists public.saved_talent_tenant_id_idx;

-- talent_discover_index
drop index if exists public.talent_discover_index_agency;
drop index if exists public.talent_discover_index_availability;
drop index if exists public.talent_discover_index_category;

-- talent_languages
drop index if exists public.idx_talent_languages_can_host;
drop index if exists public.idx_talent_languages_code_speaking;
drop index if exists public.idx_talent_languages_can_sell;

-- talent_representation_requests
drop index if exists public.talent_representation_requests_open_queue_idx;

-- talent_reviews
drop index if exists public.idx_talent_reviews_tenant;

-- talent_service_areas
drop index if exists public.idx_talent_service_areas_tenant;

-- talent_submission_consents
drop index if exists public.talent_submission_consents_tenant_id_idx;

-- talent_submission_history
drop index if exists public.talent_submission_history_tenant_id_idx;

-- talent_submission_snapshots
drop index if exists public.talent_submission_snapshots_tenant_id_idx;

-- talent_subscriptions
drop index if exists public.idx_talent_subscriptions_stripe_sub_id;

-- talent_workflow_events
drop index if exists public.talent_workflow_events_tenant_id_idx;

-- translation_audit_events
drop index if exists public.translation_audit_events_tenant_id_idx;

-- workspace_plan_overrides
drop index if exists public.workspace_plan_overrides_expiry_idx;

-- workspace_subscriptions
drop index if exists public.idx_workspace_subscriptions_stripe_sub_id;

-- agency_talent_overlays
drop index if exists public.agency_talent_overlays_sort_idx;

-- client_account_contacts
drop index if exists public.idx_client_account_contacts_profile;

-- client_balance_ledger
drop index if exists public.idx_client_balance_ledger_payment_intent_lookup;

-- client_integrations
drop index if exists public.idx_client_integrations_provider;
drop index if exists public.idx_client_integrations_staff_visible;

-- client_reviews
drop index if exists public.idx_client_reviews_client_published;
drop index if exists public.idx_client_reviews_tenant;

-- client_subscriptions
drop index if exists public.idx_client_subscriptions_stripe_subscription;

-- cms_ai_usage_log
drop index if exists public.cms_ai_usage_log_tenant_created_idx;

-- cms_form_submissions
drop index if exists public.cms_form_submissions_section_status_idx;
drop index if exists public.cms_form_submissions_tenant_created_idx;

-- cms_pages
drop index if exists public.idx_cms_pages_scheduled_sweep;

-- cms_section_comments
drop index if exists public.idx_cms_section_comments_thread;
drop index if exists public.idx_cms_section_comments_unresolved;

-- cms_workspace_templates
drop index if exists public.cms_workspace_templates_visibility_idx;

-- failed_engine_effects
drop index if exists public.idx_failed_effects_retry;

-- field_groups
drop index if exists public.field_groups_tenant_id_idx;

-- inquiry_audit_log
drop index if exists public.inquiry_audit_log_field_idx;

-- inquiry_reports
drop index if exists public.inquiry_reports_status_idx;

-- media_folders
drop index if exists public.media_folders_share_token_idx;

-- phone_e164_backfill_collisions (temporary backfill table indexes)
drop index if exists public.phone_e164_backfill_collisions_computed_idx;
drop index if exists public.phone_e164_backfill_collisions_detected_idx;

-- pitch_attachments
drop index if exists public.pitch_attachments_pitch_idx;
drop index if exists public.pitch_attachments_talent_idx;

-- profiles
drop index if exists public.profiles_origin_kind_idx;
drop index if exists public.profiles_origin_workspace_idx;

-- roster_import_jobs
drop index if exists public.idx_roster_import_jobs_running;

-- sso_handoff_tokens
drop index if exists public.idx_sso_handoff_tokens_expires_at;

-- subscription_cancellations
drop index if exists public.idx_subscription_cancellations_reason;

-- talent_agency_data_grants
drop index if exists public.idx_data_grants_tenant_active;

-- talent_claim_invitations
drop index if exists public.idx_talent_claim_invitations_tenant_pending;

-- talent_holds
drop index if exists public.idx_talent_holds_active;

-- talent_integration_items
drop index if exists public.idx_talent_integration_items_personal_site;

-- talent_integrations
drop index if exists public.idx_talent_integrations_agency_visible;
drop index if exists public.idx_talent_integrations_provider;

-- talent_profile_change_requests
drop index if exists public.idx_profile_change_requests_pending;

-- team_invite_tokens
drop index if exists public.idx_team_invite_tokens_email;
drop index if exists public.idx_team_invite_tokens_tenant_pending;

-- user_visibility_overrides
drop index if exists public.user_visibility_overrides_target_idx;
drop index if exists public.user_visibility_overrides_tenant_idx;

-- workspace_commission_overrides
drop index if exists public.workspace_commission_overrides_open_requests_idx;
