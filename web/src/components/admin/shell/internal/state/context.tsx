"use client";
import { improntaLog } from "@/lib/server/structured-log";
import { logServerError } from "@/lib/server/safe-error";
// ─────────────────────────────────────────────────────────────────────
// Phase 1b decomposition of _state.tsx (remediation-plan-2026-05-19 §4).
// Byte-for-byte declaration bodies; public surface re-exported by the
// ./state.tsx barrel. Do not add/remove exports here without updating
// the barrel + the "public export surface" proof.
// ─────────────────────────────────────────────────────────────────────
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { devSetTalentPlanTierForSelfAction } from "@/lib/talent-site/server/dev-plan";
import { createTranslator } from "@/i18n/messages";
import { LOCALE_COOKIE } from "@/i18n/locale-middleware";
import type { ToastTone } from "../primitives";
import type { BridgeData, WorkspaceInquiryForMessages, WorkspaceClientRow, CalendarEvent as BridgeCalendarEvent, WorkspaceOverviewMetrics, WorkspaceBookingRow, WorkspacePitchRow, WorkspaceTeamMember as BridgeTeamMember, TalentSelfProfile as BridgeTalentSelfProfile, TalentInquiryRow, TalentAgencyRow, WorkspaceMediaPhoto as BridgeMediaPhoto, WorkspaceMediaFolder as BridgeMediaFolder } from "../data-bridge";
import { setInquiryFlagsTenantSlug, setInquiryFlagsUserId } from "../inquiry-flags-tenant-slug";
import type { Client, ClientPage, ClientPlan, ClientProfile, ClientProfileId, ClientTrustLevel, CoordinatorAssignment, Density, EntityType, FieldVisibility, HqRole, Impersonation, InquirySource, InquiryStage, MessageSenderRole, Offer, PendingTalent, Plan, PlatformPage, ProfileClaimInvitation, ProfileClaimStatus, ProfileFieldId, ProfileVerification, RequirementGroup, RichInquiry, Role, Surface, TalentContactGate, TalentPage, TalentProfile, TalentSubscriptionTier, TeamMember, ThreadMessage, ThreadType, TrustSummary, VerificationActiveStatus, VerificationMethodAuditEntry, VerificationMethodConfig, VerificationRequest, VerificationRequestStatus, VerificationReviewMode, VerificationSubjectType, VerificationTierGate, VerificationType, VerificationVisibility, WebsiteState, WorkspaceCustomField, WorkspaceLayout, WorkspacePage } from "./types";
import type { DrawerContext, DrawerId, UpgradeOffer } from "./drawer-ids";
import { ALWAYS_INTERNAL_FIELDS, ALWAYS_VISIBLE_FIELDS, CLIENT_PAGES, CLIENT_PLANS, CLIENT_PROFILES, DEFAULT_FIELD_VISIBILITY, ENTITY_TYPES, HQ_ROLES, MY_TALENT_PROFILE, PENDING_TALENT, PLANS, PLATFORM_PAGES, RICH_INQUIRIES, ROLES, SEED_ACCOUNT_VERIFICATION, SEED_CLAIM_STATUS, SEED_PROFILE_CLAIMS, SEED_PROFILE_VERIFICATIONS, SEED_TALENT_CONTACT_GATE, SEED_VERIFICATION_METHOD_AUDIT, SEED_VERIFICATION_METHOD_CONFIG, SEED_VERIFICATION_REQUESTS, SURFACES, TALENT_PAGES, TALENT_TO_USER, TENANT, VERIFICATION_TYPE_META, WEBSITE_STATE, getClients, getRoster, getTeam, mergeWebsiteStateFromBridge, resolveWorkspacePage } from "./fixtures";

// ─── Provider ────────────────────────────────────────────────────────

type ToastAction = { label: string; onClick: () => void };
type Toast = { id: number; message: string; undo?: () => void; action?: ToastAction; tone?: ToastTone };

export type AdminShellState = {
  surface: Surface;
  // workspace dimensions
  plan: Plan;
  role: Role;
  /**
   * Workspace entity model. Drives copy ("Roster" vs "Network"), inquiry
   * routing on the pipeline page, and a few coordinator behaviours. The
   * default mock TENANT is an agency, but the ControlBar can flip this to
   * preview the hub experience without seeding a different tenant.
   */
  entityType: EntityType;
  alsoTalent: boolean;
  page: WorkspacePage;
  // talent dimensions
  talentPage: TalentPage;
  /** Talent personal subscription tier — Free / Pro / Max. */
  talentTier: TalentSubscriptionTier;
  // client dimensions
  clientPlan: ClientPlan;
  clientPage: ClientPage;
  /** Active client identity. "martina" = business (Martina Beach Club);
   * "gringo" = personal client (The Gringo). Drives identity bar photo. */
  clientProfile: ClientProfileId;
  // platform dimensions
  hqRole: HqRole;
  platformPage: PlatformPage;
  impersonating: Impersonation;
  // shared
  drawer: DrawerContext;
  upgrade: UpgradeOffer;
  toasts: Toast[];
  completedTasks: Set<string>;
  /** Comfortable (default) vs compact list density. Persisted to localStorage. */
  density: Density;
  /**
   * Workspace layout preference (X2). "topbar" (default) keeps the
   * existing horizontal nav. "sidebar" pivots to a workspace-style
   * vertical rail — useful for hybrid talent owners who run a workspace
   * and want a workspace-y mental model when they switch into it.
   * Persisted to localStorage.
   */
  workspaceLayout: WorkspaceLayout;
};

