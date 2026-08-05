export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      _archive_deprecated_field_defs_20260615: {
        Row: {
          admin_only: boolean
          count_min: number | null
          created_at: string
          default_visibility: string[]
          deprecated_at: string | null
          directory_filter_config: Json | null
          display_order: number
          field_group_id: string | null
          field_key: string
          helper: string | null
          helper_es: string | null
          id: string
          is_optional: boolean
          is_searchable: boolean
          is_sensitive: boolean
          kind: string
          label: string
          label_es: string | null
          legacy_field_keys: string[] | null
          note: string | null
          options: Json | null
          options_es: Json | null
          placeholder: string | null
          render_mode: string
          requires_review_on_change: boolean
          section: string
          show_in_directory: boolean
          show_in_directory_card: boolean
          show_in_directory_filter: boolean
          show_in_edit_drawer: boolean
          show_in_public: boolean
          show_in_public_profile_sidebar: boolean
          show_in_registration: boolean
          show_when: Json | null
          storage_mode: string
          subsection: string | null
          talent_editable: boolean
          tier: string
          unit: string | null
          updated_at: string
          validation_rules: Json | null
        }
        Insert: {
          admin_only?: boolean
          count_min?: number | null
          created_at?: string
          default_visibility?: string[]
          deprecated_at?: string | null
          directory_filter_config?: Json | null
          display_order?: number
          field_group_id?: string | null
          field_key: string
          helper?: string | null
          helper_es?: string | null
          id?: string
          is_optional?: boolean
          is_searchable?: boolean
          is_sensitive?: boolean
          kind?: string
          label: string
          label_es?: string | null
          legacy_field_keys?: string[] | null
          note?: string | null
          options?: Json | null
          options_es?: Json | null
          placeholder?: string | null
          render_mode?: string
          requires_review_on_change?: boolean
          section: string
          show_in_directory?: boolean
          show_in_directory_card?: boolean
          show_in_directory_filter?: boolean
          show_in_edit_drawer?: boolean
          show_in_public?: boolean
          show_in_public_profile_sidebar?: boolean
          show_in_registration?: boolean
          show_when?: Json | null
          storage_mode?: string
          subsection?: string | null
          talent_editable?: boolean
          tier: string
          unit?: string | null
          updated_at?: string
          validation_rules?: Json | null
        }
        Update: {
          admin_only?: boolean
          count_min?: number | null
          created_at?: string
          default_visibility?: string[]
          deprecated_at?: string | null
          directory_filter_config?: Json | null
          display_order?: number
          field_group_id?: string | null
          field_key?: string
          helper?: string | null
          helper_es?: string | null
          id?: string
          is_optional?: boolean
          is_searchable?: boolean
          is_sensitive?: boolean
          kind?: string
          label?: string
          label_es?: string | null
          legacy_field_keys?: string[] | null
          note?: string | null
          options?: Json | null
          options_es?: Json | null
          placeholder?: string | null
          render_mode?: string
          requires_review_on_change?: boolean
          section?: string
          show_in_directory?: boolean
          show_in_directory_card?: boolean
          show_in_directory_filter?: boolean
          show_in_edit_drawer?: boolean
          show_in_public?: boolean
          show_in_public_profile_sidebar?: boolean
          show_in_registration?: boolean
          show_when?: Json | null
          storage_mode?: string
          subsection?: string | null
          talent_editable?: boolean
          tier?: string
          unit?: string | null
          updated_at?: string
          validation_rules?: Json | null
        }
        Relationships: []
      }
      _archive_deprecated_field_recs_20260615: {
        Row: {
          created_at: string
          display_order: number
          field_definition_id: string
          id: string
          is_admin_only: boolean
          relationship: string
          required_at_registration: boolean
          required_before_publish: boolean
          required_before_verification: boolean
          requires_verification: boolean
          taxonomy_term_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          field_definition_id: string
          id?: string
          is_admin_only?: boolean
          relationship: string
          required_at_registration?: boolean
          required_before_publish?: boolean
          required_before_verification?: boolean
          requires_verification?: boolean
          taxonomy_term_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          field_definition_id?: string
          id?: string
          is_admin_only?: boolean
          relationship?: string
          required_at_registration?: boolean
          required_before_publish?: boolean
          required_before_verification?: boolean
          requires_verification?: boolean
          taxonomy_term_id?: string
        }
        Relationships: []
      }
      _archive_deprecated_field_settings_20260615: {
        Row: {
          admin_only_override: boolean | null
          created_at: string
          custom_helper: string | null
          custom_label: string | null
          default_visibility_override: string[] | null
          display_order_override: number | null
          enabled_override: boolean | null
          field_definition_id: string
          id: string
          last_changed_by_user_id: string | null
          required_override: boolean | null
          requires_review_on_change_override: boolean | null
          show_in_directory_card_override: boolean | null
          show_in_directory_filter_override: boolean | null
          show_in_directory_override: boolean | null
          show_in_edit_drawer_override: boolean | null
          show_in_public_override: boolean | null
          show_in_public_profile_sidebar_override: boolean | null
          show_in_registration_override: boolean | null
          talent_editable_override: boolean | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          admin_only_override?: boolean | null
          created_at?: string
          custom_helper?: string | null
          custom_label?: string | null
          default_visibility_override?: string[] | null
          display_order_override?: number | null
          enabled_override?: boolean | null
          field_definition_id: string
          id?: string
          last_changed_by_user_id?: string | null
          required_override?: boolean | null
          requires_review_on_change_override?: boolean | null
          show_in_directory_card_override?: boolean | null
          show_in_directory_filter_override?: boolean | null
          show_in_directory_override?: boolean | null
          show_in_edit_drawer_override?: boolean | null
          show_in_public_override?: boolean | null
          show_in_public_profile_sidebar_override?: boolean | null
          show_in_registration_override?: boolean | null
          talent_editable_override?: boolean | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          admin_only_override?: boolean | null
          created_at?: string
          custom_helper?: string | null
          custom_label?: string | null
          default_visibility_override?: string[] | null
          display_order_override?: number | null
          enabled_override?: boolean | null
          field_definition_id?: string
          id?: string
          last_changed_by_user_id?: string | null
          required_override?: boolean | null
          requires_review_on_change_override?: boolean | null
          show_in_directory_card_override?: boolean | null
          show_in_directory_filter_override?: boolean | null
          show_in_directory_override?: boolean | null
          show_in_edit_drawer_override?: boolean | null
          show_in_public_override?: boolean | null
          show_in_public_profile_sidebar_override?: boolean | null
          show_in_registration_override?: boolean | null
          talent_editable_override?: boolean | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      _archive_deprecated_field_values_20260615: {
        Row: {
          created_at: string
          field_definition_id: string
          id: string
          last_edited_by_user_id: string | null
          last_edited_role: string | null
          talent_profile_id: string
          tenant_id: string | null
          updated_at: string
          value: Json
          visibility_override: string[] | null
          workflow_state: string
        }
        Insert: {
          created_at?: string
          field_definition_id: string
          id?: string
          last_edited_by_user_id?: string | null
          last_edited_role?: string | null
          talent_profile_id: string
          tenant_id?: string | null
          updated_at?: string
          value: Json
          visibility_override?: string[] | null
          workflow_state?: string
        }
        Update: {
          created_at?: string
          field_definition_id?: string
          id?: string
          last_edited_by_user_id?: string | null
          last_edited_role?: string | null
          talent_profile_id?: string
          tenant_id?: string | null
          updated_at?: string
          value?: Json
          visibility_override?: string[] | null
          workflow_state?: string
        }
        Relationships: []
      }
      activity_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json
          tenant_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agencies: {
        Row: {
          accepts_open_applications: boolean
          auto_ack_enabled: boolean
          auto_ack_message: string
          created_at: string
          default_coordinator_user_id: string | null
          default_currency: string
          display_name: string
          id: string
          kind: Database["public"]["Enums"]["organization_kind"]
          onboarding_completed_at: string | null
          plan_tier: string
          preferred_currency: string | null
          settings: Json
          slug: string
          status: string
          stripe_account_id: string | null
          stripe_account_status: string
          stripe_account_synced_at: string | null
          stripe_charges_enabled: boolean
          stripe_details_submitted: boolean
          stripe_payouts_enabled: boolean
          supported_locales: string[]
          suspended_at: string | null
          suspended_reason: string | null
          talent_seat_limit: number | null
          template_key: string
          updated_at: string
        }
        Insert: {
          accepts_open_applications?: boolean
          auto_ack_enabled?: boolean
          auto_ack_message?: string
          created_at?: string
          default_coordinator_user_id?: string | null
          default_currency?: string
          display_name: string
          id?: string
          kind?: Database["public"]["Enums"]["organization_kind"]
          onboarding_completed_at?: string | null
          plan_tier?: string
          preferred_currency?: string | null
          settings?: Json
          slug: string
          status?: string
          stripe_account_id?: string | null
          stripe_account_status?: string
          stripe_account_synced_at?: string | null
          stripe_charges_enabled?: boolean
          stripe_details_submitted?: boolean
          stripe_payouts_enabled?: boolean
          supported_locales?: string[]
          suspended_at?: string | null
          suspended_reason?: string | null
          talent_seat_limit?: number | null
          template_key?: string
          updated_at?: string
        }
        Update: {
          accepts_open_applications?: boolean
          auto_ack_enabled?: boolean
          auto_ack_message?: string
          created_at?: string
          default_coordinator_user_id?: string | null
          default_currency?: string
          display_name?: string
          id?: string
          kind?: Database["public"]["Enums"]["organization_kind"]
          onboarding_completed_at?: string | null
          plan_tier?: string
          preferred_currency?: string | null
          settings?: Json
          slug?: string
          status?: string
          stripe_account_id?: string | null
          stripe_account_status?: string
          stripe_account_synced_at?: string | null
          stripe_charges_enabled?: boolean
          stripe_details_submitted?: boolean
          stripe_payouts_enabled?: boolean
          supported_locales?: string[]
          suspended_at?: string | null
          suspended_reason?: string | null
          talent_seat_limit?: number | null
          template_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      agency_bookings: {
        Row: {
          access_notes: string | null
          balance_collection_method: string | null
          balance_due_at: string | null
          booking_sub_type: string
          call_sheet_payload: Json | null
          call_sheet_updated_at: string | null
          call_sheet_updated_by_user_id: string | null
          cancelled_reason: string | null
          client_account_id: string | null
          client_account_name: string | null
          client_account_type: string | null
          client_contact_id: string | null
          client_revenue_lifecycle: string
          client_summary: string | null
          client_user_id: string | null
          client_visible_at: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          coordinator_response_time_ms: number | null
          coordinator_user_id_snapshot: string | null
          created_at: string
          created_by_staff_id: string | null
          created_with_override: boolean
          currency_code: string
          deadline_at: string | null
          deposit_amount_cents: number | null
          deposit_currency: string | null
          deposit_paid_at: string | null
          deposit_payment_intent_id: string | null
          deposit_pct: number | null
          duplicate_of_booking_id: string | null
          ends_at: string | null
          equipment_notes: string | null
          event_date: string | null
          event_timezone_snapshot: string | null
          event_type_id: string | null
          gross_profit: number
          id: string
          internal_notes: string | null
          lodging_notes: string | null
          meals_notes: string | null
          notes: string | null
          override_reason: string | null
          owner_staff_id: string | null
          owner_user_id_snapshot: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_notes: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          payout_lifecycle: string
          refund_policy_key: string | null
          source_inquiry_id: string | null
          source_type_snapshot: string | null
          starts_at: string | null
          status: Database["public"]["Enums"]["booking_status"]
          tenant_id: string
          tenant_id_snapshot: string | null
          time_to_booking_ms: number | null
          time_to_first_offer_ms: number | null
          timezone: string | null
          title: string
          total_client_revenue: number
          total_talent_cost: number
          transport_notes: string | null
          updated_at: string
          updated_by_staff_id: string | null
          venue_address: string | null
          venue_location_id: string | null
          venue_location_text: string | null
          venue_name: string | null
          wardrobe_notes: string | null
        }
        Insert: {
          access_notes?: string | null
          balance_collection_method?: string | null
          balance_due_at?: string | null
          booking_sub_type?: string
          call_sheet_payload?: Json | null
          call_sheet_updated_at?: string | null
          call_sheet_updated_by_user_id?: string | null
          cancelled_reason?: string | null
          client_account_id?: string | null
          client_account_name?: string | null
          client_account_type?: string | null
          client_contact_id?: string | null
          client_revenue_lifecycle?: string
          client_summary?: string | null
          client_user_id?: string | null
          client_visible_at?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          coordinator_response_time_ms?: number | null
          coordinator_user_id_snapshot?: string | null
          created_at?: string
          created_by_staff_id?: string | null
          created_with_override?: boolean
          currency_code?: string
          deadline_at?: string | null
          deposit_amount_cents?: number | null
          deposit_currency?: string | null
          deposit_paid_at?: string | null
          deposit_payment_intent_id?: string | null
          deposit_pct?: number | null
          duplicate_of_booking_id?: string | null
          ends_at?: string | null
          equipment_notes?: string | null
          event_date?: string | null
          event_timezone_snapshot?: string | null
          event_type_id?: string | null
          gross_profit?: number
          id?: string
          internal_notes?: string | null
          lodging_notes?: string | null
          meals_notes?: string | null
          notes?: string | null
          override_reason?: string | null
          owner_staff_id?: string | null
          owner_user_id_snapshot?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_notes?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          payout_lifecycle?: string
          refund_policy_key?: string | null
          source_inquiry_id?: string | null
          source_type_snapshot?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          tenant_id: string
          tenant_id_snapshot?: string | null
          time_to_booking_ms?: number | null
          time_to_first_offer_ms?: number | null
          timezone?: string | null
          title?: string
          total_client_revenue?: number
          total_talent_cost?: number
          transport_notes?: string | null
          updated_at?: string
          updated_by_staff_id?: string | null
          venue_address?: string | null
          venue_location_id?: string | null
          venue_location_text?: string | null
          venue_name?: string | null
          wardrobe_notes?: string | null
        }
        Update: {
          access_notes?: string | null
          balance_collection_method?: string | null
          balance_due_at?: string | null
          booking_sub_type?: string
          call_sheet_payload?: Json | null
          call_sheet_updated_at?: string | null
          call_sheet_updated_by_user_id?: string | null
          cancelled_reason?: string | null
          client_account_id?: string | null
          client_account_name?: string | null
          client_account_type?: string | null
          client_contact_id?: string | null
          client_revenue_lifecycle?: string
          client_summary?: string | null
          client_user_id?: string | null
          client_visible_at?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          coordinator_response_time_ms?: number | null
          coordinator_user_id_snapshot?: string | null
          created_at?: string
          created_by_staff_id?: string | null
          created_with_override?: boolean
          currency_code?: string
          deadline_at?: string | null
          deposit_amount_cents?: number | null
          deposit_currency?: string | null
          deposit_paid_at?: string | null
          deposit_payment_intent_id?: string | null
          deposit_pct?: number | null
          duplicate_of_booking_id?: string | null
          ends_at?: string | null
          equipment_notes?: string | null
          event_date?: string | null
          event_timezone_snapshot?: string | null
          event_type_id?: string | null
          gross_profit?: number
          id?: string
          internal_notes?: string | null
          lodging_notes?: string | null
          meals_notes?: string | null
          notes?: string | null
          override_reason?: string | null
          owner_staff_id?: string | null
          owner_user_id_snapshot?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_notes?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          payout_lifecycle?: string
          refund_policy_key?: string | null
          source_inquiry_id?: string | null
          source_type_snapshot?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          tenant_id?: string
          tenant_id_snapshot?: string | null
          time_to_booking_ms?: number | null
          time_to_first_offer_ms?: number | null
          timezone?: string | null
          title?: string
          total_client_revenue?: number
          total_talent_cost?: number
          transport_notes?: string | null
          updated_at?: string
          updated_by_staff_id?: string | null
          venue_address?: string | null
          venue_location_id?: string | null
          venue_location_text?: string | null
          venue_name?: string | null
          wardrobe_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agency_bookings_call_sheet_updated_by_user_id_fkey"
            columns: ["call_sheet_updated_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_bookings_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_bookings_client_contact_id_fkey"
            columns: ["client_contact_id"]
            isOneToOne: false
            referencedRelation: "client_account_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_bookings_client_user_id_fkey"
            columns: ["client_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_bookings_created_by_staff_id_fkey"
            columns: ["created_by_staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_bookings_duplicate_of_booking_id_fkey"
            columns: ["duplicate_of_booking_id"]
            isOneToOne: false
            referencedRelation: "agency_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_bookings_event_type_id_fkey"
            columns: ["event_type_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_bookings_owner_staff_id_fkey"
            columns: ["owner_staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_bookings_source_inquiry_id_fkey"
            columns: ["source_inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_bookings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_bookings_updated_by_staff_id_fkey"
            columns: ["updated_by_staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_bookings_venue_location_id_fkey"
            columns: ["venue_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_branding: {
        Row: {
          accent_color: string | null
          body_font: string | null
          brand_mark_svg: string | null
          component_styles_json: Json
          component_styles_json_draft: Json
          created_at: string
          favicon_media_asset_id: string | null
          favorite_icon: string | null
          font_preset: string | null
          heading_font: string | null
          logo_dark_media_asset_id: string | null
          logo_media_asset_id: string | null
          neutral_color: string | null
          og_image_media_asset_id: string | null
          primary_color: string | null
          secondary_color: string | null
          tenant_id: string
          theme_json: Json
          theme_json_draft: Json
          theme_preset_slug: string | null
          theme_published_at: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          accent_color?: string | null
          body_font?: string | null
          brand_mark_svg?: string | null
          component_styles_json?: Json
          component_styles_json_draft?: Json
          created_at?: string
          favicon_media_asset_id?: string | null
          favorite_icon?: string | null
          font_preset?: string | null
          heading_font?: string | null
          logo_dark_media_asset_id?: string | null
          logo_media_asset_id?: string | null
          neutral_color?: string | null
          og_image_media_asset_id?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          tenant_id: string
          theme_json?: Json
          theme_json_draft?: Json
          theme_preset_slug?: string | null
          theme_published_at?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          accent_color?: string | null
          body_font?: string | null
          brand_mark_svg?: string | null
          component_styles_json?: Json
          component_styles_json_draft?: Json
          created_at?: string
          favicon_media_asset_id?: string | null
          favorite_icon?: string | null
          font_preset?: string | null
          heading_font?: string | null
          logo_dark_media_asset_id?: string | null
          logo_media_asset_id?: string | null
          neutral_color?: string | null
          og_image_media_asset_id?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          tenant_id?: string
          theme_json?: Json
          theme_json_draft?: Json
          theme_preset_slug?: string | null
          theme_published_at?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agency_branding_favicon_media_asset_id_fkey"
            columns: ["favicon_media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_branding_logo_dark_media_asset_id_fkey"
            columns: ["logo_dark_media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_branding_logo_media_asset_id_fkey"
            columns: ["logo_media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_branding_og_image_media_asset_id_fkey"
            columns: ["og_image_media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_branding_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_branding_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_branding_revisions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          snapshot: Json
          tenant_id: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          snapshot: Json
          tenant_id: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          snapshot?: Json
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agency_branding_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_branding_revisions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_business_identity: {
        Row: {
          address_city: string | null
          address_country: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          default_locale: string
          footer_tagline: string | null
          legal_name: string | null
          primary_cta_href: string | null
          primary_cta_label: string | null
          public_name: string
          seo_default_description: string | null
          seo_default_share_image_media_asset_id: string | null
          seo_default_title: string | null
          service_area: string | null
          show_language_switcher: boolean
          social_facebook: string | null
          social_instagram: string | null
          social_linkedin: string | null
          social_tiktok: string | null
          social_x: string | null
          social_youtube: string | null
          supported_locales: string[]
          tagline: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
          version: number
          whatsapp: string | null
        }
        Insert: {
          address_city?: string | null
          address_country?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          default_locale?: string
          footer_tagline?: string | null
          legal_name?: string | null
          primary_cta_href?: string | null
          primary_cta_label?: string | null
          public_name: string
          seo_default_description?: string | null
          seo_default_share_image_media_asset_id?: string | null
          seo_default_title?: string | null
          service_area?: string | null
          show_language_switcher?: boolean
          social_facebook?: string | null
          social_instagram?: string | null
          social_linkedin?: string | null
          social_tiktok?: string | null
          social_x?: string | null
          social_youtube?: string | null
          supported_locales?: string[]
          tagline?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          whatsapp?: string | null
        }
        Update: {
          address_city?: string | null
          address_country?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          default_locale?: string
          footer_tagline?: string | null
          legal_name?: string | null
          primary_cta_href?: string | null
          primary_cta_label?: string | null
          public_name?: string
          seo_default_description?: string | null
          seo_default_share_image_media_asset_id?: string | null
          seo_default_title?: string | null
          service_area?: string | null
          show_language_switcher?: boolean
          social_facebook?: string | null
          social_instagram?: string | null
          social_linkedin?: string | null
          social_tiktok?: string | null
          social_x?: string | null
          social_youtube?: string | null
          supported_locales?: string[]
          tagline?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agency_business_identity_seo_default_share_image_media_ass_fkey"
            columns: ["seo_default_share_image_media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_business_identity_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_business_identity_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_business_identity_revisions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          snapshot: Json
          tenant_id: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          snapshot: Json
          tenant_id: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          snapshot?: Json
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agency_business_identity_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_business_identity_revisions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_client_relationships: {
        Row: {
          added_at: string
          added_by: string | null
          client_profile_id: string
          created_at: string
          first_inquiry_id: string | null
          id: string
          last_interaction_at: string | null
          local_tags: string[]
          origin_domain: string | null
          private_notes: string | null
          source_type: string
          source_workspace_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          client_profile_id: string
          created_at?: string
          first_inquiry_id?: string | null
          id?: string
          last_interaction_at?: string | null
          local_tags?: string[]
          origin_domain?: string | null
          private_notes?: string | null
          source_type?: string
          source_workspace_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          client_profile_id?: string
          created_at?: string
          first_inquiry_id?: string | null
          id?: string
          last_interaction_at?: string | null
          local_tags?: string[]
          origin_domain?: string | null
          private_notes?: string | null
          source_type?: string
          source_workspace_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_client_relationships_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_client_relationships_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_client_relationships_first_inquiry_id_fkey"
            columns: ["first_inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_client_relationships_source_workspace_id_fkey"
            columns: ["source_workspace_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_client_relationships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_domains: {
        Row: {
          created_at: string
          failure_reason: string | null
          hostname: string
          id: string
          is_primary: boolean
          kind: string
          last_health_check_at: string | null
          ssl_provisioned_at: string | null
          status: string
          tenant_id: string | null
          tenant_slug: string | null
          updated_at: string
          verification_token: string | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          failure_reason?: string | null
          hostname: string
          id?: string
          is_primary?: boolean
          kind: string
          last_health_check_at?: string | null
          ssl_provisioned_at?: string | null
          status?: string
          tenant_id?: string | null
          tenant_slug?: string | null
          updated_at?: string
          verification_token?: string | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          failure_reason?: string | null
          hostname?: string
          id?: string
          is_primary?: boolean
          kind?: string
          last_health_check_at?: string | null
          ssl_provisioned_at?: string | null
          status?: string
          tenant_id?: string | null
          tenant_slug?: string | null
          updated_at?: string
          verification_token?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agency_domains_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_entitlements: {
        Row: {
          advanced_analytics: boolean
          ai_enabled: boolean
          created_at: string
          custom_css_allowed: boolean
          element_library_override: boolean | null
          hub_participation_allowed: boolean
          max_active_roster_size: number
          max_custom_fields: number
          max_domains: number
          max_locales: number
          max_staff_count: number
          plan_effective_from: string
          plan_key: string
          require_profile_change_review: boolean
          reviews_enabled: boolean
          support_tier: string
          tenant_id: string
          trial_ends_at: string | null
          updated_at: string
          white_label_email: boolean
        }
        Insert: {
          advanced_analytics?: boolean
          ai_enabled?: boolean
          created_at?: string
          custom_css_allowed?: boolean
          element_library_override?: boolean | null
          hub_participation_allowed?: boolean
          max_active_roster_size?: number
          max_custom_fields?: number
          max_domains?: number
          max_locales?: number
          max_staff_count?: number
          plan_effective_from?: string
          plan_key?: string
          require_profile_change_review?: boolean
          reviews_enabled?: boolean
          support_tier?: string
          tenant_id: string
          trial_ends_at?: string | null
          updated_at?: string
          white_label_email?: boolean
        }
        Update: {
          advanced_analytics?: boolean
          ai_enabled?: boolean
          created_at?: string
          custom_css_allowed?: boolean
          element_library_override?: boolean | null
          hub_participation_allowed?: boolean
          max_active_roster_size?: number
          max_custom_fields?: number
          max_domains?: number
          max_locales?: number
          max_staff_count?: number
          plan_effective_from?: string
          plan_key?: string
          require_profile_change_review?: boolean
          reviews_enabled?: boolean
          support_tier?: string
          tenant_id?: string
          trial_ends_at?: string | null
          updated_at?: string
          white_label_email?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "agency_entitlements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_inquiry_coordinators: {
        Row: {
          added_by_user_id: string | null
          created_at: string
          id: string
          talent_profile_id: string
          tenant_id: string
        }
        Insert: {
          added_by_user_id?: string | null
          created_at?: string
          id?: string
          talent_profile_id: string
          tenant_id: string
        }
        Update: {
          added_by_user_id?: string | null
          created_at?: string
          id?: string
          talent_profile_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_inquiry_coordinators_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_inquiry_coordinators_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_inquiry_coordinators_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_memberships: {
        Row: {
          accepted_at: string | null
          created_at: string
          id: string
          invite_expires_at: string | null
          invited_at: string | null
          invited_by: string | null
          profile_id: string
          removed_at: string | null
          removed_by: string | null
          role: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invite_expires_at?: string | null
          invited_at?: string | null
          invited_by?: string | null
          profile_id: string
          removed_at?: string | null
          removed_by?: string | null
          role: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invite_expires_at?: string | null
          invited_at?: string | null
          invited_by?: string | null
          profile_id?: string
          removed_at?: string | null
          removed_by?: string | null
          role?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_memberships_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_memberships_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_talent_media: {
        Row: {
          agency_media_id: string
          caption: string | null
          created_at: string
          created_by_user_id: string | null
          display_order: number
          id: string
          is_visible_on_agency_site: boolean
          master_media_id: string | null
          talent_profile_id: string
          tenant_id: string
        }
        Insert: {
          agency_media_id: string
          caption?: string | null
          created_at?: string
          created_by_user_id?: string | null
          display_order?: number
          id?: string
          is_visible_on_agency_site?: boolean
          master_media_id?: string | null
          talent_profile_id: string
          tenant_id: string
        }
        Update: {
          agency_media_id?: string
          caption?: string | null
          created_at?: string
          created_by_user_id?: string | null
          display_order?: number
          id?: string
          is_visible_on_agency_site?: boolean
          master_media_id?: string | null
          talent_profile_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_talent_media_agency_media_id_fkey"
            columns: ["agency_media_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_talent_media_master_media_id_fkey"
            columns: ["master_media_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_talent_media_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_talent_media_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_talent_media_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_talent_overlays: {
        Row: {
          availability_notes: string | null
          booking_notes: string | null
          cover_media_asset_id: string | null
          created_at: string
          display_headline: string | null
          id: string
          internal_score: number | null
          local_bio: string | null
          local_tags: string[]
          metadata: Json
          portfolio_media_ids: string[]
          pricing_notes: string | null
          sort_override: number | null
          talent_profile_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          availability_notes?: string | null
          booking_notes?: string | null
          cover_media_asset_id?: string | null
          created_at?: string
          display_headline?: string | null
          id?: string
          internal_score?: number | null
          local_bio?: string | null
          local_tags?: string[]
          metadata?: Json
          portfolio_media_ids?: string[]
          pricing_notes?: string | null
          sort_override?: number | null
          talent_profile_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          availability_notes?: string | null
          booking_notes?: string | null
          cover_media_asset_id?: string | null
          created_at?: string
          display_headline?: string | null
          id?: string
          internal_score?: number | null
          local_bio?: string | null
          local_tags?: string[]
          metadata?: Json
          portfolio_media_ids?: string[]
          pricing_notes?: string | null
          sort_override?: number | null
          talent_profile_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_talent_overlays_cover_media_asset_id_fkey"
            columns: ["cover_media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_talent_overlays_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_talent_overlays_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_talent_overlays_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_talent_roster: {
        Row: {
          added_at: string
          added_by: string | null
          agency_visibility: string
          archived_for_downgrade_at: string | null
          archived_for_downgrade_by: string | null
          archived_for_downgrade_event: string | null
          created_at: string
          exclusivity_auto_assigned_at: string | null
          exclusivity_confirmed_at: string | null
          exclusivity_declined_at: string | null
          exclusivity_status: Database["public"]["Enums"]["exclusivity_status"]
          feature_in_directory: boolean
          hub_visibility_status: string
          id: string
          is_primary: boolean
          origin_domain: string | null
          removed_at: string | null
          removed_by: string | null
          source_type: string
          source_workspace_id: string | null
          status: string
          talent_profile_id: string
          talent_site_hidden: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          agency_visibility?: string
          archived_for_downgrade_at?: string | null
          archived_for_downgrade_by?: string | null
          archived_for_downgrade_event?: string | null
          created_at?: string
          exclusivity_auto_assigned_at?: string | null
          exclusivity_confirmed_at?: string | null
          exclusivity_declined_at?: string | null
          exclusivity_status?: Database["public"]["Enums"]["exclusivity_status"]
          feature_in_directory?: boolean
          hub_visibility_status?: string
          id?: string
          is_primary?: boolean
          origin_domain?: string | null
          removed_at?: string | null
          removed_by?: string | null
          source_type: string
          source_workspace_id?: string | null
          status?: string
          talent_profile_id: string
          talent_site_hidden?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          agency_visibility?: string
          archived_for_downgrade_at?: string | null
          archived_for_downgrade_by?: string | null
          archived_for_downgrade_event?: string | null
          created_at?: string
          exclusivity_auto_assigned_at?: string | null
          exclusivity_confirmed_at?: string | null
          exclusivity_declined_at?: string | null
          exclusivity_status?: Database["public"]["Enums"]["exclusivity_status"]
          feature_in_directory?: boolean
          hub_visibility_status?: string
          id?: string
          is_primary?: boolean
          origin_domain?: string | null
          removed_at?: string | null
          removed_by?: string | null
          source_type?: string
          source_workspace_id?: string | null
          status?: string
          talent_profile_id?: string
          talent_site_hidden?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_talent_roster_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_talent_roster_archived_for_downgrade_by_fkey"
            columns: ["archived_for_downgrade_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_talent_roster_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_talent_roster_source_workspace_id_fkey"
            columns: ["source_workspace_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_talent_roster_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_talent_roster_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_talent_roster_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_talent_skill_overrides: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          custom_label: string | null
          display_order_override: number | null
          id: string
          is_featured_for_agency: boolean
          is_visible_on_agency_site: boolean
          notes: string | null
          talent_profile_id: string
          taxonomy_term_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          custom_label?: string | null
          display_order_override?: number | null
          id?: string
          is_featured_for_agency?: boolean
          is_visible_on_agency_site?: boolean
          notes?: string | null
          talent_profile_id: string
          taxonomy_term_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          custom_label?: string | null
          display_order_override?: number | null
          id?: string
          is_featured_for_agency?: boolean
          is_visible_on_agency_site?: boolean
          notes?: string | null
          talent_profile_id?: string
          taxonomy_term_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_talent_skill_overrides_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_talent_skill_overrides_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_talent_skill_overrides_taxonomy_term_id_fkey"
            columns: ["taxonomy_term_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_talent_skill_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_taxonomy_settings: {
        Row: {
          allow_as_primary: boolean
          allow_as_secondary: boolean
          created_at: string
          created_by_user_id: string | null
          custom_label_i18n: Json
          display_order: number
          helper_text: string | null
          id: string
          is_enabled: boolean
          requires_approval: boolean
          show_in_directory: boolean
          show_in_registration: boolean
          taxonomy_term_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          allow_as_primary?: boolean
          allow_as_secondary?: boolean
          created_at?: string
          created_by_user_id?: string | null
          custom_label_i18n?: Json
          display_order?: number
          helper_text?: string | null
          id?: string
          is_enabled?: boolean
          requires_approval?: boolean
          show_in_directory?: boolean
          show_in_registration?: boolean
          taxonomy_term_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          allow_as_primary?: boolean
          allow_as_secondary?: boolean
          created_at?: string
          created_by_user_id?: string | null
          custom_label_i18n?: Json
          display_order?: number
          helper_text?: string | null
          id?: string
          is_enabled?: boolean
          requires_approval?: boolean
          show_in_directory?: boolean
          show_in_registration?: boolean
          taxonomy_term_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_taxonomy_settings_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_taxonomy_settings_taxonomy_term_id_fkey"
            columns: ["taxonomy_term_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_taxonomy_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_taxonomy_terms: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name_en: string
          name_es: string | null
          parent_term_id: string | null
          search_synonyms: string[]
          slug: string
          sort_order: number
          tenant_id: string
          term_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name_en: string
          name_es?: string | null
          parent_term_id?: string | null
          search_synonyms?: string[]
          slug: string
          sort_order?: number
          tenant_id: string
          term_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name_en?: string
          name_es?: string | null
          parent_term_id?: string | null
          search_synonyms?: string[]
          slug?: string
          sort_order?: number
          tenant_id?: string
          term_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_taxonomy_terms_parent_term_id_fkey"
            columns: ["parent_term_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_taxonomy_terms_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_usage_counters: {
        Row: {
          counter_key: string
          counter_value: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          counter_key: string
          counter_value?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          counter_key?: string
          counter_value?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_usage_counters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_provider_audit: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          tenant_id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_provider_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_provider_instances: {
        Row: {
          created_at: string
          credential_masked_hint: string | null
          credential_source: Database["public"]["Enums"]["ai_credential_mode"]
          credential_ui_state: Database["public"]["Enums"]["ai_credential_ui_state"]
          disabled: boolean
          id: string
          is_default: boolean
          kind: Database["public"]["Enums"]["ai_provider_registry_kind"]
          label: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credential_masked_hint?: string | null
          credential_source?: Database["public"]["Enums"]["ai_credential_mode"]
          credential_ui_state?: Database["public"]["Enums"]["ai_credential_ui_state"]
          disabled?: boolean
          id?: string
          is_default?: boolean
          kind: Database["public"]["Enums"]["ai_provider_registry_kind"]
          label?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credential_masked_hint?: string | null
          credential_source?: Database["public"]["Enums"]["ai_credential_mode"]
          credential_ui_state?: Database["public"]["Enums"]["ai_credential_ui_state"]
          disabled?: boolean
          id?: string
          is_default?: boolean
          kind?: Database["public"]["Enums"]["ai_provider_registry_kind"]
          label?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_provider_secrets: {
        Row: {
          ciphertext: string
          created_at: string
          id: string
          key_version: number
          provider_instance_id: string
          updated_at: string
        }
        Insert: {
          ciphertext: string
          created_at?: string
          id?: string
          key_version?: number
          provider_instance_id: string
          updated_at?: string
        }
        Update: {
          ciphertext?: string
          created_at?: string
          id?: string
          key_version?: number
          provider_instance_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_provider_secrets_provider_instance_id_fkey"
            columns: ["provider_instance_id"]
            isOneToOne: true
            referencedRelation: "ai_provider_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_search_logs: {
        Row: {
          created_at: string | null
          height_max_cm: number | null
          height_min_cm: number | null
          id: string
          locale: string | null
          location_slug: string | null
          normalized_summary: string | null
          raw_query: string | null
          taxonomy_term_ids: string[] | null
          tenant_id: string
          used_interpreter: boolean | null
        }
        Insert: {
          created_at?: string | null
          height_max_cm?: number | null
          height_min_cm?: number | null
          id?: string
          locale?: string | null
          location_slug?: string | null
          normalized_summary?: string | null
          raw_query?: string | null
          taxonomy_term_ids?: string[] | null
          tenant_id: string
          used_interpreter?: boolean | null
        }
        Update: {
          created_at?: string | null
          height_max_cm?: number | null
          height_min_cm?: number | null
          id?: string
          locale?: string | null
          location_slug?: string | null
          normalized_summary?: string | null
          raw_query?: string | null
          taxonomy_term_ids?: string[] | null
          tenant_id?: string
          used_interpreter?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_search_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_tenant_controls: {
        Row: {
          credential_mode: Database["public"]["Enums"]["ai_credential_mode"]
          hard_stop_on_cap: boolean
          max_requests_per_minute: number | null
          max_requests_per_month: number | null
          monthly_spend_cap_cents: number | null
          provider_unavailable_behavior: Database["public"]["Enums"]["ai_provider_unavailable_behavior"]
          tenant_id: string
          updated_at: string
          warn_threshold_percent: number | null
        }
        Insert: {
          credential_mode?: Database["public"]["Enums"]["ai_credential_mode"]
          hard_stop_on_cap?: boolean
          max_requests_per_minute?: number | null
          max_requests_per_month?: number | null
          monthly_spend_cap_cents?: number | null
          provider_unavailable_behavior?: Database["public"]["Enums"]["ai_provider_unavailable_behavior"]
          tenant_id?: string
          updated_at?: string
          warn_threshold_percent?: number | null
        }
        Update: {
          credential_mode?: Database["public"]["Enums"]["ai_credential_mode"]
          hard_stop_on_cap?: boolean
          max_requests_per_minute?: number | null
          max_requests_per_month?: number | null
          monthly_spend_cap_cents?: number | null
          provider_unavailable_behavior?: Database["public"]["Enums"]["ai_provider_unavailable_behavior"]
          tenant_id?: string
          updated_at?: string
          warn_threshold_percent?: number | null
        }
        Relationships: []
      }
      ai_usage_monthly: {
        Row: {
          month_key: string
          request_count: number
          spend_cents: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          month_key: string
          request_count?: number
          spend_cents?: number
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          month_key?: string
          request_count?: number
          spend_cents?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          created_at: string
          id: string
          locale: string | null
          name: string
          path: string | null
          payload: Json
          session_id: string | null
          talent_id: string | null
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          locale?: string | null
          name: string
          path?: string | null
          payload?: Json
          session_id?: string | null
          talent_id?: string | null
          tenant_id?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          locale?: string | null
          name?: string
          path?: string | null
          payload?: Json
          session_id?: string | null
          talent_id?: string | null
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_locales: {
        Row: {
          archived_at: string | null
          code: string
          created_at: string
          enabled_admin: boolean
          enabled_public: boolean
          fallback_locale: string | null
          is_default: boolean
          label_en: string
          label_native: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          code: string
          created_at?: string
          enabled_admin?: boolean
          enabled_public?: boolean
          fallback_locale?: string | null
          is_default?: boolean
          label_en: string
          label_native: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          code?: string
          created_at?: string
          enabled_admin?: boolean
          enabled_public?: boolean
          fallback_locale?: string | null
          is_default?: boolean
          label_en?: string
          label_native?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_locales_fallback_locale_fkey"
            columns: ["fallback_locale"]
            isOneToOne: false
            referencedRelation: "app_locales"
            referencedColumns: ["code"]
          },
        ]
      }
      booking_activity_log: {
        Row: {
          actor_user_id: string | null
          booking_id: string
          created_at: string
          event_type: string
          id: string
          payload: Json
          tenant_id: string
        }
        Insert: {
          actor_user_id?: string | null
          booking_id: string
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          tenant_id: string
        }
        Update: {
          actor_user_id?: string | null
          booking_id?: string
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_activity_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_activity_log_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "agency_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_activity_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_commission_snapshot: {
        Row: {
          booking_id: string
          channel_referral_cents: number
          channel_referral_party_id: string | null
          client_surcharge_cents: number
          created_at: string
          currency_code: string
          gross_cents: number
          gross_charged_cents: number
          off_platform_reason: string | null
          owning_party_id: string
          owning_party_type: string
          participant_id: string
          payment_method: string
          platform_fee_cents: number
          platform_take_bps: number
          platform_take_floor_cents: number
          resolved_from: string
          seller_deduction_cents: number
          seller_shortfall_cents: number
          talent_net_cents: number
          workspace_fee_cents: number
        }
        Insert: {
          booking_id: string
          channel_referral_cents?: number
          channel_referral_party_id?: string | null
          client_surcharge_cents?: number
          created_at?: string
          currency_code: string
          gross_cents: number
          gross_charged_cents?: number
          off_platform_reason?: string | null
          owning_party_id: string
          owning_party_type: string
          participant_id: string
          payment_method: string
          platform_fee_cents: number
          platform_take_bps: number
          platform_take_floor_cents?: number
          resolved_from: string
          seller_deduction_cents?: number
          seller_shortfall_cents?: number
          talent_net_cents: number
          workspace_fee_cents: number
        }
        Update: {
          booking_id?: string
          channel_referral_cents?: number
          channel_referral_party_id?: string | null
          client_surcharge_cents?: number
          created_at?: string
          currency_code?: string
          gross_cents?: number
          gross_charged_cents?: number
          off_platform_reason?: string | null
          owning_party_id?: string
          owning_party_type?: string
          participant_id?: string
          payment_method?: string
          platform_fee_cents?: number
          platform_take_bps?: number
          platform_take_floor_cents?: number
          resolved_from?: string
          seller_deduction_cents?: number
          seller_shortfall_cents?: number
          talent_net_cents?: number
          workspace_fee_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_commission_snapshot_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "agency_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_commission_snapshot_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "inquiry_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_fulfillment: {
        Row: {
          booking_id: string
          carrier: string | null
          created_at: string
          delivered_at: string | null
          digital_asset_id: string | null
          fulfillment_type: string
          id: string
          lead_time_days: number | null
          notes: string | null
          ship_to: Json | null
          shipped_at: string | null
          status: string
          tenant_id: string | null
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          booking_id: string
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          digital_asset_id?: string | null
          fulfillment_type?: string
          id?: string
          lead_time_days?: number | null
          notes?: string | null
          ship_to?: Json | null
          shipped_at?: string | null
          status?: string
          tenant_id?: string | null
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          booking_id?: string
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          digital_asset_id?: string | null
          fulfillment_type?: string
          id?: string
          lead_time_days?: number | null
          notes?: string | null
          ship_to?: Json | null
          shipped_at?: string | null
          status?: string
          tenant_id?: string | null
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_fulfillment_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "agency_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_payouts: {
        Row: {
          amount_cents: number
          attempts: number
          booking_id: string
          created_at: string
          currency: string
          destination_account_id: string | null
          id: string
          last_error: string | null
          owning_party_id: string | null
          owning_party_type: string | null
          participant_id: string
          party: string
          payout_rail: string | null
          status: string
          stripe_transfer_id: string | null
          talent_profile_id: string | null
          tenant_id: string | null
          transaction_id: string | null
          transferred_at: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          attempts?: number
          booking_id: string
          created_at?: string
          currency: string
          destination_account_id?: string | null
          id?: string
          last_error?: string | null
          owning_party_id?: string | null
          owning_party_type?: string | null
          participant_id: string
          party: string
          payout_rail?: string | null
          status: string
          stripe_transfer_id?: string | null
          talent_profile_id?: string | null
          tenant_id?: string | null
          transaction_id?: string | null
          transferred_at?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          attempts?: number
          booking_id?: string
          created_at?: string
          currency?: string
          destination_account_id?: string | null
          id?: string
          last_error?: string | null
          owning_party_id?: string | null
          owning_party_type?: string | null
          participant_id?: string
          party?: string
          payout_rail?: string | null
          status?: string
          stripe_transfer_id?: string | null
          talent_profile_id?: string | null
          tenant_id?: string | null
          transaction_id?: string | null
          transferred_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      booking_talent: {
        Row: {
          booking_id: string
          client_charge_rate: number
          client_charge_total: number
          created_at: string
          gross_profit: number
          id: string
          notes: string | null
          pricing_unit: Database["public"]["Enums"]["pricing_unit"]
          profile_code_snapshot: string | null
          role_label: string | null
          sort_order: number
          talent_cost_rate: number
          talent_cost_total: number
          talent_name_snapshot: string | null
          talent_profile_id: string | null
          tenant_id: string
          units: number
          updated_at: string
        }
        Insert: {
          booking_id: string
          client_charge_rate?: number
          client_charge_total?: number
          created_at?: string
          gross_profit?: number
          id?: string
          notes?: string | null
          pricing_unit?: Database["public"]["Enums"]["pricing_unit"]
          profile_code_snapshot?: string | null
          role_label?: string | null
          sort_order?: number
          talent_cost_rate?: number
          talent_cost_total?: number
          talent_name_snapshot?: string | null
          talent_profile_id?: string | null
          tenant_id: string
          units?: number
          updated_at?: string
        }
        Update: {
          booking_id?: string
          client_charge_rate?: number
          client_charge_total?: number
          created_at?: string
          gross_profit?: number
          id?: string
          notes?: string | null
          pricing_unit?: Database["public"]["Enums"]["pricing_unit"]
          profile_code_snapshot?: string | null
          role_label?: string | null
          sort_order?: number
          talent_cost_rate?: number
          talent_cost_total?: number
          talent_name_snapshot?: string | null
          talent_profile_id?: string | null
          tenant_id?: string
          units?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_talent_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "agency_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_talent_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_talent_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_talent_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_transactions: {
        Row: {
          booking_id: string
          checkout_type: string
          created_at: string
          created_by_profile_id: string | null
          currency: string
          disputed_at: string | null
          failed_at: string | null
          failure_reason: string | null
          gross_amount_cents: number
          id: string
          net_amount_cents: number
          paid_at: string | null
          payer_email: string | null
          payer_user_id: string | null
          payout_completed_at: string | null
          payout_initiated_at: string | null
          payout_receiver_display_name: string | null
          payout_receiver_id: string | null
          payout_receiver_kind: string | null
          platform_fee_basis_points: number
          platform_fee_cents: number
          provider: string
          provider_metadata: Json
          provider_reference: string | null
          provider_refund_id: string | null
          refund_of_transaction_id: string | null
          refunded_at: string | null
          requested_at: string | null
          source_inquiry_id: string | null
          source_tenant_id: string
          status: string
          updated_at: string
        }
        Insert: {
          booking_id: string
          checkout_type?: string
          created_at?: string
          created_by_profile_id?: string | null
          currency?: string
          disputed_at?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          gross_amount_cents: number
          id?: string
          net_amount_cents: number
          paid_at?: string | null
          payer_email?: string | null
          payer_user_id?: string | null
          payout_completed_at?: string | null
          payout_initiated_at?: string | null
          payout_receiver_display_name?: string | null
          payout_receiver_id?: string | null
          payout_receiver_kind?: string | null
          platform_fee_basis_points: number
          platform_fee_cents: number
          provider?: string
          provider_metadata?: Json
          provider_reference?: string | null
          provider_refund_id?: string | null
          refund_of_transaction_id?: string | null
          refunded_at?: string | null
          requested_at?: string | null
          source_inquiry_id?: string | null
          source_tenant_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          booking_id?: string
          checkout_type?: string
          created_at?: string
          created_by_profile_id?: string | null
          currency?: string
          disputed_at?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          gross_amount_cents?: number
          id?: string
          net_amount_cents?: number
          paid_at?: string | null
          payer_email?: string | null
          payer_user_id?: string | null
          payout_completed_at?: string | null
          payout_initiated_at?: string | null
          payout_receiver_display_name?: string | null
          payout_receiver_id?: string | null
          payout_receiver_kind?: string | null
          platform_fee_basis_points?: number
          platform_fee_cents?: number
          provider?: string
          provider_metadata?: Json
          provider_reference?: string | null
          provider_refund_id?: string | null
          refund_of_transaction_id?: string | null
          refunded_at?: string | null
          requested_at?: string | null
          source_inquiry_id?: string | null
          source_tenant_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "agency_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_transactions_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_transactions_payer_user_id_fkey"
            columns: ["payer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_transactions_payout_receiver_id_fkey"
            columns: ["payout_receiver_id"]
            isOneToOne: false
            referencedRelation: "payout_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_transactions_refund_of_transaction_id_fkey"
            columns: ["refund_of_transaction_id"]
            isOneToOne: false
            referencedRelation: "booking_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_transactions_source_inquiry_id_fkey"
            columns: ["source_inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_transactions_source_tenant_id_fkey"
            columns: ["source_tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      builder_catalog_overlay: {
        Row: {
          availability_override: string | null
          category_override: string | null
          data_source_defaults: Json | null
          default_props: Json | null
          default_variant: string | null
          icon_override: string | null
          item_ref: string
          lab_enabled: boolean
          label_override: string | null
          locked_props: string[]
          required_plan_override: string | null
          source: string
          talent_enabled: boolean
          talent_profile_enabled: boolean
          talent_shell_enabled: boolean
          updated_at: string
          updated_by: string | null
          workspace_enabled: boolean
          workspace_page_enabled: boolean
          workspace_shell_enabled: boolean
        }
        Insert: {
          availability_override?: string | null
          category_override?: string | null
          data_source_defaults?: Json | null
          default_props?: Json | null
          default_variant?: string | null
          icon_override?: string | null
          item_ref: string
          lab_enabled?: boolean
          label_override?: string | null
          locked_props?: string[]
          required_plan_override?: string | null
          source: string
          talent_enabled?: boolean
          talent_profile_enabled?: boolean
          talent_shell_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          workspace_enabled?: boolean
          workspace_page_enabled?: boolean
          workspace_shell_enabled?: boolean
        }
        Update: {
          availability_override?: string | null
          category_override?: string | null
          data_source_defaults?: Json | null
          default_props?: Json | null
          default_variant?: string | null
          icon_override?: string | null
          item_ref?: string
          lab_enabled?: boolean
          label_override?: string | null
          locked_props?: string[]
          required_plan_override?: string | null
          source?: string
          talent_enabled?: boolean
          talent_profile_enabled?: boolean
          talent_shell_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          workspace_enabled?: boolean
          workspace_page_enabled?: boolean
          workspace_shell_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "builder_catalog_overlay_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      builder_catalog_structure: {
        Row: {
          category_override: string | null
          created: boolean
          hidden: boolean
          icon_override: string | null
          kind: string
          label_override: string | null
          parent_tab: string | null
          ref: string
          sort_order: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category_override?: string | null
          created?: boolean
          hidden?: boolean
          icon_override?: string | null
          kind: string
          label_override?: string | null
          parent_tab?: string | null
          ref: string
          sort_order?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category_override?: string | null
          created?: boolean
          hidden?: boolean
          icon_override?: string | null
          kind?: string
          label_override?: string | null
          parent_tab?: string | null
          ref?: string
          sort_order?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      builder_catalog_version: {
        Row: {
          id: number
          updated_at: string
          version: number
        }
        Insert: {
          id?: number
          updated_at?: string
          version?: number
        }
        Update: {
          id?: number
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      builder_lab_audit: {
        Row: {
          action: string
          actor: string | null
          actor_label: string | null
          after: Json | null
          before: Json | null
          created_at: string
          id: string
          item_ref: string | null
          template_id: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          actor_label?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          item_ref?: string | null
          template_id?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          actor_label?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          item_ref?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "builder_lab_audit_actor_fkey"
            columns: ["actor"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      builder_template_revisions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          snapshot: Json
          status: Database["public"]["Enums"]["builder_template_status"]
          template_id: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          snapshot: Json
          status: Database["public"]["Enums"]["builder_template_status"]
          template_id: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          snapshot?: Json
          status?: Database["public"]["Enums"]["builder_template_status"]
          template_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "builder_template_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builder_template_revisions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "builder_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      builder_template_usage: {
        Row: {
          id: string
          inserted_at: string
          page_ref: string | null
          surface: string | null
          template_id: string
          tenant_id: string | null
        }
        Insert: {
          id?: string
          inserted_at?: string
          page_ref?: string | null
          surface?: string | null
          template_id: string
          tenant_id?: string | null
        }
        Update: {
          id?: string
          inserted_at?: string
          page_ref?: string | null
          surface?: string | null
          template_id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "builder_template_usage_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "builder_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      builder_templates: {
        Row: {
          builder_tree: Json
          category: string
          changelog: string | null
          created_at: string
          created_by: string | null
          data_binding_requirements: Json
          data_source_defaults: Json | null
          default_props: Json | null
          description: string | null
          gallery_tab: string
          hero_asset_id: string | null
          id: string
          kind: Database["public"]["Enums"]["builder_template_kind"]
          locked_props: string[]
          published_at: string | null
          required_plan: string
          required_talent_tier: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          rollout_percentage: number
          rollout_ramp_at: string | null
          rollout_ramp_to: number | null
          schema_version: number
          slug: string
          source_tenant_id: string | null
          status: Database["public"]["Enums"]["builder_template_status"]
          status_expire_at: string | null
          submitted_at: string | null
          submitted_by: string | null
          tags: string[]
          target_context: Database["public"]["Enums"]["builder_template_target"]
          tenant_allowlist: string[]
          tenant_denylist: string[]
          theme_tokens: Json | null
          thumbnail_asset_id: string | null
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          builder_tree?: Json
          category: string
          changelog?: string | null
          created_at?: string
          created_by?: string | null
          data_binding_requirements?: Json
          data_source_defaults?: Json | null
          default_props?: Json | null
          description?: string | null
          gallery_tab: string
          hero_asset_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["builder_template_kind"]
          locked_props?: string[]
          published_at?: string | null
          required_plan?: string
          required_talent_tier?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rollout_percentage?: number
          rollout_ramp_at?: string | null
          rollout_ramp_to?: number | null
          schema_version?: number
          slug: string
          source_tenant_id?: string | null
          status?: Database["public"]["Enums"]["builder_template_status"]
          status_expire_at?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          tags?: string[]
          target_context?: Database["public"]["Enums"]["builder_template_target"]
          tenant_allowlist?: string[]
          tenant_denylist?: string[]
          theme_tokens?: Json | null
          thumbnail_asset_id?: string | null
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          builder_tree?: Json
          category?: string
          changelog?: string | null
          created_at?: string
          created_by?: string | null
          data_binding_requirements?: Json
          data_source_defaults?: Json | null
          default_props?: Json | null
          description?: string | null
          gallery_tab?: string
          hero_asset_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["builder_template_kind"]
          locked_props?: string[]
          published_at?: string | null
          required_plan?: string
          required_talent_tier?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rollout_percentage?: number
          rollout_ramp_at?: string | null
          rollout_ramp_to?: number | null
          schema_version?: number
          slug?: string
          source_tenant_id?: string | null
          status?: Database["public"]["Enums"]["builder_template_status"]
          status_expire_at?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          tags?: string[]
          target_context?: Database["public"]["Enums"]["builder_template_target"]
          tenant_allowlist?: string[]
          tenant_denylist?: string[]
          theme_tokens?: Json | null
          thumbnail_asset_id?: string | null
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "builder_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builder_templates_hero_asset_id_fkey"
            columns: ["hero_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builder_templates_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builder_templates_source_tenant_id_fkey"
            columns: ["source_tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builder_templates_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builder_templates_thumbnail_asset_id_fkey"
            columns: ["thumbnail_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      client_account_contacts: {
        Row: {
          archived_at: string | null
          client_account_id: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_primary: boolean
          job_title: string | null
          notes: string | null
          phone: string | null
          profile_user_id: string | null
          tenant_id: string
          updated_at: string
          whatsapp_phone: string | null
        }
        Insert: {
          archived_at?: string | null
          client_account_id: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_primary?: boolean
          job_title?: string | null
          notes?: string | null
          phone?: string | null
          profile_user_id?: string | null
          tenant_id: string
          updated_at?: string
          whatsapp_phone?: string | null
        }
        Update: {
          archived_at?: string | null
          client_account_id?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_primary?: boolean
          job_title?: string | null
          notes?: string | null
          phone?: string | null
          profile_user_id?: string | null
          tenant_id?: string
          updated_at?: string
          whatsapp_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_account_contacts_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_account_contacts_profile_user_id_fkey"
            columns: ["profile_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_account_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      client_accounts: {
        Row: {
          account_type: Database["public"]["Enums"]["client_account_type"]
          account_type_detail: string | null
          address_notes: string | null
          archived_at: string | null
          billing_notes: string | null
          city: string | null
          country: string | null
          created_at: string
          google_place_id: string | null
          id: string
          internal_notes: string | null
          latitude: number | null
          location_id: string | null
          location_text: string | null
          longitude: number | null
          name: string
          primary_email: string | null
          primary_phone: string | null
          tenant_id: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["client_account_type"]
          account_type_detail?: string | null
          address_notes?: string | null
          archived_at?: string | null
          billing_notes?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          google_place_id?: string | null
          id?: string
          internal_notes?: string | null
          latitude?: number | null
          location_id?: string | null
          location_text?: string | null
          longitude?: number | null
          name: string
          primary_email?: string | null
          primary_phone?: string | null
          tenant_id: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          account_type?: Database["public"]["Enums"]["client_account_type"]
          account_type_detail?: string | null
          address_notes?: string | null
          archived_at?: string | null
          billing_notes?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          google_place_id?: string | null
          id?: string
          internal_notes?: string | null
          latitude?: number | null
          location_id?: string | null
          location_text?: string | null
          longitude?: number | null
          name?: string
          primary_email?: string | null
          primary_phone?: string | null
          tenant_id?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_accounts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      client_balance_ledger: {
        Row: {
          amount_cents: number
          created_at: string
          entry_type: string
          id: string
          note: string | null
          stripe_payment_intent_id: string | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          entry_type?: string
          id?: string
          note?: string | null
          stripe_payment_intent_id?: string | null
          tenant_id: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          entry_type?: string
          id?: string
          note?: string | null
          stripe_payment_intent_id?: string | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_balance_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      client_favorites: {
        Row: {
          added_at: string
          client_user_id: string
          talent_profile_id: string
        }
        Insert: {
          added_at?: string
          client_user_id: string
          talent_profile_id: string
        }
        Update: {
          added_at?: string
          client_user_id?: string
          talent_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_favorites_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_favorites_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_integration_secrets: {
        Row: {
          ciphertext: string
          created_at: string
          expires_at: string | null
          id: string
          last4: string | null
          provider_key: string
          secret_field: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ciphertext: string
          created_at?: string
          expires_at?: string | null
          id?: string
          last4?: string | null
          provider_key: string
          secret_field: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ciphertext?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          last4?: string | null
          provider_key?: string
          secret_field?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      client_integrations: {
        Row: {
          agency_visible: boolean
          auto_refresh_enabled: boolean
          connection_method: string
          consent_version: string
          created_at: string
          created_by_user_id: string | null
          id: string
          last_error: string | null
          last_sync_at: string | null
          last_verified_at: string | null
          metadata_cache: Json
          provider_account_id: string | null
          provider_account_label: string | null
          provider_key: string
          public_profile_enabled: boolean
          scopes: string[]
          settings_json: Json
          status: string
          talent_visible: boolean
          trust_signal_enabled: boolean
          updated_at: string
          updated_by_user_id: string | null
          user_id: string
        }
        Insert: {
          agency_visible?: boolean
          auto_refresh_enabled?: boolean
          connection_method?: string
          consent_version?: string
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          last_verified_at?: string | null
          metadata_cache?: Json
          provider_account_id?: string | null
          provider_account_label?: string | null
          provider_key: string
          public_profile_enabled?: boolean
          scopes?: string[]
          settings_json?: Json
          status?: string
          talent_visible?: boolean
          trust_signal_enabled?: boolean
          updated_at?: string
          updated_by_user_id?: string | null
          user_id: string
        }
        Update: {
          agency_visible?: boolean
          auto_refresh_enabled?: boolean
          connection_method?: string
          consent_version?: string
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          last_verified_at?: string | null
          metadata_cache?: Json
          provider_account_id?: string | null
          provider_account_label?: string | null
          provider_key?: string
          public_profile_enabled?: boolean
          scopes?: string[]
          settings_json?: Json
          status?: string
          talent_visible?: boolean
          trust_signal_enabled?: boolean
          updated_at?: string
          updated_by_user_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_integrations_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_integrations_updated_by_user_id_fkey"
            columns: ["updated_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_profiles: {
        Row: {
          company_name: string | null
          created_at: string
          id: string
          notes: string | null
          phone: string | null
          stripe_identity_session_id: string | null
          trust_tier: string
          updated_at: string
          user_id: string
          verification_status: string
          verified_at: string | null
          website_url: string | null
          whatsapp_phone: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          phone?: string | null
          stripe_identity_session_id?: string | null
          trust_tier?: string
          updated_at?: string
          user_id: string
          verification_status?: string
          verified_at?: string | null
          website_url?: string | null
          whatsapp_phone?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          phone?: string | null
          stripe_identity_session_id?: string | null
          trust_tier?: string
          updated_at?: string
          user_id?: string
          verification_status?: string
          verified_at?: string | null
          website_url?: string | null
          whatsapp_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_reviews: {
        Row: {
          author_talent_profile_id: string | null
          author_user_id: string
          body: string | null
          booking_id: string | null
          client_user_id: string
          created_at: string
          id: string
          published_at: string | null
          rating: number
          reported_at: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          author_talent_profile_id?: string | null
          author_user_id: string
          body?: string | null
          booking_id?: string | null
          client_user_id: string
          created_at?: string
          id?: string
          published_at?: string | null
          rating: number
          reported_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          author_talent_profile_id?: string | null
          author_user_id?: string
          body?: string | null
          booking_id?: string | null
          client_user_id?: string
          created_at?: string
          id?: string
          published_at?: string | null
          rating?: number
          reported_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_reviews_author_talent_profile_id_fkey"
            columns: ["author_talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_reviews_author_talent_profile_id_fkey"
            columns: ["author_talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_reviews_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "agency_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_reviews_client_user_id_fkey"
            columns: ["client_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      client_shortlist_items: {
        Row: {
          added_at: string
          position: number | null
          shortlist_id: string
          talent_profile_id: string
        }
        Insert: {
          added_at?: string
          position?: number | null
          shortlist_id: string
          talent_profile_id: string
        }
        Update: {
          added_at?: string
          position?: number | null
          shortlist_id?: string
          talent_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_shortlist_items_shortlist_id_fkey"
            columns: ["shortlist_id"]
            isOneToOne: false
            referencedRelation: "client_shortlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_shortlist_items_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_shortlist_items_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_shortlists: {
        Row: {
          client_user_id: string
          created_at: string
          event_date_hint: string | null
          id: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          client_user_id: string
          created_at?: string
          event_date_hint?: string | null
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          client_user_id?: string
          created_at?: string
          event_date_hint?: string | null
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      client_stripe_customers: {
        Row: {
          billing_email: string | null
          created_at: string
          stripe_customer_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_email?: string | null
          created_at?: string
          stripe_customer_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_email?: string | null
          created_at?: string
          stripe_customer_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      client_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          client_user_id: string
          created_at: string
          current_period_end: string | null
          id: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier: string
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          client_user_id: string
          created_at?: string
          current_period_end?: string | null
          id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          client_user_id?: string
          created_at?: string
          current_period_end?: string | null
          id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      client_trust_state: {
        Row: {
          created_at: string
          evaluated_at: string
          funded_balance_cents: number
          manual_override:
            | Database["public"]["Enums"]["client_trust_level"]
            | null
          tenant_id: string
          trust_level: Database["public"]["Enums"]["client_trust_level"]
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          evaluated_at?: string
          funded_balance_cents?: number
          manual_override?:
            | Database["public"]["Enums"]["client_trust_level"]
            | null
          tenant_id: string
          trust_level?: Database["public"]["Enums"]["client_trust_level"]
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          evaluated_at?: string
          funded_balance_cents?: number
          manual_override?:
            | Database["public"]["Enums"]["client_trust_level"]
            | null
          tenant_id?: string
          trust_level?: Database["public"]["Enums"]["client_trust_level"]
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_trust_state_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_ai_usage_log: {
        Row: {
          action: string
          actor_profile_id: string | null
          context_jsonb: Json | null
          created_at: string
          id: string
          input_tokens: number | null
          latency_ms: number | null
          model: string | null
          ok: boolean
          output_tokens: number | null
          provider: string
          tenant_id: string
        }
        Insert: {
          action: string
          actor_profile_id?: string | null
          context_jsonb?: Json | null
          created_at?: string
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string | null
          ok?: boolean
          output_tokens?: number | null
          provider: string
          tenant_id: string
        }
        Update: {
          action?: string
          actor_profile_id?: string | null
          context_jsonb?: Json | null
          created_at?: string
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string | null
          ok?: boolean
          output_tokens?: number | null
          provider?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cms_ai_usage_log_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_ai_usage_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_builder_components: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          root_kind: string
          subtree_jsonb: Json
          tenant_id: string
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          root_kind: string
          subtree_jsonb?: Json
          tenant_id: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          root_kind?: string
          subtree_jsonb?: Json
          tenant_id?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "cms_builder_components_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_builder_components_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_collection_items: {
        Row: {
          collection_id: string
          created_at: string
          data: Json
          id: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          data?: Json
          id?: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          data?: Json
          id?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cms_collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "cms_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_collection_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_collections: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          fields: Json
          id: string
          name: string
          slug: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          fields?: Json
          id?: string
          name: string
          slug: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          fields?: Json
          id?: string
          name?: string
          slug?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cms_collections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_collections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_collections_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_form_submissions: {
        Row: {
          archived_at: string | null
          contact_email: string | null
          contact_name: string | null
          created_at: string
          honeypot_tripped: boolean
          id: string
          ip_address: unknown
          payload_jsonb: Json
          read_at: string | null
          section_id: string
          source_url: string | null
          status: string
          tenant_id: string
          user_agent: string | null
        }
        Insert: {
          archived_at?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          honeypot_tripped?: boolean
          id?: string
          ip_address?: unknown
          payload_jsonb?: Json
          read_at?: string | null
          section_id: string
          source_url?: string | null
          status?: string
          tenant_id: string
          user_agent?: string | null
        }
        Update: {
          archived_at?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          honeypot_tripped?: boolean
          id?: string
          ip_address?: unknown
          payload_jsonb?: Json
          read_at?: string | null
          section_id?: string
          source_url?: string | null
          status?: string
          tenant_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cms_form_submissions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "cms_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_form_submissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_navigation_items: {
        Row: {
          created_at: string
          href: string
          id: string
          label: string
          locale: string
          parent_id: string | null
          pin_in_menu: boolean
          show_in_sticky_top_nav: boolean
          sort_order: number
          tenant_id: string
          updated_at: string
          version: number
          visible: boolean
          zone: string
        }
        Insert: {
          created_at?: string
          href: string
          id?: string
          label: string
          locale?: string
          parent_id?: string | null
          pin_in_menu?: boolean
          show_in_sticky_top_nav?: boolean
          sort_order?: number
          tenant_id: string
          updated_at?: string
          version?: number
          visible?: boolean
          zone: string
        }
        Update: {
          created_at?: string
          href?: string
          id?: string
          label?: string
          locale?: string
          parent_id?: string | null
          pin_in_menu?: boolean
          show_in_sticky_top_nav?: boolean
          sort_order?: number
          tenant_id?: string
          updated_at?: string
          version?: number
          visible?: boolean
          zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "cms_navigation_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "cms_navigation_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_navigation_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_navigation_menus: {
        Row: {
          created_at: string
          id: string
          locale: string
          published_at: string | null
          published_by: string | null
          tenant_id: string
          tree_json: Json
          updated_at: string
          version: number
          zone: string
        }
        Insert: {
          created_at?: string
          id?: string
          locale: string
          published_at?: string | null
          published_by?: string | null
          tenant_id: string
          tree_json?: Json
          updated_at?: string
          version?: number
          zone: string
        }
        Update: {
          created_at?: string
          id?: string
          locale?: string
          published_at?: string | null
          published_by?: string | null
          tenant_id?: string
          tree_json?: Json
          updated_at?: string
          version?: number
          zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "cms_navigation_menus_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_navigation_menus_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_navigation_revisions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          locale: string
          snapshot: Json
          tenant_id: string
          version: number
          zone: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          locale: string
          snapshot: Json
          tenant_id: string
          version: number
          zone: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          locale?: string
          snapshot?: Json
          tenant_id?: string
          version?: number
          zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "cms_navigation_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_navigation_revisions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_page_revisions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["cms_revision_kind"]
          page_id: string
          snapshot: Json
          template_schema_version: number
          tenant_id: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["cms_revision_kind"]
          page_id: string
          snapshot: Json
          template_schema_version?: number
          tenant_id: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["cms_revision_kind"]
          page_id?: string
          snapshot?: Json
          template_schema_version?: number
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "cms_page_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_page_revisions_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "cms_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_page_revisions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_page_sections: {
        Row: {
          created_at: string
          id: string
          is_draft: boolean
          page_id: string
          section_id: string
          slot_key: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_draft?: boolean
          page_id: string
          section_id: string
          slot_key: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_draft?: boolean
          page_id?: string
          section_id?: string
          slot_key?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cms_page_sections_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "cms_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_page_sections_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "cms_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_page_sections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_pages: {
        Row: {
          blocks: Json
          body: string
          canonical_url: string | null
          created_at: string
          created_by: string | null
          draft_seq: number | null
          edit_session_id: string | null
          hero: Json
          id: string
          include_in_sitemap: boolean
          is_freeform: boolean
          is_system_owned: boolean
          json_ld: Json | null
          locale: string
          meta_description: string | null
          meta_title: string | null
          noindex: boolean
          og_description: string | null
          og_image_media_asset_id: string | null
          og_image_url: string | null
          og_title: string | null
          published_at: string | null
          published_homepage_snapshot: Json | null
          published_page_snapshot: Json | null
          scheduled_by: string | null
          scheduled_publish_at: string | null
          scheduled_revision_id: string | null
          slug: string
          status: Database["public"]["Enums"]["cms_page_status"]
          style_classes: Json | null
          style_presets: Json | null
          system_template_key: string | null
          template_key: string
          template_schema_version: number
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          blocks?: Json
          body?: string
          canonical_url?: string | null
          created_at?: string
          created_by?: string | null
          draft_seq?: number | null
          edit_session_id?: string | null
          hero?: Json
          id?: string
          include_in_sitemap?: boolean
          is_freeform?: boolean
          is_system_owned?: boolean
          json_ld?: Json | null
          locale?: string
          meta_description?: string | null
          meta_title?: string | null
          noindex?: boolean
          og_description?: string | null
          og_image_media_asset_id?: string | null
          og_image_url?: string | null
          og_title?: string | null
          published_at?: string | null
          published_homepage_snapshot?: Json | null
          published_page_snapshot?: Json | null
          scheduled_by?: string | null
          scheduled_publish_at?: string | null
          scheduled_revision_id?: string | null
          slug: string
          status?: Database["public"]["Enums"]["cms_page_status"]
          style_classes?: Json | null
          style_presets?: Json | null
          system_template_key?: string | null
          template_key?: string
          template_schema_version?: number
          tenant_id: string
          title: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          blocks?: Json
          body?: string
          canonical_url?: string | null
          created_at?: string
          created_by?: string | null
          draft_seq?: number | null
          edit_session_id?: string | null
          hero?: Json
          id?: string
          include_in_sitemap?: boolean
          is_freeform?: boolean
          is_system_owned?: boolean
          json_ld?: Json | null
          locale?: string
          meta_description?: string | null
          meta_title?: string | null
          noindex?: boolean
          og_description?: string | null
          og_image_media_asset_id?: string | null
          og_image_url?: string | null
          og_title?: string | null
          published_at?: string | null
          published_homepage_snapshot?: Json | null
          published_page_snapshot?: Json | null
          scheduled_by?: string | null
          scheduled_publish_at?: string | null
          scheduled_revision_id?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["cms_page_status"]
          style_classes?: Json | null
          style_presets?: Json | null
          system_template_key?: string | null
          template_key?: string
          template_schema_version?: number
          tenant_id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "cms_pages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_pages_locale_fkey"
            columns: ["locale"]
            isOneToOne: false
            referencedRelation: "app_locales"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "cms_pages_og_image_media_asset_id_fkey"
            columns: ["og_image_media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_pages_scheduled_by_fkey"
            columns: ["scheduled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_pages_scheduled_revision_id_fkey"
            columns: ["scheduled_revision_id"]
            isOneToOne: false
            referencedRelation: "cms_page_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_pages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_pages_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_post_revisions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["cms_revision_kind"]
          post_id: string
          snapshot: Json
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["cms_revision_kind"]
          post_id: string
          snapshot: Json
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["cms_revision_kind"]
          post_id?: string
          snapshot?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cms_post_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_post_revisions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "cms_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_post_revisions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_posts: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          excerpt: string
          id: string
          include_in_sitemap: boolean
          locale: string
          meta_description: string | null
          meta_title: string | null
          noindex: boolean
          og_image_url: string | null
          published_at: string | null
          slug: string
          status: Database["public"]["Enums"]["cms_page_status"]
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body?: string
          created_at?: string
          created_by?: string | null
          excerpt?: string
          id?: string
          include_in_sitemap?: boolean
          locale?: string
          meta_description?: string | null
          meta_title?: string | null
          noindex?: boolean
          og_image_url?: string | null
          published_at?: string | null
          slug: string
          status?: Database["public"]["Enums"]["cms_page_status"]
          tenant_id: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          excerpt?: string
          id?: string
          include_in_sitemap?: boolean
          locale?: string
          meta_description?: string | null
          meta_title?: string | null
          noindex?: boolean
          og_image_url?: string | null
          published_at?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["cms_page_status"]
          tenant_id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cms_posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_posts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_posts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_redirects: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          new_path: string
          old_path: string
          status_code: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          new_path: string
          old_path: string
          status_code?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          new_path?: string
          old_path?: string
          status_code?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cms_redirects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_redirects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_section_comments: {
        Row: {
          author_display_name: string | null
          author_kind: string
          author_share_link_id: string | null
          author_user_id: string | null
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          mentions: string[]
          page_id: string
          parent_comment_id: string | null
          resolved_at: string | null
          resolved_by_user_id: string | null
          section_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          author_display_name?: string | null
          author_kind: string
          author_share_link_id?: string | null
          author_user_id?: string | null
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          mentions?: string[]
          page_id: string
          parent_comment_id?: string | null
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          section_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          author_display_name?: string | null
          author_kind?: string
          author_share_link_id?: string | null
          author_user_id?: string | null
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          mentions?: string[]
          page_id?: string
          parent_comment_id?: string | null
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          section_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cms_section_comments_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "cms_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_section_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "cms_section_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_section_comments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_section_revisions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["cms_revision_kind"]
          schema_version: number
          section_id: string
          snapshot: Json
          tenant_id: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["cms_revision_kind"]
          schema_version: number
          section_id: string
          snapshot: Json
          tenant_id: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["cms_revision_kind"]
          schema_version?: number
          section_id?: string
          snapshot?: Json
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "cms_section_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_section_revisions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "cms_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_section_revisions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_sections: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          props_jsonb: Json
          schema_version: number
          section_type_key: string
          status: Database["public"]["Enums"]["cms_section_status"]
          tenant_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          props_jsonb?: Json
          schema_version?: number
          section_type_key: string
          status?: Database["public"]["Enums"]["cms_section_status"]
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          props_jsonb?: Json
          schema_version?: number
          section_type_key?: string
          status?: Database["public"]["Enums"]["cms_section_status"]
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "cms_sections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_sections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_sections_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_workspace_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          snapshot_jsonb: Json
          source_page_id: string | null
          source_page_locale: string | null
          tenant_id: string
          theme_tokens_jsonb: Json | null
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          snapshot_jsonb?: Json
          source_page_id?: string | null
          source_page_locale?: string | null
          tenant_id: string
          theme_tokens_jsonb?: Json | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          snapshot_jsonb?: Json
          source_page_id?: string | null
          source_page_locale?: string | null
          tenant_id?: string
          theme_tokens_jsonb?: Json | null
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "cms_workspace_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_workspace_templates_source_page_id_fkey"
            columns: ["source_page_id"]
            isOneToOne: false
            referencedRelation: "cms_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_workspace_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_items: {
        Row: {
          collection_id: string
          sort_order: number
          talent_profile_id: string
          tenant_id: string
        }
        Insert: {
          collection_id: string
          sort_order?: number
          talent_profile_id: string
          tenant_id: string
        }
        Update: {
          collection_id?: string
          sort_order?: number
          talent_profile_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_items_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_items_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          slug: string
          sort_order: number
          tenant_id: string
          title_en: string
          title_es: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          slug: string
          sort_order?: number
          tenant_id: string
          title_en: string
          title_es?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          slug?: string
          sort_order?: number
          tenant_id?: string
          title_en?: string
          title_es?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          active: boolean
          archived_at: string | null
          created_at: string
          id: string
          iso2: string
          name_en: string
          name_es: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          archived_at?: string | null
          created_at?: string
          id?: string
          iso2: string
          name_en: string
          name_es?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          archived_at?: string | null
          created_at?: string
          id?: string
          iso2?: string
          name_en?: string
          name_es?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      directory_filter_panel_items: {
        Row: {
          item_key: string
          sort_order: number
          tenant_id: string
          updated_at: string
          visible: boolean
        }
        Insert: {
          item_key: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
          visible?: boolean
        }
        Update: {
          item_key?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "directory_filter_panel_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      directory_sidebar_layout: {
        Row: {
          field_visibility_overrides: Json
          filter_option_search_visible: boolean
          id: number | null
          item_order: string[]
          section_collapsed_defaults: Json
          talent_type_top_bar_visible: boolean
          tenant_id: string
          top_bar_facet_key: string | null
          updated_at: string
        }
        Insert: {
          field_visibility_overrides?: Json
          filter_option_search_visible?: boolean
          id?: number | null
          item_order?: string[]
          section_collapsed_defaults?: Json
          talent_type_top_bar_visible?: boolean
          tenant_id: string
          top_bar_facet_key?: string | null
          updated_at?: string
        }
        Update: {
          field_visibility_overrides?: Json
          filter_option_search_visible?: boolean
          id?: number | null
          item_order?: string[]
          section_collapsed_defaults?: Json
          talent_type_top_bar_visible?: boolean
          tenant_id?: string
          top_bar_facet_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "directory_sidebar_layout_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_suppressions: {
        Row: {
          created_at: string
          email_address: string
          id: string
          notes: string | null
          reason: string
          source: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email_address: string
          id?: string
          notes?: string | null
          reason: string
          source?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email_address?: string
          id?: string
          notes?: string | null
          reason?: string
          source?: string | null
          user_id?: string
        }
        Relationships: []
      }
      engine_audit_log: {
        Row: {
          actor_role: string
          actor_user_id: string | null
          after_value: Json | null
          before_value: Json | null
          created_at: string
          id: string
          operation: string
          subject_id: string
          subject_key: string | null
          subject_kind: string
          surface: string
          tenant_id: string
        }
        Insert: {
          actor_role: string
          actor_user_id?: string | null
          after_value?: Json | null
          before_value?: Json | null
          created_at?: string
          id?: string
          operation: string
          subject_id: string
          subject_key?: string | null
          subject_kind: string
          surface: string
          tenant_id: string
        }
        Update: {
          actor_role?: string
          actor_user_id?: string | null
          after_value?: Json | null
          before_value?: Json | null
          created_at?: string
          id?: string
          operation?: string
          subject_id?: string
          subject_key?: string | null
          subject_kind?: string
          surface?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engine_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      failed_engine_effects: {
        Row: {
          attempt_count: number
          created_at: string
          engine_action: string
          event_actor_user_id: string | null
          event_id: string
          event_payload: Json | null
          event_type: string | null
          failed_step: string
          id: string
          inquiry_id: string
          listener_name: string
          next_retry_at: string | null
          payload: Json
          priority: string
          resolved: boolean
          retried_at: string | null
          tenant_id: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          engine_action: string
          event_actor_user_id?: string | null
          event_id?: string
          event_payload?: Json | null
          event_type?: string | null
          failed_step: string
          id?: string
          inquiry_id: string
          listener_name: string
          next_retry_at?: string | null
          payload?: Json
          priority?: string
          resolved?: boolean
          retried_at?: string | null
          tenant_id: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          engine_action?: string
          event_actor_user_id?: string | null
          event_id?: string
          event_payload?: Json | null
          event_type?: string | null
          failed_step?: string
          id?: string
          inquiry_id?: string
          listener_name?: string
          next_retry_at?: string | null
          payload?: Json
          priority?: string
          resolved?: boolean
          retried_at?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "failed_engine_effects_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "failed_engine_effects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      field_groups: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          name_en: string
          name_es: string | null
          slug: string
          sort_order: number
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name_en: string
          name_es?: string | null
          slug: string
          sort_order?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name_en?: string
          name_es?: string | null
          slug?: string
          sort_order?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_sessions: {
        Row: {
          created_at: string
          id: string
          session_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          session_key: string
        }
        Update: {
          created_at?: string
          id?: string
          session_key?: string
        }
        Relationships: []
      }
      inquiries: {
        Row: {
          access_notes: string | null
          assigned_staff_id: string | null
          booked_at: string | null
          claim_candidate_user_ids: string[]
          client_account_id: string | null
          client_contact_id: string | null
          client_user_id: string | null
          close_reason: string | null
          close_reason_text: string | null
          closed_by_user_id: string | null
          closed_reason: string | null
          company: string | null
          contact_email: string
          contact_name: string
          contact_phone: string | null
          coordinator_accepted_at: string | null
          coordinator_assigned_at: string | null
          coordinator_id: string | null
          created_at: string
          current_offer_id: string | null
          deadline_at: string | null
          duplicate_of_inquiry_id: string | null
          equipment_notes: string | null
          event_date: string | null
          event_location: string | null
          event_timezone: string | null
          event_type_id: string | null
          expires_at: string | null
          freeze_reason: string | null
          frozen_at: string | null
          frozen_by_user_id: string | null
          guest_session_id: string | null
          has_failed_effects: boolean
          id: string
          initiator_role: string | null
          initiator_user_id: string | null
          interpreted_query: Json | null
          is_frozen: boolean
          last_edited_at: string | null
          last_edited_by: string | null
          lodging_notes: string | null
          meals_notes: string | null
          message: string | null
          next_action_by: string | null
          origin_domain: string | null
          owner_user_id: string | null
          priority: string
          quantity: number | null
          raw_ai_query: string | null
          requested_proficiency_min: string | null
          requested_skill_term_id: string | null
          source_channel: Database["public"]["Enums"]["inquiry_source_channel"]
          source_context: Json
          source_page: string | null
          source_pitch_id: string | null
          source_type: string
          source_workspace_id: string
          staff_notes: string | null
          status: Database["public"]["Enums"]["inquiry_status"]
          tenant_id: string
          transport_notes: string | null
          trust_level_at_submission: string | null
          updated_at: string
          uses_new_engine: boolean
          version: number
          wardrobe_notes: string | null
        }
        Insert: {
          access_notes?: string | null
          assigned_staff_id?: string | null
          booked_at?: string | null
          claim_candidate_user_ids?: string[]
          client_account_id?: string | null
          client_contact_id?: string | null
          client_user_id?: string | null
          close_reason?: string | null
          close_reason_text?: string | null
          closed_by_user_id?: string | null
          closed_reason?: string | null
          company?: string | null
          contact_email: string
          contact_name: string
          contact_phone?: string | null
          coordinator_accepted_at?: string | null
          coordinator_assigned_at?: string | null
          coordinator_id?: string | null
          created_at?: string
          current_offer_id?: string | null
          deadline_at?: string | null
          duplicate_of_inquiry_id?: string | null
          equipment_notes?: string | null
          event_date?: string | null
          event_location?: string | null
          event_timezone?: string | null
          event_type_id?: string | null
          expires_at?: string | null
          freeze_reason?: string | null
          frozen_at?: string | null
          frozen_by_user_id?: string | null
          guest_session_id?: string | null
          has_failed_effects?: boolean
          id?: string
          initiator_role?: string | null
          initiator_user_id?: string | null
          interpreted_query?: Json | null
          is_frozen?: boolean
          last_edited_at?: string | null
          last_edited_by?: string | null
          lodging_notes?: string | null
          meals_notes?: string | null
          message?: string | null
          next_action_by?: string | null
          origin_domain?: string | null
          owner_user_id?: string | null
          priority?: string
          quantity?: number | null
          raw_ai_query?: string | null
          requested_proficiency_min?: string | null
          requested_skill_term_id?: string | null
          source_channel?: Database["public"]["Enums"]["inquiry_source_channel"]
          source_context?: Json
          source_page?: string | null
          source_pitch_id?: string | null
          source_type?: string
          source_workspace_id: string
          staff_notes?: string | null
          status?: Database["public"]["Enums"]["inquiry_status"]
          tenant_id: string
          transport_notes?: string | null
          trust_level_at_submission?: string | null
          updated_at?: string
          uses_new_engine?: boolean
          version?: number
          wardrobe_notes?: string | null
        }
        Update: {
          access_notes?: string | null
          assigned_staff_id?: string | null
          booked_at?: string | null
          claim_candidate_user_ids?: string[]
          client_account_id?: string | null
          client_contact_id?: string | null
          client_user_id?: string | null
          close_reason?: string | null
          close_reason_text?: string | null
          closed_by_user_id?: string | null
          closed_reason?: string | null
          company?: string | null
          contact_email?: string
          contact_name?: string
          contact_phone?: string | null
          coordinator_accepted_at?: string | null
          coordinator_assigned_at?: string | null
          coordinator_id?: string | null
          created_at?: string
          current_offer_id?: string | null
          deadline_at?: string | null
          duplicate_of_inquiry_id?: string | null
          equipment_notes?: string | null
          event_date?: string | null
          event_location?: string | null
          event_timezone?: string | null
          event_type_id?: string | null
          expires_at?: string | null
          freeze_reason?: string | null
          frozen_at?: string | null
          frozen_by_user_id?: string | null
          guest_session_id?: string | null
          has_failed_effects?: boolean
          id?: string
          initiator_role?: string | null
          initiator_user_id?: string | null
          interpreted_query?: Json | null
          is_frozen?: boolean
          last_edited_at?: string | null
          last_edited_by?: string | null
          lodging_notes?: string | null
          meals_notes?: string | null
          message?: string | null
          next_action_by?: string | null
          origin_domain?: string | null
          owner_user_id?: string | null
          priority?: string
          quantity?: number | null
          raw_ai_query?: string | null
          requested_proficiency_min?: string | null
          requested_skill_term_id?: string | null
          source_channel?: Database["public"]["Enums"]["inquiry_source_channel"]
          source_context?: Json
          source_page?: string | null
          source_pitch_id?: string | null
          source_type?: string
          source_workspace_id?: string
          staff_notes?: string | null
          status?: Database["public"]["Enums"]["inquiry_status"]
          tenant_id?: string
          transport_notes?: string | null
          trust_level_at_submission?: string | null
          updated_at?: string
          uses_new_engine?: boolean
          version?: number
          wardrobe_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_inquiries_current_offer"
            columns: ["current_offer_id"]
            isOneToOne: false
            referencedRelation: "inquiry_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_client_contact_id_fkey"
            columns: ["client_contact_id"]
            isOneToOne: false
            referencedRelation: "client_account_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_client_user_id_fkey"
            columns: ["client_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_closed_by_user_id_fkey"
            columns: ["closed_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_coordinator_id_fkey"
            columns: ["coordinator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_duplicate_of_inquiry_id_fkey"
            columns: ["duplicate_of_inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_event_type_id_fkey"
            columns: ["event_type_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_frozen_by_user_id_fkey"
            columns: ["frozen_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_guest_session_id_fkey"
            columns: ["guest_session_id"]
            isOneToOne: false
            referencedRelation: "guest_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_last_edited_by_fkey"
            columns: ["last_edited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_requested_skill_term_id_fkey"
            columns: ["requested_skill_term_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_source_pitch_id_fkey"
            columns: ["source_pitch_id"]
            isOneToOne: false
            referencedRelation: "pitches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_source_workspace_id_fkey"
            columns: ["source_workspace_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_action_log: {
        Row: {
          action_type: string
          actor_user_id: string
          created_at: string
          id: number
          inquiry_id: string
          metadata: Json | null
          reason: string | null
          result: string
          tenant_id: string
        }
        Insert: {
          action_type: string
          actor_user_id: string
          created_at?: string
          id?: number
          inquiry_id: string
          metadata?: Json | null
          reason?: string | null
          result: string
          tenant_id: string
        }
        Update: {
          action_type?: string
          actor_user_id?: string
          created_at?: string
          id?: number
          inquiry_id?: string
          metadata?: Json | null
          reason?: string | null
          result?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_action_log_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_action_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_alternates: {
        Row: {
          added_by_user_id: string | null
          created_at: string
          id: string
          inquiry_id: string
          note: string | null
          rank: number
          requirement_group_id: string | null
          talent_profile_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          added_by_user_id?: string | null
          created_at?: string
          id?: string
          inquiry_id: string
          note?: string | null
          rank?: number
          requirement_group_id?: string | null
          talent_profile_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          added_by_user_id?: string | null
          created_at?: string
          id?: string
          inquiry_id?: string
          note?: string | null
          rank?: number
          requirement_group_id?: string | null
          talent_profile_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_alternates_added_by_user_id_fkey"
            columns: ["added_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_alternates_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_alternates_requirement_group_id_fkey"
            columns: ["requirement_group_id"]
            isOneToOne: false
            referencedRelation: "inquiry_requirement_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_alternates_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_alternates_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_alternates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_approvals: {
        Row: {
          created_at: string
          decided_at: string | null
          id: string
          inquiry_id: string
          notes: string | null
          offer_id: string | null
          participant_id: string
          status: Database["public"]["Enums"]["inquiry_approval_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          id?: string
          inquiry_id: string
          notes?: string | null
          offer_id?: string | null
          participant_id: string
          status?: Database["public"]["Enums"]["inquiry_approval_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          id?: string
          inquiry_id?: string
          notes?: string | null
          offer_id?: string | null
          participant_id?: string
          status?: Database["public"]["Enums"]["inquiry_approval_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_approvals_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_approvals_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "inquiry_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_approvals_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "inquiry_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_approvals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_attachments: {
        Row: {
          attachment_kind: string | null
          byte_size: number | null
          created_at: string
          deleted_at: string | null
          description: string | null
          filename: string
          id: string
          inquiry_id: string
          mime_type: string | null
          storage_path: string
          tenant_id: string
          uploaded_by: string
          visibility: string
        }
        Insert: {
          attachment_kind?: string | null
          byte_size?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          filename: string
          id?: string
          inquiry_id: string
          mime_type?: string | null
          storage_path: string
          tenant_id: string
          uploaded_by: string
          visibility?: string
        }
        Update: {
          attachment_kind?: string | null
          byte_size?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          filename?: string
          id?: string
          inquiry_id?: string
          mime_type?: string | null
          storage_path?: string
          tenant_id?: string
          uploaded_by?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_attachments_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_attachments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_audit_log: {
        Row: {
          actor_user_id: string | null
          amount_cents: number | null
          created_at: string
          currency: string | null
          field_group: string | null
          field_key: string | null
          id: string
          inquiry_id: string
          kind: string
          new_value: Json | null
          old_value: Json | null
          payload: Json
          tenant_id: string
          visibility_scope: string | null
        }
        Insert: {
          actor_user_id?: string | null
          amount_cents?: number | null
          created_at?: string
          currency?: string | null
          field_group?: string | null
          field_key?: string | null
          id?: string
          inquiry_id: string
          kind: string
          new_value?: Json | null
          old_value?: Json | null
          payload?: Json
          tenant_id: string
          visibility_scope?: string | null
        }
        Update: {
          actor_user_id?: string | null
          amount_cents?: number | null
          created_at?: string
          currency?: string | null
          field_group?: string | null
          field_key?: string | null
          id?: string
          inquiry_id?: string
          kind?: string
          new_value?: Json | null
          old_value?: Json | null
          payload?: Json
          tenant_id?: string
          visibility_scope?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_audit_log_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_coordinators: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          inquiry_id: string
          role: string
          status: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          inquiry_id: string
          role: string
          status?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          inquiry_id?: string
          role?: string
          status?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_coordinators_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_coordinators_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_coordinators_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_coordinators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_drafts: {
        Row: {
          abandoned_at: string | null
          created_at: string
          id: string
          intent: Json
          requester_email: string | null
          requester_user_id: string | null
          source: string
          source_context: Json
          submitted_inquiry_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          abandoned_at?: string | null
          created_at?: string
          id?: string
          intent?: Json
          requester_email?: string | null
          requester_user_id?: string | null
          source?: string
          source_context?: Json
          submitted_inquiry_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          abandoned_at?: string | null
          created_at?: string
          id?: string
          intent?: Json
          requester_email?: string | null
          requester_user_id?: string | null
          source?: string
          source_context?: Json
          submitted_inquiry_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_drafts_submitted_inquiry_id_fkey"
            columns: ["submitted_inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_drafts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_events: {
        Row: {
          actor_role: Database["public"]["Enums"]["inquiry_event_actor_role"]
          actor_user_id: string | null
          booking_id: string | null
          created_at: string
          event_type: string
          id: string
          inquiry_id: string
          payload: Json
          tenant_id: string
          visibility: Database["public"]["Enums"]["inquiry_event_visibility"]
        }
        Insert: {
          actor_role?: Database["public"]["Enums"]["inquiry_event_actor_role"]
          actor_user_id?: string | null
          booking_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          inquiry_id: string
          payload?: Json
          tenant_id: string
          visibility?: Database["public"]["Enums"]["inquiry_event_visibility"]
        }
        Update: {
          actor_role?: Database["public"]["Enums"]["inquiry_event_actor_role"]
          actor_user_id?: string | null
          booking_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          inquiry_id?: string
          payload?: Json
          tenant_id?: string
          visibility?: Database["public"]["Enums"]["inquiry_event_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "agency_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_events_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_message_pins: {
        Row: {
          inquiry_id: string
          message_id: string
          pinned_at: string
          pinned_by: string | null
          tenant_id: string
        }
        Insert: {
          inquiry_id: string
          message_id: string
          pinned_at?: string
          pinned_by?: string | null
          tenant_id: string
        }
        Update: {
          inquiry_id?: string
          message_id?: string
          pinned_at?: string
          pinned_by?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_message_pins_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_message_pins_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "inquiry_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_message_pins_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_message_pins_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_message_reads: {
        Row: {
          inquiry_id: string
          last_read_at: string
          last_read_message_id: string | null
          target_owning_party_id: string | null
          tenant_id: string
          thread_type: Database["public"]["Enums"]["inquiry_thread_type"]
          user_id: string
        }
        Insert: {
          inquiry_id: string
          last_read_at?: string
          last_read_message_id?: string | null
          target_owning_party_id?: string | null
          tenant_id: string
          thread_type: Database["public"]["Enums"]["inquiry_thread_type"]
          user_id: string
        }
        Update: {
          inquiry_id?: string
          last_read_at?: string
          last_read_message_id?: string | null
          target_owning_party_id?: string | null
          tenant_id?: string
          thread_type?: Database["public"]["Enums"]["inquiry_thread_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_message_reads_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_message_reads_last_read_message_id_fkey"
            columns: ["last_read_message_id"]
            isOneToOne: false
            referencedRelation: "inquiry_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_message_reads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_message_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_message_stars: {
        Row: {
          created_at: string
          inquiry_id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          inquiry_id: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          inquiry_id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_message_stars_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_message_stars_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "inquiry_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_messages: {
        Row: {
          body: string
          body_tsv: unknown
          card_payload: Json | null
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          guest_session_id: string | null
          id: string
          inquiry_id: string
          message_kind: string
          metadata: Json
          reply_to_message_id: string | null
          sender_user_id: string | null
          target_owning_party_id: string | null
          target_owning_party_type: string | null
          tenant_id: string
          thread_type: Database["public"]["Enums"]["inquiry_thread_type"]
        }
        Insert: {
          body: string
          body_tsv?: unknown
          card_payload?: Json | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          guest_session_id?: string | null
          id?: string
          inquiry_id: string
          message_kind?: string
          metadata?: Json
          reply_to_message_id?: string | null
          sender_user_id?: string | null
          target_owning_party_id?: string | null
          target_owning_party_type?: string | null
          tenant_id: string
          thread_type: Database["public"]["Enums"]["inquiry_thread_type"]
        }
        Update: {
          body?: string
          body_tsv?: unknown
          card_payload?: Json | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          guest_session_id?: string | null
          id?: string
          inquiry_id?: string
          message_kind?: string
          metadata?: Json
          reply_to_message_id?: string | null
          sender_user_id?: string | null
          target_owning_party_id?: string | null
          target_owning_party_type?: string | null
          tenant_id?: string
          thread_type?: Database["public"]["Enums"]["inquiry_thread_type"]
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_messages_guest_session_id_fkey"
            columns: ["guest_session_id"]
            isOneToOne: false
            referencedRelation: "guest_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_messages_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "inquiry_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_messages_sender_user_id_fkey"
            columns: ["sender_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_offer_line_items: {
        Row: {
          created_at: string
          id: string
          label: string | null
          notes: string | null
          offer_id: string
          pricing_unit: Database["public"]["Enums"]["pricing_unit"]
          sort_order: number
          source_service_id: string | null
          talent_cost: number
          talent_profile_id: string | null
          tenant_id: string
          total_price: number
          unit_price: number
          units: number
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          notes?: string | null
          offer_id: string
          pricing_unit?: Database["public"]["Enums"]["pricing_unit"]
          sort_order?: number
          source_service_id?: string | null
          talent_cost?: number
          talent_profile_id?: string | null
          tenant_id: string
          total_price?: number
          unit_price?: number
          units?: number
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          notes?: string | null
          offer_id?: string
          pricing_unit?: Database["public"]["Enums"]["pricing_unit"]
          sort_order?: number
          source_service_id?: string | null
          talent_cost?: number
          talent_profile_id?: string | null
          tenant_id?: string
          total_price?: number
          unit_price?: number
          units?: number
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_offer_line_items_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "inquiry_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_offer_line_items_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_offer_line_items_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_offer_line_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_offers: {
        Row: {
          accepted_at: string | null
          balance_collection_method: string | null
          coordinator_fee: number
          created_at: string
          created_by_user_id: string | null
          currency_code: string
          deposit_amount_cents: number | null
          deposit_pct: number | null
          id: string
          inquiry_id: string
          notes: string | null
          refund_policy_key: string | null
          rejection_reason: string | null
          rejection_reason_text: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["inquiry_offer_status"]
          tenant_id: string
          total_client_price: number
          updated_at: string
          valid_until: string | null
          version: number
        }
        Insert: {
          accepted_at?: string | null
          balance_collection_method?: string | null
          coordinator_fee?: number
          created_at?: string
          created_by_user_id?: string | null
          currency_code?: string
          deposit_amount_cents?: number | null
          deposit_pct?: number | null
          id?: string
          inquiry_id: string
          notes?: string | null
          refund_policy_key?: string | null
          rejection_reason?: string | null
          rejection_reason_text?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["inquiry_offer_status"]
          tenant_id: string
          total_client_price?: number
          updated_at?: string
          valid_until?: string | null
          version?: number
        }
        Update: {
          accepted_at?: string | null
          balance_collection_method?: string | null
          coordinator_fee?: number
          created_at?: string
          created_by_user_id?: string | null
          currency_code?: string
          deposit_amount_cents?: number | null
          deposit_pct?: number | null
          id?: string
          inquiry_id?: string
          notes?: string | null
          refund_policy_key?: string | null
          rejection_reason?: string | null
          rejection_reason_text?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["inquiry_offer_status"]
          tenant_id?: string
          total_client_price?: number
          updated_at?: string
          valid_until?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_offers_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_offers_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_offers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_participants: {
        Row: {
          accepted_at: string | null
          added_by_user_id: string | null
          created_at: string
          decline_reason: string | null
          decline_reason_text: string | null
          id: string
          inquiry_id: string
          invited_at: string
          owning_party_id: string | null
          owning_party_type: string | null
          removed_at: string | null
          requirement_group_id: string
          role: Database["public"]["Enums"]["inquiry_participant_role"]
          sort_order: number
          status: Database["public"]["Enums"]["inquiry_participant_status"]
          talent_profile_id: string | null
          tenant_id: string
          updated_at: string
          user_id: string | null
          visible_from: string | null
        }
        Insert: {
          accepted_at?: string | null
          added_by_user_id?: string | null
          created_at?: string
          decline_reason?: string | null
          decline_reason_text?: string | null
          id?: string
          inquiry_id: string
          invited_at?: string
          owning_party_id?: string | null
          owning_party_type?: string | null
          removed_at?: string | null
          requirement_group_id: string
          role: Database["public"]["Enums"]["inquiry_participant_role"]
          sort_order?: number
          status?: Database["public"]["Enums"]["inquiry_participant_status"]
          talent_profile_id?: string | null
          tenant_id: string
          updated_at?: string
          user_id?: string | null
          visible_from?: string | null
        }
        Update: {
          accepted_at?: string | null
          added_by_user_id?: string | null
          created_at?: string
          decline_reason?: string | null
          decline_reason_text?: string | null
          id?: string
          inquiry_id?: string
          invited_at?: string
          owning_party_id?: string | null
          owning_party_type?: string | null
          removed_at?: string | null
          requirement_group_id?: string
          role?: Database["public"]["Enums"]["inquiry_participant_role"]
          sort_order?: number
          status?: Database["public"]["Enums"]["inquiry_participant_status"]
          talent_profile_id?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
          visible_from?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_participants_added_by_user_id_fkey"
            columns: ["added_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_participants_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_participants_requirement_group_id_fkey"
            columns: ["requirement_group_id"]
            isOneToOne: false
            referencedRelation: "inquiry_requirement_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_participants_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_participants_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_participants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_reports: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          inquiry_id: string
          reason: string
          reported_client_user_id: string | null
          reported_guest_session_id: string | null
          reporter_user_id: string
          resolved_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          inquiry_id: string
          reason: string
          reported_client_user_id?: string | null
          reported_guest_session_id?: string | null
          reporter_user_id: string
          resolved_at?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          inquiry_id?: string
          reason?: string
          reported_client_user_id?: string | null
          reported_guest_session_id?: string | null
          reporter_user_id?: string
          resolved_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_reports_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_reports_reported_client_user_id_fkey"
            columns: ["reported_client_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_reports_reported_guest_session_id_fkey"
            columns: ["reported_guest_session_id"]
            isOneToOne: false
            referencedRelation: "guest_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_reports_reporter_user_id_fkey"
            columns: ["reporter_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_requirement_groups: {
        Row: {
          created_at: string
          id: string
          inquiry_id: string
          notes: string | null
          quantity_required: number
          role_key: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          inquiry_id: string
          notes?: string | null
          quantity_required: number
          role_key: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          inquiry_id?: string
          notes?: string | null
          quantity_required?: number
          role_key?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_requirement_groups_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_requirement_groups_role_key_fkey"
            columns: ["role_key"]
            isOneToOne: false
            referencedRelation: "requirement_role_keys"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "inquiry_requirement_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_user_flags: {
        Row: {
          archived: boolean
          archived_at: string | null
          created_at: string
          id: string
          inquiry_id: string
          manually_unread: boolean
          marked_unread_at: string | null
          pinned: boolean
          pinned_at: string | null
          profile_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          archived?: boolean
          archived_at?: string | null
          created_at?: string
          id?: string
          inquiry_id: string
          manually_unread?: boolean
          marked_unread_at?: string | null
          pinned?: boolean
          pinned_at?: string | null
          profile_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          archived?: boolean
          archived_at?: string | null
          created_at?: string
          id?: string
          inquiry_id?: string
          manually_unread?: boolean
          marked_unread_at?: string | null
          pinned?: boolean
          pinned_at?: string | null
          profile_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_user_flags_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_user_flags_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_user_flags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          active: boolean
          archived_at: string | null
          city_slug: string
          country_code: string
          country_id: string | null
          created_at: string
          display_name_i18n: Json
          id: string
          latitude: number | null
          longitude: number | null
          population: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          archived_at?: string | null
          city_slug: string
          country_code: string
          country_id?: string | null
          created_at?: string
          display_name_i18n?: Json
          id?: string
          latitude?: number | null
          longitude?: number | null
          population?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          archived_at?: string | null
          city_slug?: string
          country_code?: string
          country_id?: string | null
          created_at?: string
          display_name_i18n?: Json
          id?: string
          latitude?: number | null
          longitude?: number | null
          population?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_subscribers: {
        Row: {
          consented_at: string
          email: string
          id: string
          locale: string
          source: string
          unsubscribe_token: string
          unsubscribed_at: string | null
        }
        Insert: {
          consented_at?: string
          email: string
          id?: string
          locale?: string
          source: string
          unsubscribe_token?: string
          unsubscribed_at?: string | null
        }
        Update: {
          consented_at?: string
          email?: string
          id?: string
          locale?: string
          source?: string
          unsubscribe_token?: string
          unsubscribed_at?: string | null
        }
        Relationships: []
      }
      media_asset_activity: {
        Row: {
          actor_id: string | null
          asset_id: string
          created_at: string
          id: string
          kind: string
          payload: Json | null
          tenant_id: string
        }
        Insert: {
          actor_id?: string | null
          asset_id: string
          created_at?: string
          id?: string
          kind: string
          payload?: Json | null
          tenant_id: string
        }
        Update: {
          actor_id?: string | null
          asset_id?: string
          created_at?: string
          id?: string
          kind?: string
          payload?: Json | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_asset_activity_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_asset_activity_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          alt: string | null
          approval_state: Database["public"]["Enums"]["media_approval_state"]
          asset_kind: string | null
          attribution_note: string | null
          bucket_id: string
          byte_size: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          file_size: number | null
          file_size_bytes: number | null
          height: number | null
          id: string
          metadata: Json
          mime: string | null
          mime_type: string | null
          original_filename: string | null
          owner_talent_profile_id: string | null
          owner_tenant_id: string | null
          ownership_kind: string
          public_url: string | null
          purpose: Database["public"]["Enums"]["media_purpose"]
          sort_order: number
          source_media_asset_id: string | null
          storage_path: string
          tags: string[]
          tenant_id: string
          updated_at: string
          uploaded_by_user_id: string | null
          variant_kind: Database["public"]["Enums"]["media_variant_kind"]
          visible_in_talent_editor: boolean
          visible_on_master_profile: boolean
          watermark_override_json: Json | null
          width: number | null
        }
        Insert: {
          alt?: string | null
          approval_state?: Database["public"]["Enums"]["media_approval_state"]
          asset_kind?: string | null
          attribution_note?: string | null
          bucket_id: string
          byte_size?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          file_size?: number | null
          file_size_bytes?: number | null
          height?: number | null
          id?: string
          metadata?: Json
          mime?: string | null
          mime_type?: string | null
          original_filename?: string | null
          owner_talent_profile_id?: string | null
          owner_tenant_id?: string | null
          ownership_kind?: string
          public_url?: string | null
          purpose?: Database["public"]["Enums"]["media_purpose"]
          sort_order?: number
          source_media_asset_id?: string | null
          storage_path: string
          tags?: string[]
          tenant_id: string
          updated_at?: string
          uploaded_by_user_id?: string | null
          variant_kind?: Database["public"]["Enums"]["media_variant_kind"]
          visible_in_talent_editor?: boolean
          visible_on_master_profile?: boolean
          watermark_override_json?: Json | null
          width?: number | null
        }
        Update: {
          alt?: string | null
          approval_state?: Database["public"]["Enums"]["media_approval_state"]
          asset_kind?: string | null
          attribution_note?: string | null
          bucket_id?: string
          byte_size?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          file_size?: number | null
          file_size_bytes?: number | null
          height?: number | null
          id?: string
          metadata?: Json
          mime?: string | null
          mime_type?: string | null
          original_filename?: string | null
          owner_talent_profile_id?: string | null
          owner_tenant_id?: string | null
          ownership_kind?: string
          public_url?: string | null
          purpose?: Database["public"]["Enums"]["media_purpose"]
          sort_order?: number
          source_media_asset_id?: string | null
          storage_path?: string
          tags?: string[]
          tenant_id?: string
          updated_at?: string
          uploaded_by_user_id?: string | null
          variant_kind?: Database["public"]["Enums"]["media_variant_kind"]
          visible_in_talent_editor?: boolean
          visible_on_master_profile?: boolean
          watermark_override_json?: Json | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_owner_talent_profile_id_fkey"
            columns: ["owner_talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_owner_talent_profile_id_fkey"
            columns: ["owner_talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_owner_tenant_id_fkey"
            columns: ["owner_tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_source_media_asset_id_fkey"
            columns: ["source_media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_uploaded_by_user_id_fkey"
            columns: ["uploaded_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      media_folder_items: {
        Row: {
          added_at: string
          added_by: string | null
          asset_id: string
          folder_id: string
          id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          asset_id: string
          folder_id: string
          id?: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          asset_id?: string
          folder_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_folder_items_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_folder_items_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "media_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      media_folders: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          id: string
          is_private: boolean
          name: string
          share_expires_at: string | null
          share_token: string | null
          share_view_count: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_private?: boolean
          name: string
          share_expires_at?: string | null
          share_token?: string | null
          share_view_count?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_private?: boolean
          name?: string
          share_expires_at?: string | null
          share_token?: string | null
          share_view_count?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_folders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "inquiry_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_dispatch_log: {
        Row: {
          attempts: number
          bounced_at: string | null
          catalog_entry_id: string | null
          channel: string
          clicked_at: string | null
          complaint_at: string | null
          created_at: string
          dedupe_key: string | null
          delivered_at: string | null
          error_message: string | null
          event_kind: string
          id: string
          inquiry_id: string | null
          locale: string | null
          opened_at: string | null
          payload: Json
          provider_reference: string | null
          recipient_email: string | null
          recipient_user_id: string | null
          sent_at: string | null
          status: string
          template_id: string | null
          tenant_id: string | null
        }
        Insert: {
          attempts?: number
          bounced_at?: string | null
          catalog_entry_id?: string | null
          channel: string
          clicked_at?: string | null
          complaint_at?: string | null
          created_at?: string
          dedupe_key?: string | null
          delivered_at?: string | null
          error_message?: string | null
          event_kind: string
          id?: string
          inquiry_id?: string | null
          locale?: string | null
          opened_at?: string | null
          payload?: Json
          provider_reference?: string | null
          recipient_email?: string | null
          recipient_user_id?: string | null
          sent_at?: string | null
          status?: string
          template_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          attempts?: number
          bounced_at?: string | null
          catalog_entry_id?: string | null
          channel?: string
          clicked_at?: string | null
          complaint_at?: string | null
          created_at?: string
          dedupe_key?: string | null
          delivered_at?: string | null
          error_message?: string | null
          event_kind?: string
          id?: string
          inquiry_id?: string | null
          locale?: string | null
          opened_at?: string | null
          payload?: Json
          provider_reference?: string | null
          recipient_email?: string | null
          recipient_user_id?: string | null
          sent_at?: string | null
          status?: string
          template_id?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_dispatch_log_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_dispatch_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_overlay: {
        Row: {
          catalog_entry_id: string
          email_enabled: boolean | null
          in_app_enabled: boolean | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          catalog_entry_id: string
          email_enabled?: boolean | null
          in_app_enabled?: boolean | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          catalog_entry_id?: string
          email_enabled?: boolean | null
          in_app_enabled?: boolean | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      notification_template_override: {
        Row: {
          body_markdown: string | null
          catalog_entry_id: string
          enabled: boolean
          id: string
          locale: string
          subject: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body_markdown?: string | null
          catalog_entry_id: string
          enabled?: boolean
          id?: string
          locale?: string
          subject?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body_markdown?: string | null
          catalog_entry_id?: string
          enabled?: boolean
          id?: string
          locale?: string
          subject?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          read_at: string | null
          tenant_id: string
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          tenant_id: string
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          tenant_id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_category_field_groups: {
        Row: {
          completeness_weight: number
          created_at: string
          display_order: number
          field_group_id: string
          in_profile_editor: boolean
          in_registration_wizard: boolean
          is_default: boolean
          parent_category_id: string
          weight: string
        }
        Insert: {
          completeness_weight?: number
          created_at?: string
          display_order?: number
          field_group_id: string
          in_profile_editor?: boolean
          in_registration_wizard?: boolean
          is_default?: boolean
          parent_category_id: string
          weight?: string
        }
        Update: {
          completeness_weight?: number
          created_at?: string
          display_order?: number
          field_group_id?: string
          in_profile_editor?: boolean
          in_registration_wizard?: boolean
          is_default?: boolean
          parent_category_id?: string
          weight?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_category_field_groups_field_group_id_fkey"
            columns: ["field_group_id"]
            isOneToOne: false
            referencedRelation: "profile_field_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_category_field_groups_parent_category_id_fkey"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_accounts: {
        Row: {
          connected_at: string | null
          created_at: string
          created_by_profile_id: string | null
          disconnected_at: string | null
          display_name: string
          id: string
          last_verified_at: string | null
          owner_id: string
          owner_type: string
          provider: string
          provider_account_id: string | null
          requirements_pending_jsonb: Json
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          connected_at?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          disconnected_at?: string | null
          display_name: string
          id?: string
          last_verified_at?: string | null
          owner_id: string
          owner_type: string
          provider?: string
          provider_account_id?: string | null
          requirements_pending_jsonb?: Json
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          connected_at?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          disconnected_at?: string | null
          display_name?: string
          id?: string
          last_verified_at?: string | null
          owner_id?: string
          owner_type?: string
          provider?: string
          provider_account_id?: string | null
          requirements_pending_jsonb?: Json
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_accounts_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_e164_backfill_collisions: {
        Row: {
          computed_e164: string
          created_at: string
          detected_at: string
          id: string
          raw_phone: string
          resolution_action: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolver_id: string | null
          row_id: string
          updated_at: string
        }
        Insert: {
          computed_e164: string
          created_at?: string
          detected_at?: string
          id?: string
          raw_phone: string
          resolution_action?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolver_id?: string | null
          row_id: string
          updated_at?: string
        }
        Update: {
          computed_e164?: string
          created_at?: string
          detected_at?: string
          id?: string
          raw_phone?: string
          resolution_action?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolver_id?: string | null
          row_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "phone_e164_backfill_collisions_resolver_id_fkey"
            columns: ["resolver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_e164_backfill_collisions_row_id_fkey"
            columns: ["row_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_e164_backfill_collisions_row_id_fkey"
            columns: ["row_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pitch_attachments: {
        Row: {
          byte_size: number | null
          created_at: string
          deleted_at: string | null
          filename: string
          id: string
          kind: string
          mime_type: string | null
          pitch_id: string
          position: number
          storage_path: string
          talent_profile_id: string | null
          tenant_id: string
          uploaded_by: string | null
        }
        Insert: {
          byte_size?: number | null
          created_at?: string
          deleted_at?: string | null
          filename: string
          id?: string
          kind?: string
          mime_type?: string | null
          pitch_id: string
          position?: number
          storage_path: string
          talent_profile_id?: string | null
          tenant_id: string
          uploaded_by?: string | null
        }
        Update: {
          byte_size?: number | null
          created_at?: string
          deleted_at?: string | null
          filename?: string
          id?: string
          kind?: string
          mime_type?: string | null
          pitch_id?: string
          position?: number
          storage_path?: string
          talent_profile_id?: string | null
          tenant_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pitch_attachments_pitch_id_fkey"
            columns: ["pitch_id"]
            isOneToOne: false
            referencedRelation: "pitches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pitch_attachments_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pitch_attachments_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pitch_attachments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pitch_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pitch_events: {
        Row: {
          actor_role: string
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json
          pitch_id: string
          tenant_id: string
        }
        Insert: {
          actor_role?: string
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          pitch_id: string
          tenant_id: string
        }
        Update: {
          actor_role?: string
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          pitch_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pitch_events_pitch_id_fkey"
            columns: ["pitch_id"]
            isOneToOne: false
            referencedRelation: "pitches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pitch_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      pitch_talents: {
        Row: {
          admin_note: string | null
          created_at: string
          id: string
          pitch_id: string
          position: number
          removed_by_client_at: string | null
          talent_profile_id: string
          tenant_id: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          id?: string
          pitch_id: string
          position?: number
          removed_by_client_at?: string | null
          talent_profile_id: string
          tenant_id: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          id?: string
          pitch_id?: string
          position?: number
          removed_by_client_at?: string | null
          talent_profile_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pitch_talents_pitch_id_fkey"
            columns: ["pitch_id"]
            isOneToOne: false
            referencedRelation: "pitches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pitch_talents_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pitch_talents_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pitch_talents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      pitches: {
        Row: {
          approved_at: string | null
          brief: Json
          cancelled_at: string | null
          converted_at: string | null
          converted_inquiry_id: string | null
          created_at: string
          created_by_user_id: string | null
          declined_at: string | null
          expires_at: string | null
          first_viewed_at: string | null
          id: string
          internal_notes: string | null
          last_viewed_at: string | null
          parent_pitch_id: string | null
          personal_note: string | null
          recipient_contact: Json
          recipient_user_id: string | null
          sent_at: string | null
          share_channel:
            | Database["public"]["Enums"]["pitch_share_channel"]
            | null
          share_token_id: string
          status: Database["public"]["Enums"]["pitch_status"]
          tenant_id: string
          updated_at: string
          view_count: number
        }
        Insert: {
          approved_at?: string | null
          brief?: Json
          cancelled_at?: string | null
          converted_at?: string | null
          converted_inquiry_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          declined_at?: string | null
          expires_at?: string | null
          first_viewed_at?: string | null
          id?: string
          internal_notes?: string | null
          last_viewed_at?: string | null
          parent_pitch_id?: string | null
          personal_note?: string | null
          recipient_contact?: Json
          recipient_user_id?: string | null
          sent_at?: string | null
          share_channel?:
            | Database["public"]["Enums"]["pitch_share_channel"]
            | null
          share_token_id?: string
          status?: Database["public"]["Enums"]["pitch_status"]
          tenant_id: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          approved_at?: string | null
          brief?: Json
          cancelled_at?: string | null
          converted_at?: string | null
          converted_inquiry_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          declined_at?: string | null
          expires_at?: string | null
          first_viewed_at?: string | null
          id?: string
          internal_notes?: string | null
          last_viewed_at?: string | null
          parent_pitch_id?: string | null
          personal_note?: string | null
          recipient_contact?: Json
          recipient_user_id?: string | null
          sent_at?: string | null
          share_channel?:
            | Database["public"]["Enums"]["pitch_share_channel"]
            | null
          share_token_id?: string
          status?: Database["public"]["Enums"]["pitch_status"]
          tenant_id?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "pitches_converted_inquiry_id_fkey"
            columns: ["converted_inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pitches_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pitches_parent_pitch_id_fkey"
            columns: ["parent_pitch_id"]
            isOneToOne: false
            referencedRelation: "pitches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pitches_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pitches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_tier_caps: {
        Row: {
          api_access: boolean
          custom_domain: boolean
          description: string | null
          embed_widgets: boolean
          exclusivity_eligible: boolean
          inquiry_throughput: number
          plan_tier: string
          talent_seats: number
          team_seats: number
        }
        Insert: {
          api_access?: boolean
          custom_domain?: boolean
          description?: string | null
          embed_widgets?: boolean
          exclusivity_eligible?: boolean
          inquiry_throughput: number
          plan_tier: string
          talent_seats: number
          team_seats: number
        }
        Update: {
          api_access?: boolean
          custom_domain?: boolean
          description?: string | null
          embed_widgets?: boolean
          exclusivity_eligible?: boolean
          inquiry_throughput?: number
          plan_tier?: string
          talent_seats?: number
          team_seats?: number
        }
        Relationships: []
      }
      plan_trial_offers: {
        Row: {
          audience: string
          created_at: string
          cta_headline: string | null
          cta_subtext: string | null
          id: string
          is_enabled: boolean
          plan_key: string
          trial_days: number
          updated_at: string
        }
        Insert: {
          audience: string
          created_at?: string
          cta_headline?: string | null
          cta_subtext?: string | null
          id?: string
          is_enabled?: boolean
          plan_key: string
          trial_days?: number
          updated_at?: string
        }
        Update: {
          audience?: string
          created_at?: string
          cta_headline?: string | null
          cta_subtext?: string | null
          id?: string
          is_enabled?: boolean
          plan_key?: string
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_alerts: {
        Row: {
          audit_date: string
          category: string
          content_hash: string
          created_at: string
          id: string
          message: string
          payload: Json
          severity: string
        }
        Insert: {
          audit_date?: string
          category: string
          content_hash: string
          created_at?: string
          id?: string
          message: string
          payload?: Json
          severity: string
        }
        Update: {
          audit_date?: string
          category?: string
          content_hash?: string
          created_at?: string
          id?: string
          message?: string
          payload?: Json
          severity?: string
        }
        Relationships: []
      }
      platform_audit_log: {
        Row: {
          action: string
          actor_profile_id: string | null
          actor_role: string | null
          actor_user_id: string | null
          after_jsonb: Json | null
          before_jsonb: Json | null
          context_jsonb: Json | null
          created_at: string
          id: string
          ip_address: unknown
          metadata: Json
          reason: string | null
          session_id: string | null
          severity: string
          support_mode: string | null
          target_id: string | null
          target_kind: string | null
          target_type: string | null
          tenant_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_profile_id?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          after_jsonb?: Json | null
          before_jsonb?: Json | null
          context_jsonb?: Json | null
          created_at?: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          reason?: string | null
          session_id?: string | null
          severity?: string
          support_mode?: string | null
          target_id?: string | null
          target_kind?: string | null
          target_type?: string | null
          tenant_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_profile_id?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          after_jsonb?: Json | null
          before_jsonb?: Json | null
          context_jsonb?: Json | null
          created_at?: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          reason?: string | null
          session_id?: string | null
          severity?: string
          support_mode?: string | null
          target_id?: string | null
          target_kind?: string | null
          target_type?: string | null
          tenant_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_audit_log_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_commission_balances: {
        Row: {
          balances_cents: Json
          last_settled_at: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          balances_cents?: Json
          last_settled_at?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          balances_cents?: Json
          last_settled_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_commission_balances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_commission_config: {
        Row: {
          cash_settlement_currency: string
          cash_settlement_threshold_cents: number
          client_surcharge_bps: number | null
          created_at: string
          default_take_bps: number
          default_take_floor_cents: number
          id: string
          max_base_fee_bps: number | null
          max_base_fee_cents: number | null
          plan_tier_bps: Json
          singleton_key: boolean
          updated_at: string
        }
        Insert: {
          cash_settlement_currency?: string
          cash_settlement_threshold_cents?: number
          client_surcharge_bps?: number | null
          created_at?: string
          default_take_bps?: number
          default_take_floor_cents?: number
          id?: string
          max_base_fee_bps?: number | null
          max_base_fee_cents?: number | null
          plan_tier_bps?: Json
          singleton_key?: boolean
          updated_at?: string
        }
        Update: {
          cash_settlement_currency?: string
          cash_settlement_threshold_cents?: number
          client_surcharge_bps?: number | null
          created_at?: string
          default_take_bps?: number
          default_take_floor_cents?: number
          id?: string
          max_base_fee_bps?: number | null
          max_base_fee_cents?: number | null
          plan_tier_bps?: Json
          singleton_key?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      platform_commission_movements: {
        Row: {
          amount_cents: number
          booking_id: string | null
          created_at: string
          created_by_user_id: string | null
          currency_code: string
          id: string
          movement_type: string
          note: string | null
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          tenant_id: string
        }
        Insert: {
          amount_cents: number
          booking_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          currency_code: string
          id?: string
          movement_type: string
          note?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          tenant_id: string
        }
        Update: {
          amount_cents?: number
          booking_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          currency_code?: string
          id?: string
          movement_type?: string
          note?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_commission_movements_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "agency_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_commission_movements_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_commission_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_media_settings: {
        Row: {
          client_compression_enabled: boolean | null
          created_at: string
          id: string
          jpeg_quality_pct: number | null
          max_image_upload_bytes: number | null
          max_long_edge_px: number | null
          tenant_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_compression_enabled?: boolean | null
          created_at?: string
          id?: string
          jpeg_quality_pct?: number | null
          max_image_upload_bytes?: number | null
          max_long_edge_px?: number | null
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_compression_enabled?: boolean | null
          created_at?: string
          id?: string
          jpeg_quality_pct?: number | null
          max_image_upload_bytes?: number | null
          max_long_edge_px?: number | null
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_media_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_reserved_slugs: {
        Row: {
          created_at: string
          reason: string
          slug: string
        }
        Insert: {
          created_at?: string
          reason: string
          slug: string
        }
        Update: {
          created_at?: string
          reason?: string
          slug?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          active_payout_system: string
          default_component_styles: Json | null
          default_component_styles_talent: Json | null
          default_deposit_pct: number
          default_refund_policy: string
          default_storefront_template_id: string | null
          default_talent_freeform_enabled: boolean
          default_talent_price_from_cents: number | null
          default_talent_template_id: string | null
          default_theme_preset_slug: string | null
          default_theme_preset_slug_talent: string | null
          default_theme_tokens: Json | null
          default_theme_tokens_talent: Json | null
          default_theme_updated_at: string | null
          default_theme_updated_by: string | null
          id: boolean
          instant_book_default: boolean
          multi_currency_display_enabled: boolean
          operating_currency: string
          updated_at: string
          updated_by: string | null
          workspace_fab_enabled: boolean
          workspace_tour_enabled: boolean
        }
        Insert: {
          active_payout_system?: string
          default_component_styles?: Json | null
          default_component_styles_talent?: Json | null
          default_deposit_pct?: number
          default_refund_policy?: string
          default_storefront_template_id?: string | null
          default_talent_freeform_enabled?: boolean
          default_talent_price_from_cents?: number | null
          default_talent_template_id?: string | null
          default_theme_preset_slug?: string | null
          default_theme_preset_slug_talent?: string | null
          default_theme_tokens?: Json | null
          default_theme_tokens_talent?: Json | null
          default_theme_updated_at?: string | null
          default_theme_updated_by?: string | null
          id?: boolean
          instant_book_default?: boolean
          multi_currency_display_enabled?: boolean
          operating_currency?: string
          updated_at?: string
          updated_by?: string | null
          workspace_fab_enabled?: boolean
          workspace_tour_enabled?: boolean
        }
        Update: {
          active_payout_system?: string
          default_component_styles?: Json | null
          default_component_styles_talent?: Json | null
          default_deposit_pct?: number
          default_refund_policy?: string
          default_storefront_template_id?: string | null
          default_talent_freeform_enabled?: boolean
          default_talent_price_from_cents?: number | null
          default_talent_template_id?: string | null
          default_theme_preset_slug?: string | null
          default_theme_preset_slug_talent?: string | null
          default_theme_tokens?: Json | null
          default_theme_tokens_talent?: Json | null
          default_theme_updated_at?: string | null
          default_theme_updated_by?: string | null
          id?: boolean
          instant_book_default?: boolean
          multi_currency_display_enabled?: boolean
          operating_currency?: string
          updated_at?: string
          updated_by?: string | null
          workspace_fab_enabled?: boolean
          workspace_tour_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "platform_settings_default_storefront_template_id_fkey"
            columns: ["default_storefront_template_id"]
            isOneToOne: false
            referencedRelation: "builder_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_settings_default_talent_template_id_fkey"
            columns: ["default_talent_template_id"]
            isOneToOne: false
            referencedRelation: "builder_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      product_discounts: {
        Row: {
          applies_to: Json
          code: string
          created_at: string
          currency: string | null
          ends_at: string | null
          id: string
          is_active: boolean
          kind: string
          max_redemptions: number | null
          name: string
          per_customer_limit: number
          redemption_count: number
          starts_at: string | null
          stripe_coupon_id: string | null
          stripe_promotion_code_id: string | null
          updated_at: string
          value: number
        }
        Insert: {
          applies_to?: Json
          code: string
          created_at?: string
          currency?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          kind: string
          max_redemptions?: number | null
          name: string
          per_customer_limit?: number
          redemption_count?: number
          starts_at?: string | null
          stripe_coupon_id?: string | null
          stripe_promotion_code_id?: string | null
          updated_at?: string
          value: number
        }
        Update: {
          applies_to?: Json
          code?: string
          created_at?: string
          currency?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          max_redemptions?: number | null
          name?: string
          per_customer_limit?: number
          redemption_count?: number
          starts_at?: string | null
          stripe_coupon_id?: string | null
          stripe_promotion_code_id?: string | null
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      product_features: {
        Row: {
          category: string | null
          created_at: string
          display_order: number
          highlight: boolean
          id: string
          included: boolean
          label: string
          tier_id: string
          updated_at: string
          value_text: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          display_order?: number
          highlight?: boolean
          id?: string
          included?: boolean
          label: string
          tier_id: string
          updated_at?: string
          value_text?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          display_order?: number
          highlight?: boolean
          id?: string
          included?: boolean
          label?: string
          tier_id?: string
          updated_at?: string
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_features_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "product_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_packages: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          family: string
          id: string
          is_active: boolean
          label: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          family: string
          id?: string
          is_active?: boolean
          label: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          family?: string
          id?: string
          is_active?: boolean
          label?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_prices: {
        Row: {
          archived_at: string | null
          created_at: string
          currency: string
          id: string
          interval: string
          is_active: boolean
          notes: string | null
          stripe_price_id: string | null
          tier_id: string
          unit_amount: number
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          currency: string
          id?: string
          interval: string
          is_active?: boolean
          notes?: string | null
          stripe_price_id?: string | null
          tier_id: string
          unit_amount: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          interval?: string
          is_active?: boolean
          notes?: string | null
          stripe_price_id?: string | null
          tier_id?: string
          unit_amount?: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_prices_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "product_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_tiers: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          is_featured: boolean
          name: string
          package_id: string
          slug: string
          stripe_product_id: string | null
          tagline: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_featured?: boolean
          name: string
          package_id: string
          slug: string
          stripe_product_id?: string | null
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_featured?: boolean
          name?: string
          package_id?: string
          slug?: string
          stripe_product_id?: string | null
          tagline?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_tiers_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "product_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_editor_section_groups: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_system: boolean
          label_en: string
          label_en_alt: string | null
          label_es: string | null
          label_es_alt: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          label_en: string
          label_en_alt?: string | null
          label_es?: string | null
          label_es_alt?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          label_en?: string
          label_en_alt?: string | null
          label_es?: string | null
          label_es_alt?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      profile_editor_sections: {
        Row: {
          archived_at: string | null
          created_at: string
          emoji: string
          id: string
          is_active: boolean
          is_system: boolean
          label_i18n: Json
          section_group_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          emoji?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          label_i18n?: Json
          section_group_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          emoji?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          label_i18n?: Json
          section_group_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_editor_sections_section_group_id_fkey"
            columns: ["section_group_id"]
            isOneToOne: false
            referencedRelation: "profile_editor_section_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_field_definitions: {
        Row: {
          admin_only: boolean
          count_min: number | null
          created_at: string
          default_visibility: string[]
          deprecated_at: string | null
          directory_filter_config: Json | null
          display_order: number
          field_group_id: string | null
          field_key: string
          helper_i18n: Json
          id: string
          is_optional: boolean
          is_searchable: boolean
          is_sensitive: boolean
          kind: string
          label_i18n: Json
          legacy_field_keys: string[] | null
          note: string | null
          option_labels_i18n: Json
          options: Json | null
          placeholder_i18n: Json
          render_mode: string
          requires_review_on_change: boolean
          section: string
          show_in_directory: boolean
          show_in_directory_card: boolean
          show_in_directory_filter: boolean
          show_in_edit_drawer: boolean
          show_in_public: boolean
          show_in_public_profile_sidebar: boolean
          show_in_registration: boolean
          show_when: Json | null
          storage_mode: string
          subsection: string | null
          talent_editable: boolean
          tier: string
          unit: string | null
          updated_at: string
          validation_rules: Json | null
        }
        Insert: {
          admin_only?: boolean
          count_min?: number | null
          created_at?: string
          default_visibility?: string[]
          deprecated_at?: string | null
          directory_filter_config?: Json | null
          display_order?: number
          field_group_id?: string | null
          field_key: string
          helper_i18n?: Json
          id?: string
          is_optional?: boolean
          is_searchable?: boolean
          is_sensitive?: boolean
          kind?: string
          label_i18n?: Json
          legacy_field_keys?: string[] | null
          note?: string | null
          option_labels_i18n?: Json
          options?: Json | null
          placeholder_i18n?: Json
          render_mode?: string
          requires_review_on_change?: boolean
          section: string
          show_in_directory?: boolean
          show_in_directory_card?: boolean
          show_in_directory_filter?: boolean
          show_in_edit_drawer?: boolean
          show_in_public?: boolean
          show_in_public_profile_sidebar?: boolean
          show_in_registration?: boolean
          show_when?: Json | null
          storage_mode?: string
          subsection?: string | null
          talent_editable?: boolean
          tier: string
          unit?: string | null
          updated_at?: string
          validation_rules?: Json | null
        }
        Update: {
          admin_only?: boolean
          count_min?: number | null
          created_at?: string
          default_visibility?: string[]
          deprecated_at?: string | null
          directory_filter_config?: Json | null
          display_order?: number
          field_group_id?: string | null
          field_key?: string
          helper_i18n?: Json
          id?: string
          is_optional?: boolean
          is_searchable?: boolean
          is_sensitive?: boolean
          kind?: string
          label_i18n?: Json
          legacy_field_keys?: string[] | null
          note?: string | null
          option_labels_i18n?: Json
          options?: Json | null
          placeholder_i18n?: Json
          render_mode?: string
          requires_review_on_change?: boolean
          section?: string
          show_in_directory?: boolean
          show_in_directory_card?: boolean
          show_in_directory_filter?: boolean
          show_in_edit_drawer?: boolean
          show_in_public?: boolean
          show_in_public_profile_sidebar?: boolean
          show_in_registration?: boolean
          show_when?: Json | null
          storage_mode?: string
          subsection?: string | null
          talent_editable?: boolean
          tier?: string
          unit?: string | null
          updated_at?: string
          validation_rules?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_field_definitions_field_group_id_fkey"
            columns: ["field_group_id"]
            isOneToOne: false
            referencedRelation: "profile_field_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_field_groups: {
        Row: {
          created_at: string
          description_en: string | null
          description_es: string | null
          id: string
          is_active: boolean
          name_i18n: Json
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_en?: string | null
          description_es?: string | null
          id?: string
          is_active?: boolean
          name_i18n?: Json
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_en?: string | null
          description_es?: string | null
          id?: string
          is_active?: boolean
          name_i18n?: Json
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      profile_field_recommendations: {
        Row: {
          created_at: string
          display_order: number
          field_definition_id: string
          id: string
          is_admin_only: boolean
          relationship: string
          required_at_registration: boolean
          required_before_publish: boolean
          required_before_verification: boolean
          requires_verification: boolean
          taxonomy_term_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          field_definition_id: string
          id?: string
          is_admin_only?: boolean
          relationship: string
          required_at_registration?: boolean
          required_before_publish?: boolean
          required_before_verification?: boolean
          requires_verification?: boolean
          taxonomy_term_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          field_definition_id?: string
          id?: string
          is_admin_only?: boolean
          relationship?: string
          required_at_registration?: boolean
          required_before_publish?: boolean
          required_before_verification?: boolean
          requires_verification?: boolean
          taxonomy_term_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_field_recommendations_field_definition_id_fkey"
            columns: ["field_definition_id"]
            isOneToOne: false
            referencedRelation: "profile_field_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_field_recommendations_taxonomy_term_id_fkey"
            columns: ["taxonomy_term_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_revisions: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          id: string
          payload: Json
          resolved_at: string | null
          status: Database["public"]["Enums"]["revision_status"]
          talent_profile_id: string
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          payload?: Json
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["revision_status"]
          talent_profile_id: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          payload?: Json
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["revision_status"]
          talent_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_revisions_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_revisions_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_revisions_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_status: Database["public"]["Enums"]["account_status"]
          app_role: Database["public"]["Enums"]["app_role"]
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          is_test_account: boolean
          onboarding_completed_at: string | null
          origin_created_by_user_id: string | null
          origin_kind: string | null
          origin_workspace_id: string | null
          updated_at: string
        }
        Insert: {
          account_status?: Database["public"]["Enums"]["account_status"]
          app_role?: Database["public"]["Enums"]["app_role"]
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          is_test_account?: boolean
          onboarding_completed_at?: string | null
          origin_created_by_user_id?: string | null
          origin_kind?: string | null
          origin_workspace_id?: string | null
          updated_at?: string
        }
        Update: {
          account_status?: Database["public"]["Enums"]["account_status"]
          app_role?: Database["public"]["Enums"]["app_role"]
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_test_account?: boolean
          onboarding_completed_at?: string | null
          origin_created_by_user_id?: string | null
          origin_kind?: string | null
          origin_workspace_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_origin_created_by_user_id_fkey"
            columns: ["origin_created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_origin_workspace_id_fkey"
            columns: ["origin_workspace_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      requirement_role_keys: {
        Row: {
          archived_at: string | null
          created_at: string
          key: string
          label_en: string
          sort_order: number
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          key: string
          label_en: string
          sort_order?: number
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          key?: string
          label_en?: string
          sort_order?: number
        }
        Relationships: []
      }
      review_moderation_events: {
        Row: {
          action: string
          actor_is_platform: boolean
          actor_user_id: string | null
          created_at: string
          id: string
          justification: string | null
          reason_code: string | null
          review_id: string
          review_kind: string
          tenant_id: string
        }
        Insert: {
          action: string
          actor_is_platform?: boolean
          actor_user_id?: string | null
          created_at?: string
          id?: string
          justification?: string | null
          reason_code?: string | null
          review_id: string
          review_kind: string
          tenant_id: string
        }
        Update: {
          action?: string
          actor_is_platform?: boolean
          actor_user_id?: string | null
          created_at?: string
          id?: string
          justification?: string | null
          reason_code?: string | null
          review_id?: string
          review_kind?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_moderation_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_moderation_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      review_requests: {
        Row: {
          booking_id: string | null
          client_user_id: string | null
          completed_at: string | null
          created_at: string
          expires_at: string
          id: string
          invite_token: string
          invited_email: string | null
          message: string | null
          reminded_at: string | null
          requested_by_user_id: string | null
          status: string
          talent_profile_id: string
          tenant_id: string
        }
        Insert: {
          booking_id?: string | null
          client_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invite_token?: string
          invited_email?: string | null
          message?: string | null
          reminded_at?: string | null
          requested_by_user_id?: string | null
          status?: string
          talent_profile_id: string
          tenant_id: string
        }
        Update: {
          booking_id?: string | null
          client_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invite_token?: string
          invited_email?: string | null
          message?: string | null
          reminded_at?: string | null
          requested_by_user_id?: string | null
          status?: string
          talent_profile_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_requests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "agency_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_client_user_id_fkey"
            columns: ["client_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_requested_by_user_id_fkey"
            columns: ["requested_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      roster_import_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          failed_rows: number
          failure_details: Json
          id: string
          initiated_by_user_id: string | null
          note: string | null
          processed_rows: number
          source_file_name: string | null
          source_file_size_bytes: number | null
          source_format: string | null
          started_at: string | null
          status: string
          storage_path: string | null
          succeeded_rows: number
          tenant_id: string
          total_rows: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          failed_rows?: number
          failure_details?: Json
          id?: string
          initiated_by_user_id?: string | null
          note?: string | null
          processed_rows?: number
          source_file_name?: string | null
          source_file_size_bytes?: number | null
          source_format?: string | null
          started_at?: string | null
          status?: string
          storage_path?: string | null
          succeeded_rows?: number
          tenant_id: string
          total_rows?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          failed_rows?: number
          failure_details?: Json
          id?: string
          initiated_by_user_id?: string | null
          note?: string | null
          processed_rows?: number
          source_file_name?: string | null
          source_file_size_bytes?: number | null
          source_format?: string | null
          started_at?: string | null
          status?: string
          storage_path?: string | null
          succeeded_rows?: number
          tenant_id?: string
          total_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "roster_import_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      saas_marketing_signups: {
        Row: {
          audience: string
          business_description: string | null
          business_name: string | null
          claimed_at: string | null
          claimed_by_profile_id: string | null
          created_at: string
          email: string
          id: string
          ip_hash: string | null
          name: string
          notes: string | null
          provisioned_tenant_id: string | null
          referrer: string | null
          roster_size: string
          source_page: string | null
          status: string
          subdomain_wanted: string | null
          tier_interest: string | null
          updated_at: string
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          audience: string
          business_description?: string | null
          business_name?: string | null
          claimed_at?: string | null
          claimed_by_profile_id?: string | null
          created_at?: string
          email: string
          id?: string
          ip_hash?: string | null
          name: string
          notes?: string | null
          provisioned_tenant_id?: string | null
          referrer?: string | null
          roster_size: string
          source_page?: string | null
          status?: string
          subdomain_wanted?: string | null
          tier_interest?: string | null
          updated_at?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          audience?: string
          business_description?: string | null
          business_name?: string | null
          claimed_at?: string | null
          claimed_by_profile_id?: string | null
          created_at?: string
          email?: string
          id?: string
          ip_hash?: string | null
          name?: string
          notes?: string | null
          provisioned_tenant_id?: string | null
          referrer?: string | null
          roster_size?: string
          source_page?: string | null
          status?: string
          subdomain_wanted?: string | null
          tier_interest?: string | null
          updated_at?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saas_marketing_signups_claimed_by_profile_id_fkey"
            columns: ["claimed_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saas_marketing_signups_provisioned_tenant_id_fkey"
            columns: ["provisioned_tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      saas_subdomain_reservations: {
        Row: {
          expires_at: string
          lead_id: string
          reserved_at: string
          slug: string
        }
        Insert: {
          expires_at?: string
          lead_id: string
          reserved_at?: string
          slug: string
        }
        Update: {
          expires_at?: string
          lead_id?: string
          reserved_at?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "saas_subdomain_reservations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "saas_marketing_signups"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_talent: {
        Row: {
          client_user_id: string | null
          created_at: string
          guest_session_id: string | null
          id: string
          in_cart: boolean
          talent_profile_id: string
          tenant_id: string | null
        }
        Insert: {
          client_user_id?: string | null
          created_at?: string
          guest_session_id?: string | null
          id?: string
          in_cart?: boolean
          talent_profile_id: string
          tenant_id?: string | null
        }
        Update: {
          client_user_id?: string | null
          created_at?: string
          guest_session_id?: string | null
          id?: string
          in_cart?: boolean
          talent_profile_id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_talent_client_user_id_fkey"
            columns: ["client_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_talent_guest_session_id_fkey"
            columns: ["guest_session_id"]
            isOneToOne: false
            referencedRelation: "guest_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_talent_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_talent_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_talent_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      search_queries: {
        Row: {
          ai_enabled: boolean | null
          ai_path_requested: string | null
          clicked_talent_id: string | null
          created_at: string
          explanation_enabled: boolean | null
          fallback_reason: string | null
          fallback_triggered: boolean | null
          filters: Json
          flag_snapshot: Json
          id: string
          intent: string | null
          query: string | null
          rerank_enabled: boolean | null
          results_count: number
          search_mode: string | null
          session_id: string | null
          source: string
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          ai_enabled?: boolean | null
          ai_path_requested?: string | null
          clicked_talent_id?: string | null
          created_at?: string
          explanation_enabled?: boolean | null
          fallback_reason?: string | null
          fallback_triggered?: boolean | null
          filters?: Json
          flag_snapshot?: Json
          id?: string
          intent?: string | null
          query?: string | null
          rerank_enabled?: boolean | null
          results_count?: number
          search_mode?: string | null
          session_id?: string | null
          source?: string
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          ai_enabled?: boolean | null
          ai_path_requested?: string | null
          clicked_talent_id?: string | null
          created_at?: string
          explanation_enabled?: boolean | null
          fallback_reason?: string | null
          fallback_triggered?: boolean | null
          filters?: Json
          flag_snapshot?: Json
          id?: string
          intent?: string | null
          query?: string | null
          rerank_enabled?: boolean | null
          results_count?: number
          search_mode?: string | null
          session_id?: string | null
          source?: string
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "search_queries_clicked_talent_id_fkey"
            columns: ["clicked_talent_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_queries_clicked_talent_id_fkey"
            columns: ["clicked_talent_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_queries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_queries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          key: string
          tenant_id: string | null
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          tenant_id?: string | null
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          tenant_id?: string | null
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      sso_handoff_tokens: {
        Row: {
          created_at: string
          expires_at: string
          target_host: string
          token: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          target_host: string
          token?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          target_host?: string
          token?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sso_handoff_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_permissions: {
        Row: {
          permission: string
          user_id: string
        }
        Insert: {
          permission: string
          user_id: string
        }
        Update: {
          permission?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_customers: {
        Row: {
          billing_email: string | null
          created_at: string
          stripe_customer_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          billing_email?: string | null
          created_at?: string
          stripe_customer_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          billing_email?: string | null
          created_at?: string
          stripe_customer_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_processed_events: {
        Row: {
          api_version: string | null
          event_id: string
          event_type: string
          livemode: boolean | null
          processed_at: string
        }
        Insert: {
          api_version?: string | null
          event_id: string
          event_type: string
          livemode?: boolean | null
          processed_at?: string
        }
        Update: {
          api_version?: string | null
          event_id?: string
          event_type?: string
          livemode?: boolean | null
          processed_at?: string
        }
        Relationships: []
      }
      subscription_cancellations: {
        Row: {
          cancelled_by_user_id: string | null
          created_at: string
          effective_at: string
          feedback: string | null
          from_plan: string
          id: string
          reason: string
          tenant_id: string
          to_plan: string
        }
        Insert: {
          cancelled_by_user_id?: string | null
          created_at?: string
          effective_at?: string
          feedback?: string | null
          from_plan: string
          id?: string
          reason: string
          tenant_id: string
          to_plan: string
        }
        Update: {
          cancelled_by_user_id?: string | null
          created_at?: string
          effective_at?: string
          feedback?: string | null
          from_plan?: string
          id?: string
          reason?: string
          tenant_id?: string
          to_plan?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_cancellations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_agency_applications: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by_user_id: string | null
          decision_note: string | null
          id: string
          message: string | null
          status: Database["public"]["Enums"]["talent_application_status"]
          submitted_at: string
          submitted_by_user_id: string | null
          talent_profile_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by_user_id?: string | null
          decision_note?: string | null
          id?: string
          message?: string | null
          status?: Database["public"]["Enums"]["talent_application_status"]
          submitted_at?: string
          submitted_by_user_id?: string | null
          talent_profile_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by_user_id?: string | null
          decision_note?: string | null
          id?: string
          message?: string | null
          status?: Database["public"]["Enums"]["talent_application_status"]
          submitted_at?: string
          submitted_by_user_id?: string | null
          talent_profile_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_agency_applications_decided_by_user_id_fkey"
            columns: ["decided_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_agency_applications_submitted_by_user_id_fkey"
            columns: ["submitted_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_agency_applications_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_agency_applications_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_agency_applications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_agency_data_grants: {
        Row: {
          granted_at: string
          granted_by_user_id: string | null
          granted_scopes: string[]
          id: string
          revoked_at: string | null
          source_request_id: string | null
          talent_profile_id: string
          tenant_id: string
        }
        Insert: {
          granted_at?: string
          granted_by_user_id?: string | null
          granted_scopes: string[]
          id?: string
          revoked_at?: string | null
          source_request_id?: string | null
          talent_profile_id: string
          tenant_id: string
        }
        Update: {
          granted_at?: string
          granted_by_user_id?: string | null
          granted_scopes?: string[]
          id?: string
          revoked_at?: string | null
          source_request_id?: string | null
          talent_profile_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_agency_data_grants_source_request_id_fkey"
            columns: ["source_request_id"]
            isOneToOne: false
            referencedRelation: "talent_agency_permission_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_agency_data_grants_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_agency_data_grants_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_agency_data_grants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_agency_permission_requests: {
        Row: {
          approved_scopes: string[] | null
          created_at: string
          expires_at: string
          id: string
          request_message: string | null
          requested_at: string
          requested_scopes: string[]
          requesting_tenant_id: string
          responded_at: string | null
          responded_by_user_id: string | null
          status: string
          talent_profile_id: string
        }
        Insert: {
          approved_scopes?: string[] | null
          created_at?: string
          expires_at?: string
          id?: string
          request_message?: string | null
          requested_at?: string
          requested_scopes: string[]
          requesting_tenant_id: string
          responded_at?: string | null
          responded_by_user_id?: string | null
          status?: string
          talent_profile_id: string
        }
        Update: {
          approved_scopes?: string[] | null
          created_at?: string
          expires_at?: string
          id?: string
          request_message?: string | null
          requested_at?: string
          requested_scopes?: string[]
          requesting_tenant_id?: string
          responded_at?: string | null
          responded_by_user_id?: string | null
          status?: string
          talent_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_agency_permission_requests_requesting_tenant_id_fkey"
            columns: ["requesting_tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_agency_permission_requests_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_agency_permission_requests_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_availability_blocks: {
        Row: {
          all_day: boolean
          created_at: string
          ends_at: string
          id: string
          note: string | null
          reason: string
          starts_at: string
          talent_profile_id: string
          visibility: string
        }
        Insert: {
          all_day?: boolean
          created_at?: string
          ends_at: string
          id?: string
          note?: string | null
          reason?: string
          starts_at: string
          talent_profile_id: string
          visibility?: string
        }
        Update: {
          all_day?: boolean
          created_at?: string
          ends_at?: string
          id?: string
          note?: string | null
          reason?: string
          starts_at?: string
          talent_profile_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_availability_blocks_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_availability_blocks_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_bookings: {
        Row: {
          all_day: boolean
          client_label: string | null
          created_at: string
          created_by_user_id: string | null
          ends_at: string
          id: string
          inquiry_id: string | null
          location_text: string | null
          starts_at: string
          status: string
          talent_profile_id: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          all_day?: boolean
          client_label?: string | null
          created_at?: string
          created_by_user_id?: string | null
          ends_at: string
          id?: string
          inquiry_id?: string | null
          location_text?: string | null
          starts_at: string
          status?: string
          talent_profile_id: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          all_day?: boolean
          client_label?: string | null
          created_at?: string
          created_by_user_id?: string | null
          ends_at?: string
          id?: string
          inquiry_id?: string | null
          location_text?: string | null
          starts_at?: string
          status?: string
          talent_profile_id?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_bookings_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_bookings_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_bookings_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_bookings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_claim_invitations: {
        Row: {
          channel: string
          delivery_status: string
          delivery_status_detail: string | null
          expires_at: string
          id: string
          invited_email: string | null
          invited_phone: string | null
          notes: string | null
          redeemed_at: string | null
          redeemed_by_user_id: string | null
          revoked_at: string | null
          revoked_by_user_id: string | null
          sent_at: string
          sent_by_user_id: string | null
          talent_profile_id: string
          tenant_id: string
        }
        Insert: {
          channel: string
          delivery_status?: string
          delivery_status_detail?: string | null
          expires_at?: string
          id?: string
          invited_email?: string | null
          invited_phone?: string | null
          notes?: string | null
          redeemed_at?: string | null
          redeemed_by_user_id?: string | null
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          sent_at?: string
          sent_by_user_id?: string | null
          talent_profile_id: string
          tenant_id: string
        }
        Update: {
          channel?: string
          delivery_status?: string
          delivery_status_detail?: string | null
          expires_at?: string
          id?: string
          invited_email?: string | null
          invited_phone?: string | null
          notes?: string | null
          redeemed_at?: string | null
          redeemed_by_user_id?: string | null
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          sent_at?: string
          sent_by_user_id?: string | null
          talent_profile_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_claim_invitations_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_claim_invitations_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_claim_invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_contact_preferences: {
        Row: {
          allow_basic: boolean
          allow_gold: boolean
          allow_silver: boolean
          allow_verified: boolean
          talent_profile_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          allow_basic?: boolean
          allow_gold?: boolean
          allow_silver?: boolean
          allow_verified?: boolean
          talent_profile_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          allow_basic?: boolean
          allow_gold?: boolean
          allow_silver?: boolean
          allow_verified?: boolean
          talent_profile_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_contact_preferences_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: true
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_contact_preferences_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: true
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_contact_preferences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_demand_scores: {
        Row: {
          computed_at: string
          score: number
          talent_profile_id: string
          tenant_id: string
        }
        Insert: {
          computed_at?: string
          score?: number
          talent_profile_id: string
          tenant_id: string
        }
        Update: {
          computed_at?: string
          score?: number
          talent_profile_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_demand_scores_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_demand_scores_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_demand_scores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_embeddings: {
        Row: {
          document_hash: string | null
          embedding: string
          embedding_model: string
          embedding_version: string
          talent_profile_id: string
          updated_at: string
        }
        Insert: {
          document_hash?: string | null
          embedding: string
          embedding_model: string
          embedding_version: string
          talent_profile_id: string
          updated_at?: string
        }
        Update: {
          document_hash?: string | null
          embedding?: string
          embedding_model?: string
          embedding_version?: string
          talent_profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_embeddings_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: true
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_embeddings_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: true
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_holds: {
        Row: {
          all_day: boolean
          client_label: string | null
          created_at: string
          created_by_user_id: string | null
          ends_at: string
          expires_at: string | null
          hold_strength: string
          id: string
          inquiry_id: string | null
          starts_at: string
          talent_profile_id: string
          tenant_id: string
          title: string
        }
        Insert: {
          all_day?: boolean
          client_label?: string | null
          created_at?: string
          created_by_user_id?: string | null
          ends_at: string
          expires_at?: string | null
          hold_strength?: string
          id?: string
          inquiry_id?: string | null
          starts_at: string
          talent_profile_id: string
          tenant_id: string
          title: string
        }
        Update: {
          all_day?: boolean
          client_label?: string | null
          created_at?: string
          created_by_user_id?: string | null
          ends_at?: string
          expires_at?: string | null
          hold_strength?: string
          id?: string
          inquiry_id?: string | null
          starts_at?: string
          talent_profile_id?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_holds_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_holds_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_holds_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_holds_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_hub_applications: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by_user_id: string | null
          decision_note: string | null
          id: string
          message: string | null
          status: Database["public"]["Enums"]["talent_application_status"]
          submitted_at: string
          submitted_by_user_id: string | null
          talent_profile_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by_user_id?: string | null
          decision_note?: string | null
          id?: string
          message?: string | null
          status?: Database["public"]["Enums"]["talent_application_status"]
          submitted_at?: string
          submitted_by_user_id?: string | null
          talent_profile_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by_user_id?: string | null
          decision_note?: string | null
          id?: string
          message?: string | null
          status?: Database["public"]["Enums"]["talent_application_status"]
          submitted_at?: string
          submitted_by_user_id?: string | null
          talent_profile_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_hub_applications_decided_by_user_id_fkey"
            columns: ["decided_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_hub_applications_submitted_by_user_id_fkey"
            columns: ["submitted_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_hub_applications_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_hub_applications_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_hub_applications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_integration_items: {
        Row: {
          captured_at: string | null
          created_at: string
          embed_url: string | null
          external_item_id: string
          id: string
          item_kind: string
          item_metadata: Json
          personal_site_enabled: boolean
          provider_key: string
          public_profile_enabled: boolean
          talent_integration_id: string
          talent_profile_id: string
          thumbnail_url: string | null
          title: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          captured_at?: string | null
          created_at?: string
          embed_url?: string | null
          external_item_id: string
          id?: string
          item_kind: string
          item_metadata?: Json
          personal_site_enabled?: boolean
          provider_key: string
          public_profile_enabled?: boolean
          talent_integration_id: string
          talent_profile_id: string
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          captured_at?: string | null
          created_at?: string
          embed_url?: string | null
          external_item_id?: string
          id?: string
          item_kind?: string
          item_metadata?: Json
          personal_site_enabled?: boolean
          provider_key?: string
          public_profile_enabled?: boolean
          talent_integration_id?: string
          talent_profile_id?: string
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_integration_items_talent_integration_id_fkey"
            columns: ["talent_integration_id"]
            isOneToOne: false
            referencedRelation: "talent_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_integration_items_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_integration_items_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_integration_secrets: {
        Row: {
          ciphertext: string
          created_at: string
          id: string
          last4: string | null
          provider_key: string
          secret_field: string
          talent_profile_id: string
          updated_at: string
        }
        Insert: {
          ciphertext: string
          created_at?: string
          id?: string
          last4?: string | null
          provider_key: string
          secret_field: string
          talent_profile_id: string
          updated_at?: string
        }
        Update: {
          ciphertext?: string
          created_at?: string
          id?: string
          last4?: string | null
          provider_key?: string
          secret_field?: string
          talent_profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_integration_secrets_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_integration_secrets_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_integrations: {
        Row: {
          agency_visible: boolean
          auto_refresh_enabled: boolean
          calendar_availability_enabled: boolean
          calendar_write_enabled: boolean
          connection_method: string
          consent_version: string
          created_at: string
          created_by_user_id: string | null
          id: string
          last_error: string | null
          last_sync_at: string | null
          last_verified_at: string | null
          metadata_cache: Json
          personal_site_enabled: boolean
          provider_account_id: string | null
          provider_account_label: string | null
          provider_key: string
          public_badge_enabled: boolean
          public_profile_enabled: boolean
          scopes: string[]
          settings_json: Json
          status: string
          talent_profile_id: string
          updated_at: string
          updated_by_user_id: string | null
        }
        Insert: {
          agency_visible?: boolean
          auto_refresh_enabled?: boolean
          calendar_availability_enabled?: boolean
          calendar_write_enabled?: boolean
          connection_method?: string
          consent_version?: string
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          last_verified_at?: string | null
          metadata_cache?: Json
          personal_site_enabled?: boolean
          provider_account_id?: string | null
          provider_account_label?: string | null
          provider_key: string
          public_badge_enabled?: boolean
          public_profile_enabled?: boolean
          scopes?: string[]
          settings_json?: Json
          status?: string
          talent_profile_id: string
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Update: {
          agency_visible?: boolean
          auto_refresh_enabled?: boolean
          calendar_availability_enabled?: boolean
          calendar_write_enabled?: boolean
          connection_method?: string
          consent_version?: string
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          last_verified_at?: string | null
          metadata_cache?: Json
          personal_site_enabled?: boolean
          provider_account_id?: string | null
          provider_account_label?: string | null
          provider_key?: string
          public_badge_enabled?: boolean
          public_profile_enabled?: boolean
          scopes?: string[]
          settings_json?: Json
          status?: string
          talent_profile_id?: string
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_integrations_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_integrations_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_languages: {
        Row: {
          can_host: boolean
          can_sell: boolean
          can_teach: boolean
          can_translate: boolean
          created_at: string
          display_order: number
          id: string
          is_native: boolean
          language_code: string
          language_name: string
          reading_level: string | null
          speaking_level: string
          talent_profile_id: string
          tenant_id: string | null
          updated_at: string
          writing_level: string | null
        }
        Insert: {
          can_host?: boolean
          can_sell?: boolean
          can_teach?: boolean
          can_translate?: boolean
          created_at?: string
          display_order?: number
          id?: string
          is_native?: boolean
          language_code: string
          language_name: string
          reading_level?: string | null
          speaking_level?: string
          talent_profile_id: string
          tenant_id?: string | null
          updated_at?: string
          writing_level?: string | null
        }
        Update: {
          can_host?: boolean
          can_sell?: boolean
          can_teach?: boolean
          can_translate?: boolean
          created_at?: string
          display_order?: number
          id?: string
          is_native?: boolean
          language_code?: string
          language_name?: string
          reading_level?: string | null
          speaking_level?: string
          talent_profile_id?: string
          tenant_id?: string | null
          updated_at?: string
          writing_level?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_languages_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_languages_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_languages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_offering_addons: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          label: string
          offering_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          label: string
          offering_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          label?: string
          offering_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_offering_addons_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "talent_offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_offering_media: {
        Row: {
          media_asset_id: string
          offering_id: string
          sort_order: number
        }
        Insert: {
          media_asset_id: string
          offering_id: string
          sort_order?: number
        }
        Update: {
          media_asset_id?: string
          offering_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "talent_offering_media_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_offering_media_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "talent_offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_offering_variants: {
        Row: {
          amount_cents: number | null
          created_at: string
          id: string
          label: string
          offering_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          amount_cents?: number | null
          created_at?: string
          id?: string
          label: string
          offering_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          amount_cents?: number | null
          created_at?: string
          id?: string
          label?: string
          offering_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_offering_variants_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "talent_offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_offerings: {
        Row: {
          allow_pay_in_person: boolean
          amount_cents: number | null
          attributes: Json
          booking_mode: string
          cancellation_hours: number | null
          category: string | null
          created_at: string
          currency: string
          deposit_pct: number | null
          description: string | null
          description_i18n: Json | null
          duration_minutes: number | null
          free_reserve_expires_days: number | null
          id: string
          inventory_qty: number | null
          is_featured: boolean
          kind: string
          moderation_state: string
          price_display: string
          price_type: string
          reserve_mode: string
          sort_order: number
          status: string
          talent_profile_id: string
          tenant_id: string | null
          title: string
          title_i18n: Json | null
          updated_at: string
          visibility: string
        }
        Insert: {
          allow_pay_in_person?: boolean
          amount_cents?: number | null
          attributes?: Json
          booking_mode?: string
          cancellation_hours?: number | null
          category?: string | null
          created_at?: string
          currency?: string
          deposit_pct?: number | null
          description?: string | null
          description_i18n?: Json | null
          duration_minutes?: number | null
          free_reserve_expires_days?: number | null
          id?: string
          inventory_qty?: number | null
          is_featured?: boolean
          kind?: string
          moderation_state?: string
          price_display?: string
          price_type?: string
          reserve_mode?: string
          sort_order?: number
          status?: string
          talent_profile_id: string
          tenant_id?: string | null
          title: string
          title_i18n?: Json | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          allow_pay_in_person?: boolean
          amount_cents?: number | null
          attributes?: Json
          booking_mode?: string
          cancellation_hours?: number | null
          category?: string | null
          created_at?: string
          currency?: string
          deposit_pct?: number | null
          description?: string | null
          description_i18n?: Json | null
          duration_minutes?: number | null
          free_reserve_expires_days?: number | null
          id?: string
          inventory_qty?: number | null
          is_featured?: boolean
          kind?: string
          moderation_state?: string
          price_display?: string
          price_type?: string
          reserve_mode?: string
          sort_order?: number
          status?: string
          talent_profile_id?: string
          tenant_id?: string | null
          title?: string
          title_i18n?: Json | null
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_offerings_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_offerings_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_offerings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_page_revisions: {
        Row: {
          blocks: Json
          created_at: string
          created_by: string | null
          id: string
          page_id: string
          theme: Json
        }
        Insert: {
          blocks?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          page_id: string
          theme?: Json
        }
        Update: {
          blocks?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          page_id?: string
          theme?: Json
        }
        Relationships: [
          {
            foreignKeyName: "talent_page_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_page_revisions_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "talent_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_pages: {
        Row: {
          blocks: Json
          canonical_url: string | null
          created_at: string
          created_by: string | null
          id: string
          is_home: boolean
          json_ld: Json | null
          meta_description: string | null
          nav_label: string | null
          noindex: boolean | null
          og_description: string | null
          og_image_url: string | null
          og_title: string | null
          published_at: string | null
          required_talent_tier: string | null
          scheduled_for: string | null
          slug: string
          sort_order: number
          status: string
          style_classes: Json | null
          style_presets: Json | null
          talent_profile_id: string
          theme: Json
          title: string
          updated_at: string
        }
        Insert: {
          blocks?: Json
          canonical_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_home?: boolean
          json_ld?: Json | null
          meta_description?: string | null
          nav_label?: string | null
          noindex?: boolean | null
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          published_at?: string | null
          required_talent_tier?: string | null
          scheduled_for?: string | null
          slug: string
          sort_order?: number
          status?: string
          style_classes?: Json | null
          style_presets?: Json | null
          talent_profile_id: string
          theme?: Json
          title?: string
          updated_at?: string
        }
        Update: {
          blocks?: Json
          canonical_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_home?: boolean
          json_ld?: Json | null
          meta_description?: string | null
          nav_label?: string | null
          noindex?: boolean | null
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          published_at?: string | null
          required_talent_tier?: string | null
          scheduled_for?: string | null
          slug?: string
          sort_order?: number
          status?: string
          style_classes?: Json | null
          style_presets?: Json | null
          talent_profile_id?: string
          theme?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_pages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_pages_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_pages_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_plan_overrides: {
        Row: {
          base_plan_key: string
          created_at: string
          created_by: string | null
          ended_at: string | null
          ended_by: string | null
          expires_at: string | null
          grant_kind: string
          id: string
          note: string | null
          override_plan_key: string
          reason: string | null
          starts_at: string
          status: string
          talent_profile_id: string
          updated_at: string
        }
        Insert: {
          base_plan_key: string
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          ended_by?: string | null
          expires_at?: string | null
          grant_kind?: string
          id?: string
          note?: string | null
          override_plan_key: string
          reason?: string | null
          starts_at?: string
          status?: string
          talent_profile_id: string
          updated_at?: string
        }
        Update: {
          base_plan_key?: string
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          ended_by?: string | null
          expires_at?: string | null
          grant_kind?: string
          id?: string
          note?: string | null
          override_plan_key?: string
          reason?: string | null
          starts_at?: string
          status?: string
          talent_profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_plan_overrides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_plan_overrides_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_plan_overrides_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_plan_overrides_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_profile_change_requests: {
        Row: {
          changes: Json
          decided_at: string | null
          decided_by_user_id: string | null
          decision_note: string | null
          id: string
          previous_values: Json | null
          status: string
          submitted_at: string
          submitted_by_user_id: string | null
          talent_profile_id: string
          tenant_id: string
        }
        Insert: {
          changes: Json
          decided_at?: string | null
          decided_by_user_id?: string | null
          decision_note?: string | null
          id?: string
          previous_values?: Json | null
          status?: string
          submitted_at?: string
          submitted_by_user_id?: string | null
          talent_profile_id: string
          tenant_id: string
        }
        Update: {
          changes?: Json
          decided_at?: string | null
          decided_by_user_id?: string | null
          decision_note?: string | null
          id?: string
          previous_values?: Json | null
          status?: string
          submitted_at?: string
          submitted_by_user_id?: string | null
          talent_profile_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_profile_change_requests_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_profile_change_requests_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_profile_change_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_profile_external_calendars: {
        Row: {
          created_at: string
          display_in_profile: boolean
          external_url: string | null
          id: string
          is_primary: boolean
          kind: string
          talent_profile_id: string
        }
        Insert: {
          created_at?: string
          display_in_profile?: boolean
          external_url?: string | null
          id?: string
          is_primary?: boolean
          kind: string
          talent_profile_id: string
        }
        Update: {
          created_at?: string
          display_in_profile?: boolean
          external_url?: string | null
          id?: string
          is_primary?: boolean
          kind?: string
          talent_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_profile_external_calendars_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_profile_external_calendars_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_profile_field_value_history: {
        Row: {
          actor_role: string | null
          actor_user_id: string | null
          after_value: Json | null
          after_visibility_override: string[] | null
          after_workflow_state: string | null
          before_value: Json | null
          before_visibility_override: string[] | null
          before_workflow_state: string | null
          changed_at: string
          field_definition_id: string
          id: string
          operation: string
          talent_profile_id: string
          tenant_id: string
        }
        Insert: {
          actor_role?: string | null
          actor_user_id?: string | null
          after_value?: Json | null
          after_visibility_override?: string[] | null
          after_workflow_state?: string | null
          before_value?: Json | null
          before_visibility_override?: string[] | null
          before_workflow_state?: string | null
          changed_at?: string
          field_definition_id: string
          id?: string
          operation: string
          talent_profile_id: string
          tenant_id: string
        }
        Update: {
          actor_role?: string | null
          actor_user_id?: string | null
          after_value?: Json | null
          after_visibility_override?: string[] | null
          after_workflow_state?: string | null
          before_value?: Json | null
          before_visibility_override?: string[] | null
          before_workflow_state?: string | null
          changed_at?: string
          field_definition_id?: string
          id?: string
          operation?: string
          talent_profile_id?: string
          tenant_id?: string
        }
        Relationships: []
      }
      talent_profile_field_values: {
        Row: {
          created_at: string
          field_definition_id: string
          id: string
          last_edited_by_user_id: string | null
          last_edited_role: string | null
          talent_profile_id: string
          tenant_id: string | null
          updated_at: string
          value: Json
          visibility_override: string[] | null
          workflow_state: string
        }
        Insert: {
          created_at?: string
          field_definition_id: string
          id?: string
          last_edited_by_user_id?: string | null
          last_edited_role?: string | null
          talent_profile_id: string
          tenant_id?: string | null
          updated_at?: string
          value: Json
          visibility_override?: string[] | null
          workflow_state?: string
        }
        Update: {
          created_at?: string
          field_definition_id?: string
          id?: string
          last_edited_by_user_id?: string | null
          last_edited_role?: string | null
          talent_profile_id?: string
          tenant_id?: string | null
          updated_at?: string
          value?: Json
          visibility_override?: string[] | null
          workflow_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_profile_field_values_field_definition_id_fkey"
            columns: ["field_definition_id"]
            isOneToOne: false
            referencedRelation: "profile_field_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_profile_field_values_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_profile_field_values_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_profile_field_values_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_profile_taxonomy: {
        Row: {
          created_at: string
          display_order: number
          is_primary: boolean
          proficiency_level: string | null
          relationship_type: string
          talent_profile_id: string
          taxonomy_term_id: string
          tenant_id: string | null
          updated_at: string
          verification_note: string | null
          verified_at: string | null
          verified_by_tenant_id: string | null
          verified_by_user_id: string | null
          years_experience: number | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          is_primary?: boolean
          proficiency_level?: string | null
          relationship_type?: string
          talent_profile_id: string
          taxonomy_term_id: string
          tenant_id?: string | null
          updated_at?: string
          verification_note?: string | null
          verified_at?: string | null
          verified_by_tenant_id?: string | null
          verified_by_user_id?: string | null
          years_experience?: number | null
        }
        Update: {
          created_at?: string
          display_order?: number
          is_primary?: boolean
          proficiency_level?: string | null
          relationship_type?: string
          talent_profile_id?: string
          taxonomy_term_id?: string
          tenant_id?: string | null
          updated_at?: string
          verification_note?: string | null
          verified_at?: string | null
          verified_by_tenant_id?: string | null
          verified_by_user_id?: string | null
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_profile_taxonomy_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_profile_taxonomy_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_profile_taxonomy_taxonomy_term_id_fkey"
            columns: ["taxonomy_term_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_profile_taxonomy_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_profile_taxonomy_verified_by_tenant_id_fkey"
            columns: ["verified_by_tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_profile_trust_badges: {
        Row: {
          badge_kind: string
          created_at: string
          evidence_media_id: string | null
          expires_at: string | null
          id: string
          notes: string | null
          rejection_reason: string | null
          scope: string
          scope_tenant_id: string | null
          status: string
          talent_profile_id: string
          updated_at: string
          verified_at: string | null
          verified_by_user_id: string | null
        }
        Insert: {
          badge_kind: string
          created_at?: string
          evidence_media_id?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          rejection_reason?: string | null
          scope?: string
          scope_tenant_id?: string | null
          status?: string
          talent_profile_id: string
          updated_at?: string
          verified_at?: string | null
          verified_by_user_id?: string | null
        }
        Update: {
          badge_kind?: string
          created_at?: string
          evidence_media_id?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          rejection_reason?: string | null
          scope?: string
          scope_tenant_id?: string | null
          status?: string
          talent_profile_id?: string
          updated_at?: string
          verified_at?: string | null
          verified_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_profile_trust_badges_evidence_media_id_fkey"
            columns: ["evidence_media_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_profile_trust_badges_scope_tenant_id_fkey"
            columns: ["scope_tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_profile_trust_badges_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_profile_trust_badges_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_profiles: {
        Row: {
          ai_search_document: string | null
          availability_data: Json
          bio_draft_i18n: Json
          bio_i18n: Json
          bio_status_i18n: Json
          bio_updated_at_i18n: Json
          booking_note: string | null
          booking_terms: Json | null
          contact_policy: Json
          created_at: string
          created_by_agency_id: string | null
          created_by_user_id_provenance: string | null
          crypto_payouts_enabled: boolean
          date_of_birth: string | null
          default_currency: string
          deleted_at: string | null
          destinations: string[]
          display_name: string | null
          embedded_media: Json
          event_styles: string[]
          featured_level: number
          featured_position: number
          featured_until: string | null
          field_visibility: Json
          first_name: string | null
          gender: string | null
          gp_recipient_account_id: string | null
          height_cm: number | null
          hidden_at: string | null
          hidden_by_user_id: string | null
          home_city_text: string | null
          home_country_text: string | null
          home_place_id: string | null
          id: string
          intro_italic: string | null
          invitation_email: string | null
          is_discoverable: boolean
          is_featured: boolean
          is_publicly_hidden: boolean
          is_publicly_listed: boolean
          is_test_account: boolean
          languages: string[]
          last_active_at: string | null
          last_name: string | null
          lead_time_weeks: string | null
          legal_name: string | null
          listing_started_at: string | null
          location_id: string | null
          manual_rank_override: number | null
          membership_status: Database["public"]["Enums"]["membership_status"]
          membership_tier: Database["public"]["Enums"]["membership_tier"]
          nationality: string | null
          origin_city_id: string | null
          origin_country_id: string | null
          origin_created_by_user_id: string | null
          origin_kind: string | null
          origin_workspace_id: string | null
          package_teasers: Json
          phone: string | null
          phone_e164: string | null
          preferred_locale: string | null
          profile_code: string
          profile_completeness_pct: number | null
          profile_completeness_score: number
          pronunciation: string | null
          public_slug_part: string | null
          published_globally: boolean
          rating_all_avg: number
          rating_all_count: number
          rating_avg: number
          rating_count: number
          remote_only: boolean
          residence_city_id: string | null
          residence_country_id: string | null
          service_category_slug: string | null
          services_menu: Json
          short_bio: string | null
          social_links: Json
          source_type: string | null
          starting_from: string | null
          stripe_account_id: string | null
          stripe_account_status: string | null
          stripe_account_synced_at: string | null
          stripe_charges_enabled: boolean
          stripe_details_submitted: boolean
          stripe_payouts_enabled: boolean
          subscription_template: string
          talent_plan_key: string
          team_size: string | null
          total_completed_bookings: number
          travel_fee_required: boolean
          travel_radius_km: number | null
          travels_globally: boolean
          updated_at: string
          user_id: string | null
          visibility: Database["public"]["Enums"]["visibility"]
          workflow_status: Database["public"]["Enums"]["profile_workflow_status"]
          would_book_again_pct: number | null
        }
        Insert: {
          ai_search_document?: string | null
          availability_data?: Json
          bio_draft_i18n?: Json
          bio_i18n?: Json
          bio_status_i18n?: Json
          bio_updated_at_i18n?: Json
          booking_note?: string | null
          booking_terms?: Json | null
          contact_policy?: Json
          created_at?: string
          created_by_agency_id?: string | null
          created_by_user_id_provenance?: string | null
          crypto_payouts_enabled?: boolean
          date_of_birth?: string | null
          default_currency?: string
          deleted_at?: string | null
          destinations?: string[]
          display_name?: string | null
          embedded_media?: Json
          event_styles?: string[]
          featured_level?: number
          featured_position?: number
          featured_until?: string | null
          field_visibility?: Json
          first_name?: string | null
          gender?: string | null
          gp_recipient_account_id?: string | null
          height_cm?: number | null
          hidden_at?: string | null
          hidden_by_user_id?: string | null
          home_city_text?: string | null
          home_country_text?: string | null
          home_place_id?: string | null
          id?: string
          intro_italic?: string | null
          invitation_email?: string | null
          is_discoverable?: boolean
          is_featured?: boolean
          is_publicly_hidden?: boolean
          is_publicly_listed?: boolean
          is_test_account?: boolean
          languages?: string[]
          last_active_at?: string | null
          last_name?: string | null
          lead_time_weeks?: string | null
          legal_name?: string | null
          listing_started_at?: string | null
          location_id?: string | null
          manual_rank_override?: number | null
          membership_status?: Database["public"]["Enums"]["membership_status"]
          membership_tier?: Database["public"]["Enums"]["membership_tier"]
          nationality?: string | null
          origin_city_id?: string | null
          origin_country_id?: string | null
          origin_created_by_user_id?: string | null
          origin_kind?: string | null
          origin_workspace_id?: string | null
          package_teasers?: Json
          phone?: string | null
          phone_e164?: string | null
          preferred_locale?: string | null
          profile_code: string
          profile_completeness_pct?: number | null
          profile_completeness_score?: number
          pronunciation?: string | null
          public_slug_part?: string | null
          published_globally?: boolean
          rating_all_avg?: number
          rating_all_count?: number
          rating_avg?: number
          rating_count?: number
          remote_only?: boolean
          residence_city_id?: string | null
          residence_country_id?: string | null
          service_category_slug?: string | null
          services_menu?: Json
          short_bio?: string | null
          social_links?: Json
          source_type?: string | null
          starting_from?: string | null
          stripe_account_id?: string | null
          stripe_account_status?: string | null
          stripe_account_synced_at?: string | null
          stripe_charges_enabled?: boolean
          stripe_details_submitted?: boolean
          stripe_payouts_enabled?: boolean
          subscription_template?: string
          talent_plan_key?: string
          team_size?: string | null
          total_completed_bookings?: number
          travel_fee_required?: boolean
          travel_radius_km?: number | null
          travels_globally?: boolean
          updated_at?: string
          user_id?: string | null
          visibility?: Database["public"]["Enums"]["visibility"]
          workflow_status?: Database["public"]["Enums"]["profile_workflow_status"]
          would_book_again_pct?: number | null
        }
        Update: {
          ai_search_document?: string | null
          availability_data?: Json
          bio_draft_i18n?: Json
          bio_i18n?: Json
          bio_status_i18n?: Json
          bio_updated_at_i18n?: Json
          booking_note?: string | null
          booking_terms?: Json | null
          contact_policy?: Json
          created_at?: string
          created_by_agency_id?: string | null
          created_by_user_id_provenance?: string | null
          crypto_payouts_enabled?: boolean
          date_of_birth?: string | null
          default_currency?: string
          deleted_at?: string | null
          destinations?: string[]
          display_name?: string | null
          embedded_media?: Json
          event_styles?: string[]
          featured_level?: number
          featured_position?: number
          featured_until?: string | null
          field_visibility?: Json
          first_name?: string | null
          gender?: string | null
          gp_recipient_account_id?: string | null
          height_cm?: number | null
          hidden_at?: string | null
          hidden_by_user_id?: string | null
          home_city_text?: string | null
          home_country_text?: string | null
          home_place_id?: string | null
          id?: string
          intro_italic?: string | null
          invitation_email?: string | null
          is_discoverable?: boolean
          is_featured?: boolean
          is_publicly_hidden?: boolean
          is_publicly_listed?: boolean
          is_test_account?: boolean
          languages?: string[]
          last_active_at?: string | null
          last_name?: string | null
          lead_time_weeks?: string | null
          legal_name?: string | null
          listing_started_at?: string | null
          location_id?: string | null
          manual_rank_override?: number | null
          membership_status?: Database["public"]["Enums"]["membership_status"]
          membership_tier?: Database["public"]["Enums"]["membership_tier"]
          nationality?: string | null
          origin_city_id?: string | null
          origin_country_id?: string | null
          origin_created_by_user_id?: string | null
          origin_kind?: string | null
          origin_workspace_id?: string | null
          package_teasers?: Json
          phone?: string | null
          phone_e164?: string | null
          preferred_locale?: string | null
          profile_code?: string
          profile_completeness_pct?: number | null
          profile_completeness_score?: number
          pronunciation?: string | null
          public_slug_part?: string | null
          published_globally?: boolean
          rating_all_avg?: number
          rating_all_count?: number
          rating_avg?: number
          rating_count?: number
          remote_only?: boolean
          residence_city_id?: string | null
          residence_country_id?: string | null
          service_category_slug?: string | null
          services_menu?: Json
          short_bio?: string | null
          social_links?: Json
          source_type?: string | null
          starting_from?: string | null
          stripe_account_id?: string | null
          stripe_account_status?: string | null
          stripe_account_synced_at?: string | null
          stripe_charges_enabled?: boolean
          stripe_details_submitted?: boolean
          stripe_payouts_enabled?: boolean
          subscription_template?: string
          talent_plan_key?: string
          team_size?: string | null
          total_completed_bookings?: number
          travel_fee_required?: boolean
          travel_radius_km?: number | null
          travels_globally?: boolean
          updated_at?: string
          user_id?: string | null
          visibility?: Database["public"]["Enums"]["visibility"]
          workflow_status?: Database["public"]["Enums"]["profile_workflow_status"]
          would_book_again_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_profiles_created_by_agency_id_fkey"
            columns: ["created_by_agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_profiles_created_by_user_id_provenance_fkey"
            columns: ["created_by_user_id_provenance"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_profiles_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_profiles_origin_city_id_fkey"
            columns: ["origin_city_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_profiles_origin_country_id_fkey"
            columns: ["origin_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_profiles_origin_created_by_user_id_fkey"
            columns: ["origin_created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_profiles_origin_workspace_id_fkey"
            columns: ["origin_workspace_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_profiles_residence_city_id_fkey"
            columns: ["residence_city_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_profiles_residence_country_id_fkey"
            columns: ["residence_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_representation_requests: {
        Row: {
          created_at: string
          id: string
          picked_up_at: string | null
          picked_up_by: string | null
          requested_at: string
          requested_by: string
          requester_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_reason: string | null
          status: string
          talent_profile_id: string
          target_id: string
          target_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          picked_up_at?: string | null
          picked_up_by?: string | null
          requested_at?: string
          requested_by: string
          requester_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_reason?: string | null
          status?: string
          talent_profile_id: string
          target_id: string
          target_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          picked_up_at?: string | null
          picked_up_by?: string | null
          requested_at?: string
          requested_by?: string
          requester_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_reason?: string | null
          status?: string
          talent_profile_id?: string
          target_id?: string
          target_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_representation_requests_picked_up_by_fkey"
            columns: ["picked_up_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_representation_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_representation_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_representation_requests_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_representation_requests_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_representation_requests_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_review_media: {
        Row: {
          approval_state: string
          bucket_id: string
          byte_size: number | null
          created_at: string
          deleted_at: string | null
          id: string
          mime_type: string | null
          review_id: string
          sort_order: number
          storage_path: string
          tenant_id: string
          uploader_user_id: string | null
        }
        Insert: {
          approval_state?: string
          bucket_id?: string
          byte_size?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          mime_type?: string | null
          review_id: string
          sort_order?: number
          storage_path: string
          tenant_id: string
          uploader_user_id?: string | null
        }
        Update: {
          approval_state?: string
          bucket_id?: string
          byte_size?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          mime_type?: string | null
          review_id?: string
          sort_order?: number
          storage_path?: string
          tenant_id?: string
          uploader_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_review_media_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "talent_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_review_media_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_review_media_uploader_user_id_fkey"
            columns: ["uploader_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_reviews: {
        Row: {
          anon: boolean
          attr_communication: number | null
          attr_professionalism: number | null
          attr_reliability: number | null
          attr_skill: number | null
          body: string | null
          booking_id: string | null
          client_user_id: string
          created_at: string
          id: string
          locked_at: string | null
          private_note: string | null
          published_at: string | null
          rating: number
          reply_at: string | null
          reply_body: string | null
          reported_at: string | null
          skill_scope: string | null
          status: string
          talent_profile_id: string
          tenant_id: string
          traits: string[] | null
          transaction_id: string | null
          updated_at: string
          verified_paid: boolean
          would_book_again: boolean | null
        }
        Insert: {
          anon?: boolean
          attr_communication?: number | null
          attr_professionalism?: number | null
          attr_reliability?: number | null
          attr_skill?: number | null
          body?: string | null
          booking_id?: string | null
          client_user_id: string
          created_at?: string
          id?: string
          locked_at?: string | null
          private_note?: string | null
          published_at?: string | null
          rating: number
          reply_at?: string | null
          reply_body?: string | null
          reported_at?: string | null
          skill_scope?: string | null
          status?: string
          talent_profile_id: string
          tenant_id: string
          traits?: string[] | null
          transaction_id?: string | null
          updated_at?: string
          verified_paid?: boolean
          would_book_again?: boolean | null
        }
        Update: {
          anon?: boolean
          attr_communication?: number | null
          attr_professionalism?: number | null
          attr_reliability?: number | null
          attr_skill?: number | null
          body?: string | null
          booking_id?: string | null
          client_user_id?: string
          created_at?: string
          id?: string
          locked_at?: string | null
          private_note?: string | null
          published_at?: string | null
          rating?: number
          reply_at?: string | null
          reply_body?: string | null
          reported_at?: string | null
          skill_scope?: string | null
          status?: string
          talent_profile_id?: string
          tenant_id?: string
          traits?: string[] | null
          transaction_id?: string | null
          updated_at?: string
          verified_paid?: boolean
          would_book_again?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "agency_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_reviews_client_user_id_fkey"
            columns: ["client_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_reviews_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_reviews_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_reviews_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "booking_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_service_areas: {
        Row: {
          city: string | null
          created_at: string
          display_order: number
          id: string
          location_id: string | null
          notes: string | null
          service_kind: string
          talent_profile_id: string
          tenant_id: string | null
          travel_fee_required: boolean
          travel_radius_km: number | null
          updated_at: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          display_order?: number
          id?: string
          location_id?: string | null
          notes?: string | null
          service_kind?: string
          talent_profile_id: string
          tenant_id?: string | null
          travel_fee_required?: boolean
          travel_radius_km?: number | null
          updated_at?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          display_order?: number
          id?: string
          location_id?: string | null
          notes?: string | null
          service_kind?: string
          talent_profile_id?: string
          tenant_id?: string | null
          travel_fee_required?: boolean
          travel_radius_km?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_service_areas_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_service_areas_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_service_areas_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_service_areas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_site_domains: {
        Row: {
          created_at: string
          domain: string
          failure_reason: string | null
          id: string
          is_primary: boolean
          last_health_check_at: string | null
          ssl_provisioned_at: string | null
          status: string
          talent_profile_id: string
          updated_at: string
          verification_token: string | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          domain: string
          failure_reason?: string | null
          id?: string
          is_primary?: boolean
          last_health_check_at?: string | null
          ssl_provisioned_at?: string | null
          status?: string
          talent_profile_id: string
          updated_at?: string
          verification_token?: string | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          domain?: string
          failure_reason?: string | null
          id?: string
          is_primary?: boolean
          last_health_check_at?: string | null
          ssl_provisioned_at?: string | null
          status?: string
          talent_profile_id?: string
          updated_at?: string
          verification_token?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_site_domains_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_site_domains_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_site_revisions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          snapshot: Json
          talent_profile_id: string
          talent_site_id: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          snapshot: Json
          talent_profile_id: string
          talent_site_id: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          snapshot?: Json
          talent_profile_id?: string
          talent_site_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "talent_site_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_site_revisions_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_site_revisions_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_site_revisions_talent_site_id_fkey"
            columns: ["talent_site_id"]
            isOneToOne: false
            referencedRelation: "talent_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_sites: {
        Row: {
          created_at: string
          created_by: string | null
          draft_snapshot: Json
          draft_updated_at: string
          id: string
          logo_url: string | null
          pending_template_reset: boolean
          plan_locked: boolean
          published_at: string | null
          published_snapshot: Json | null
          shell_published: Json | null
          shell_tree: Json
          site_kind: string
          site_published_at: string | null
          site_slug: string | null
          status: string
          style_classes: Json | null
          style_presets: Json | null
          talent_profile_id: string
          unpublished_at: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          draft_snapshot?: Json
          draft_updated_at?: string
          id?: string
          logo_url?: string | null
          pending_template_reset?: boolean
          plan_locked?: boolean
          published_at?: string | null
          published_snapshot?: Json | null
          shell_published?: Json | null
          shell_tree?: Json
          site_kind?: string
          site_published_at?: string | null
          site_slug?: string | null
          status?: string
          style_classes?: Json | null
          style_presets?: Json | null
          talent_profile_id: string
          unpublished_at?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          draft_snapshot?: Json
          draft_updated_at?: string
          id?: string
          logo_url?: string | null
          pending_template_reset?: boolean
          plan_locked?: boolean
          published_at?: string | null
          published_snapshot?: Json | null
          shell_published?: Json | null
          shell_tree?: Json
          site_kind?: string
          site_published_at?: string | null
          site_slug?: string | null
          status?: string
          style_classes?: Json | null
          style_presets?: Json | null
          talent_profile_id?: string
          unpublished_at?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "talent_sites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_sites_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: true
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_sites_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: true
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_sites_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_skill_metrics: {
        Row: {
          booking_count: number
          last_booked_at: string | null
          refreshed_at: string
          talent_profile_id: string
          taxonomy_term_id: string
        }
        Insert: {
          booking_count?: number
          last_booked_at?: string | null
          refreshed_at?: string
          talent_profile_id: string
          taxonomy_term_id: string
        }
        Update: {
          booking_count?: number
          last_booked_at?: string | null
          refreshed_at?: string
          talent_profile_id?: string
          taxonomy_term_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_skill_metrics_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_skill_metrics_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_skill_metrics_taxonomy_term_id_fkey"
            columns: ["taxonomy_term_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_stripe_customers: {
        Row: {
          billing_email: string | null
          created_at: string
          stripe_customer_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_email?: string | null
          created_at?: string
          stripe_customer_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_email?: string | null
          created_at?: string
          stripe_customer_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      talent_submission_consents: {
        Row: {
          accepted_at: string
          consent_type: string
          created_at: string
          id: string
          submission_context: string | null
          talent_profile_id: string
          tenant_id: string
          terms_version: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          consent_type: string
          created_at?: string
          id?: string
          submission_context?: string | null
          talent_profile_id: string
          tenant_id: string
          terms_version: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          consent_type?: string
          created_at?: string
          id?: string
          submission_context?: string | null
          talent_profile_id?: string
          tenant_id?: string
          terms_version?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_submission_consents_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_submission_consents_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_submission_consents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_submission_consents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_submission_history: {
        Row: {
          accepted_terms_version: string | null
          created_at: string
          id: string
          source_revision_id: string | null
          submission_kind: string
          submission_snapshot_id: string | null
          submitted_at: string
          submitted_by_user_id: string | null
          talent_profile_id: string
          tenant_id: string
          terms_consent_id: string | null
          workflow_state_after:
            | Database["public"]["Enums"]["profile_workflow_status"]
            | null
          workflow_state_before:
            | Database["public"]["Enums"]["profile_workflow_status"]
            | null
        }
        Insert: {
          accepted_terms_version?: string | null
          created_at?: string
          id?: string
          source_revision_id?: string | null
          submission_kind?: string
          submission_snapshot_id?: string | null
          submitted_at?: string
          submitted_by_user_id?: string | null
          talent_profile_id: string
          tenant_id: string
          terms_consent_id?: string | null
          workflow_state_after?:
            | Database["public"]["Enums"]["profile_workflow_status"]
            | null
          workflow_state_before?:
            | Database["public"]["Enums"]["profile_workflow_status"]
            | null
        }
        Update: {
          accepted_terms_version?: string | null
          created_at?: string
          id?: string
          source_revision_id?: string | null
          submission_kind?: string
          submission_snapshot_id?: string | null
          submitted_at?: string
          submitted_by_user_id?: string | null
          talent_profile_id?: string
          tenant_id?: string
          terms_consent_id?: string | null
          workflow_state_after?:
            | Database["public"]["Enums"]["profile_workflow_status"]
            | null
          workflow_state_before?:
            | Database["public"]["Enums"]["profile_workflow_status"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_submission_history_source_revision_id_fkey"
            columns: ["source_revision_id"]
            isOneToOne: false
            referencedRelation: "profile_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_submission_history_submission_snapshot_id_fkey"
            columns: ["submission_snapshot_id"]
            isOneToOne: false
            referencedRelation: "talent_submission_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_submission_history_submitted_by_user_id_fkey"
            columns: ["submitted_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_submission_history_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_submission_history_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_submission_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_submission_history_terms_consent_id_fkey"
            columns: ["terms_consent_id"]
            isOneToOne: false
            referencedRelation: "talent_submission_consents"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_submission_snapshots: {
        Row: {
          completion_score_at_submit: number | null
          created_at: string
          id: string
          snapshot: Json
          submitted_by_user_id: string | null
          talent_profile_id: string
          tenant_id: string
          workflow_status_at_submit:
            | Database["public"]["Enums"]["profile_workflow_status"]
            | null
        }
        Insert: {
          completion_score_at_submit?: number | null
          created_at?: string
          id?: string
          snapshot?: Json
          submitted_by_user_id?: string | null
          talent_profile_id: string
          tenant_id: string
          workflow_status_at_submit?:
            | Database["public"]["Enums"]["profile_workflow_status"]
            | null
        }
        Update: {
          completion_score_at_submit?: number | null
          created_at?: string
          id?: string
          snapshot?: Json
          submitted_by_user_id?: string | null
          talent_profile_id?: string
          tenant_id?: string
          workflow_status_at_submit?:
            | Database["public"]["Enums"]["profile_workflow_status"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_submission_snapshots_submitted_by_user_id_fkey"
            columns: ["submitted_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_submission_snapshots_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_submission_snapshots_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_submission_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          cancelled_at: string | null
          created_at: string
          current_period_end: string | null
          id: string
          plan_key: string
          status: string
          stripe_customer_id: string
          stripe_price_id: string | null
          stripe_subscription_id: string
          talent_profile_id: string
          trial_end: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan_key: string
          status?: string
          stripe_customer_id: string
          stripe_price_id?: string | null
          stripe_subscription_id: string
          talent_profile_id: string
          trial_end?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan_key?: string
          status?: string
          stripe_customer_id?: string
          stripe_price_id?: string | null
          stripe_subscription_id?: string
          talent_profile_id?: string
          trial_end?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_subscriptions_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: true
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_subscriptions_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: true
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_type_field_groups: {
        Row: {
          created_at: string
          display_order: number
          expanded_by_default: boolean
          field_slugs: string[]
          id: string
          label_en: string
          label_es: string | null
          taxonomy_term_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          expanded_by_default?: boolean
          field_slugs?: string[]
          id?: string
          label_en: string
          label_es?: string | null
          taxonomy_term_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          expanded_by_default?: boolean
          field_slugs?: string[]
          id?: string
          label_en?: string
          label_es?: string | null
          taxonomy_term_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_type_field_groups_taxonomy_term_id_fkey"
            columns: ["taxonomy_term_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_workflow_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json
          talent_profile_id: string
          tenant_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          talent_profile_id: string
          tenant_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          talent_profile_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_workflow_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_workflow_events_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_workflow_events_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_workflow_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      taxonomy_term_requests: {
        Row: {
          context_note: string | null
          created_at: string
          created_term_id: string | null
          id: string
          parent_category_id: string | null
          proposed_name: string
          requested_by_tenant_id: string | null
          requested_by_user_id: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by_user_id: string | null
          source: string | null
          status: string
          talent_profile_id: string | null
        }
        Insert: {
          context_note?: string | null
          created_at?: string
          created_term_id?: string | null
          id?: string
          parent_category_id?: string | null
          proposed_name: string
          requested_by_tenant_id?: string | null
          requested_by_user_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          source?: string | null
          status?: string
          talent_profile_id?: string | null
        }
        Update: {
          context_note?: string | null
          created_at?: string
          created_term_id?: string | null
          id?: string
          parent_category_id?: string | null
          proposed_name?: string
          requested_by_tenant_id?: string | null
          requested_by_user_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          source?: string | null
          status?: string
          talent_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "taxonomy_term_requests_created_term_id_fkey"
            columns: ["created_term_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taxonomy_term_requests_parent_category_id_fkey"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taxonomy_term_requests_requested_by_tenant_id_fkey"
            columns: ["requested_by_tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taxonomy_term_requests_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taxonomy_term_requests_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      taxonomy_terms: {
        Row: {
          ai_keywords: string[]
          aliases: string[]
          archived_at: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          is_generic_fallback: boolean
          is_profile_badge: boolean
          is_public_filter: boolean
          is_restricted: boolean
          is_visible_by_default: boolean
          kind: Database["public"]["Enums"]["taxonomy_kind"]
          level: number
          name_i18n: Json
          parent_id: string | null
          plural_name: string | null
          promo_image_storage_path: string | null
          promo_placements: string[]
          restriction_level: string | null
          search_synonyms: string[]
          slug: string
          sort_order: number
          term_type: string
          updated_at: string
        }
        Insert: {
          ai_keywords?: string[]
          aliases?: string[]
          archived_at?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          is_generic_fallback?: boolean
          is_profile_badge?: boolean
          is_public_filter?: boolean
          is_restricted?: boolean
          is_visible_by_default?: boolean
          kind: Database["public"]["Enums"]["taxonomy_kind"]
          level?: number
          name_i18n?: Json
          parent_id?: string | null
          plural_name?: string | null
          promo_image_storage_path?: string | null
          promo_placements?: string[]
          restriction_level?: string | null
          search_synonyms?: string[]
          slug: string
          sort_order?: number
          term_type: string
          updated_at?: string
        }
        Update: {
          ai_keywords?: string[]
          aliases?: string[]
          archived_at?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          is_generic_fallback?: boolean
          is_profile_badge?: boolean
          is_public_filter?: boolean
          is_restricted?: boolean
          is_visible_by_default?: boolean
          kind?: Database["public"]["Enums"]["taxonomy_kind"]
          level?: number
          name_i18n?: Json
          parent_id?: string | null
          plural_name?: string | null
          promo_image_storage_path?: string | null
          promo_placements?: string[]
          restriction_level?: string | null
          search_synonyms?: string[]
          slug?: string
          sort_order?: number
          term_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "taxonomy_terms_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invite_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          invited_by_user_id: string | null
          invited_email: string
          redeemed_at: string | null
          redeemed_by_user_id: string | null
          revoked_at: string | null
          target_role: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          invited_by_user_id?: string | null
          invited_email: string
          redeemed_at?: string | null
          redeemed_by_user_id?: string | null
          revoked_at?: string | null
          target_role: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          invited_by_user_id?: string | null
          invited_email?: string
          redeemed_at?: string | null
          redeemed_by_user_id?: string | null
          revoked_at?: string | null
          target_role?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invite_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_guest_chat_settings: {
        Row: {
          account_conversation_limit: number
          created_at: string
          email_verified_conversation_limit: number
          enabled: boolean
          greeting: string | null
          guest_conversation_limit: number
          show_on_directory: boolean
          show_on_home: boolean
          show_on_talent: boolean
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_conversation_limit?: number
          created_at?: string
          email_verified_conversation_limit?: number
          enabled?: boolean
          greeting?: string | null
          guest_conversation_limit?: number
          show_on_directory?: boolean
          show_on_home?: boolean
          show_on_talent?: boolean
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_conversation_limit?: number
          created_at?: string
          email_verified_conversation_limit?: number
          enabled?: boolean
          greeting?: string | null
          guest_conversation_limit?: number
          show_on_directory?: boolean
          show_on_home?: boolean
          show_on_talent?: boolean
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_guest_chat_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_guest_chat_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_integration_secrets: {
        Row: {
          ciphertext: string
          created_at: string
          id: string
          integration_key: string
          last4: string | null
          secret_field: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          ciphertext: string
          created_at?: string
          id?: string
          integration_key: string
          last4?: string | null
          secret_field: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          ciphertext?: string
          created_at?: string
          id?: string
          integration_key?: string
          last4?: string | null
          secret_field?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_integration_secrets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_integrations: {
        Row: {
          config_json: Json
          connection_method: string
          created_at: string
          created_by: string | null
          credential_mode: string
          id: string
          integration_key: string
          last_error: string | null
          last_verified_at: string | null
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config_json?: Json
          connection_method?: string
          created_at?: string
          created_by?: string | null
          credential_mode?: string
          id?: string
          integration_key: string
          last_error?: string | null
          last_verified_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config_json?: Json
          connection_method?: string
          created_at?: string
          created_by?: string | null
          credential_mode?: string
          id?: string
          integration_key?: string
          last_error?: string | null
          last_verified_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_integrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_registration_settings: {
        Row: {
          created_at: string
          created_by: string | null
          cta_label: string
          default_roster_visibility: string
          enabled: boolean
          mode: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          cta_label?: string
          default_roster_visibility?: string
          enabled?: boolean
          mode?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          cta_label?: string
          default_roster_visibility?: string
          enabled?: boolean
          mode?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_registration_settings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_registration_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_registration_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_social_feed_items: {
        Row: {
          caption: string | null
          created_at: string
          external_id: string
          fetched_at: string
          hidden: boolean
          id: string
          media_type: string
          media_url: string
          permalink: string | null
          posted_at: string | null
          poster_url: string | null
          provider: string
          tenant_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          external_id: string
          fetched_at?: string
          hidden?: boolean
          id?: string
          media_type?: string
          media_url: string
          permalink?: string | null
          posted_at?: string | null
          poster_url?: string | null
          provider: string
          tenant_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          external_id?: string
          fetched_at?: string
          hidden?: boolean
          id?: string
          media_type?: string
          media_url?: string
          permalink?: string | null
          posted_at?: string | null
          poster_url?: string | null
          provider?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_social_feed_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_testimonials: {
        Row: {
          author_name: string
          author_role: string | null
          body: string
          created_at: string
          created_by_user_id: string | null
          id: string
          rating: number | null
          source: string
          status: string
          talent_profile_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          author_name: string
          author_role?: string | null
          body: string
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          rating?: number | null
          source?: string
          status?: string
          talent_profile_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          author_name?: string
          author_role?: string | null
          body?: string
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          rating?: number | null
          source?: string
          status?: string
          talent_profile_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_testimonials_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_testimonials_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_testimonials_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_testimonials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      translation_audit_events: {
        Row: {
          actor_id: string | null
          actor_kind: string
          created_at: string
          entity_id: string
          entity_type: string
          event_type: string
          field_name: string
          id: string
          meta: Json
          next_status: string | null
          prev_status: string | null
          tenant_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind?: string
          created_at?: string
          entity_id: string
          entity_type: string
          event_type: string
          field_name: string
          id?: string
          meta?: Json
          next_status?: string | null
          prev_status?: string | null
          tenant_id: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          event_type?: string
          field_name?: string
          id?: string
          meta?: Json
          next_status?: string | null
          prev_status?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "translation_audit_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_admin_notes: {
        Row: {
          author_user_id: string | null
          body: string
          created_at: string
          id: string
          target_talent_profile_id: string | null
          target_user_id: string | null
        }
        Insert: {
          author_user_id?: string | null
          body: string
          created_at?: string
          id?: string
          target_talent_profile_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          author_user_id?: string | null
          body?: string
          created_at?: string
          id?: string
          target_talent_profile_id?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_admin_notes_target_talent_profile_id_fkey"
            columns: ["target_talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_admin_notes_target_talent_profile_id_fkey"
            columns: ["target_talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_blocks: {
        Row: {
          blocked_client_user_id: string | null
          blocked_guest_session_id: string | null
          blocked_subject_type: string
          blocker_user_id: string
          created_at: string
          id: string
          reason: string | null
          scope: string
          tenant_id: string
        }
        Insert: {
          blocked_client_user_id?: string | null
          blocked_guest_session_id?: string | null
          blocked_subject_type: string
          blocker_user_id: string
          created_at?: string
          id?: string
          reason?: string | null
          scope?: string
          tenant_id: string
        }
        Update: {
          blocked_client_user_id?: string | null
          blocked_guest_session_id?: string | null
          blocked_subject_type?: string
          blocker_user_id?: string
          created_at?: string
          id?: string
          reason?: string | null
          scope?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_blocks_blocked_client_user_id_fkey"
            columns: ["blocked_client_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocked_guest_session_id_fkey"
            columns: ["blocked_guest_session_id"]
            isOneToOne: false
            referencedRelation: "guest_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_user_id_fkey"
            columns: ["blocker_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notifications: {
        Row: {
          actor_initials: string | null
          actor_user_id: string | null
          body: string | null
          created_at: string
          id: string
          kind: string
          origin_event_id: string | null
          origin_inquiry_id: string | null
          origin_kind: string | null
          read_at: string | null
          surface: string
          target_drawer: string | null
          target_payload: Json | null
          tenant_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          actor_initials?: string | null
          actor_user_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          origin_event_id?: string | null
          origin_inquiry_id?: string | null
          origin_kind?: string | null
          read_at?: string | null
          surface?: string
          target_drawer?: string | null
          target_payload?: Json | null
          tenant_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          actor_initials?: string | null
          actor_user_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          origin_event_id?: string | null
          origin_inquiry_id?: string | null
          origin_kind?: string | null
          read_at?: string | null
          surface?: string
          target_drawer?: string | null
          target_payload?: Json | null
          tenant_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notifications_origin_inquiry_id_fkey"
            columns: ["origin_inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_prefs: {
        Row: {
          first_run_toggle_tip_seen: boolean
          notification_prefs: Json
          preferred_surface: string | null
          privacy_prefs: Json
          talent_checklist_dismissed: boolean
          unsubscribe_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          first_run_toggle_tip_seen?: boolean
          notification_prefs?: Json
          preferred_surface?: string | null
          privacy_prefs?: Json
          talent_checklist_dismissed?: boolean
          unsubscribe_token?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          first_run_toggle_tip_seen?: boolean
          notification_prefs?: Json
          preferred_surface?: string | null
          privacy_prefs?: Json
          talent_checklist_dismissed?: boolean
          unsubscribe_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_visibility_overrides: {
        Row: {
          hidden_at: string
          hidden_by_user_id: string | null
          id: string
          reason: string | null
          target_id: string
          target_kind: string
          tenant_id: string
        }
        Insert: {
          hidden_at?: string
          hidden_by_user_id?: string | null
          id?: string
          reason?: string | null
          target_id: string
          target_kind?: string
          tenant_id: string
        }
        Update: {
          hidden_at?: string
          hidden_by_user_id?: string | null
          id?: string
          reason?: string | null
          target_id?: string
          target_kind?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_visibility_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_channel_referral_config: {
        Row: {
          created_at: string
          hub_referral_bps: number
          source_workspace_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          hub_referral_bps?: number
          source_workspace_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          hub_referral_bps?: number
          source_workspace_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_channel_referral_config_source_workspace_id_fkey"
            columns: ["source_workspace_id"]
            isOneToOne: true
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_commission_overrides: {
        Row: {
          base_reservation_fee_bps: number | null
          base_reservation_fee_cents: number | null
          default_workspace_take_bps: number | null
          default_workspace_take_per_unit_cents: number | null
          default_workspace_take_per_unit_label: string | null
          override_note: string
          platform_take_bps: number | null
          platform_take_floor_cents: number | null
          request_status: string | null
          requested_at: string | null
          requested_by_user_id: string | null
          requested_note: string | null
          requested_platform_take_bps: number | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          set_at: string
          set_by_user_id: string | null
          tenant_id: string
        }
        Insert: {
          base_reservation_fee_bps?: number | null
          base_reservation_fee_cents?: number | null
          default_workspace_take_bps?: number | null
          default_workspace_take_per_unit_cents?: number | null
          default_workspace_take_per_unit_label?: string | null
          override_note?: string
          platform_take_bps?: number | null
          platform_take_floor_cents?: number | null
          request_status?: string | null
          requested_at?: string | null
          requested_by_user_id?: string | null
          requested_note?: string | null
          requested_platform_take_bps?: number | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          set_at?: string
          set_by_user_id?: string | null
          tenant_id: string
        }
        Update: {
          base_reservation_fee_bps?: number | null
          base_reservation_fee_cents?: number | null
          default_workspace_take_bps?: number | null
          default_workspace_take_per_unit_cents?: number | null
          default_workspace_take_per_unit_label?: string | null
          override_note?: string
          platform_take_bps?: number | null
          platform_take_floor_cents?: number | null
          request_status?: string | null
          requested_at?: string | null
          requested_by_user_id?: string | null
          requested_note?: string | null
          requested_platform_take_bps?: number | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          set_at?: string
          set_by_user_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_commission_overrides_requested_by_user_id_fkey"
            columns: ["requested_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_commission_overrides_reviewed_by_user_id_fkey"
            columns: ["reviewed_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_commission_overrides_set_by_user_id_fkey"
            columns: ["set_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_commission_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_field_group_settings: {
        Row: {
          created_at: string
          custom_label: string | null
          display_order: number | null
          field_group_id: string
          helper_text: string | null
          id: string
          is_enabled: boolean | null
          show_in_profile_edit: boolean | null
          show_in_public_profile: boolean | null
          show_in_registration: boolean | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_label?: string | null
          display_order?: number | null
          field_group_id: string
          helper_text?: string | null
          id?: string
          is_enabled?: boolean | null
          show_in_profile_edit?: boolean | null
          show_in_public_profile?: boolean | null
          show_in_registration?: boolean | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_label?: string | null
          display_order?: number | null
          field_group_id?: string
          helper_text?: string | null
          id?: string
          is_enabled?: boolean | null
          show_in_profile_edit?: boolean | null
          show_in_public_profile?: boolean | null
          show_in_registration?: boolean | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_field_group_settings_field_group_id_fkey"
            columns: ["field_group_id"]
            isOneToOne: false
            referencedRelation: "profile_field_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_field_group_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_plan_overrides: {
        Row: {
          base_plan_tier: string
          base_talent_seat_limit: number | null
          created_at: string
          created_by: string | null
          ended_at: string | null
          ended_by: string | null
          expires_at: string | null
          grant_kind: string
          id: string
          note: string | null
          override_plan_tier: string
          override_talent_seat_limit: number | null
          reason: string | null
          starts_at: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          base_plan_tier: string
          base_talent_seat_limit?: number | null
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          ended_by?: string | null
          expires_at?: string | null
          grant_kind?: string
          id?: string
          note?: string | null
          override_plan_tier: string
          override_talent_seat_limit?: number | null
          reason?: string | null
          starts_at?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          base_plan_tier?: string
          base_talent_seat_limit?: number | null
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          ended_by?: string | null
          expires_at?: string | null
          grant_kind?: string
          id?: string
          note?: string | null
          override_plan_tier?: string
          override_talent_seat_limit?: number | null
          reason?: string | null
          starts_at?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_plan_overrides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_plan_overrides_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_plan_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_profile_field_settings: {
        Row: {
          admin_only_override: boolean | null
          created_at: string
          custom_helper: string | null
          custom_label: string | null
          default_visibility_override: string[] | null
          display_order_override: number | null
          enabled_override: boolean | null
          field_definition_id: string
          id: string
          last_changed_by_user_id: string | null
          required_override: boolean | null
          requires_review_on_change_override: boolean | null
          show_in_directory_card_override: boolean | null
          show_in_directory_filter_override: boolean | null
          show_in_directory_override: boolean | null
          show_in_edit_drawer_override: boolean | null
          show_in_public_override: boolean | null
          show_in_public_profile_sidebar_override: boolean | null
          show_in_registration_override: boolean | null
          talent_editable_override: boolean | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          admin_only_override?: boolean | null
          created_at?: string
          custom_helper?: string | null
          custom_label?: string | null
          default_visibility_override?: string[] | null
          display_order_override?: number | null
          enabled_override?: boolean | null
          field_definition_id: string
          id?: string
          last_changed_by_user_id?: string | null
          required_override?: boolean | null
          requires_review_on_change_override?: boolean | null
          show_in_directory_card_override?: boolean | null
          show_in_directory_filter_override?: boolean | null
          show_in_directory_override?: boolean | null
          show_in_edit_drawer_override?: boolean | null
          show_in_public_override?: boolean | null
          show_in_public_profile_sidebar_override?: boolean | null
          show_in_registration_override?: boolean | null
          talent_editable_override?: boolean | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          admin_only_override?: boolean | null
          created_at?: string
          custom_helper?: string | null
          custom_label?: string | null
          default_visibility_override?: string[] | null
          display_order_override?: number | null
          enabled_override?: boolean | null
          field_definition_id?: string
          id?: string
          last_changed_by_user_id?: string | null
          required_override?: boolean | null
          requires_review_on_change_override?: boolean | null
          show_in_directory_card_override?: boolean | null
          show_in_directory_filter_override?: boolean | null
          show_in_directory_override?: boolean | null
          show_in_edit_drawer_override?: boolean | null
          show_in_public_override?: boolean | null
          show_in_public_profile_sidebar_override?: boolean | null
          show_in_registration_override?: boolean | null
          talent_editable_override?: boolean | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_profile_field_settings_field_definition_id_fkey"
            columns: ["field_definition_id"]
            isOneToOne: false
            referencedRelation: "profile_field_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_profile_field_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          cancelled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_key: string
          status: string
          stripe_customer_id: string
          stripe_price_id: string | null
          stripe_subscription_id: string
          tenant_id: string
          trial_end: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_key: string
          status?: string
          stripe_customer_id: string
          stripe_price_id?: string | null
          stripe_subscription_id: string
          tenant_id: string
          trial_end?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_key?: string
          status?: string
          stripe_customer_id?: string
          stripe_price_id?: string | null
          stripe_subscription_id?: string
          tenant_id?: string
          trial_end?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      inquiry_offer_line_items_talent_view: {
        Row: {
          created_at: string | null
          id: string | null
          label: string | null
          notes: string | null
          offer_id: string | null
          pricing_unit: Database["public"]["Enums"]["pricing_unit"] | null
          sort_order: number | null
          talent_cost: number | null
          talent_profile_id: string | null
          units: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          label?: string | null
          notes?: string | null
          offer_id?: string | null
          pricing_unit?: Database["public"]["Enums"]["pricing_unit"] | null
          sort_order?: number | null
          talent_cost?: number | null
          talent_profile_id?: string | null
          units?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          label?: string | null
          notes?: string | null
          offer_id?: string | null
          pricing_unit?: Database["public"]["Enums"]["pricing_unit"] | null
          sort_order?: number | null
          talent_cost?: number | null
          talent_profile_id?: string | null
          units?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_offer_line_items_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "inquiry_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_offer_line_items_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_offer_line_items_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_discover_index: {
        Row: {
          agency_name: string | null
          agency_plan_tier: string | null
          agency_tenant_id: string | null
          availability_dots_14d: string | null
          available_days_in_next_30: number | null
          category_label: string | null
          category_slug: string | null
          display_name: string | null
          first_name: string | null
          home_city_text: string | null
          home_country_text: string | null
          id: string | null
          index_refreshed_at: string | null
          is_exclusive: boolean | null
          last_name: string | null
          next_available_date: string | null
          profile_code: string | null
          rating_avg: number | null
          rating_count: number | null
          residence_city_id: string | null
          trust_tier: string | null
          workflow_status:
            | Database["public"]["Enums"]["profile_workflow_status"]
            | null
          would_book_again_pct: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agency_talent_roster_tenant_id_fkey"
            columns: ["agency_tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_profiles_residence_city_id_fkey"
            columns: ["residence_city_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_skills_resolved: {
        Row: {
          booking_count: number | null
          created_at: string | null
          display_order: number | null
          is_generic_fallback: boolean | null
          is_verified: boolean | null
          last_booked_at: string | null
          parent_category_id: string | null
          parent_category_name_en: string | null
          parent_category_slug: string | null
          proficiency_level: string | null
          relationship_type: string | null
          skill_name_en: string | null
          skill_name_es: string | null
          skill_slug: string | null
          skill_term_id: string | null
          talent_profile_id: string | null
          tenant_id: string | null
          updated_at: string | null
          verification_note: string | null
          verified_at: string | null
          verified_by_tenant_id: string | null
          verified_by_user_id: string | null
          years_experience: number | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_profile_taxonomy_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_discover_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_profile_taxonomy_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_profile_taxonomy_taxonomy_term_id_fkey"
            columns: ["skill_term_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_profile_taxonomy_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_profile_taxonomy_verified_by_tenant_id_fkey"
            columns: ["verified_by_tenant_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _clamp_workspace_to_plan_limit: {
        Args: { p_limit: number; p_tenant_id: string }
        Returns: number
      }
      _inquiry_files_tenant_from_path: {
        Args: { name: string }
        Returns: string
      }
      _pitch_files_tenant_from_path: { Args: { name: string }; Returns: string }
      acceptance_summary_for_offer: {
        Args: { p_offer_id: string }
        Returns: {
          accepted_count: number
          declined_count: number
          derived_status: string
          owning_party_id: string
          owning_party_type: string
          pending_count: number
          talent_count: number
        }[]
      }
      allocate_media_gallery_sort_order: {
        Args: { p_count: number; p_talent_profile_id: string }
        Returns: number
      }
      archive_inquiries_for_user: {
        Args: { p_inquiry_ids: string[] }
        Returns: number
      }
      bootstrap_agency_taxonomy_defaults: {
        Args: { p_tenant_id: string }
        Returns: number
      }
      builder_template_usage_totals: {
        Args: never
        Returns: {
          applied_count: number
          template_id: string
          tenant_count: number
        }[]
      }
      cms_page_revisions_trim: {
        Args: { p_keep?: number; p_page_id: string; p_tenant_id: string }
        Returns: number
      }
      cms_public_navigation_for_tenant: {
        Args: { p_tenant_id: string }
        Returns: {
          created_at: string
          href: string
          id: string
          label: string
          locale: string
          parent_id: string | null
          pin_in_menu: boolean
          show_in_sticky_top_nav: boolean
          sort_order: number
          tenant_id: string
          updated_at: string
          version: number
          visible: boolean
          zone: string
        }[]
        SetofOptions: {
          from: "*"
          to: "cms_navigation_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cms_public_navigation_menu_for_tenant: {
        Args: { p_locale: string; p_tenant_id: string; p_zone: string }
        Returns: {
          created_at: string
          id: string
          locale: string
          published_at: string | null
          published_by: string | null
          tenant_id: string
          tree_json: Json
          updated_at: string
          version: number
          zone: string
        }
        SetofOptions: {
          from: "*"
          to: "cms_navigation_menus"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cms_public_pages_for_tenant: {
        Args: { p_tenant_id: string }
        Returns: {
          blocks: Json
          body: string
          canonical_url: string | null
          created_at: string
          created_by: string | null
          draft_seq: number | null
          edit_session_id: string | null
          hero: Json
          id: string
          include_in_sitemap: boolean
          is_freeform: boolean
          is_system_owned: boolean
          json_ld: Json | null
          locale: string
          meta_description: string | null
          meta_title: string | null
          noindex: boolean
          og_description: string | null
          og_image_media_asset_id: string | null
          og_image_url: string | null
          og_title: string | null
          published_at: string | null
          published_homepage_snapshot: Json | null
          published_page_snapshot: Json | null
          scheduled_by: string | null
          scheduled_publish_at: string | null
          scheduled_revision_id: string | null
          slug: string
          status: Database["public"]["Enums"]["cms_page_status"]
          style_classes: Json | null
          style_presets: Json | null
          system_template_key: string | null
          template_key: string
          template_schema_version: number
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "cms_pages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cms_public_posts_for_tenant: {
        Args: { p_tenant_id: string }
        Returns: {
          body: string
          created_at: string
          created_by: string | null
          excerpt: string
          id: string
          include_in_sitemap: boolean
          locale: string
          meta_description: string | null
          meta_title: string | null
          noindex: boolean
          og_image_url: string | null
          published_at: string | null
          slug: string
          status: Database["public"]["Enums"]["cms_page_status"]
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "cms_posts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cms_public_redirects_for_tenant: {
        Args: { p_tenant_id: string }
        Returns: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          new_path: string
          old_path: string
          status_code: number
          tenant_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "cms_redirects"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cms_section_revisions_trim: {
        Args: { p_keep?: number; p_section_id: string; p_tenant_id: string }
        Returns: number
      }
      complete_client_onboarding: { Args: never; Returns: undefined }
      complete_talent_onboarding: { Args: never; Returns: string }
      complete_talent_onboarding_with_locations: {
        Args: {
          p_date_of_birth?: string
          p_display_name?: string
          p_first_name?: string
          p_gender?: string
          p_last_name?: string
          p_nationality?: string
          p_origin_city_name_en?: string
          p_origin_city_name_es?: string
          p_origin_city_slug?: string
          p_origin_country_iso2?: string
          p_origin_country_name_en?: string
          p_origin_country_name_es?: string
          p_origin_lat?: number
          p_origin_lng?: number
          p_phone?: string
          p_residence_city_name_en?: string
          p_residence_city_name_es?: string
          p_residence_city_slug?: string
          p_residence_country_iso2?: string
          p_residence_country_name_en?: string
          p_residence_country_name_es?: string
          p_residence_lat?: number
          p_residence_lng?: number
        }
        Returns: string
      }
      compute_talent_availability_snapshot: {
        Args: { p_now?: string; p_talent_profile_id: string }
        Returns: {
          availability_dots_14d: string
          available_days_in_next_30: number
          next_available_date: string
        }[]
      }
      count_builder_component_section_embed_keys: {
        Args: never
        Returns: {
          embed_key: string
          n: number
        }[]
      }
      count_builder_component_usage: {
        Args: never
        Returns: {
          kind: string
          n: number
        }[]
      }
      current_tenant_id: { Args: never; Returns: string }
      current_user_tenant_ids: { Args: never; Returns: string[] }
      default_country_name_en: { Args: { p_iso2: string }; Returns: string }
      default_country_name_es: { Args: { p_iso2: string }; Returns: string }
      descendants_of: {
        Args: { p_term_id: string }
        Returns: {
          id: string
        }[]
      }
      directory_facet_b_def_id_for_legacy_id: {
        Args: { p_legacy_id: string }
        Returns: string
      }
      directory_facet_boolean_field_value_counts: {
        Args: {
          p_boolean_filters: Json
          p_field_definition_id: string
          p_gender_filter: string[]
          p_height_max: number
          p_height_min: number
          p_location_city_slug: string
          p_search: string
          p_selected_taxonomy_ids: string[]
          p_text_filters: Json
        }
        Returns: {
          profile_count: number
          value_bool: boolean
        }[]
      }
      directory_facet_gender_value_counts: {
        Args: {
          p_boolean_filters: Json
          p_height_max: number
          p_height_min: number
          p_location_city_slug: string
          p_search: string
          p_selected_taxonomy_ids: string[]
          p_text_filters: Json
        }
        Returns: {
          gender_value: string
          profile_count: number
        }[]
      }
      directory_facet_location_counts:
        | {
            Args: {
              p_height_max: number
              p_height_min: number
              p_search: string
              p_selected_taxonomy_ids: string[]
            }
            Returns: {
              city_slug: string
              profile_count: number
            }[]
          }
        | {
            Args: {
              p_height_max: number
              p_height_min: number
              p_search: string
              p_selected_taxonomy_ids: string[]
              p_tenant_id: string
            }
            Returns: {
              city_slug: string
              profile_count: number
            }[]
          }
      directory_facet_normalize_value: {
        Args: { p_raw: string }
        Returns: string
      }
      directory_facet_scalar_base_ids: {
        Args: {
          p_boolean_filters: Json
          p_gender_filter: string[]
          p_height_max: number
          p_height_min: number
          p_location_city_slug: string
          p_search: string
          p_selected_taxonomy_ids: string[]
          p_text_filters: Json
        }
        Returns: string[]
      }
      directory_facet_slugify: { Args: { p_raw: string }; Returns: string }
      directory_facet_taxonomy_counts_for_kind: {
        Args: {
          p_height_max: number
          p_height_min: number
          p_kind: string
          p_location_city_slug: string
          p_search: string
          p_selected_taxonomy_ids: string[]
        }
        Returns: {
          profile_count: number
          taxonomy_term_id: string
        }[]
      }
      directory_facet_text_field_value_counts: {
        Args: {
          p_boolean_filters: Json
          p_field_definition_id: string
          p_gender_filter: string[]
          p_height_max: number
          p_height_min: number
          p_location_city_slug: string
          p_search: string
          p_selected_taxonomy_ids: string[]
          p_text_filters: Json
        }
        Returns: {
          profile_count: number
          value_text: string
        }[]
      }
      directory_search_public_talent_ids: {
        Args: { p_query: string }
        Returns: string[]
      }
      engine_add_requirement_group: {
        Args: {
          p_actor_user_id: string
          p_inquiry_id: string
          p_notes: string
          p_quantity_required: number
          p_role_key: string
        }
        Returns: string
      }
      engine_add_secondary_coordinator: {
        Args: {
          p_actor_user_id: string
          p_inquiry_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      engine_assign_participant_to_group: {
        Args: {
          p_actor_user_id: string
          p_group_id: string
          p_participant_id: string
        }
        Returns: undefined
      }
      engine_cancel_inquiry: {
        Args: {
          p_actor_user_id: string
          p_inquiry_id: string
          p_reason?: string
        }
        Returns: undefined
      }
      engine_convert_to_booking: {
        Args: {
          p_actor_user_id: string
          p_inquiry_expected_version: number
          p_inquiry_id: string
          p_override_reason?: string
        }
        Returns: string
      }
      engine_emit_event: {
        Args: {
          p_actor_role: Database["public"]["Enums"]["inquiry_event_actor_role"]
          p_actor_user_id: string
          p_event_type: string
          p_inquiry_id: string
          p_payload?: Json
          p_visibility: Database["public"]["Enums"]["inquiry_event_visibility"]
        }
        Returns: undefined
      }
      engine_emit_notification: {
        Args: {
          p_body?: string
          p_tenant_id: string
          p_title: string
          p_user_id: string
        }
        Returns: string
      }
      engine_emit_system_event: {
        Args: { p_event_type: string; p_inquiry_id: string; p_payload?: Json }
        Returns: undefined
      }
      engine_inquiry_group_shortfall: {
        Args: { p_inquiry_id: string }
        Returns: Json
      }
      engine_load_commission_context: {
        Args: { p_booking_id: string }
        Returns: Json
      }
      engine_persist_booking_commission_snapshot: {
        Args: { p_booking_id: string; p_rows: Json }
        Returns: Json
      }
      engine_platform_commission_split: { Args: never; Returns: number }
      engine_promote_to_primary: {
        Args: {
          p_actor_user_id: string
          p_inquiry_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      engine_remove_requirement_group: {
        Args: { p_actor_user_id: string; p_group_id: string }
        Returns: undefined
      }
      engine_remove_secondary_coordinator: {
        Args: {
          p_actor_user_id: string
          p_inquiry_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      engine_send_offer: {
        Args: {
          p_actor_user_id: string
          p_inquiry_expected_version: number
          p_inquiry_id: string
          p_offer_expected_version: number
          p_offer_id: string
        }
        Returns: {
          next_inquiry_version: number
          next_offer_version: number
        }[]
      }
      engine_submit_approval: {
        Args: {
          p_actor_user_id: string
          p_decision: string
          p_inquiry_expected_version: number
          p_inquiry_id: string
          p_notes?: string
          p_offer_id: string
          p_participant_id: string
        }
        Returns: Json
      }
      engine_update_requirement_group: {
        Args: {
          p_actor_user_id: string
          p_group_id: string
          p_notes: string
          p_quantity_required: number
          p_role_key: string
        }
        Returns: undefined
      }
      engine_workspace_base_fee_inputs: {
        Args: { p_tenant_id: string }
        Returns: Json
      }
      ensure_city_location: {
        Args: {
          p_city_name_en?: string
          p_city_name_es?: string
          p_city_slug?: string
          p_country_iso2: string
          p_country_name_en?: string
          p_country_name_es?: string
          p_lat?: number
          p_lng?: number
          p_population?: number
        }
        Returns: {
          city_id: string
          country_id: string
        }[]
      }
      ensure_country: {
        Args: { p_iso2: string; p_name_en?: string; p_name_es?: string }
        Returns: string
      }
      ensure_guest_session: { Args: { p_session_key: string }; Returns: string }
      find_auth_user_identity_by_email: {
        Args: { p_email: string }
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"]
          app_role: Database["public"]["Enums"]["app_role"]
          display_name: string
          has_client_profile: boolean
          user_id: string
        }[]
      }
      find_taxonomy_assignment_drift: {
        Args: never
        Returns: {
          reason: string
          relationship_type: string
          talent_profile_id: string
          taxonomy_term_id: string
          term_type: string
        }[]
      }
      generate_profile_code: { Args: never; Returns: string }
      get_inquiry_thread_unread_count: {
        Args: {
          p_inquiry_id: string
          p_thread_type: Database["public"]["Enums"]["inquiry_thread_type"]
        }
        Returns: number
      }
      get_inquiry_timeline: {
        Args: { p_inquiry_id: string }
        Returns: {
          actor_role: Database["public"]["Enums"]["inquiry_event_actor_role"]
          actor_user_id: string
          created_at: string
          event_type: string
          id: string
          inquiry_id: string
          payload: Json
          visibility: Database["public"]["Enums"]["inquiry_event_visibility"]
        }[]
      }
      get_user_unread_inquiry_ids: {
        Args: never
        Returns: {
          inquiry_id: string
          last_unread_at: string
        }[]
      }
      guest_add_saved_talent: {
        Args: { p_session_key: string; p_talent_profile_id: string }
        Returns: undefined
      }
      guest_list_saved_talent_ids: {
        Args: { p_session_key: string }
        Returns: {
          talent_profile_id: string
        }[]
      }
      guest_remove_saved_talent: {
        Args: { p_session_key: string; p_talent_profile_id: string }
        Returns: undefined
      }
      increment_ai_usage_monthly: {
        Args: {
          p_month_key: string
          p_spend_delta_cents: number
          p_tenant_id: string
        }
        Returns: undefined
      }
      inquiry_approval_summary: {
        Args: { p_inquiry_id: string; p_offer_id: string }
        Returns: Json
      }
      inquiry_audit_emit: {
        Args: {
          p_amount_cents?: number
          p_currency?: string
          p_inquiry_id: string
          p_kind: string
          p_payload?: Json
        }
        Returns: string
      }
      inquiry_audit_emit_field: {
        Args: {
          p_actor_role?: string
          p_field_group: string
          p_field_key: string
          p_inquiry_id: string
          p_new_value?: Json
          p_old_value?: Json
          p_visibility_scope?: string
        }
        Returns: string
      }
      inquiry_mark_thread_read: {
        Args: {
          p_inquiry_id: string
          p_thread_type: Database["public"]["Enums"]["inquiry_thread_type"]
        }
        Returns: undefined
      }
      is_agency_staff: { Args: never; Returns: boolean }
      is_booking_coordinator: {
        Args: { p_booking_id: string }
        Returns: boolean
      }
      is_cross_tenant_inquiry: {
        Args: { p_inquiry_id: string }
        Returns: boolean
      }
      is_inquiry_coordinator: {
        Args: { p_inquiry_id: string }
        Returns: boolean
      }
      is_platform_admin: { Args: never; Returns: boolean }
      is_reserved_platform_hostname: {
        Args: { p_hostname: string }
        Returns: boolean
      }
      is_staff_of_tenant: {
        Args: { target_tenant_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
      is_talent_profile_owner: {
        Args: { profile_id: string }
        Returns: boolean
      }
      language_level_rank: { Args: { p_level: string }; Returns: number }
      lineup_status_summary: {
        Args: { p_inquiry_id: string }
        Returns: {
          derived_label: string
          total_accepted: number
          total_declined: number
          total_pending: number
          total_talents: number
        }[]
      }
      list_applied_migrations: {
        Args: never
        Returns: {
          version: string
        }[]
      }
      list_public_columns: {
        Args: never
        Returns: {
          column_name: string
          table_name: string
        }[]
      }
      list_public_tables: {
        Args: never
        Returns: {
          table_name: string
        }[]
      }
      list_table_columns: {
        Args: never
        Returns: {
          column_name: string
          table_name: string
        }[]
      }
      match_talent_embeddings: {
        Args: { p_match_count?: number; p_query_embedding: string }
        Returns: {
          distance: number
          talent_profile_id: string
        }[]
      }
      merge_guest_session_to_client:
        | {
            Args: { p_client_profile_id: string; p_session_key: string }
            Returns: undefined
          }
        | {
            Args: {
              p_client_profile_id: string
              p_session_key: string
              p_verified_email: string
            }
            Returns: undefined
          }
      normalize_location_slug: { Args: { p_input: string }; Returns: string }
      owning_parties_for_inquiry: {
        Args: { p_inquiry_id: string }
        Returns: {
          owning_party_id: string
          owning_party_type: string
          talent_count: number
        }[]
      }
      parent_category_of: { Args: { p_term_id: string }; Returns: string }
      pending_exclusivity_prompts_for_talent: {
        Args: { p_talent_profile_id: string }
        Returns: {
          agency_name: string
          agency_plan_tier: string
          auto_assigned_at: string
          roster_id: string
          tenant_id: string
        }[]
      }
      recompute_talent_height_gender: {
        Args: { p_talent_profile_id: string }
        Returns: undefined
      }
      reconcile_expired_plan_overrides: {
        Args: { p_tenant_id?: string }
        Returns: number
      }
      reconcile_expired_talent_plan_overrides: {
        Args: { p_talent_profile_id?: string }
        Returns: number
      }
      record_phase5_audit: {
        Args: {
          p_action: string
          p_after_hash: string
          p_before_hash: string
          p_correlation_id: string
          p_diff_summary: string
          p_target_id: string
          p_target_type: string
          p_tenant_id: string
        }
        Returns: string
      }
      refresh_talent_discover_index: { Args: never; Returns: undefined }
      refresh_talent_skill_metrics: {
        Args: { p_talent_profile_id: string; p_taxonomy_term_id: string }
        Returns: undefined
      }
      refresh_talent_skill_metrics_all: { Args: never; Returns: number }
      release_offering_stock: {
        Args: { p_offering_id: string; p_qty?: number }
        Returns: undefined
      }
      replace_talent_languages: {
        Args: { p_rows: Json; p_talent_profile_id: string; p_tenant_id: string }
        Returns: undefined
      }
      require_staff_of_tenant: {
        Args: { target_tenant_id: string }
        Returns: undefined
      }
      reserve_offering_stock: {
        Args: { p_offering_id: string; p_qty?: number }
        Returns: boolean
      }
      resolve_public_tenant_by_slug: {
        Args: { p_slug: string }
        Returns: {
          tenant_id: string
          tenant_slug: string
        }[]
      }
      review_is_arms_length_paid: {
        Args: {
          p_booking_id: string
          p_client_user_id: string
          p_talent_profile_id: string
        }
        Returns: boolean
      }
      rotate_unsubscribe_token: { Args: { p_user_id: string }; Returns: string }
      search_inquiry_messages: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          body: string
          created_at: string
          id: string
          inquiry_id: string
          rank: number
          sender_user_id: string
        }[]
      }
      search_queries_fallback_reason_rollup: {
        Args: { p_limit?: number; p_since: string }
        Returns: {
          cnt: number
          reason: string
        }[]
      }
      set_primary_agency_domain: {
        Args: { p_hostname: string; p_tenant_id: string }
        Returns: undefined
      }
      set_tenant_context: { Args: { p_tenant_id: string }; Returns: undefined }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      submit_own_talent_profile_for_review: {
        Args: {
          p_completion_score: number
          p_snapshot?: Json
          p_source_revision_id?: string
          p_submission_context: string
          p_terms_version: string
        }
        Returns: Json
      }
      sync_location_taxonomy_terms: { Args: never; Returns: undefined }
      talent_compute_publicly_listed: {
        Args: { p_talent_profile_id: string }
        Returns: boolean
      }
      talent_has_public_roster: {
        Args: { p_talent_profile_id: string }
        Returns: boolean
      }
      talent_is_site_visible_anywhere: {
        Args: { p_talent_id: string }
        Returns: boolean
      }
      talent_profile_has_max: { Args: { profile_id: string }; Returns: boolean }
      talent_public_site_for_profile_code: {
        Args: { p_profile_code: string }
        Returns: {
          profile_code: string
          published_at: string
          published_snapshot: Json
          talent_profile_id: string
        }[]
      }
      talent_recompute_completed_bookings: {
        Args: { p_talent_profile_id: string }
        Returns: undefined
      }
      talent_refresh_publicly_listed: {
        Args: { p_ids: string[] }
        Returns: undefined
      }
      talent_reviews_recompute_summary: {
        Args: { p_talent_profile_id: string }
        Returns: undefined
      }
      talent_site_domain_lookup: {
        Args: { p_host: string }
        Returns: {
          domain: string
          site_slug: string
          talent_profile_id: string
        }[]
      }
      talent_soft_delete_own_media: {
        Args: { p_media_id: string }
        Returns: Json
      }
      taxv1_uuid: {
        Args: { p_slug: string; p_term_type: string }
        Returns: string
      }
      toggle_inquiry_manual_unread: {
        Args: { p_inquiry_id: string }
        Returns: boolean
      }
      toggle_inquiry_pin: { Args: { p_inquiry_id: string }; Returns: boolean }
      usage_audit_metrics: { Args: never; Returns: Json }
      user_notifications_mark_all_read: {
        Args: { p_tenant_id: string }
        Returns: number
      }
      user_notifications_mark_read: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
    }
    Enums: {
      account_status: "registered" | "onboarding" | "active" | "suspended"
      ai_credential_mode: "platform" | "agency" | "inherit"
      ai_credential_ui_state:
        | "unset"
        | "active"
        | "disabled"
        | "invalid"
        | "needs_billing"
      ai_provider_registry_kind: "none" | "openai" | "anthropic" | "custom"
      ai_provider_unavailable_behavior: "graceful" | "strict"
      app_role: "super_admin" | "agency_staff" | "talent" | "client"
      bio_es_status: "missing" | "auto" | "reviewed" | "approved" | "stale"
      booking_status:
        | "tentative"
        | "confirmed"
        | "completed"
        | "cancelled"
        | "draft"
        | "in_progress"
        | "archived"
      builder_template_kind:
        | "element"
        | "section"
        | "connected"
        | "page_template"
        | "starter_kit"
        | "shell_header"
        | "shell_footer"
      builder_template_status: "draft" | "in_review" | "published" | "archived"
      builder_template_target: "talent" | "workspace" | "both" | "platform"
      client_account_type:
        | "private_client"
        | "villa"
        | "resort"
        | "hotel"
        | "restaurant"
        | "beach_club"
        | "real_estate_company"
        | "brand"
        | "agency"
        | "other"
        | "bar_nightclub"
        | "brand_activation"
        | "event_venue"
        | "office_company"
      client_trust_level: "basic" | "verified" | "silver" | "gold"
      cms_page_status: "draft" | "published" | "archived"
      cms_revision_kind: "draft" | "published" | "rollback"
      cms_section_status: "draft" | "published" | "archived"
      exclusivity_status:
        | "confirmed"
        | "auto_assigned"
        | "declined"
        | "notice_period"
      field_required_level: "optional" | "recommended" | "required"
      field_value_type:
        | "text"
        | "textarea"
        | "number"
        | "date"
        | "boolean"
        | "taxonomy_single"
        | "taxonomy_multi"
        | "location"
      inquiry_approval_status: "pending" | "accepted" | "rejected"
      inquiry_event_actor_role:
        | "system"
        | "admin"
        | "coordinator"
        | "client"
        | "talent"
      inquiry_event_visibility: "participants" | "staff_only"
      inquiry_offer_status:
        | "draft"
        | "sent"
        | "accepted"
        | "rejected"
        | "superseded"
        | "invalidated"
        | "expired"
      inquiry_participant_role: "client" | "coordinator" | "talent"
      inquiry_participant_status: "invited" | "active" | "declined" | "removed"
      inquiry_source_channel:
        | "directory_guest"
        | "directory_client"
        | "phone"
        | "whatsapp"
        | "email"
        | "admin"
        | "other"
        | "pitch"
        | "direct_client_dashboard"
        | "discover_single_talent"
        | "discover_shortlist"
        | "saved_talent"
        | "public_talent_profile"
        | "agency_site"
        | "hub_site"
        | "admin_created"
        | "book_again"
        | "instant_book"
        | "offering_request"
      inquiry_status:
        | "new"
        | "reviewing"
        | "waiting_for_client"
        | "talent_suggested"
        | "in_progress"
        | "closed"
        | "archived"
        | "qualified"
        | "converted"
        | "closed_lost"
        | "draft"
        | "submitted"
        | "coordination"
        | "offer_pending"
        | "approved"
        | "booked"
        | "rejected"
        | "expired"
      inquiry_thread_type: "private" | "group"
      media_approval_state: "pending" | "approved" | "rejected"
      media_purpose:
        | "talent"
        | "branding"
        | "cms"
        | "starter_kit"
        | "document"
        | "video"
      media_variant_kind:
        | "original"
        | "card"
        | "gallery"
        | "banner"
        | "lightbox"
        | "public_watermarked"
        | "watermarked"
        | "hero"
      membership_status:
        | "active"
        | "inactive"
        | "pending"
        | "expired"
        | "manual_override"
      membership_tier: "free" | "free_trial" | "premium" | "featured"
      organization_kind: "agency" | "hub"
      payment_method: "cash" | "transfer" | "other"
      payment_status: "unpaid" | "partial" | "paid" | "cancelled" | "refunded"
      pitch_share_channel: "whatsapp" | "email" | "copy_link"
      pitch_status:
        | "draft"
        | "sent"
        | "viewed"
        | "edited"
        | "approved"
        | "converted"
        | "declined"
        | "cancelled"
        | "expired"
      pricing_unit:
        | "hour"
        | "day"
        | "week"
        | "event"
        | "half_day"
        | "per_person"
        | "per_contact"
        | "flat_package"
        | "custom"
      profile_workflow_status:
        | "draft"
        | "invited"
        | "submitted"
        | "under_review"
        | "approved"
        | "published"
        | "hidden"
        | "archived"
      revision_status: "pending" | "approved" | "rejected"
      talent_application_status:
        | "pending"
        | "approved"
        | "rejected"
        | "withdrawn"
      taxonomy_kind:
        | "talent_type"
        | "tag"
        | "skill"
        | "event_type"
        | "industry"
        | "fit_label"
        | "language"
        | "location_city"
        | "location_country"
      visibility: "public" | "hidden" | "private"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_status: ["registered", "onboarding", "active", "suspended"],
      ai_credential_mode: ["platform", "agency", "inherit"],
      ai_credential_ui_state: [
        "unset",
        "active",
        "disabled",
        "invalid",
        "needs_billing",
      ],
      ai_provider_registry_kind: ["none", "openai", "anthropic", "custom"],
      ai_provider_unavailable_behavior: ["graceful", "strict"],
      app_role: ["super_admin", "agency_staff", "talent", "client"],
      bio_es_status: ["missing", "auto", "reviewed", "approved", "stale"],
      booking_status: [
        "tentative",
        "confirmed",
        "completed",
        "cancelled",
        "draft",
        "in_progress",
        "archived",
      ],
      builder_template_kind: [
        "element",
        "section",
        "connected",
        "page_template",
        "starter_kit",
        "shell_header",
        "shell_footer",
      ],
      builder_template_status: ["draft", "in_review", "published", "archived"],
      builder_template_target: ["talent", "workspace", "both", "platform"],
      client_account_type: [
        "private_client",
        "villa",
        "resort",
        "hotel",
        "restaurant",
        "beach_club",
        "real_estate_company",
        "brand",
        "agency",
        "other",
        "bar_nightclub",
        "brand_activation",
        "event_venue",
        "office_company",
      ],
      client_trust_level: ["basic", "verified", "silver", "gold"],
      cms_page_status: ["draft", "published", "archived"],
      cms_revision_kind: ["draft", "published", "rollback"],
      cms_section_status: ["draft", "published", "archived"],
      exclusivity_status: [
        "confirmed",
        "auto_assigned",
        "declined",
        "notice_period",
      ],
      field_required_level: ["optional", "recommended", "required"],
      field_value_type: [
        "text",
        "textarea",
        "number",
        "date",
        "boolean",
        "taxonomy_single",
        "taxonomy_multi",
        "location",
      ],
      inquiry_approval_status: ["pending", "accepted", "rejected"],
      inquiry_event_actor_role: [
        "system",
        "admin",
        "coordinator",
        "client",
        "talent",
      ],
      inquiry_event_visibility: ["participants", "staff_only"],
      inquiry_offer_status: [
        "draft",
        "sent",
        "accepted",
        "rejected",
        "superseded",
        "invalidated",
        "expired",
      ],
      inquiry_participant_role: ["client", "coordinator", "talent"],
      inquiry_participant_status: ["invited", "active", "declined", "removed"],
      inquiry_source_channel: [
        "directory_guest",
        "directory_client",
        "phone",
        "whatsapp",
        "email",
        "admin",
        "other",
        "pitch",
        "direct_client_dashboard",
        "discover_single_talent",
        "discover_shortlist",
        "saved_talent",
        "public_talent_profile",
        "agency_site",
        "hub_site",
        "admin_created",
        "book_again",
        "instant_book",
        "offering_request",
      ],
      inquiry_status: [
        "new",
        "reviewing",
        "waiting_for_client",
        "talent_suggested",
        "in_progress",
        "closed",
        "archived",
        "qualified",
        "converted",
        "closed_lost",
        "draft",
        "submitted",
        "coordination",
        "offer_pending",
        "approved",
        "booked",
        "rejected",
        "expired",
      ],
      inquiry_thread_type: ["private", "group"],
      media_approval_state: ["pending", "approved", "rejected"],
      media_purpose: [
        "talent",
        "branding",
        "cms",
        "starter_kit",
        "document",
        "video",
      ],
      media_variant_kind: [
        "original",
        "card",
        "gallery",
        "banner",
        "lightbox",
        "public_watermarked",
        "watermarked",
        "hero",
      ],
      membership_status: [
        "active",
        "inactive",
        "pending",
        "expired",
        "manual_override",
      ],
      membership_tier: ["free", "free_trial", "premium", "featured"],
      organization_kind: ["agency", "hub"],
      payment_method: ["cash", "transfer", "other"],
      payment_status: ["unpaid", "partial", "paid", "cancelled", "refunded"],
      pitch_share_channel: ["whatsapp", "email", "copy_link"],
      pitch_status: [
        "draft",
        "sent",
        "viewed",
        "edited",
        "approved",
        "converted",
        "declined",
        "cancelled",
        "expired",
      ],
      pricing_unit: [
        "hour",
        "day",
        "week",
        "event",
        "half_day",
        "per_person",
        "per_contact",
        "flat_package",
        "custom",
      ],
      profile_workflow_status: [
        "draft",
        "invited",
        "submitted",
        "under_review",
        "approved",
        "published",
        "hidden",
        "archived",
      ],
      revision_status: ["pending", "approved", "rejected"],
      talent_application_status: [
        "pending",
        "approved",
        "rejected",
        "withdrawn",
      ],
      taxonomy_kind: [
        "talent_type",
        "tag",
        "skill",
        "event_type",
        "industry",
        "fit_label",
        "language",
        "location_city",
        "location_country",
      ],
      visibility: ["public", "hidden", "private"],
    },
  },
} as const
