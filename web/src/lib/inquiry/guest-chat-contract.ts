/**
 * guest-chat-contract.ts — THE SHARED CONTRACT for the talent-profile
 * conversational-inquiry MVP (Wave-0 / job C0).
 *
 * This file is the single source of truth every lane imports. It is a
 * PURE TYPES module — it imports NOTHING that pulls in server code
 * (no "use server", no supabase, no engine). That is deliberate: the
 * mini-chat UI lane (Lane D) imports ONLY from here, receives the three
 * server actions as INJECTED CALLBACK PROPS, and therefore never bundles
 * a backend module into the client.
 *
 * Lanes:
 *   • Lane A (backend) implements the server actions + engine guest branch
 *     to exactly these signatures.
 *   • Lane D (UI)      codes MiniChatPanel / TalentChatLauncher against the
 *     props here, with the actions passed down from a server component.
 *   • Lane E (trust)   renders GuestTrustChip against GuestTrustChipProps.
 *   • Lane C (safety)  ships user_blocks + inquiry_reports per the migration
 *     contract (see migrationColumns output) — the row shapes referenced by
 *     the action results live here.
 *
 * GROUND TRUTH these types mirror:
 *   • inquiry_messages columns: id, inquiry_id, thread_type, sender_user_id,
 *     body, metadata, edited_at, deleted_at, created_at, message_kind,
 *     card_payload, reply_to_message_id  (+ NEW guest_session_id from M1).
 *   • inquiries columns used for ownership: id, tenant_id, guest_session_id,
 *     client_user_id, status.
 *   • guest_sessions: id (uuid pk), session_key (text unique).
 *   • InquiryIntent / createInquiryFromIntent (inquiry-intent-engine.ts).
 *   • EngineResult discriminants: success | forbidden | rateLimited | error.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 0. Message-kind discriminator — EXACT mirror of the DB CHECK constraint on
//    inquiry_messages.message_kind (migration 20260513214948). Do not add a
//    value here without an accompanying CHECK migration.
// ─────────────────────────────────────────────────────────────────────────────

export type GuestMessageKind =
  | "text"
  | "offer_event"
  | "payment_request"
  | "payment_paid"
  | "coordinator_request"
  | "talent_rate"
  | "call_sheet_update"
  | "booking_status"
  | "system_event";

/**
 * Who authored a message, as the popup needs to render it. The popup only
 * ever shows the GROUP-thread-equivalent stream a guest is allowed to see;
 * the private staff thread is never sent to a guest.
 *
 *   "guest"  — sent by THIS guest session (sender_user_id null, guest_session_id set). Right-aligned.
 *   "staff"  — agency coordinator/admin reply.        Left-aligned.
 *   "talent" — a talent participant reply.            Left-aligned.
 *   "system" — auto-ack / system_event bubble.        Centered/system style.
 *   "other"  — any other authenticated participant.   Left-aligned (fallback).
 *
 * Lane A derives this server-side (it knows sender_user_id + participant
 * roles + the requesting guest_session_id). The UI must NOT try to recompute
 * authorship from raw ids — it trusts `authorRole`.
 */
export type GuestMessageAuthorRole = "guest" | "staff" | "talent" | "system" | "other";

// ─────────────────────────────────────────────────────────────────────────────
// 1. The canonical guest-thread message shape (what getGuestThreadMessages
//    returns and what sendGuestMessageAction echoes back as the created row).
//    This is the ONLY message shape the popup renders.
// ─────────────────────────────────────────────────────────────────────────────