type Ctx = {
  state: AdminShellState;
  setSurface: (s: Surface) => void;
  /**
   * Hybrid-mode toggle for talents who also own a workspace.
   * Flips between surface="talent" (their personal page) and
   * surface="workspace" (their agency/studio cockpit). Carries the
   * "I came from talent" return chip so the user has a one-click way
   * back. No-op when alsoTalent is false.
   */
  flipMode: () => void;
  setPlan: (p: Plan) => void;
  setRole: (r: Role) => void;
  setEntityType: (e: EntityType) => void;
  setAlsoTalent: (b: boolean) => void;
  setDensity: (d: Density) => void;
  setWorkspaceLayout: (l: WorkspaceLayout) => void;
  setPage: (p: WorkspacePage) => void;
  setTalentPage: (p: TalentPage) => void;
  /** Switch the talent's plan tier (dev/test affordance until billing is live). */
  setTalentTier: (t: TalentSubscriptionTier) => void;
  setClientPlan: (p: ClientPlan) => void;
  setClientPage: (p: ClientPage) => void;
  /** Active client identity (Martina Beach Club business vs The Gringo person). */
  clientProfile: ClientProfileId;
  setClientProfile: (p: ClientProfileId) => void;
  /** Resolved profile object for the active client. */
  activeClientProfile: ClientProfile;
  setHqRole: (r: HqRole) => void;
  setPlatformPage: (p: PlatformPage) => void;
  startImpersonation: (i: NonNullable<Impersonation>) => void;
  stopImpersonation: () => void;
  openDrawer: (id: DrawerId, payload?: Record<string, unknown>) => void;
  closeDrawer: () => void;
  /** Pop the drawer back-stack — reopens the previous drawer. */
  popDrawer: () => void;
  /** The chain of drawers the user opened to get here (excluding current). */
  drawerStack: DrawerContext[];
  openUpgrade: (offer: Omit<UpgradeOffer, "open">) => void;
  closeUpgrade: () => void;
  toast: (message: string, opts?: { undo?: () => void; action?: ToastAction; tone?: ToastTone }) => void;
  dismissToast: (id: number) => void;
  completeTask: (id: string) => void;
  // Pending-approvals queue, lifted into proto state so the count is
  // observable globally (topbar nav badge, mobile nav, settings row).
  pendingTalent: PendingTalent[];
  resolveApproval: (id: string) => void;
  /** CSV bulk-import — append N talent records to the pending queue. Each
   *  row enters as a draft pending profile so admin can review-then-publish.
   *  Production wires this to a real INSERT into talent_profiles. */
  bulkAddTalent: (rows: { firstName: string; lastName: string; email: string; primaryType?: string; city?: string }[]) => number;
  // WS-25.2 — Bulk client import. Mirrors `bulkAddTalent`. Returns the
  // number of rows actually created. Validation: name + at least one of
  // email/contact required.
  bulkAddClient: (rows: { name: string; contact?: string; email?: string }[]) => number;
  importedClients: Client[];
  // Custom workspace fields (Agency tier). Lifted so the Field Catalog
  // and the Profile Shell are looking at the same list.
  customFields: WorkspaceCustomField[];
  addCustomField: (f: Omit<WorkspaceCustomField, "id">) => void;
  removeCustomField: (id: string) => void;
  setCustomFieldVisibility: (id: string, vis: FieldVisibility) => void;
  // Per-workspace overrides on built-in field visibility. Empty by default
  // (workspace falls back to DEFAULT_FIELD_VISIBILITY).
  fieldVisibilityOverrides: Partial<Record<ProfileFieldId, FieldVisibility>>;
  setFieldVisibility: (id: ProfileFieldId, vis: FieldVisibility) => void;
  /** Resolve effective visibility for any built-in field — overrides win, defaults fall through. */
  effectiveFieldVisibility: (id: ProfileFieldId) => FieldVisibility;

  // ── Trust & Verification ─────────────────────────────────────────
  verificationRequests: VerificationRequest[];
  profileVerifications: ProfileVerification[];
  profileClaims: ProfileClaimInvitation[];
  claimStatusByTalent: Record<string, ProfileClaimStatus>;
  /** Submit a new verification request — returns the created request. */
  createVerificationRequest: (input: Omit<VerificationRequest, "id" | "status" | "createdAt" | "updatedAt"> & {
    status?: VerificationRequestStatus;
  }) => VerificationRequest;
  /** Move a request through its lifecycle. */
  updateVerificationRequest: (id: string, patch: Partial<VerificationRequest>) => void;
  /** Approve a request — marks request approved + creates an active ProfileVerification. */
  approveVerificationRequest: (id: string) => void;
  /** Reject a request — marks request rejected with the given reason. */
  rejectVerificationRequest: (id: string, reason: string, publicMessage?: string) => void;
  /** Revoke an approved badge (e.g. IG handle changed). */
  revokeProfileVerification: (id: string) => void;
  /** Edge case: when a talent changes their Instagram handle, the prior
   *  Instagram Verified badge is auto-revoked (production sends a notice
   *  email; prototype just flips the status). Talent must re-verify. */
  revokeInstagramOnHandleChange: (subjectType: VerificationSubjectType, subjectId: string, newHandle: string) => void;
  /** Send a claim invite to a talent profile. */
  sendProfileClaimInvite: (input: Omit<ProfileClaimInvitation, "id" | "status" | "tokenHash" | "createdAt" | "updatedAt">) => void;
  /** Resolve a disputed claim invitation. Outcome controls what happens
   *  to the profile-claim status: "release" frees the profile (back to
   *  unclaimed); "uphold" keeps it with the agency and marks the dispute
   *  resolved; "remove" deletes the agency-managed profile entirely. */
  resolveProfileClaimDispute: (claimId: string, outcome: "release" | "uphold" | "remove", adminNotes?: string) => void;
  /** Resolve all active trust data for a subject — used by every UI surface. */
  getTrustSummary: (subjectType: VerificationSubjectType, subjectId: string) => TrustSummary;

  // ── Platform-admin verification method registry (Phase 2) ────────
  /** Full registry — one config per VerificationType. Always all 8 entries. */
  verificationMethodConfigs: VerificationMethodConfig[];
  /** Audit trail of platform-admin changes to method configs. */
  verificationMethodAudit: VerificationMethodAuditEntry[];
  /** True if the method is enabled platform-wide. UI surfaces gate on this. */
  isVerificationMethodEnabled: (type: VerificationType) => boolean;
  /** Lookup the full config for a method. */
  getVerificationMethodConfig: (type: VerificationType) => VerificationMethodConfig;
  /** All currently-enabled methods, in registry order. */
  listEnabledMethods: () => VerificationType[];
  /** Patch a method's config — emits an audit entry. Platform-admin only. */
  updateVerificationMethod: (type: VerificationType, patch: Partial<VerificationMethodConfig>) => void;

  // ── Trust filtering / risk score (Phase 2.4) ─────────────────────
  /** 0-100 heuristic risk/health score for a subject. Internal only —
   *  never surface to public users. Higher = more trustworthy. */
  getRiskScore: (subjectType: VerificationSubjectType, subjectId: string) => number;
  /** Talent's preferred contact gate. */
  getTalentContactGate: (talentId: string) => TalentContactGate;
  /** Talent updates their own gate. */
  setTalentContactGate: (talentId: string, gate: TalentContactGate) => void;
  /** Returns true if a client (resolved by id or "current") meets
   *  the talent's gate, false if blocked. */
  canClientContactTalent: (talentId: string, clientId: string) => boolean;

  // ── Phase 1 real-data bridge ─────────────────────────────────────
  /**
   * Live workspace roster pre-fetched by the server-component wrapper
   * (`./page.tsx`) when the URL carries `?dataSource=live`. `null` means
   * "live mode was not requested — surfaces should fall back to the
   * per-plan mock arrays via `getRoster(plan)`". An empty array means
   * "live mode was requested but the tenant has zero rostered talent
   * (or scope/query failed) — render the empty state, NOT the mock".
   *
   * Surfaces that read roster data should use `effectiveRoster` instead
   * of calling `getRoster(plan)` directly so the bridge is honoured
   * without each call site having to know about it.
   */
  bridgeRoster: TalentProfile[] | null;
  /**
   * `bridgeRoster ?? getRoster(plan)` — the rule the workspace surface
   * should follow. Stable identity (memoised in the provider) so it can
   * be consumed inside hooks without re-render churn.
   */
  effectiveRoster: TalentProfile[];
  /** Set when running in production (cutover) mode — the real tenant slug from the URL. */
  tenantSlug: string | undefined;

  // ── Phase 3.12 real-data bridge — additional surfaces ────────────────
  /**
   * Live inquiry rows pre-fetched by the server layout. When the bridge is
   * active (tenantSlug is set) this replaces RICH_INQUIRIES. Adapter:
   * WorkspaceInquiryForMessages → RichInquiry so _messages.tsx is unchanged.
   */
  effectiveMessagesInquiries: RichInquiry[];
  /** Live client rows → adapted to Client[]. Falls back to getClients(plan). */
  effectiveClients: Client[];
  /**
   * Calendar events from inquiries with non-null event_date.
   * The CalendarEvent type from the bridge is a simpler shape than the proto
   * calendar mocks — both are consumed by _pages.tsx calendar surface.
   */
  effectiveCalendarEvents: BridgeCalendarEvent[] | null;
  /**
   * Pre-aggregated overview page metrics from the server. null = no bridge
   * active (mock mode) or loader failed. The Overview surface falls back
   * to computing from effectiveRoster / effectiveMessagesInquiries when null.
   */
  overviewMetrics: WorkspaceOverviewMetrics | null;
  /** Live booking rows. Falls back to empty array in mock mode. */
  effectiveBookings: WorkspaceBookingRow[];
  /** Phase 9 — live pitch rows for the Pitches surface. Empty array in mock mode. */
  effectivePitches: WorkspacePitchRow[];
  /** Live team member rows → adapted to TeamMember[]. Falls back to getTeam(plan). */
  effectiveTeamMembers: TeamMember[];
  /** Live total unread count for the nav badge. Falls back to 0 in mock mode. */
  totalUnread: number;
  /** Phase 5 — unread count for the talent's personal inbox (cross-mode pill). undefined = prototype/mock mode. */
  bridgeTalentUnread: number | undefined;
  /** Phase 5 — unread count for the workspace inbox (cross-mode pill). undefined = prototype/mock mode. */
  bridgeWorkspaceUnread: number | undefined;
  /** Phase 5 — whether the first-run toggle tip has been seen. undefined = prototype/mock mode. */
  bridgeFirstRunToggleTipSeen: boolean | undefined;

  // ── Phase 3.12.2 talent self-surface bridge fields ─────────────────────────
  /**
   * Live talent inquiries from the bridge. Empty array = mock mode.
   * `_talent.tsx` adapts these into its `Conversation[]` shape locally
   * (adaptation stays in the consumer to avoid a circular import with
   * the `Conversation` type defined in `_talent.tsx`).
   */
  effectiveTalentInquiries: TalentInquiryRow[];
  /**
   * The talent's own profile data from the bridge.
   * null = mock mode; `_talent.tsx` falls back to MY_TALENT_PROFILE.
   */
  bridgeTalentSelfProfile: BridgeTalentSelfProfile | null;
  /**
   * The talent's agency relationships (cross-tenant). `null` means the
   * layout didn't load them (workspace-only entry). Empty array means the
   * bridge IS in scope but the talent has zero agency relationships —
   * render an empty state, NOT Marta's MY_AGENCIES mocks.
   */
  bridgeTalentAgencies: TalentAgencyRow[] | null;
  /**
   * B.2 — Notifications feed loaded from `user_notifications`. `null` means
   * the layout didn't load it (fall back to MOCK NOTIFICATIONS in drawer);
   * empty array means real data, no rows.
   */
  bridgeUserNotifications: import("../data-bridge").UserNotification[] | null;
  /**
   * B.3 — Talent calendar entries (bookings + holds + availability_blocks).
   * `null` means mock mode (CalendarPage falls back to TALENT_BOOKINGS +
   * TALENT_REQUESTS fixtures); empty array = live mode with no entries yet.
   */
  bridgeTalentCalendarEntries: import("../data-bridge").TalentCalendarEntry[] | null;

  /**
   * Media photos from the bridge. `null` = mock mode (Media page falls
   * back to MOCK_MEDIA). Empty array = live mode with zero photos.
   */
  bridgeMediaPhotos: BridgeMediaPhoto[] | null;
  /** Virtual folders — always an array (empty when none or mock mode). */
  bridgeMediaFolders: BridgeMediaFolder[];
  /** True when the underlying media query failed. Lets the page show a
   *  real error state instead of looking like an empty tenant. */
  bridgeMediaErrored: boolean;
  /** Total matching rows in the DB. Exceeds photos.length when capped. */
  bridgeMediaTotalCount: number | null;

  // ── Phase 1 (master plan) — chrome identity bridge ────────────────────────
  /**
   * Real tenant identity from the workspace admin layout. null = standalone
   * demo mode; chrome falls back to TENANT constant.
   */
  bridgeTenantIdentity: {
    tenantId: string;
    slug: string;
    displayName: string;
    planTier: string;
    kind: string;
    /** Brand logo URL — replaces the TULALA wordmark when present. */
    logoUrl?: string | null;
    /**
     * Task 0.5 — Verified custom domain from agency_domains. Null when
     * no custom domain is live yet. The Website settings TierCard reads
     * this directly instead of inferring from plan tier.
     */
    verifiedDomain?: string | null;
    /**
     * F.1 — Workspace-level default coordinator (auto-assigned on new
     * inquiries). The Team drawer surfaces a dropdown to change this on
     * Agency-tier workspaces.
     */
    defaultCoordinatorUserId?: string | null;
    /**
     * Phase 5 — roster talent designated as default inquiry coordinators
     * (agency_inquiry_coordinators). All of them auto-join every new
     * inquiry as `coordinator` participants. Empty array when none set.
     */
    inquiryCoordinatorTalentIds?: string[];
  } | null;
  /**
   * Real signed-in user identity. null = standalone demo mode; chrome falls
   * back to MY_TALENT_PROFILE / state.userName.
   */
  bridgeSessionIdentity: {
    userId: string;
    email: string;
    role: string;
    displayName: string | null;
    /** True when the user is a platform admin — gates the switcher's
     *  "Platform" entry point to the HQ console. */
    isPlatformAdmin?: boolean;
  } | null;
  /**
   * Effective tenant values for rendering — derived from bridgeTenantIdentity
   * in production mode, or from the TENANT mock in standalone demo mode.
   * Use this everywhere instead of TENANT.xxx to avoid SSR/CSR hydration
   * mismatches (the old TENANT mutation ran on the server but not during
   * client hydration, causing React to throw and reset the state machine).
   */
  effectiveTenant: {
    name: string;
    slug: string;
    domain: string;
    customDomain: string;
    initials: string;
    entityType: EntityType;
  };
  /** Current UI locale resolved from the locale cookie. */
  locale: string;
  /** Dot-path translator for the current locale. */
  t: (key: string) => string;

  /** Workspace Website surface — live CMS rows merged with mock fallbacks. */
  effectiveWebsiteState: WebsiteState;
  /**
   * Website tab reads real `cms_pages` / bridge payloads (vs prototype-only mocks).
   * When false, destructive CMS actions should stay hidden.
   */
  websiteUsesLiveCms: boolean;
};

// ── Phase 3.12 bridge adapters ─────────────────────────────────────────────
// Convert workspace-level bridge types to the proto shell's internal types.
// These run inside useMemo so they only recompute when bridge data changes.

/**
 * Adapt a single WorkspaceInquiryForMessages row to a RichInquiry.
 * Lossy on fields not present in the bridge (requirementGroups, full message
 * history, offer line-items) — they get minimal stubs so the UI renders
 * without crashing. Full fidelity is Phase 4 once the inquiry thread API lands.
 */
