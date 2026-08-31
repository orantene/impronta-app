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
  marketing_support_opened: "marketing_support_opened",
  marketing_support_question_sent: "marketing_support_question_sent",
  marketing_support_answer_shown: "marketing_support_answer_shown",
  marketing_support_email_captured: "marketing_support_email_captured",
  marketing_support_human_requested: "marketing_support_human_requested",
  marketing_contact_form_submitted: "marketing_contact_form_submitted",

  // ---------------------------------------------------------------------------
  // /get-started funnel — step instrumentation so we can find where the
  // 87.5% who bounce actually drop off. Each event fires once per visitor
  // per form session. Joined client-side via fetch /api/analytics/events
  // and GA4 in parallel.
  // ---------------------------------------------------------------------------

  /** Fires when the get-started page mounts (visitor reached the form). Payload: { tier?, audience_initial } */
  marketing_funnel_viewed: "marketing_funnel_viewed",

  /** Fires when the visitor first types the business/project name — top-of-funnel intent. Payload: { audience } */
  marketing_business_name_typed: "marketing_business_name_typed",

  /** Fires when the visitor first focuses the email field — proxy for "intent to submit". Payload: { audience } */
  marketing_email_focused: "marketing_email_focused",

  /** Fires when the visitor first types into the subdomain field. Payload: { audience } */
  marketing_subdomain_typed: "marketing_subdomain_typed",

  /** Fires when subdomain availability check returns. Payload: { available, audience, length } */
  marketing_subdomain_checked: "marketing_subdomain_checked",

  /** Fires when the visitor selects a roster-size bucket. Payload: { bucket, audience } */
  marketing_roster_size_selected: "marketing_roster_size_selected",

  /** Fires the moment submit is clicked, BEFORE the server action returns. Payload: { audience, has_subdomain, roster_size, tier? } */
  marketing_submit_attempted: "marketing_submit_attempted",

  /** Fires if the server action returns an error. Payload: { audience, error_code } */
  marketing_submit_failed: "marketing_submit_failed",

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

  // ---------------------------------------------------------------------------
  // First-party page-view analytics (B3 — ANALYTICS-1 foundation)
  // The component that fires this event is built in ANALYTICS-2.
  // ---------------------------------------------------------------------------

  /**
   * Fired once per page render on any public surface (storefront, talent-profile,
   * talent-site). Payload: { surface, tenant_id, page_id?, page_slug?, referrer? }
   *
   * tenant_id is written to analytics_events.tenant_id (not payload-only) so
   * admin-data.ts .eq('tenant_id') filters return real rows instead of 0.
   */
  view_site_page: "view_site_page",

  // ---------------------------------------------------------------------------
  // ABTEST-1 — minimal A/B testing on CTA / form sections (shared variant engine)
  // Fired by the inline experiment runtime the shared renderer injects when a
  // CTA / form node carries a live 2-arm experiment. Both events reuse this same
  // /api/analytics/events seam (NO parallel table) and carry tenant_id top-level
  // so per-tenant experiment reporting matches real rows.
  // ---------------------------------------------------------------------------

  /**
   * Fired once per visitor per experiment node when its bucketed variant first
   * renders into view. Payload: { experiment_id, variant, node_kind, tenant_id?, surface? }
   */
  experiment_view: "experiment_view",

  /**
   * Fired when the visitor completes the node's conversion for the served
   * variant — a CTA click (button / cta_group) or a form submit (form).
   * Payload: { experiment_id, variant, node_kind, tenant_id?, surface? }
   */
  experiment_convert: "experiment_convert",

  // ---------------------------------------------------------------------------
  // Jon 360 inquiry-funnel taxonomy (Phase 0c CRO instrumentation)
  // The guest acquisition arc on /t/[profileCode]: lineup cart -> early draft
  // row -> live chat -> the send/airlock contact-promotion (the PRIMARY
  // conversion) -> the trust receipt -> a coordinator reply -> an offer.
  //
  // Every event carries the standard Jon-360 funnel props (see
  // jon360-funnel-events.ts / buildJon360Props): { inquiry_id?, tenant_id?,
  // lineup_count, identity ("guest"|"client"), source ("/t/..."), holdout_arm }.
  // tenant_id is promoted to the analytics_events.tenant_id COLUMN by the
  // client (track-client.ts) so per-tenant funnel queries return real rows.
  //
  // HOLDOUT / MDE NOTE (read before reading the dashboard): the 360 arc is
  // bucketed on a stable per-visitor seed into "on" | "off" arms (the holdout)
  // so lift is measured against a true control, not a pre/post guess. Powering
  // a 1% absolute lift on a ~5% baseline conversion (95% conf, 80% power)
  // needs ~7.8k visitors PER ARM (~15.6k total). The /t profile surface alone
  // will not reach that quickly — run the holdout on the higher-traffic
  // directory surface to read a result inside a sane window.
  // ---------------------------------------------------------------------------

  /** A talent is added to the inquiry cart (the launcher rail / a card "+"). Payload: standard. */
  lineup_add: "lineup_add",

  /** A talent is removed from the inquiry cart (rail X / card toggle off). Payload: standard. */
  lineup_remove: "lineup_remove",

  /** The early-partial inquiry row is lazily created on the first structured commit. Payload: standard. */
  draft_created: "draft_created",

  /** The chat launcher panel is opened (once per open transition). Payload: standard. */
  chat_opened: "chat_opened",

  /** A guided-chat structured field is filled (talent / brief / date / budget / ...). Payload: standard + { field }. */
  field_filled: "field_filled",

  /** The guest pressed send / "Send to agency" (intent to submit, fires before promotion lands). Payload: standard. */
  send_clicked: "send_clicked",

  /**
   * PRIMARY CONVERSION. The send/airlock moment: the synthetic early-row contact
   * is promoted to a real reachable contact and the first message lands. Anchored
   * on the INTERNAL analytics_events table (guaranteed write), NOT GA4 alone
   * (consent-gated -> undercounts). Payload: standard.
   */
  contact_promoted: "contact_promoted",

  /** The post-send trust receipt card mounts (SENT -> RECEIVED beat). Payload: standard. */
  receipt_viewed: "receipt_viewed",

  /** A coordinator reply arrives on the guest's thread. Payload: standard. */
  reply_received: "reply_received",

  /** The guest views an offer on the thread. Payload: standard. */
  offer_viewed: "offer_viewed",

  // ---------------------------------------------------------------------------
  // Tulala Agent intake — the learning loop.
  //
  // Scope decision: INSTRUMENT ONLY. Log from day one, analyse by hand until
  // volume justifies more. Data not captured cannot be recovered, but a
  // dashboard over a dozen signups is theatre.
  //
  // Every event is keyed on a versioned question id, never on question text.
  // No transcripts: a question id plus an outcome is enough for all four
  // signals, which keeps docs/ai-data-retention.md intact.
  // ---------------------------------------------------------------------------

  /**
   * A question was put to the user. The baseline every other rate divides by.
   * Payload: { question_id, question_version, bank_version, stage, ask_index, open, decisive }
   */
  tulala_question_asked: "tulala_question_asked",

  /**
   * SIGNAL 1 — abandonment point. The question on screen when a session went
   * cold. The strongest evidence that a question is bad, and it costs one event.
   * Payload: { question_id, question_version, stage, turns, facts_known }
   */
  tulala_intake_abandoned: "tulala_intake_abandoned",

  /**
   * SIGNAL 2 — yield per question. Facts produced, at what confidence, and
   * whether this was a re-ask. A high re-ask rate is a badly worded question,
   * measured rather than guessed. Also how the open-versus-closed phrasing
   * argument gets settled: open phrasings should show higher facts-per-turn AND
   * a higher re-ask rate, making the tradeoff visible.
   * Payload: { question_id, question_version, facts_yielded, fact_keys, mean_confidence, re_ask, open }
   */
  tulala_question_yield: "tulala_question_yield",

  /**
   * SIGNAL 3 — recommendation override. The user changed the structure or the
   * plan on the approval screen. A free ground-truth label on the engine being
   * wrong, volunteered by the only person who knows, and the highest-quality
   * signal in the system. Exists purely because approval is a step rather than
   * an automatic provision.
   * Payload: { engine_version, field, recommended, chosen, talent_confidence, workspace_confidence }
   */
  tulala_recommendation_overridden: "tulala_recommendation_overridden",

  /** The user accepted the recommendation as-is. The control arm for the above. */
  tulala_recommendation_accepted: "tulala_recommendation_accepted",

  /**
   * SIGNAL 4a — the user could not answer. The question is wrong for their
   * industry and belongs in a Phase 6 pack, or does not belong at all.
   * Payload: { question_id, question_version, stage, industry }
   */
  tulala_question_unanswerable: "tulala_question_unanswerable",

  /**
   * SIGNAL 4b — the ENGINE could not classify. A business shape the laws do not
   * cover. Deliberately a separate event from 4a: this one is a product gap and
   * must reach a human, not a metrics table.
   * Payload: { engine_version, kind, note, missing_fact_keys, talent_score, workspace_score }
   */
  tulala_unclassifiable: "tulala_unclassifiable",
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
