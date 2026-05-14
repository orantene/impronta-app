/**
 * Product analytics event names (GA4 custom events + internal `analytics_events.name`).
 * Keep aligned with admin funnel definitions.
 */
export const PRODUCT_ANALYTICS_EVENTS = {
  view_directory: "view_directory",
  view_talent_card: "view_talent_card",
  view_talent_profile: "view_talent_profile",
  start_inquiry: "start_inquiry",
  submit_inquiry: "submit_inquiry",
  start_application: "start_application",
  submit_application: "submit_application",
  save_talent: "save_talent",
  share_profile: "share_profile",
  search: "search",
  refine_search: "refine_search",
  apply_filter: "apply_filter",
  open_ai_explanation: "open_ai_explanation",
  contact_whatsapp: "contact_whatsapp",
  click_email: "click_email",
  click_phone: "click_phone",
  invite_link_clicked: "invite_link_clicked",
  invite_converted: "invite_converted",
  marketing_cta_clicked: "marketing_cta_clicked",
  marketing_waitlist_submitted: "marketing_waitlist_submitted",
  marketing_pricing_viewed: "marketing_pricing_viewed",
  marketing_demo_requested: "marketing_demo_requested",
  marketing_section_viewed: "marketing_section_viewed",
  marketing_faq_opened: "marketing_faq_opened",
  marketing_audience_selected: "marketing_audience_selected",

  // ---------------------------------------------------------------------------
  // Inquiry funnel (step 12 — 2026-05-13)
  // ---------------------------------------------------------------------------

  /** Fired client-side when the inquiry form mounts. Payload: { surface, tenant_id, source_page } */
  inquiry_form_started: "inquiry_form_started",

  /** Fired client-side when a talent is added to the inquiry cart. Payload: { talent_profile_id, source } */
  inquiry_talent_added: "inquiry_talent_added",

  /** Fired client-side on form unmount without submit (best-effort). Payload: { surface, tenant_id, source_page } */
  inquiry_abandoned: "inquiry_abandoned",

  /** Fired server-side on submitInquiry engine success. Payload: { inquiry_id, mode, talent_count, has_budget, source_channel, initiator_role, is_guest } */
  inquiry_submitted: "inquiry_submitted",

  /** Stub for step 3 (category mode UI) — fired when a role+quantity row is added. */
  inquiry_category_added: "inquiry_category_added",

  /** Stub for step 4 (budget UI) — fired when budget unit/amount is set. */
  inquiry_budget_set: "inquiry_budget_set",
} as const;

export type ProductAnalyticsEventName =
  (typeof PRODUCT_ANALYTICS_EVENTS)[keyof typeof PRODUCT_ANALYTICS_EVENTS];

export type ProductAnalyticsPayload = {
  locale?: string;
  role?: string;
  talent_id?: string;
  category_id?: string;
  location_id?: string;
  source_page?: string;
  query_text_length?: number;
  results_count?: number;
  filter_count?: number;
  inquiry_type?: string;
  [key: string]: unknown;
};