function adaptBridgeInquiry(w: WorkspaceInquiryForMessages): RichInquiry {
  const stage: InquiryStage =
    w.status === "submitted"      ? "submitted" :
    w.status === "coordination"   ? "coordination" :
    w.status === "offer_pending"  ? "offer_pending" :
    w.status === "approved"       ? "approved" :
    w.status === "booked" || w.status === "converted" ? "booked" :
    w.status === "rejected"       ? "rejected" :
    w.status === "expired"        ? "expired" :
    "draft";

  const source: InquirySource =
    w.sourceKind === "hub"        ? { kind: "hub",         hubName: "Tulala Hub", domain: w.sourcePage ?? "tulala.digital" } :
    w.sourceKind === "marketplace"? { kind: "marketplace", platform: "Tulala" } :
    w.sourceKind === "talent-page"? { kind: "talent-page", talentSlug: w.sourcePage?.replace(/^\/t\//, "") ?? "talent" } :
    w.sourceKind === "direct"     ? { kind: "direct",      domain: w.sourcePage ?? "direct" } :
    { kind: "manual", channel: "email" };

  const clientTrust: ClientTrustLevel =
    w.trustLevel === "gold"     ? "gold" :
    w.trustLevel === "silver"   ? "silver" :
    w.trustLevel === "verified" ? "verified" :
    "basic";

  const coordinator: CoordinatorAssignment | null = w.coordinatorName
    ? {
        id: w.coordinatorUserId ?? w.id + "-coord",
        name: w.coordinatorName,
        initials:
          w.coordinatorInitials ??
          w.coordinatorName.split(" ").map((s: string) => s[0]).join("").slice(0, 2).toUpperCase(),
        email: "",
        acceptedAt: w.coordinatorAcceptedAt,
        isPrimary: true,
      }
    : null;

  const nextActionBy: RichInquiry["nextActionBy"] =
    w.nextActionBy === "system" ? "ops" : w.nextActionBy ?? null;

  const mapParticipantStatus = (status: string): RequirementGroup["talents"][number]["status"] => {
    const s = status.toLowerCase();
    if (s === "accepted" || s === "confirmed" || s === "active" || s === "booked") return "accepted";
    if (s === "declined" || s === "removed" || s === "withdrawn") return "declined";
    if (s === "hold" || s === "superseded") return "superseded";
    return "pending";
  };

  const requirementGroups: RequirementGroup[] =
    w.lineupTotal > 0
      ? [{
          id: w.id + "-rg",
          role: "talent",
          needed: w.lineupTotal,
          approved: w.lineupConfirmed,
          talents: w.lineupTalent.map((talent) => ({
            name: talent.displayName,
            thumb: "",
            status: mapParticipantStatus(talent.status),
          })),
        }]
      : [];

  const offer: Offer | null = w.currentOfferStatus
    ? {
        // Use the real offer UUID from the bridge so engine actions
        // (sendOffer, clientAcceptOffer, clientRejectOffer) can target the
        // correct row. Falls back to a synthetic id only when the bridge
        // didn't populate one (shouldn't happen when status is set).
        id: w.currentOfferId ?? (w.id + "-offer"),
        version: 1,
        status: w.currentOfferStatus,
        total: w.currentOfferTotal ?? "—",
        sentAt: null,
        lineItems: [],
        clientApproval: w.currentOfferStatus === "accepted" ? "accepted" : "pending",
      }
    : null;

  const messages: ThreadMessage[] = (w.threadMessages.length > 0
    ? w.threadMessages.map((message) => {
        const threadType = (message as { thread_type?: ThreadType }).thread_type ?? "private";
        const senderRole: MessageSenderRole =
          !message.sender_user_id ? "system"
          : message.is_mine ? "coordinator"
          : message.sender_role === "coordinator" ? "coordinator"
          : message.sender_role === "talent" ? "talent"
          : message.sender_role === "client" ? "client"
          : threadType === "private" ? "client"
          : "talent";
        const senderName = senderRole === "system"
          ? "System"
          : message.sender_name || (senderRole === "talent" ? "Talent" : w.clientName);
        return {
          id: message.id,
          threadType,
          senderName,
          senderRole,
          senderInitials: senderRole === "system" ? "SY" : shortInitialsForBridge(senderName),
          body: message.body,
          ts: new Date(message.created_at).toLocaleString("en-US", {
            weekday: "short",
            hour: "numeric",
            minute: "2-digit",
          }),
          isYou: message.is_mine,
          messageKind: message.message_kind ?? "text",
          cardPayload: message.card_payload ?? null,
        } as ThreadMessage & { messageKind?: string; cardPayload?: Record<string, unknown> | null };
      })
    : w.lastMessagePreview
      ? [{
          id: w.id + "-m0",
          threadType: (w.lastMessageThreadType ?? "private") as ThreadType,
          senderName: w.lastMessageRole === "system" ? "System" : w.lastMessageRole === "you" ? "You" : w.clientName,
          senderRole: (
            w.lastMessageRole === "you"    ? "coordinator" :
            w.lastMessageRole === "system" ? "system" :
            w.lastMessageRole ?? "client"
          ) as MessageSenderRole,
          senderInitials: w.lastMessageRole === "system" ? "SY" : w.clientInitials,
          body: w.lastMessagePreview,
          ts: w.lastMessageAt
            ? new Date(w.lastMessageAt).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })
            : "",
          isYou: w.lastMessageRole === "you",
        }]
      : []);

  return {
    id: w.id,
    agencyName: "",
    clientName: w.clientCompany ?? w.clientName,
    clientTrust,
    brief: w.briefTitle,
    date: w.eventDate,
    location: w.eventLocation,
    source,
    stage,
    ageDays: Math.max(1, Math.ceil(w.ageHrs / 24)),
    unreadPrivate: w.unreadPrivate,
    unreadGroup: w.unreadGroup,
    nextActionBy,
    lastActivityHrs: w.ageHrs,
    repeatBookings: 0,
    requirementGroups,
    coordinator,
    offer,
    bookingId: null,
    messages,
    seen: w.seen,
  };
}

/** Adapt WorkspaceClientRow → Client (proto shell's client type). */
function adaptBridgeClient(w: WorkspaceClientRow): Client {
  return {
    id: w.id,
    name: w.company ?? w.name,
    contact: w.name,
    bookingsYTD: w.bookingsYTD,
    status: w.accountStatus === "suspended" ? "dormant" : "active",
    trust: (w.trustLevel ?? "basic") as ClientTrustLevel,
  };
}

/** Adapt BridgeTeamMember → TeamMember (proto shell's team type). */
function adaptBridgeTeamMember(m: BridgeTeamMember): TeamMember {
  const words = m.name.trim().split(/\s+/);
  const initials = words.length >= 2
    ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
    : m.name.slice(0, 2).toUpperCase();
  return {
    id: m.id,
    name: m.name,
    // Email comes from `auth.users` via the bridge loader's service-role
    // lookup (`public.profiles` carries none) — may still be empty if
    // the lookup failed.
    email: m.email ?? "",
    photoUrl: m.photoUrl,
    role: (["viewer","editor","manager","admin","owner"].includes(m.role) ? m.role : "viewer") as Role,
    status: m.status === "pending_acceptance" ? "invited" : "active",
    initials,
  };
}

