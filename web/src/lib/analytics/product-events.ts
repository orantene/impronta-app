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