export type GuestThreadMessage = {
  /** inquiry_messages.id */
  id: string;
  /** inquiry_messages.inquiry_id */
  inquiryId: string;
  /**
   * Rendering bucket. For the guest popup the server only ever returns
   * messages the guest is entitled to see; this is purely a render hint.
   */
  authorRole: GuestMessageAuthorRole;
  /**
   * Display name for left-aligned (non-guest) bubbles — e.g. the agency
   * name or talent display name. Null for guest's own + system bubbles.
   * Already privacy-filtered server-side (never leak staff PII to a guest).
   */
  authorLabel: string | null;
  /** Optional avatar/portrait URL for the author. Null when none. */
  authorAvatarUrl: string | null;
  /** inquiry_messages.body. For deleted rows this is "" (see isDeleted). */
  body: string;
  /** inquiry_messages.message_kind. "text" for normal bubbles. */
  kind: GuestMessageKind;
  /**
   * inquiry_messages.card_payload — opaque per-kind JSON for typed cards
   * (e.g. {offer_id, status, total_cents}). null for text. The MVP popup
   * renders text + a generic fallback for non-text kinds; full ChatCard
   * rendering is a fast-follow. Typed as unknown — the UI must narrow.
   */
  cardPayload: unknown | null;
  /** inquiry_messages.created_at (ISO 8601 string). */
  createdAt: string;
  /** inquiry_messages.edited_at, or null. */
  editedAt: string | null;
  /** True when inquiry_messages.deleted_at is set (render "message removed"). */
  isDeleted: boolean;
  /** inquiry_messages.reply_to_message_id, or null. */
  replyToMessageId: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Shared result envelope. All three guest actions return a discriminated
//    union with the SAME failure vocabulary, mapped from EngineResult so the
//    UI handles them uniformly. `retryAfterMs` is present only on rate_limited.
// ─────────────────────────────────────────────────────────────────────────────

/** Stable failure codes the popup branches on for copy. */
export type GuestChatErrorCode =
  | "rate_limited"        // shared KV limiter tripped (Lane B)
  | "blocked"             // recipient blocked this guest (Lane C user_blocks)
  | "forbidden"           // ownership/permission failure (wrong guest session, etc.)
  | "not_found"           // inquiry/thread does not exist or not owned
  | "validation_failed"   // bad input (empty body, missing email, intent invalid)
  | "disposable_email"    // email gate rejected a disposable domain (Lane B)
  | "captcha_required"    // velocity gate wants a Turnstile token (Lane B)
  | "tenant_unavailable"  // tenant scope could not be resolved
  | "db_unavailable"      // service-role client missing
  | "limit_reached"       // active-conversation trust gate tripped (U3)
  | "engine_error";       // catch-all engine/insert failure

export type GuestChatFailure = {
  ok: false;
  code: GuestChatErrorCode;
  /** Human-readable, already-safe-to-display message. */
  message: string;
  /** Only set when code === "rate_limited". */
  retryAfterMs?: number;
  /** Only set when code === "validation_failed" (field paths, e.g. "requester.email"). */
  missingFields?: string[];
};

// ─────────────────────────────────────────────────────────────────────────────
// 3a. startGuestChatInquiry — creates the real inquiry + guest client + the
//     opening message. Wraps createInquiryFromIntent + ensureGuestClientByEmail.
//
//     SECURITY: the guest session key is read SERVER-SIDE from the
//     `x-impronta-guest` header. It is intentionally NOT in this input.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The minimal structured fields the mini-chat collects on first send. The
 * action assembles these into a full InquiryIntent (source:
 * "public_talent_profile") server-side — the UI never builds InquiryIntent.
 */
export type StartGuestChatInput = {
  /** Tenant slug from the talent-profile page (hostCtx.tenantSlug). Required. */
  tenantSlug: string;
  /**
   * The talent the guest is messaging (talent_profiles.id). OPTIONAL: omitted
   * (or empty) on the agency directory/home launcher, which starts a talent-less
   * "message the agency" inquiry (source `agency_site`). Present on a talent
   * profile page (source `public_talent_profile`).
   */
  talentProfileId?: string | null;
  /** Public profile code, for source_context provenance. Omitted on agency-level chats. */
  talentProfileCode?: string | null;
  /** Guest's name from the inline gate. Required (engine requires requester.name). */
  contactName: string;
  /** Guest's email from the inline gate. Required to persist + route + claim. */
  contactEmail: string;
  /** Optional phone. */
  contactPhone?: string | null;
  /** The guest's first free-text message. Becomes the opening group-thread message. Required, non-empty. */
  firstMessage: string;
  /** source_page for attribution (e.g. "/t/TA-12345"). */
  sourcePage: string;
  /**
   * Honeypot field — must be empty. Populated value ⇒ silent spam reject
   * (Lane B / L0). The UI renders a hidden, aria-hidden, off-screen input.
   */
  honeypot?: string | null;
  /** Optional Turnstile token when a velocity challenge was shown (Lane B / L3). */
  captchaToken?: string | null;
};

export type StartGuestChatResult =
  | {
      ok: true;
      /** The created inquiries.id — the popup keys all further calls on this. */
      inquiryId: string;
      /** The opening message row, already in GuestThreadMessage shape. */
      openingMessage: GuestThreadMessage;
      /**
       * The auto-ack system bubble if one was generated synchronously, else
       * null (it may instead arrive on the next poll). Lets the popup show
       * "Got it — we'll reply in ~X" immediately when available.
       */
      autoAckMessage: GuestThreadMessage | null;
      /** Echo of the email used — drives the "we emailed you a link" copy. */
      guestEmail: string;
      /** Guest-account provisioning outcome (mirrors GuestActivationStatus). */
      guestActivation: "matched" | "created" | "unlinked";
    }
  | GuestChatFailure;

// ─────────────────────────────────────────────────────────────────────────────
// 3b. sendGuestMessageAction — append a message to an existing guest-owned
//     inquiry thread. inquiryId + body are the ONLY client inputs.
// ─────────────────────────────────────────────────────────────────────────────

export type SendGuestMessageInput = {
  /** inquiries.id the guest is appending to. Ownership re-checked server-side. */
  inquiryId: string;
  /** Message text. 1..10000 chars after trim. */
  body: string;
  /** Honeypot — must be empty. */
  honeypot?: string | null;
  /** Optional Turnstile token if a challenge was shown mid-conversation. */
  captchaToken?: string | null;
};

export type SendGuestMessageResult =
  | {
      ok: true;
      /** The newly created message, in GuestThreadMessage shape, for optimistic reconcile. */
      message: GuestThreadMessage;
    }
  | GuestChatFailure;

// ─────────────────────────────────────────────────────────────────────────────
// 3b-bis. sendGuestClaimToEmail — send the claim/sign-in magic-link to a
//     DIFFERENT or ADDITIONAL email and register it as a claim CANDIDATE on the
//     guest-owned inquiry. Whichever candidate confirms FIRST claims the
//     conversation (first-confirm-wins; relink lives in /auth/confirm).
//
//     SECURITY: like the other guest actions, the guest session is read
//     server-side from x-impronta-guest and MUST own `inquiryId`. The email is
//     a plain client input; an "unlinked" (staff/talent) email is refused.
// ─────────────────────────────────────────────────────────────────────────────

export type AddGuestClaimEmailInput = {
  /** inquiries.id the guest is adding a claim recipient to. Ownership re-checked server-side. */
  inquiryId: string;
  /** The different/additional email to send the sign-in link to. */
  email: string;
};

export type AddGuestClaimEmailResult =
  | {
      ok: true;
      /** Echo of the email the link was sent to (for the tiny confirmation line). */
      email: string;
    }
  | GuestChatFailure;

// ─────────────────────────────────────────────────────────────────────────────
// 3c. getGuestThreadMessages — initial load + poll source for the popup.
//     Returns the messages this guest session is entitled to see, oldest→newest.
// ─────────────────────────────────────────────────────────────────────────────

export type GetGuestThreadInput = {
  /** inquiries.id. Ownership checked server-side via x-impronta-guest. */
  inquiryId: string;
  /**
   * Poll cursor: when set, return only messages with created_at strictly
   * after this ISO timestamp (cheap incremental poll). Omit/null = full load.
   */
  afterIso?: string | null;
};

export type GetGuestThreadResult =
  | {
      ok: true;
      /** Oldest→newest. When afterIso was set, only the delta. */
      messages: GuestThreadMessage[];
      /**
       * Coarse thread status for the popup header chip ("open" / "you have an
       * offer" / "booked" etc.). Derived from inquiries.status + presence of
       * offer/payment cards. Kept loose; the UI maps to copy.
       */
      threadStatus: GuestThreadStatus;
      /**
       * Honest presence/SLA hint for the header, as a bare FRAGMENT ("in ~4
       * hours", "within a day"). The panel renders `Typically replies {fragment}`
       * — the producer must NOT include the prefix (avoids a double-prefix).
       * Null when not computable. Comes from Lane E / P1.
       */
      typicalReplyLabel: string | null;
    }
  | GuestChatFailure;

/** Coarse status for the popup header. Maps from inquiries.status, not 1:1. */
export type GuestThreadStatus =
  | "open"          // submitted / coordination / active conversation
  | "offer_pending" // an offer card exists awaiting the client
  | "approved"      // all-parties approved, pre-booking
  | "booked"        // converted to a booking
  | "closed";       // declined / archived / cancelled

// ─────────────────────────────────────────────────────────────────────────────
// 3d. getActiveGuestInquiry — returning-guest resume. A SERVER COMPONENT (the
//     launcher mount) calls this on page load to reopen the live thread instead
//     of starting fresh after a refresh. Guest identity is the x-impronta-guest
//     cookie (server-resolved); only an inquiry the cookie OWNS is ever returned.
// ─────────────────────────────────────────────────────────────────────────────

/** The resumable thread + prefill for the inline name/email gate. */
export type ActiveGuestInquiry = {
  /** inquiries.id to reopen — the panel mounts straight into the thread stage. */
  inquiryId: string;
  /** Captured contact fields, so a returning guest never re-types the gate. */
  prefill: {
    name: string | null;
    email: string | null;
    phone: string | null;
  };
};

export type GetActiveGuestInquiryResult =
  | {
      ok: true;
      /** null = nothing to resume (first-time visitor) — open at the intro stage. */
      active: ActiveGuestInquiry | null;
    }
  | GuestChatFailure;

// ─────────────────────────────────────────────────────────────────────────────
// 4. The three injected callback prop types. The UI lane references THESE,
//    never the concrete action functions. A server component passes the real
//    actions (which match these shapes) down as props.
//
//    NOTE: these are typed to TAKE THE INPUT OBJECTS above. The wrapper that a
//    server component passes is responsible for currying tenant/talent context
//    where appropriate; from the UI's perspective it just calls the callback.
// ─────────────────────────────────────────────────────────────────────────────

export type OnStartInquiryCallback = (
  input: StartGuestChatInput,
) => Promise<StartGuestChatResult>;

export type OnSendMessageCallback = (
  input: SendGuestMessageInput,
) => Promise<SendGuestMessageResult>;

export type FetchMessagesCallback = (
  input: GetGuestThreadInput,
) => Promise<GetGuestThreadResult>;

export type AddClaimEmailCallback = (
  input: AddGuestClaimEmailInput,
) => Promise<AddGuestClaimEmailResult>;

// ─────────────────────────────────────────────────────────────────────────────
// 4b. U2 thread-switcher — list ALL live inquiries this guest session owns on a
//     tenant, so the panel can show an avatar-rail when a guest has messaged
//     several talents. Server-resolved by guest cookie; the panel computes the
//     'new' dot client-side (the server always returns unreadHint:false).
// ─────────────────────────────────────────────────────────────────────────────

export type GuestInquirySummary = {
  inquiryId: string;
  talentProfileId: string | null;
  talentName: string;
  talentPortraitUrl: string | null;
  agencyName: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadHint: boolean;
  threadStatus: GuestThreadStatus;
  typicalReplyLabel: string | null;
};

export type ListGuestInquiriesCallback = (input: {
  tenantSlug: string;
}) => Promise<{ ok: true; inquiries: GuestInquirySummary[] } | GuestChatFailure>;

// ─────────────────────────────────────────────────────────────────────────────
// 4c. U4 guided detail chips — five deterministic chips (Date / Location /
//     Headcount / Type / Budget) that each map 1:1 to an InquiryIntent field.
//     captureGuestChip writes interpreted_query + the relevant flat column(s);
//     it NEVER creates an offer (coordinator-driven). The panel renders the chip
//     rail above the composer once an inquiry exists (progressive disclosure).
// ─────────────────────────────────────────────────────────────────────────────

export type GuestChipKind = "date" | "location" | "headcount" | "event_type" | "budget";

export type GuestChipValue = {
  dateStatus?: "exact" | "flexible" | "not_sure";
  eventDate?: string | null;
  city?: string | null;
  locationStatus?: "confirmed" | "unconfirmed" | "online" | "not_sure";
  headcount?: number | null;
  eventType?: string | null;
  budgetPreference?:
    | "agency_recommends"
    | "total_budget"
    | "per_hour"
    | "per_day"
    | "per_week"
    | "per_contract"
    | "per_talent"
    | "not_sure";
  budgetAmount?: number | null;
  currency?: string | null;
};

export type GuestChipInput = { inquiryId: string; kind: GuestChipKind; value: GuestChipValue };

export type GuestChipResult = { ok: true; appliedSummary: string } | GuestChatFailure;

export type CaptureGuestChipCallback = (input: GuestChipInput) => Promise<GuestChipResult>;

// ─────────────────────────────────────────────────────────────────────────────
// 5. MiniChatPanel props — the only substantial new frontend (Lane D / F2).
//    Server actions arrive as the three callbacks above. Branding arrives as
//    plain values so the panel imports nothing server-side.
// ─────────────────────────────────────────────────────────────────────────────

export type MiniChatBrand = {
  /** Agency/talent display name for opener + header ("Message {agencyName}"). */
  agencyName: string;
  /** Talent first name / display name used in the opener ("Hi — I'm {talentName}'s booking assistant"). */
  talentDisplayName: string;
  /**
   * Brand accent color (CSS color string) from agency_branding.theme_json
   * ("color.primary" / accent). Drives the launcher + send button. Optional —
   * falls back to the app default token when null.
   */
  accentColor?: string | null;
  /** Optional agency logo URL for the panel header. */
  logoUrl?: string | null;
  /**
   * Optional custom opener line (tenant_guest_chat_settings.greeting). When set,
   * replaces the default "Hi — I'm {talent}'s booking assistant…" opener.
   */
  greeting?: string | null;
};

export type MiniChatPanelProps = {
  /** Open/close state owned by the launcher; panel is controlled. */
  open: boolean;
  onClose: () => void;

  /** Context needed to START a new inquiry (passed straight into onStartInquiry). */
  tenantSlug: string;
  talentProfileId: string;
  talentProfileCode: string;
  sourcePage: string;

  /** Branding for the skin. */
  brand: MiniChatBrand;

  /**
   * If the guest already has an active inquiry with this talent (resolved by a
   * server component from the cookie), pass it so the panel reopens the thread
   * instead of starting fresh. Null = fresh start (collect email on first send).
   */
  existingInquiryId?: string | null;

  /**
   * Pre-fill for the inline name/email gate when known (e.g. returning guest
   * whose cookie maps to a prior contact). All optional.
   */
  prefill?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;

  /** INJECTED server actions — the UI imports no backend module. */
  onStartInquiry: OnStartInquiryCallback;
  onSendMessage: OnSendMessageCallback;
  fetchMessages: FetchMessagesCallback;
  /**
   * Optional: send the claim/sign-in link to a different/additional email and
   * register it as a claim candidate (first-confirm-wins). When null the
   * "Use a different email" affordance is hidden.
   */
  onAddClaimEmail?: AddClaimEmailCallback | null;

  /**
   * Poll cadence in ms while the panel is focused/open (MVP liveness path).
   * Default 4000. Lane D should pause polling when document is hidden.
   */
  pollIntervalMs?: number;

  /**
   * "Open full conversation ↗" target. Inert/link-only for MVP (points at the
   * claim/login path). Null hides the affordance. NOTE (U1): the panel now
   * self-computes /c/{inquiryId} from its own inquiryId, so this prop is
   * optional/back-compat only — it is not required for the full-conversation link.
   */
  openFullHref?: string | null;

  /**
   * U2: list ALL live inquiries this guest owns on the tenant (drives the
   * thread-switcher avatar-rail). Null hides the switcher entirely.
   */
  onListGuestInquiries?: ListGuestInquiriesCallback | null;

  /**
   * U4: capture a single deterministic detail chip into the inquiry's
   * structured spine. Null hides the chip rail.
   */
  onCaptureChip?: CaptureGuestChipCallback | null;

  /**
   * U2: enable the soft inbound-message chime. Gated by a user gesture inside
   * the hook (only fires once the guest has sent ≥1 message). Default true.
   */
  soundOnReply?: boolean;

  /**
   * U3: the guest↔account identity tier, resolved by the server component that
   * mounts the panel (same source as the trust chip). Drives the proactive
   * account toolkit + trust-gate nudge. Defaults to "guest" when unknown.
   */
  identity?: GuestIdentityTier;
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. TalentChatLauncher props — the floating brand-skinned launcher (Lane D /
//    F1). Mounts as a sibling of TalentProfileInquireButton on /t/[code].
// ─────────────────────────────────────────────────────────────────────────────

export type TalentChatLauncherProps = {
  /** Same context the launcher hands to MiniChatPanel. */
  tenantSlug: string;
  talentProfileId: string;
  talentProfileCode: string;
  sourcePage: string;
  brand: MiniChatBrand;
  existingInquiryId?: string | null;
  prefill?: MiniChatPanelProps["prefill"];

  /** Injected actions, forwarded to the panel. */
  onStartInquiry: OnStartInquiryCallback;
  onSendMessage: OnSendMessageCallback;
  fetchMessages: FetchMessagesCallback;
  /** Optional add-a-claim-email action, forwarded to the panel. Null hides the control. */
  onAddClaimEmail?: AddClaimEmailCallback | null;

  /**
   * Launcher label override. Default "Message {talentDisplayName}".
   * Secondary CTA copy (e.g. "Ask availability") is internal to the component.
   */
  label?: string;
  /** className passthrough for placement (mirrors TalentProfileInquireButton). */
  className?: string;
  openFullHref?: string | null;

  /** U2: forwarded to the panel — list all live inquiries for the switcher. */
  onListGuestInquiries?: ListGuestInquiriesCallback | null;
  /** U4: forwarded to the panel — capture a detail chip. */
  onCaptureChip?: CaptureGuestChipCallback | null;
  /** U2: forwarded to the panel — enable the inbound chime. Default true. */
  soundOnReply?: boolean;
  /** U3: forwarded to the panel — the guest↔account identity tier. */
  identity?: GuestIdentityTier;
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. GuestTrustChip props — talent-facing trust chip v1 (Lane E / F3). Renders
//    atop the talent thread. Reuses the live TrustBadge tier + a per-signal
//    row. This is a PROPS contract; the data is assembled server-side from
//    client_trust_state + TrustSummary + booking count + block/report status.
// ─────────────────────────────────────────────────────────────────────────────

/** The live trust tier (matches ClientTrustLevel in components/trust-badge.tsx). */
export type GuestTrustTier = "basic" | "verified" | "silver" | "gold";

/**
 * The guest↔account spectrum (U3 / strategy §5 trust ladder). This is the
 * IDENTITY axis (how known the person is), distinct from the trust-BADGE tier
 * GuestTrustTier above (basic/verified/silver/gold). Mirrors
 * GuestTrustChipProps.identity. The U3 toolkit + nudge components consume this
 * union; the server-side gate (guest-trust-gate.ts) keeps its OWN local
 * GuestTrustTier of the same spelling for its return value (it is never
 * promoted here to avoid the name collision with the badge tier).
 */
export type GuestIdentityTier = "guest" | "identified" | "email_verified" | "account";

/** Per-signal tri-state for the chip's tick row. */
export type TrustSignalState = "verified" | "present_unverified" | "absent";

export type GuestTrustChipProps = {
  /**
   * Top-line label that captures the guest↔account spectrum:
   *   "guest"          — cookie only, no email captured/verified
   *   "identified"     — name+email captured, not verified
   *   "email_verified" — magic-link verified
   *   "account"        — registered client
   */
  identity: "guest" | "identified" | "email_verified" | "account";
  /** Trust tier badge (drives TrustBadge). Null when no trust record. */
  tier: GuestTrustTier | null;
  /** Display name to show next to the chip. */
  displayName: string;
  /** Per-signal ticks. Absent signals render as hollow/○. */
  signals: {
    email: TrustSignalState;
    phone: TrustSignalState;
    social: TrustSignalState;
    payment: TrustSignalState;
  };
  /** Completed bookings on Tulala (drives "★N bookings"). 0 hides the star. */
  completedBookings: number;
  /**
   * One-line human risk read, precomputed server-side:
   *   "New guest — unverified" | "Verified buyer · booked 3× on Tulala".
   */
  riskLine: string;
  /** True when this guest/client is already blocked by the viewing talent/agency. */
  isBlocked: boolean;
  /**
   * Injected recipient-safety actions (Lane C). Null disables the control
   * (e.g. when the viewer lacks the capability). The chip renders Block/Report
   * affordances only when provided.
   */
  onBlock?: (() => Promise<{ ok: boolean }>) | null;
  onReport?: ((reason: InquiryReportReason) => Promise<{ ok: boolean }>) | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. Recipient-safety enums (Lane C). The report-reason vocabulary is part of
//    the contract so the chip and the inquiry_reports table agree.
// ─────────────────────────────────────────────────────────────────────────────

/** inquiry_reports.reason allowed values (mirror the DB CHECK in S4). */
export type InquiryReportReason =
  | "spam"
  | "harassment"
  | "scam_or_fraud"
  | "off_platform"
  | "inappropriate"
  | "other";

/** user_blocks.blocked_subject_type allowed values (mirror the DB CHECK in S4). */
export type BlockSubjectType = "guest_session" | "client_user";

/** user_blocks.scope allowed values (mirror the DB CHECK in S4). */
export type BlockScope = "messaging" | "all";