function shortInitialsForBridge(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AdminShellContext = createContext<Ctx | null>(null);

// 2026 #6 — Wrap a state mutation in document.startViewTransition() so
// the browser interpolates DOM changes into a smooth crossfade. Falls
// back to plain execution on browsers without support (Firefox <125,
// Safari <18) and is skipped entirely when prefers-reduced-motion is
// set. Used by openDrawer / closeDrawer to crossfade between drawers.
//
// QA 2026-05-13 — same family as the locale-switch bug fixed at
// b5a3ee970. `startViewTransition` can throw `InvalidStateError:
// Transition was aborted because of invalid state` if another VT is
// mid-cleanup (or the document hits a state the spec considers
// invalid). Without try/catch + async catch on the returned handle,
// the throw silently aborts the work() call and the drawer state
// mutation never lands — operator clicks "Open team drawer" and
// nothing happens. We catch sync + async failures and re-run work()
// directly so the drawer actually opens, just without the crossfade.
function runWithViewTransition(work: () => void): void {
  if (typeof window === "undefined") { work(); return; }
  const reduced = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  type ViewTransitionHandle = { updateCallbackDone?: Promise<void>; finished?: Promise<void> };
  type DocWithVT = Document & {
    startViewTransition?: (cb: () => void) => ViewTransitionHandle | undefined;
  };
  const doc = document as DocWithVT;
  if (reduced || typeof doc.startViewTransition !== "function") {
    work();
    return;
  }
  let ranFallback = false;
  const runFallback = (err: unknown) => {
    if (ranFallback) return;
    ranFallback = true;
    if (process.env.NODE_ENV !== "production") {
      void improntaLog("admin_context.warn", {
        message: "[admin-shell] view-transition failed, falling back",
        error: String(err),
      });
    }
    work();
  };
  try {
    const handle = doc.startViewTransition(work);
    handle?.updateCallbackDone?.catch(runFallback);
    handle?.finished?.catch(() => {
      /* updateCallbackDone already handled the recovery */
    });
  } catch (err) {
    runFallback(err);
  }
}

/**
 * Map a canonical WorkspacePage to its Next.js route segment.
 * "overview" → "" (the root /admin path with no sub-segment).
 * All others → their own slug.
 */
function pageToSegment(p: WorkspacePage): string {
  const resolved = resolveWorkspacePage(p as string);
  return resolved === "overview" ? "" : resolved;
}

/** Maps a TalentPage to the URL segment for canonical talent routes. */
function talentPageToSegment(p: TalentPage): string {
  // Canonical canonical paths mirror the existing /talent/* route tree.
  const map: Partial<Record<TalentPage, string>> = {
    today:     "today",
    messages:  "inbox",  // messages → inbox canonical route
    inbox:     "inbox",
    profile:   "profile",
    calendar:  "calendar",
    agencies:  "agencies",
    "public-page": "site",
    settings:  "settings",
  };
  return map[p] ?? p;
}

// Segments the talent layout serves — used by the prefetcher below.
const TALENT_ROUTE_SEGMENTS = TALENT_PAGES.map(talentPageToSegment).filter(
  (s, i, a) => a.indexOf(s) === i,
);

export function AdminShellProvider({
  children,
  initialBridgeData = null,
  initialPage,
  initialSurface,
  initialTalentPage,
  tenantSlug,
  platformTalentRoutes = false,
}: {
  children: ReactNode;
  /**
   * Phase 1 real-data bridge payload pre-fetched server-side. `null` (the
   * default) preserves the original 100% mock behaviour. See
   * `_data-bridge.ts` and `./page.tsx` for the server boundary.
   */
  initialBridgeData?: BridgeData | null;
  /**
   * Cutover mode — when set, the shell starts on this page and URL sync
   * uses Next.js router.push() instead of replaceState query-params.
   * Used by the production admin routes (Step 1 of the prototype cutover).
   */
  initialPage?: WorkspacePage;
  /**
   * Phase 3.12.2 — when set, the shell starts on this surface (e.g. "talent"
   * for the canonical talent self-surface, "client" for client self). When
   * omitted, defaults to "workspace" (the admin shell default).
   */
  initialSurface?: Surface;
  /**
   * Phase 3.12.2 — when set, the talent shell starts on this page and URL
   * sync uses Next.js router.push() for talent routes.
   */
  initialTalentPage?: TalentPage;
  /**
   * When set alongside `initialPage`, page changes push to
   * `/${tenantSlug}/admin/${segment}` via the Next.js router so the
   * browser URL stays in sync with the shell's internal page state.
   */
  tenantSlug?: string;
  /** Platform `/talent/*` routes on app.tulala.digital (no `/{slug}` prefix). */
  platformTalentRoutes?: boolean;
}) {
  const router = useRouter();
  const tenantSlugRef = useRef(tenantSlug);
  const platformTalentRoutesRef = useRef(platformTalentRoutes);
  useEffect(() => {
    tenantSlugRef.current = tenantSlug;
    platformTalentRoutesRef.current = platformTalentRoutes;
  }, [tenantSlug, platformTalentRoutes]);

  const [locale, setLocale] = useState("en");
  useEffect(() => {
    const m = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`));
    if (m) setLocale(decodeURIComponent(m[1]));
  }, []);

  // P3.4 — Prefetch all talent tab routes on mount so cold tab-switches
  // feel instant. Only fires when we're in production talent mode (slug
  // set + initialSurface === "talent"). Prefetch is fire-and-forget;
  // failures are silently ignored by Next.js.
  useEffect(() => {
    if (initialSurface !== "talent") return;
    if (platformTalentRoutes) {
      for (const seg of TALENT_ROUTE_SEGMENTS) {
        router.prefetch(`/talent/${seg}`);
      }
      return;
    }
    if (!tenantSlug) return;
    for (const seg of TALENT_ROUTE_SEGMENTS) {
      router.prefetch(`/${tenantSlug}/talent/${seg}`);
    }
    // Only run once on mount — deps are stable (tenantSlug and initialSurface
    // are server-provided props that never change within a mounted provider).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only prefetch: tenantSlug/initialSurface are server props stable for provider lifetime; router.prefetch is a stable Next.js method
  }, []);

  // Phase 5 — preferred surface from DB user prefs. Priority order:
  //   1. initialSurface from the route — the URL is an EXPLICIT user
  //      intent ("/talent/today" wants the talent surface, period). It
  //      always wins.
  //   2. preferredSurface from bridge (DB pref) — used only when the
  //      route is ambiguous (e.g. the bare /admin entry from a hybrid
  //      user who last left the app on the talent surface).
  //   3. default "workspace"
  //
  // Earlier this was inverted (pref won over route), which produced the
  // bug where `/talent/today` rendered the workspace shell because the
  // user had once toggled to workspace and the pref was sticky.
  const [surface, setSurface] = useState<Surface>(
    (() => {
      if (initialSurface === "talent" || initialSurface === "workspace") {
        return initialSurface;
      }
      const pref = initialBridgeData?.preferredSurface;
      if (pref === "talent" || pref === "workspace") return pref;
      return initialSurface ?? "workspace";
    })(),
  );

  // Phase 1 (master plan) — when the workspace admin layout supplies
  // bridge identity, prime the prototype's plan + role from real data so
  // capability gates (Settings > Team, Plan & billing, plan-locked
  // sections) reflect the tenant's actual tier and the user's actual
  // role. Falls back to the prototype's demo defaults in standalone mode.
  const initialPlan: Plan = (() => {
    const t = initialBridgeData?.tenantIdentity?.planTier;
    return t === "free" || t === "studio" || t === "agency" || t === "network"
      ? (t as Plan)
      : "free";
  })();
  const initialRole: Role = (() => {
    const r = initialBridgeData?.sessionIdentity?.role;
    return r === "owner" || r === "admin" || r === "coordinator" || r === "editor" || r === "viewer"
      ? (r as Role)
      : "owner";
  })();

  // (Phase 1 mutation removed — the old `useState(() => { TENANT.xxx = ... })`
  // approach mutated a module-level singleton during the server render but
  // React does not re-run `useState` initializers during client hydration,
  // so SSR and CSR produced different TENANT values → hydration mismatch →
  // state machine reset. Replaced by `effectiveTenant` in the context value.)

  const [plan, setPlan] = useState<Plan>(initialPlan);
  const [role, setRole] = useState<Role>(initialRole);
  const [entityType, setEntityType] = useState<EntityType>(TENANT.entityType);
  // Phase 0 (talent-surface launch readiness) — derive hybrid signal from the
  // bridge instead of hardcoding `true`. The bridge sets `isHybrid` to true
  // only when the signed-in user has BOTH a talent profile AND a workspace
  // membership in this tenant; the toggle is hidden otherwise. Standalone
  // prototype mode (no bridge) defaults to `true` to preserve design-QA
  // visibility of the toggle.
  const [alsoTalent, setAlsoTalent] = useState<boolean>(
    initialBridgeData ? Boolean(initialBridgeData.isHybrid) : true,
  );
  const [page, setPageRaw] = useState<WorkspacePage>(initialPage ?? "overview");

  // In production (cutover) mode the browser URL is the source of truth
  // for page — driven by Next.js routing, not ?page= query params. When
  // tenantSlug is set we skip the replaceState URL sync and instead push
  // a real navigation so every page change is a proper Next.js route.
  const setPage = useCallback((p: WorkspacePage) => {
    setPageRaw(p);
    const slug = tenantSlugRef.current;
    if (slug) {
      const segment = pageToSegment(p);
      const targetHref = segment ? `/${slug}/admin/${segment}` : `/${slug}/admin`;
      // Guard: skip push if we're already on this URL. This prevents a
      // navigation loop when PageRouteSyncer fires setPage on mount while
      // the browser is already at the correct route.
      if (typeof window !== "undefined" && window.location.pathname !== targetHref) {
        router.push(targetHref);
      }
    }
  }, [router]);
  // talent
  const [talentPage, setTalentPageRaw] = useState<TalentPage>(initialTalentPage ?? "today");
  const setTalentPage = useCallback((p: TalentPage) => {
    setTalentPageRaw(p);
    if (initialSurface !== "talent") return;
    const segment = talentPageToSegment(p);
    if (typeof window === "undefined") return;
    const currentPath = window.location.pathname;

    if (platformTalentRoutesRef.current) {
      const platformHref = `/talent/${segment}`;
      if (currentPath === platformHref) return;
      router.push(platformHref);
      return;
    }

    const slug = tenantSlugRef.current;
    if (!slug) return;
    const canonicalHref = `/${slug}/talent/${segment}`;
    const brandedHref = `/talent/${segment}`;
    if (currentPath === canonicalHref || currentPath === brandedHref) return;
    router.push(canonicalHref);
  }, [router, initialSurface]);
  // Talent personal subscription tier (Free / Pro / Max). Live bridge data
  // reads talent_profiles.talent_plan_key; prototype mode uses the demo
  // fixture tier. Switchable in dev via the Compare-plans drawer.
  const [talentTier, setTalentTierState] = useState<TalentSubscriptionTier>(
    initialBridgeData?.talentSelfProfile?.talentTier ?? MY_TALENT_PROFILE.subscription.tier,
  );
  // client
  const [clientPlan, setClientPlan] = useState<ClientPlan>("pro");
  const [clientPage, setClientPage] = useState<ClientPage>("today");
  const [clientProfile, setClientProfile] = useState<ClientProfileId>("martina");
  const activeClientProfile = CLIENT_PROFILES[clientProfile];
  // platform
  const [hqRole, setHqRole] = useState<HqRole>("exec");
  const [platformPage, setPlatformPage] = useState<PlatformPage>("today");
  const [impersonating, setImpersonating] = useState<Impersonation>(null);
  // shared
  const [drawer, setDrawer] = useState<DrawerContext>({ drawerId: null });
  const [upgrade, setUpgrade] = useState<UpgradeOffer>({ open: false });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
  // Pending-approvals queue lifted into proto state. Mutating this
  // updates the topbar Roster nav badge, mobile bottom nav, and the
  // Settings → Pending approvals row in one shot.
  const [pendingTalent, setPendingTalent] = useState<PendingTalent[]>(PENDING_TALENT);
  const resolveApproval = useCallback((id: string) => {
    setPendingTalent(p => p.filter(x => x.id !== id));
  }, []);
  // CSV bulk-import → append valid rows to the pending queue. Returns
  // the number of rows actually created (skipping any that fail
  // minimum validation: name + email required).
  const bulkAddTalent = useCallback((rows: { firstName: string; lastName: string; email: string; primaryType?: string; city?: string }[]) => {
    const valid = rows.filter(r => r.firstName.trim() && r.email.trim());
    if (valid.length === 0) return 0;
    const now = new Date().toISOString();
    const additions: PendingTalent[] = valid.map((r, i) => ({
      id: `csv-${Date.now()}-${i}`,
      name: `${r.firstName.trim()} ${r.lastName.trim()}`.trim(),
      thumb: `https://i.pravatar.cc/300?img=${(i * 7 + 30) % 70}`,
      parentCategory: "models",
      childTypes: r.primaryType ? [r.primaryType] : ["fashion"],
      city: r.city?.trim() || "—",
      submittedAgo: "just now",
      photoCount: 0,
      languages: ["English"],
      fields: { _source: "csv-import", _email: r.email.trim(), _createdAt: now },
    }));
    setPendingTalent(p => [...additions, ...p]);
    return valid.length;
  }, []);

  // WS-25.2 — Client CSV import. Unlike talent which has an approval
  // queue, client adds go straight in (clients are workspace-internal
  // records — no off-platform identity to verify on creation).
  const [importedClients, setImportedClients] = useState<Client[]>([]);
  const bulkAddClient = useCallback((rows: { name: string; contact?: string; email?: string }[]) => {
    const valid = rows.filter(r => r.name.trim() && (r.contact?.trim() || r.email?.trim()));
    if (valid.length === 0) return 0;
    const additions: Client[] = valid.map((r, i) => ({
      id: `csv-c-${Date.now()}-${i}`,
      name: r.name.trim(),
      contact: r.contact?.trim() || r.email?.trim() || "—",
      bookingsYTD: 0,
      status: "active" as const,
      trust: "basic" as const,
    }));
    setImportedClients(p => [...additions, ...p]);
    return valid.length;
  }, []);

  // Custom workspace fields. Persisted to localStorage so adds in
  // Field Catalog survive page reload (the prototype's URL-driven nav
  // does a full mount on every change).
  const CUSTOM_FIELDS_KEY = "tulala_custom_fields_v1";
  const SEED_FIELDS: WorkspaceCustomField[] = [
    { id: "cf1", name: "Niches",     kind: "Multi-select", appliesTo: "Talent", required: false, helper: "Editorial / Commercial / Runway / Showroom / Lookbook" },
    { id: "cf2", name: "Brand tier", kind: "Select",       appliesTo: "Client", required: true,  helper: "A — global / B — regional / C — local" },
    { id: "cf3", name: "Region",     kind: "Select",       appliesTo: "Client", required: false, helper: "EMEA / Americas / APAC" },
  ];
  const [customFields, setCustomFields] = useState<WorkspaceCustomField[]>(() => {
    if (typeof window === "undefined") return SEED_FIELDS;
    try {
      const raw = window.localStorage.getItem(CUSTOM_FIELDS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed as WorkspaceCustomField[];
      }
    } catch {}
    return SEED_FIELDS;
  });
  const addCustomField = useCallback((f: Omit<WorkspaceCustomField, "id">) => {
    setCustomFields(cs => {
      const next = [...cs, { ...f, id: `cf-${Date.now()}` }];
      try { window.localStorage.setItem(CUSTOM_FIELDS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  const removeCustomField = useCallback((id: string) => {
    setCustomFields(cs => {
      const next = cs.filter(c => c.id !== id);
      try { window.localStorage.setItem(CUSTOM_FIELDS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  const setCustomFieldVisibility = useCallback((id: string, vis: FieldVisibility) => {
    setCustomFields(cs => {
      const next = cs.map(c => c.id === id ? { ...c, visibility: vis } : c);
      try { window.localStorage.setItem(CUSTOM_FIELDS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // Per-workspace overrides on built-in field visibility.
  const FIELD_VIS_KEY = "tulala_field_visibility_v1";
  const [fieldVisibilityOverrides, setFieldVisibilityOverrides] = useState<Partial<Record<ProfileFieldId, FieldVisibility>>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(FIELD_VIS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {};
  });
  const setFieldVisibility = useCallback((id: ProfileFieldId, vis: FieldVisibility) => {
    // Hard-policy enforcement: financial / PII / compliance fields can
    // never go public. Required fields can never be hidden. Silently
    // coerces invalid combos so a bad UI/API call can't leak data.
    if (ALWAYS_INTERNAL_FIELDS.has(id) && vis === "public") return;
    if (ALWAYS_VISIBLE_FIELDS.has(id) && vis === "hidden") return;
    setFieldVisibilityOverrides(o => {
      const next = { ...o };
      if (DEFAULT_FIELD_VISIBILITY[id] === vis) delete next[id];
      else next[id] = vis;
      try { window.localStorage.setItem(FIELD_VIS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  const effectiveFieldVisibility = useCallback(
    (id: ProfileFieldId) => fieldVisibilityOverrides[id] ?? DEFAULT_FIELD_VISIBILITY[id],
    [fieldVisibilityOverrides],
  );

  // ── Trust & Verification state ──────────────────────────────────
  const [verificationRequests, setVerificationRequests] = useState<VerificationRequest[]>(SEED_VERIFICATION_REQUESTS);
  const [profileVerifications, setProfileVerifications] = useState<ProfileVerification[]>(SEED_PROFILE_VERIFICATIONS);
  const [profileClaims, setProfileClaims] = useState<ProfileClaimInvitation[]>(SEED_PROFILE_CLAIMS);
  const [claimStatusByTalent, setClaimStatusByTalent] = useState<Record<string, ProfileClaimStatus>>(SEED_CLAIM_STATUS);
  const [verificationMethodConfigs, setVerificationMethodConfigs] = useState<VerificationMethodConfig[]>(SEED_VERIFICATION_METHOD_CONFIG);
  const [verificationMethodAudit, setVerificationMethodAudit] = useState<VerificationMethodAuditEntry[]>(SEED_VERIFICATION_METHOD_AUDIT);
  const [talentContactGates, setTalentContactGates] = useState<Record<string, TalentContactGate>>(SEED_TALENT_CONTACT_GATE);

  const nowIso = () => new Date().toISOString();
  const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const createVerificationRequest = useCallback((input: Omit<VerificationRequest, "id" | "status" | "createdAt" | "updatedAt"> & {
    status?: VerificationRequestStatus;
  }): VerificationRequest => {
    // Edge case #9: duplicate guard — reuse any active in-flight request
    // for the same subject + verification type instead of creating a dup.
    const existing = verificationRequests.find(r =>
      r.subjectType === input.subjectType
      && r.subjectId === input.subjectId
      && r.verificationType === input.verificationType
      && (r.status === "pending_user_action" || r.status === "submitted" || r.status === "in_review" || r.status === "needs_more_info")
    );
    if (existing) return existing;
    const req: VerificationRequest = {
      id: newId("vr"),
      status: input.status ?? "pending_user_action",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      ...input,
    };
    setVerificationRequests(rs => [...rs, req]);
    return req;
  }, [verificationRequests]);

  // Edge case #10: expired-code sweep. Once a minute, any pending or
  // submitted request whose expires_at has passed flips to "expired".
  // Cheap to run and matches production cron behavior.
  useEffect(() => {
    const sweep = () => {
      const now = Date.now();
      setVerificationRequests(rs => rs.map(r => {
        if (!r.expiresAt) return r;
        if (r.status !== "pending_user_action" && r.status !== "submitted") return r;
        if (new Date(r.expiresAt).getTime() < now) {
          return { ...r, status: "expired" as VerificationRequestStatus, updatedAt: nowIso() };
        }
        return r;
      }));
    };
    sweep(); // run once on mount
    const id = window.setInterval(sweep, 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Edge case #8: IG handle change → revoke active IG verification.
  // Exposed as a callable so the talent profile editor can invoke it
  // when the talent edits their Instagram handle.
  const revokeInstagramOnHandleChange = useCallback((subjectType: VerificationSubjectType, subjectId: string, newHandle: string) => {
    setProfileVerifications(pvs => pvs.map(pv => {
      if (pv.subjectType !== subjectType || pv.subjectId !== subjectId) return pv;
      if (pv.verificationType !== "instagram_verified") return pv;
      if (pv.status !== "active") return pv;
      if (pv.identifier === newHandle) return pv; // same handle, no-op
      return { ...pv, status: "revoked" as VerificationActiveStatus };
    }));
  }, []);

  const updateVerificationRequest = useCallback((id: string, patch: Partial<VerificationRequest>) => {
    setVerificationRequests(rs => rs.map(r => r.id === id ? { ...r, ...patch, updatedAt: nowIso() } : r));
  }, []);

  const approveVerificationRequest = useCallback((id: string) => {
    setVerificationRequests(rs => rs.map(r => {
      if (r.id !== id) return r;
      return { ...r, status: "approved" as VerificationRequestStatus, reviewedAt: nowIso(), updatedAt: nowIso() };
    }));
    // Create the active ProfileVerification record
    const req = verificationRequests.find(r => r.id === id);
    if (req) {
      const provider =
        req.method === "instagram_dm" ? "instagram" :
        req.method === "agency_confirmation" ? "agency" :
        req.method === "domain" ? "domain" :
        req.method === "payment" ? "stripe" :
        req.method === "phone" ? "phone" :
        "tulala";
      const pv: ProfileVerification = {
        id: newId("pv"),
        subjectType: req.subjectType,
        subjectId: req.subjectId,
        verificationType: req.verificationType,
        provider,
        identifier: req.claimedIdentifier ?? null,
        sourceRequestId: req.id,
        status: "active",
        publicBadgeEnabled: true,
        verifiedAt: nowIso(),
      };
      setProfileVerifications(pvs => [...pvs, pv]);
    }
  }, [verificationRequests]);

  const rejectVerificationRequest = useCallback((id: string, reason: string, publicMessage?: string) => {
    setVerificationRequests(rs => rs.map(r => r.id === id ? {
      ...r,
      status: "rejected" as VerificationRequestStatus,
      rejectionReason: reason,
      publicMessage: publicMessage ?? null,
      reviewedAt: nowIso(),
      updatedAt: nowIso(),
    } : r));
  }, []);

  const revokeProfileVerification = useCallback((id: string) => {
    setProfileVerifications(pvs => pvs.map(pv => pv.id === id ? { ...pv, status: "revoked" as VerificationActiveStatus } : pv));
  }, []);

  const sendProfileClaimInvite = useCallback((input: Omit<ProfileClaimInvitation, "id" | "status" | "tokenHash" | "createdAt" | "updatedAt">) => {
    const inv: ProfileClaimInvitation = {
      id: newId("pci"),
      status: "pending",
      tokenHash: newId("hash"),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      ...input,
    };
    setProfileClaims(cs => [...cs, inv]);
    // Update claim status on the talent
    if (input.profileType === "talent_profile") {
      setClaimStatusByTalent(s => ({ ...s, [input.profileId]: "invite_sent" as ProfileClaimStatus }));
    }
  }, []);

  const resolveProfileClaimDispute = useCallback((claimId: string, outcome: "release" | "uphold" | "remove", _adminNotes?: string) => {
    setProfileClaims(cs => cs.map(c => {
      if (c.id !== claimId) return c;
      const nextStatus: ProfileClaimInvitation["status"] =
        outcome === "release" ? "revoked"
        : outcome === "remove" ? "revoked"
        : /* uphold */ "pending";
      return { ...c, status: nextStatus, updatedAt: nowIso() };
    }));
    const claim = profileClaims.find(c => c.id === claimId);
    if (claim?.profileType === "talent_profile") {
      setClaimStatusByTalent(s => {
        const next = { ...s };
        if (outcome === "release") next[claim.profileId] = "released" as ProfileClaimStatus;
        else if (outcome === "remove") delete next[claim.profileId];
        else if (outcome === "uphold") next[claim.profileId] = "invite_sent" as ProfileClaimStatus;
        return next;
      });
    }
  }, [profileClaims]);

  const getTrustSummary = useCallback((subjectType: VerificationSubjectType, subjectId: string): TrustSummary => {
    const claimStatus = subjectType === "talent_profile" ? claimStatusByTalent[subjectId] : undefined;
    const userId = subjectType === "talent_profile" ? TALENT_TO_USER[subjectId] : undefined;
    const account = userId ? SEED_ACCOUNT_VERIFICATION[userId] : undefined;
    const badges = profileVerifications
      .filter(pv => pv.subjectType === subjectType && pv.subjectId === subjectId && pv.status === "active")
      .map(pv => ({
        type: pv.verificationType,
        label: VERIFICATION_TYPE_META[pv.verificationType].label,
        tooltip: VERIFICATION_TYPE_META[pv.verificationType].tooltip,
        public: pv.publicBadgeEnabled,
        status: pv.status,
        identifier: pv.identifier,
        methodEnabled: verificationMethodConfigs.find(c => c.type === pv.verificationType)?.enabled ?? true,
      }));
    const pendingRequests = verificationRequests
      .filter(r => r.subjectType === subjectType && r.subjectId === subjectId
        && (r.status === "pending_user_action" || r.status === "submitted" || r.status === "in_review" || r.status === "needs_more_info"))
      .map(r => ({ verificationType: r.verificationType, status: r.status, method: r.method }));
    return { subjectType, subjectId, claimStatus, account, badges, pendingRequests };
  }, [profileVerifications, verificationRequests, claimStatusByTalent, verificationMethodConfigs]);

  // ── Platform-admin verification method registry ───────────────────
  const isVerificationMethodEnabled = useCallback((type: VerificationType) => {
    return verificationMethodConfigs.find(c => c.type === type)?.enabled ?? false;
  }, [verificationMethodConfigs]);
  const getVerificationMethodConfig = useCallback((type: VerificationType) => {
    return verificationMethodConfigs.find(c => c.type === type)
      ?? { type, enabled: false, reviewMode: "manual" as VerificationReviewMode, visibleOn: ["admin_only"] as VerificationVisibility[], availableToTiers: ["all"] as VerificationTierGate[], evidenceRequired: false, expiresAfterDays: null };
  }, [verificationMethodConfigs]);
  const listEnabledMethods = useCallback(() => {
    return verificationMethodConfigs.filter(c => c.enabled).map(c => c.type);
  }, [verificationMethodConfigs]);
  const updateVerificationMethod = useCallback((type: VerificationType, patch: Partial<VerificationMethodConfig>) => {
    setVerificationMethodConfigs(cs => cs.map(c => {
      if (c.type !== type) return c;
      const next = { ...c, ...patch };
      // Emit one audit entry per changed key.
      const entries: VerificationMethodAuditEntry[] = [];
      const stamp = nowIso();
      const mkEntry = (kind: VerificationMethodAuditEntry["changeKind"], before: unknown, after: unknown) => ({
        id: newId("vma"), methodType: type, changedByUserId: "u-platform-admin",
        changeKind: kind, before: String(before), after: String(after), at: stamp,
      });
      if ("enabled" in patch && patch.enabled !== c.enabled) entries.push(mkEntry(patch.enabled ? "enabled" : "disabled", c.enabled, patch.enabled));
      if ("reviewMode" in patch && patch.reviewMode !== c.reviewMode) entries.push(mkEntry("review_mode", c.reviewMode, patch.reviewMode));
      if ("visibleOn" in patch && JSON.stringify(patch.visibleOn) !== JSON.stringify(c.visibleOn)) entries.push(mkEntry("visibility", c.visibleOn.join(","), (patch.visibleOn ?? []).join(",")));
      if ("availableToTiers" in patch && JSON.stringify(patch.availableToTiers) !== JSON.stringify(c.availableToTiers)) entries.push(mkEntry("tier_gate", c.availableToTiers.join(","), (patch.availableToTiers ?? []).join(",")));
      if ("evidenceRequired" in patch && patch.evidenceRequired !== c.evidenceRequired) entries.push(mkEntry("evidence_required", c.evidenceRequired, patch.evidenceRequired));
      if ("expiresAfterDays" in patch && patch.expiresAfterDays !== c.expiresAfterDays) entries.push(mkEntry("expiry", c.expiresAfterDays ?? "never", patch.expiresAfterDays ?? "never"));
      if (entries.length > 0) {
        setVerificationMethodAudit(a => [...entries, ...a]);
      }
      return next;
    }));
  }, []);

  // ── Risk score (Phase 2.4) — internal-only heuristic ─────────────
  const getRiskScore = useCallback((subjectType: VerificationSubjectType, subjectId: string): number => {
    let score = 50; // baseline
    const summary = profileVerifications
      .filter(pv => pv.subjectType === subjectType && pv.subjectId === subjectId && pv.status === "active");
    score += summary.length * 12;
    const claim = subjectType === "talent_profile" ? claimStatusByTalent[subjectId] : undefined;
    if (claim === "claimed") score += 10;
    if (claim === "disputed") score -= 25;
    const userId = subjectType === "talent_profile" ? TALENT_TO_USER[subjectId] : undefined;
    const account = userId ? SEED_ACCOUNT_VERIFICATION[userId] : undefined;
    if (account?.emailVerified) score += 5;
    if (account?.phoneVerified) score += 5;
    // Negative: recent expired/rejected requests
    const recentBad = verificationRequests.filter(r =>
      r.subjectType === subjectType && r.subjectId === subjectId
      && (r.status === "rejected" || r.status === "expired")
    ).length;
    score -= recentBad * 8;
    return Math.max(0, Math.min(100, score));
  }, [profileVerifications, claimStatusByTalent, verificationRequests]);

  const getTalentContactGate = useCallback((talentId: string) => {
    return talentContactGates[talentId] ?? "open";
  }, [talentContactGates]);
  const setTalentContactGate = useCallback((talentId: string, gate: TalentContactGate) => {
    setTalentContactGates(s => ({ ...s, [talentId]: gate }));
  }, []);
  const canClientContactTalent = useCallback((talentId: string, clientId: string) => {
    const gate = talentContactGates[talentId] ?? "open";
    if (gate === "open") return true;
    const trust = profileVerifications.filter(pv => pv.subjectType === "client_profile" && pv.subjectId === clientId && pv.status === "active");
    if (gate === "verified_only") return trust.length > 0;
    // trusted_only — needs score ≥ 60
    let score = 50 + trust.length * 12;
    const claim = claimStatusByTalent[clientId];
    if (claim === "claimed") score += 10;
    return score >= 60;
  }, [talentContactGates, profileVerifications, claimStatusByTalent]);
  const [density, setDensityState] = useState<Density>("comfortable");
  const [workspaceLayout, setWorkspaceLayoutState] = useState<WorkspaceLayout>("topbar");
  const toastIdRef = useRef(0);

  // Hydrate density + workspace layout from localStorage on mount.
  useEffect(() => {
    try {
      const v = window.localStorage.getItem("tulala_density");
      if (v === "comfortable" || v === "compact") setDensityState(v);
      const l = window.localStorage.getItem("tulala_workspaceLayout");
      if (l === "topbar" || l === "sidebar") setWorkspaceLayoutState(l);
    } catch {
      /* ignore — quota / private mode */
    }
  }, []);
  const setDensity = useCallback((d: Density) => {
    setDensityState(d);
    try {
      window.localStorage.setItem("tulala_density", d);
    } catch {
      /* ignore */
    }
  }, []);
  const setWorkspaceLayout = useCallback((l: WorkspaceLayout) => {
    setWorkspaceLayoutState(l);
    try {
      window.localStorage.setItem("tulala_workspaceLayout", l);
    } catch {
      /* ignore */
    }
  }, []);
  // Mirror density onto <html> so global CSS can target it without
  // touching every component. Cleared on unmount.
  useEffect(() => {
    document.documentElement.dataset.tulalaDensity = density;
    return () => {
      delete document.documentElement.dataset.tulalaDensity;
    };
  }, [density]);

  // Hydration gate — the persist-to-URL effect skips its initial fire
  // until the URL-read effect below has had a chance to apply the
  // params. Otherwise the persist effect runs on first paint with
  // *defaults* and clobbers the user's URL params before they're read.
  const [urlHydrated, setUrlHydrated] = useState(false);

  // Read initial state from URL on mount.
  // Skipped in production (cutover) mode — page is driven by Next.js
  // routing, not ?page= query params.
  useEffect(() => {
    if (tenantSlugRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const s = params.get("surface");
    const pl = params.get("plan");
    const r = params.get("role");
    const et = params.get("entityType");
    const at = params.get("alsoTalent");
    const pg = params.get("page");
    const tpg = params.get("talentPage");
    const cpl = params.get("clientPlan");
    const cpg = params.get("clientPage");
    const hr = params.get("hqRole");
    const ppg = params.get("platformPage");
    const dr = params.get("drawer");
    const drp = params.get("drawerPayload");
    if (s && SURFACES.includes(s as Surface)) setSurface(s as Surface);
    if (pl && PLANS.includes(pl as Plan)) setPlan(pl as Plan);
    if (r && ROLES.includes(r as Role)) setRole(r as Role);
    if (et && ENTITY_TYPES.includes(et as EntityType)) setEntityType(et as EntityType);
    if (at === "true" || at === "false") setAlsoTalent(at === "true");
    // WS-3.6 — resolve legacy aliases before setting page
    if (pg) setPage(resolveWorkspacePage(pg));
    if (tpg && TALENT_PAGES.includes(tpg as TalentPage)) setTalentPage(tpg as TalentPage);
    if (cpl && CLIENT_PLANS.includes(cpl as ClientPlan)) setClientPlan(cpl as ClientPlan);
    if (cpg && CLIENT_PAGES.includes(cpg as ClientPage)) setClientPage(cpg as ClientPage);
    const cprof = params.get("clientProfile");
    if (cprof === "martina" || cprof === "gringo") setClientProfile(cprof);
    if (hr && HQ_ROLES.includes(hr as HqRole)) setHqRole(hr as HqRole);
    if (ppg && PLATFORM_PAGES.includes(ppg as PlatformPage)) setPlatformPage(ppg as PlatformPage);
    // Drawer is a wide string-literal union (~150 ids); we trust the URL
    // rather than enumerating a runtime list. If the id is unknown,
    // DrawerRoot's switch falls through and renders nothing — same as a
    // closed drawer. Payload survives only if it's JSON-serializable
    // primitives (the common case: string ids, numbers, booleans).
    if (dr) {
      let payload: Record<string, unknown> | undefined;
      if (drp) {
        try {
          const parsed = JSON.parse(drp);
          if (parsed && typeof parsed === "object") payload = parsed as Record<string, unknown>;
        } catch {
          // ignore malformed payload — open the drawer empty
        }
      }
      setDrawer({ drawerId: dr as DrawerId, payload });
    }
    // Open the persistence gate AFTER reading. This sets a flag in the
    // next render tick, so the persist effect's first fire-with-defaults
    // is skipped and only fires once state actually reflects the URL.
    setUrlHydrated(true);
  }, []);

  // Persist to URL (replace, not push). Only sync the dimensions relevant to
  // the active surface to keep URLs short and shareable.
  // Skipped in production (cutover) mode — URL is owned by Next.js router.
  useEffect(() => {
    if (tenantSlugRef.current) return;
    // Skip until URL-read has applied. Otherwise the very first paint
    // writes defaults to the URL and discards whatever the user navigated to.
    if (!urlHydrated) return;
    const params = new URLSearchParams();
    params.set("surface", surface);
    if (surface === "workspace") {
      params.set("plan", plan);
      params.set("role", role);
      params.set("entityType", entityType);
      params.set("alsoTalent", String(alsoTalent));
      params.set("page", page);
    } else if (surface === "talent") {
      params.set("talentPage", talentPage);
    } else if (surface === "client") {
      params.set("clientPlan", clientPlan);
      params.set("clientPage", clientPage);
      params.set("clientProfile", clientProfile);
    } else if (surface === "platform") {
      params.set("hqRole", hqRole);
      params.set("platformPage", platformPage);
    }
    // Drawer (cross-surface): persist the open drawer + JSON-encoded
    // payload of primitives. Skipped if no drawer is open so closed-state
    // URLs stay clean.
    if (drawer.drawerId) {
      params.set("drawer", drawer.drawerId);
      if (drawer.payload && Object.keys(drawer.payload).length > 0) {
        try {
          // Strip non-serializable values (functions, undefined). JSON.stringify
          // already drops them, so we only need to guard against circular
          // references — rare in this prototype but cheap to handle.
          params.set("drawerPayload", JSON.stringify(drawer.payload));
        } catch {
          // omit payload silently
        }
      }
    }
    const next = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", next);
  }, [
    surface,
    plan,
    role,
    entityType,
    alsoTalent,
    page,
    talentPage,
    clientPlan,
    clientPage,
    clientProfile,
    hqRole,
    platformPage,
    drawer,
    urlHydrated,
  ]);

  // Drawer history stack — supports a "back" affordance in nested
  // drawer flows. Push the *current* drawer onto the stack whenever a
  // new drawer is opened on top of it; pop on close. Reset whenever a
  // drawer is opened from a closed state.
  const [drawerStack, setDrawerStack] = useState<DrawerContext[]>([]);
  const openDrawer = useCallback(
    (id: DrawerId, payload?: Record<string, unknown>) => {
      // 2026 #6 — Wrap drawer mutations in startViewTransition so the
      // browser crossfades the DOM. Falls back to plain state on
      // unsupported browsers + skipped under prefers-reduced-motion.
      runWithViewTransition(() => {
        setDrawer((current) => {
          // If a drawer is already open and we're switching to a different
          // one, push the current one onto the back-stack.
          if (current.drawerId && current.drawerId !== id) {
            setDrawerStack((s) => [...s, current]);
          }
          return { drawerId: id, payload };
        });
      });
    },
    [],
  );
  const closeDrawer = useCallback(() => {
    runWithViewTransition(() => {
      setDrawer({ drawerId: null });
      setDrawerStack([]);
    });
  }, []);
  /**
   * Pop the back-stack and reopen the previous drawer. If the stack is
   * empty this is a no-op; the consumer should hide the back affordance
   * in that case.
   */
  const popDrawer = useCallback(() => {
    setDrawerStack((s) => {
      if (s.length === 0) return s;
      const prev = s[s.length - 1]!;
      setDrawer(prev);
      return s.slice(0, -1);
    });
  }, []);

  const openUpgrade = useCallback((offer: Omit<UpgradeOffer, "open">) => {
    setUpgrade({ open: true, ...offer });
  }, []);
  const closeUpgrade = useCallback(() => {
    setUpgrade({ open: false });
  }, []);

  const toast = useCallback((message: string, opts?: { undo?: () => void; action?: ToastAction; tone?: ToastTone }) => {
    const id = ++toastIdRef.current;
    // WS-0.9 — toast queue limit. Max 3 toasts on screen at once.
    // Errors get priority (kept), oldest non-error gets dropped.
    // Without this cap, firing 5 toasts in a row stacks them and
    // the user can't read any.
    const TOAST_LIMIT = 3;
    setToasts((prev) => {
      const next = [...prev, { id, message, undo: opts?.undo, action: opts?.action, tone: opts?.tone }];
      if (next.length <= TOAST_LIMIT) return next;
      // Over limit — drop the oldest non-error toast first; if all are
      // errors, drop the absolute oldest.
      const dropIdx = next.findIndex((t) => t.tone !== "error");
      const cutAt = dropIdx === -1 ? 0 : dropIdx;
      return next.slice(0, cutAt).concat(next.slice(cutAt + 1));
    });
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, (opts?.undo || opts?.action) ? 5000 : 2400); // actionable toasts stay longer
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleSetTalentTier = useCallback(
    async (tier: TalentSubscriptionTier) => {
      if (process.env.NODE_ENV !== "production") {
        const result = await devSetTalentPlanTierForSelfAction(tier);
        if (!result.ok) {
          toast(result.error, { tone: "error" });
          return;
        }
      }
      setTalentTierState(tier);
      router.refresh();
    },
    [router, toast],
  );

  const completeTask = useCallback((id: string) => {
    setCompletedTasks((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  // When surface changes, reset to a sensible default page for that surface.
  const handleSetSurface = useCallback((s: Surface) => {
    setSurface(s);
    if (s === "workspace") setPage("overview");
    if (s === "talent") setTalentPage("today");
    if (s === "client") setClientPage("today");
    if (s === "platform") setPlatformPage("today");
    setDrawer({ drawerId: null });
  }, []);

  // Hybrid-mode toggle. Only meaningful for a user who is BOTH talent and
  // workspace owner. Flips between the two surfaces.
  //
  // CRITICAL UX RULE: in production (cutover) mode the URL must lead, not
  // follow. Optimistically flipping `state.surface` and then calling
  // `router.push` produces a multi-second window where the URL still
  // points at /talent/X but the inline render already shows the workspace
  // shell — which the user (correctly) reads as "URL is stuck." So in
  // bridge mode we navigate FIRST and let the destination layout's
  // `initialSurface` drive the surface change. The destination layout's
  // `loading.tsx` covers the brief render gap.
  //
  // In standalone prototype mode (no tenantSlug, no bridge) we keep the
  // legacy behavior — flip state inline since there's no real route to
  // navigate to.
  //
  // Phase 5 — fire-and-forget setPreferredSurface persists the choice.
  const flipMode = useCallback(() => {
    if (!alsoTalent) return; // gated to hybrid users only
    let nextSurface: Surface | null = null;
    if (surface === "talent") nextSurface = "workspace";
    else if (surface === "workspace") nextSurface = "talent";
    if (!nextSurface) return;

    const slug = tenantSlugRef.current;
    if (slug) {
      // Production / cutover mode — URL leads.
      let nextHref: string;
      if (nextSurface === "workspace") {
        // Preserve the workspace page the user last had (so toggling
        // /talent → workspace returns them to /admin/roster, not /admin).
        const segment = pageToSegment(page);
        nextHref = segment ? `/${slug}/admin/${segment}` : `/${slug}/admin`;
      } else {
        // Preserve last talent page similarly.
        const segment = talentPageToSegment(talentPage);
        nextHref = `/${slug}/talent/${segment}`;
      }
      router.push(nextHref);
      setDrawer({ drawerId: null });
    } else {
      // Standalone prototype mode — just flip state inline.
      handleSetSurface(nextSurface);
    }

    // Persist preference when in production (bridge) mode.
    if (initialBridgeData != null) {
      const target = nextSurface as "talent" | "workspace";
      // Dynamic import keeps the server action out of the standalone bundle.
      import("@/lib/server-actions/user-prefs")
        .then(({ setPreferredSurface }) => setPreferredSurface(target))
        .catch((err: unknown) => logServerError("flipmode", err));
    }
  }, [alsoTalent, surface, page, talentPage, handleSetSurface, initialBridgeData, router]);

  // Impersonation: HQ user starts viewing a tenant's workspace. We jump to
  // the workspace surface in read-only mode, with a banner overlay (rendered
  // by SurfaceRouter when state.impersonating is set).
  const startImpersonation = useCallback(
    (i: NonNullable<Impersonation>) => {
      setImpersonating(i);
      setSurface("workspace");
      setPlan(i.asPlan);
      setRole(i.asRole);
      setEntityType(i.asEntityType);
      setPage("overview");
      setDrawer({ drawerId: null });
    },
    [],
  );
  const stopImpersonation = useCallback(() => {
    setImpersonating(null);
    setSurface("platform");
    setPlatformPage("tenants");
    setDrawer({ drawerId: null });
  }, []);

  // Phase 1 real-data bridge — pre-fetched payload from `./page.tsx`.
  // `bridgeRoster` is null when the URL did not request live mode (the
  // default); in that case `effectiveRoster` falls back to the mock
  // arrays via `getRoster(plan)`. When live mode is requested,
  // `bridgeRoster` carries the result of the server-side query and
  // overrides the per-plan mock — even if it's an empty array (which
  // we render as the standard empty state, NOT silent mock fallback).
  const bridgeRoster = initialBridgeData?.roster ?? null;
  const effectiveRoster = useMemo<TalentProfile[]>(
    () => bridgeRoster ?? getRoster(plan),
    [bridgeRoster, plan],
  );

  // Phase 3.12 — additional bridge surface fields
  const bridgeInquiries = initialBridgeData?.inquiries ?? null;
  const effectiveMessagesInquiries = useMemo<RichInquiry[]>(
    () =>
      bridgeInquiries != null
        ? bridgeInquiries.map(adaptBridgeInquiry)
        : RICH_INQUIRIES,
    [bridgeInquiries],
  );

  const bridgeClients = initialBridgeData?.clients ?? null;
  const effectiveClients = useMemo<Client[]>(
    () =>
      bridgeClients != null
        ? bridgeClients.map(adaptBridgeClient)
        : getClients(plan),
    [bridgeClients, plan],
  );

  const effectiveCalendarEvents = initialBridgeData?.calendarEvents ?? null;
  const overviewMetrics = initialBridgeData?.overviewMetrics ?? null;

  const bridgeBookings = initialBridgeData?.bookings ?? null;
  const effectiveBookings = useMemo<WorkspaceBookingRow[]>(
    () => bridgeBookings ?? [],
    [bridgeBookings],
  );

  const bridgePitches = initialBridgeData?.pitches ?? null;
  const effectivePitches = useMemo<WorkspacePitchRow[]>(
    () => bridgePitches ?? [],
    [bridgePitches],
  );

  const bridgeTeamMembers = initialBridgeData?.teamMembers ?? null;
  const effectiveTeamMembers = useMemo<TeamMember[]>(
    () =>
      bridgeTeamMembers != null
        ? bridgeTeamMembers.map(adaptBridgeTeamMember)
        : getTeam(plan),
    [bridgeTeamMembers, plan],
  );

  const totalUnread = initialBridgeData?.totalUnread ?? 0;

  // Phase 5 — cross-mode unread counts for the toggle pill.
  // When no bridge data (standalone prototype), both are undefined so the
  // pill falls back to mock constants (preserves design-QA behaviour).
  const bridgeTalentUnread: number | undefined = initialBridgeData?.talentUnread;
  const bridgeWorkspaceUnread: number | undefined = initialBridgeData?.workspaceUnread;
  // First-run tooltip flag. undefined in prototype mode → tooltip hidden.
  const bridgeFirstRunToggleTipSeen: boolean | undefined = initialBridgeData?.firstRunToggleTipSeen;

  // Phase 1 (master plan) — chrome identity bridge.
  // When provided by the workspace admin layout, the prototype's chrome
  // (top-bar, plan badge, acting subline) reads from these instead of
  // the hardcoded TENANT/MY_TALENT_PROFILE constants. When null, the
  // prototype runs in standalone demo mode and falls back to mocks.
  const bridgeTenantIdentity = initialBridgeData?.tenantIdentity ?? null;
  const bridgeSessionIdentity = initialBridgeData?.sessionIdentity ?? null;

  // Stable, serialization-safe tenant values for all JSX renders.
  // Computed from the bridge in production; falls back to the TENANT mock
  // in standalone prototype mode. Stable reference (memoised on bridgeTenantIdentity
  // which is itself derived from the stable initialBridgeData prop).
  const effectiveTenant = useMemo(() => {
    if (!bridgeTenantIdentity) return TENANT;
    const { displayName, slug, kind } = bridgeTenantIdentity;
    const words = displayName.split(/\s+/u).filter(Boolean);
    const initials =
      ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() ||
      displayName.slice(0, 2).toUpperCase();
    return {
      name: displayName,
      slug,
      domain: `${slug}.tulala.digital`,
      customDomain: `${slug}.com`,
      initials,
      entityType: (kind === "hub" ? "hub" : "agency") as EntityType,
    };
  }, [bridgeTenantIdentity]);

  // Bridge the real tenant slug and signed-in user id down to module-level
  // helpers in messages.tsx (togglePin/toggleManualUnread/archiveInquiry)
  // that can't access hooks. See inquiry-flags-tenant-slug.ts for rationale.
  useEffect(() => {
    setInquiryFlagsTenantSlug(effectiveTenant.slug);
    return () => setInquiryFlagsTenantSlug(null);
  }, [effectiveTenant.slug]);

  useEffect(() => {
    setInquiryFlagsUserId(bridgeSessionIdentity?.userId ?? null);
    return () => setInquiryFlagsUserId(null);
  }, [bridgeSessionIdentity?.userId]);

  // Phase 3.12.2 — talent self-surface bridge
  const effectiveTalentInquiries = useMemo<TalentInquiryRow[]>(
    () => initialBridgeData?.talentInquiries ?? [],
    [initialBridgeData?.talentInquiries],
  );
  const bridgeTalentSelfProfile = initialBridgeData?.talentSelfProfile ?? null;
  // Talent's agency relationships. `null` means the layout didn't load
  // them (workspace-only entry); empty array means "real bridge, no
  // agency relationships yet" — render empty state, not Marta's mocks.
  const bridgeTalentAgencies = initialBridgeData?.talentAgencies ?? null;
  // B.2 — user notifications feed. `null` falls back to mock NOTIFICATIONS
  // in the drawer; empty array means real bridge with no rows yet.
  const bridgeUserNotifications = initialBridgeData?.userNotifications ?? null;
  // B.3 — talent calendar entries from bookings + holds + blocks.
  // `null` falls back to mock TALENT_BOOKINGS + TALENT_REQUESTS in CalendarPage.
  const bridgeTalentCalendarEntries = initialBridgeData?.talentCalendarEntries ?? null;

  // Media gallery bridge — `null` falls back to MOCK_MEDIA in WorkspaceMediaPage,
  // empty array means "live mode, no photos yet" → renders empty state.
  const bridgeMediaPhotos = initialBridgeData?.mediaPhotos ?? null;
  const bridgeMediaFolders: BridgeMediaFolder[] = initialBridgeData?.mediaFolders ?? [];
  const bridgeMediaErrored = initialBridgeData?.mediaBridgeErrored ?? false;
  const bridgeMediaTotalCount = initialBridgeData?.mediaTotalCount ?? null;

  const bridgeWebsite = initialBridgeData?.website;
  const websiteUsesLiveCms = bridgeWebsite != null;
  const effectiveWebsiteState = useMemo(
    () =>
      bridgeWebsite != null
        ? mergeWebsiteStateFromBridge(bridgeWebsite)
        : WEBSITE_STATE,
    [bridgeWebsite],
  );

  const value: Ctx = useMemo(
    () => ({
      state: {
        surface,
        plan,
        role,
        entityType,
        alsoTalent,
        page,
        talentPage,
        talentTier,
        clientPlan,
        clientPage,
        clientProfile,
        hqRole,
        platformPage,
        impersonating,
        drawer,
        upgrade,
        toasts,
        completedTasks,
        density,
        workspaceLayout,
      },
      setSurface: handleSetSurface,
      flipMode,
      setPlan,
      setRole,
      setEntityType,
      setAlsoTalent,
      setDensity,
      setWorkspaceLayout,
      setPage,
      setTalentPage,
      setTalentTier: handleSetTalentTier,
      setClientPlan,
      setClientPage,
      clientProfile,
      setClientProfile,
      activeClientProfile,
      setHqRole,
      setPlatformPage,
      startImpersonation,
      stopImpersonation,
      openDrawer,
      closeDrawer,
      popDrawer,
      drawerStack,
      openUpgrade,
      closeUpgrade,
      toast,
      dismissToast,
      handleSetTalentTier,
      completeTask,
      pendingTalent,
      resolveApproval,
      bulkAddTalent,
      bulkAddClient,
      importedClients,
      customFields,
      addCustomField,
      removeCustomField,
      setCustomFieldVisibility,
      fieldVisibilityOverrides,
      setFieldVisibility,
      effectiveFieldVisibility,
      verificationRequests,
      profileVerifications,
      profileClaims,
      claimStatusByTalent,
      createVerificationRequest,
      updateVerificationRequest,
      approveVerificationRequest,
      rejectVerificationRequest,
      revokeProfileVerification,
      revokeInstagramOnHandleChange,
      sendProfileClaimInvite,
      resolveProfileClaimDispute,
      getTrustSummary,
      verificationMethodConfigs,
      verificationMethodAudit,
      isVerificationMethodEnabled,
      getVerificationMethodConfig,
      listEnabledMethods,
      updateVerificationMethod,
      getRiskScore,
      getTalentContactGate,
      setTalentContactGate,
      canClientContactTalent,
      // Phase 1 real-data bridge fields. `bridgeRoster` is the raw
      // server-fetched payload (or null in mock mode); `effectiveRoster`
      // is the resolved `bridgeRoster ?? getRoster(plan)` that surfaces
      // should consume.
      bridgeRoster,
      effectiveRoster,
      tenantSlug,
      // Phase 3.12 — additional surface bridge fields
      effectiveMessagesInquiries,
      effectiveClients,
      effectiveCalendarEvents,
      overviewMetrics,
      effectiveBookings,
      effectivePitches,
      effectiveTeamMembers,
      totalUnread,
      effectiveTalentInquiries,
      bridgeTalentSelfProfile,
      bridgeTalentAgencies,
      bridgeUserNotifications,
      bridgeTalentCalendarEntries,
      bridgeMediaPhotos,
      bridgeMediaFolders,
      bridgeMediaErrored,
      bridgeMediaTotalCount,
      bridgeTenantIdentity,
      bridgeSessionIdentity,
      effectiveTenant,
      effectiveWebsiteState,
      websiteUsesLiveCms,
      // Phase 5
      bridgeTalentUnread,
      bridgeWorkspaceUnread,
      bridgeFirstRunToggleTipSeen,
      locale,
      t: createTranslator(locale),
    }),
    [
      surface,
      plan,
      role,
      entityType,
      alsoTalent,
      page,
      talentPage,
      talentTier,
      clientPlan,
      clientPage,
      hqRole,
      platformPage,
      impersonating,
      drawer,
      drawerStack,
      upgrade,
      toasts,
      completedTasks,
      density,
      workspaceLayout,
      setDensity,
      setWorkspaceLayout,
      handleSetSurface,
      flipMode,
      startImpersonation,
      stopImpersonation,
      openDrawer,
      closeDrawer,
      popDrawer,
      openUpgrade,
      closeUpgrade,
      toast,
      dismissToast,
      handleSetTalentTier,
      completeTask,
      pendingTalent,
      resolveApproval,
      bulkAddTalent,
      bulkAddClient,
      importedClients,
      customFields,
      addCustomField,
      removeCustomField,
      setCustomFieldVisibility,
      fieldVisibilityOverrides,
      setFieldVisibility,
      effectiveFieldVisibility,
      verificationRequests,
      profileVerifications,
      profileClaims,
      claimStatusByTalent,
      createVerificationRequest,
      updateVerificationRequest,
      approveVerificationRequest,
      rejectVerificationRequest,
      revokeProfileVerification,
      revokeInstagramOnHandleChange,
      sendProfileClaimInvite,
      resolveProfileClaimDispute,
      getTrustSummary,
      verificationMethodConfigs,
      verificationMethodAudit,
      isVerificationMethodEnabled,
      getVerificationMethodConfig,
      listEnabledMethods,
      updateVerificationMethod,
      getRiskScore,
      getTalentContactGate,
      setTalentContactGate,
      canClientContactTalent,
      bridgeRoster,
      effectiveRoster,
      tenantSlug,
      effectiveMessagesInquiries,
      effectiveClients,
      effectiveCalendarEvents,
      overviewMetrics,
      effectiveBookings,
      effectivePitches,
      effectiveTeamMembers,
      totalUnread,
      effectiveTalentInquiries,
      bridgeTalentSelfProfile,
      bridgeTalentAgencies,
      bridgeUserNotifications,
      bridgeTalentCalendarEntries,
      bridgeMediaPhotos,
      bridgeMediaFolders,
      bridgeMediaErrored,
      bridgeMediaTotalCount,
      bridgeTenantIdentity,
      bridgeSessionIdentity,
      effectiveTenant,
      effectiveWebsiteState,
      websiteUsesLiveCms,
      // Phase 5
      bridgeTalentUnread,
      bridgeWorkspaceUnread,
      bridgeFirstRunToggleTipSeen,
      locale,
    ],
  );

  return <AdminShellContext.Provider value={value}>{children}</AdminShellContext.Provider>;
}

export function useAdminShell(): Ctx {
  const v = useContext(AdminShellContext);
  if (!v) throw new Error("useAdminShell outside AdminShellProvider");
  return v;
}
