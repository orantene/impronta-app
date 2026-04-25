/**
 * Workspace-status behavior matrix.
 *
 * Status is product policy, not user-configurable. Each `agencies.status`
 * value maps to a set of allow/deny rules consulted by step 9 of the access
 * resolution contract.
 *
 * Phase tagging:
 *   - `phase: 1` — reachable today (set manually or by onboarding).
 *     The resolver enforces these rules.
 *   - `phase: 2` — only reachable when billing lifecycle ships (Stripe,
 *     trial transitions, past-due cron). Defined now for completeness;
 *     the resolver passes them through with a logged warning until
 *     enforcement is wired in.
 *
 * See §10 of the architecture brief.
 */

export const STATUS_KEYS = [
  "draft",
  "onboarding",
  "trial",
  "active",
  "past_due",
  "restricted",
  "suspended",
  "cancelled",
  "archived",
] as const;

export type StatusKey = (typeof STATUS_KEYS)[number];

/** Per-status behavior — each cell answers a yes/owner-only/blocked question. */
export type StatusBehavior = {
  /** Phase the resolver actively enforces these rules. */
  phase: 1 | 2;
  /** Public storefront available to anonymous visitors? */
  publicSite: "yes" | "no" | "read_only";
  /** Owner / staff can sign in to admin? */
  adminLogin: "yes" | "owner_only" | "platform_only" | "no";
  /** Read-only admin views render? */
  adminRead: "yes" | "no" | "limited_window";
  /** Can edit existing content? */
  edits: "yes" | "no";
  /** Can publish drafts? */
  publish: "yes" | "no" | "warn";
  /** Billing page reachable from admin? */
  billingPage: "yes" | "no";
  /** Can send team invites? */
  invites: "yes" | "no";
  /** Talent profiles renderable on the public site? */
  profilesVisible: "yes" | "no";
  /** Workspace owner can export their data? */
  dataExport: "yes" | "no" | "platform_only";
  /** Optional human-readable note shown in admin banners. */
  banner?: string;
};

export const STATUS_RULES: Record<StatusKey, StatusBehavior> = {
  // ─── Phase 1 (reachable today, enforced now) ─────────────────────────
  onboarding: {
    phase: 1,
    publicSite: "no",
    adminLogin: "yes",
    adminRead: "yes",
    edits: "yes",
    publish: "warn",
    billingPage: "yes",
    invites: "yes",
    profilesVisible: "no",
    dataExport: "yes",
    banner: "Your site is not yet public. Finish setup to go live.",
  },
  active: {
    phase: 1,
    publicSite: "yes",
    adminLogin: "yes",
    adminRead: "yes",
    edits: "yes",
    publish: "yes",
    billingPage: "yes",
    invites: "yes",
    profilesVisible: "yes",
    dataExport: "yes",
  },
  suspended: {
    phase: 1,
    publicSite: "no",
    adminLogin: "owner_only",
    adminRead: "no",
    edits: "no",
    publish: "no",
    billingPage: "yes",
    invites: "no",
    profilesVisible: "no",
    dataExport: "yes",
    banner: "This workspace is suspended. Contact support to reactivate.",
  },

  // ─── Phase 2 (defined for future, not yet enforced) ──────────────────
  draft: {
    phase: 2,
    publicSite: "no",
    adminLogin: "owner_only",
    adminRead: "yes",
    edits: "yes",
    publish: "no",
    billingPage: "yes",
    invites: "no",
    profilesVisible: "no",
    dataExport: "yes",
  },
  trial: {
    phase: 2,
    publicSite: "yes",
    adminLogin: "yes",
    adminRead: "yes",
    edits: "yes",
    publish: "yes",
    billingPage: "yes",
    invites: "yes",
    profilesVisible: "yes",
    dataExport: "yes",
  },
  past_due: {
    phase: 2,
    publicSite: "yes",
    adminLogin: "yes",
    adminRead: "yes",
    edits: "yes",
    publish: "warn",
    billingPage: "yes",
    invites: "no",
    profilesVisible: "yes",
    dataExport: "yes",
    banner: "Payment is past due. Update billing to avoid suspension.",
  },
  restricted: {
    phase: 2,
    publicSite: "read_only",
    adminLogin: "yes",
    adminRead: "yes",
    edits: "no",
    publish: "no",
    billingPage: "yes",
    invites: "no",
    profilesVisible: "yes",
    dataExport: "yes",
    banner: "Editing is paused until billing is resolved.",
  },
  cancelled: {
    phase: 2,
    publicSite: "no",
    adminLogin: "owner_only",
    adminRead: "limited_window",
    edits: "no",
    publish: "no",
    billingPage: "yes",
    invites: "no",
    profilesVisible: "no",
    dataExport: "yes",
    banner: "This workspace is cancelled. Reactivate within 30 days to restore.",
  },
  archived: {
    phase: 2,
    publicSite: "no",
    adminLogin: "platform_only",
    adminRead: "no",
    edits: "no",
    publish: "no",
    billingPage: "no",
    invites: "no",
    profilesVisible: "no",
    dataExport: "platform_only",
  },
};

/** Statuses where any non-platform action is allowed at all. */
export const SERVABLE_STATUSES: ReadonlySet<StatusKey> = new Set<StatusKey>([
  "onboarding",
  "trial",
  "active",
  "past_due",
  "restricted",
]);

export function isStatusEnforced(status: string): status is StatusKey {
  if (!isKnownStatus(status)) return false;
  return STATUS_RULES[status].phase === 1;
}

export function isKnownStatus(status: string): status is StatusKey {
  return (STATUS_KEYS as readonly string[]).includes(status);
}

export function isServableStatus(status: string): boolean {
  return isKnownStatus(status) && SERVABLE_STATUSES.has(status);
}
