import "server-only";

/**
 * guest-trust-gate.ts — SERVER-SIDE enforcement of the per-tenant
 * active-conversation trust gate (strategy §7 "limits are trust-gates, not
 * paywalls" + §5 "the guest→account trust ladder").
 *
 * THE REFRAME: the unlock currency is VERIFICATION, never dollars. A guest who
 * has the maximum number of conversations open is not asked to pay — they are
 * nudged to VERIFY their email or create a free account, which raises their cap.
 * Any legacy "$5" idea is reframed elsewhere in the UI as a refundable hold; the
 * default ladder mentions no money at all.
 *
 * THE TIER LADDER (matches the spelling used by guest-trust-chip-mapper.ts):
 *   • "guest"          — cookie only, no email captured.                 cap = guest_conversation_limit          (default 1)
 *   • "identified"     — email captured but not verified.                cap = guest_conversation_limit          (default 1) †
 *   • "email_verified" — magic-link verified (auth email_confirmed_at).  cap = email_verified_conversation_limit (default 3)
 *   • "account"        — a real registered client (profiles.active).     cap = account_conversation_limit        (default 10)
 *
 *   † An "identified" guest has typed an email but NOT proven ownership, so it
 *     does not unlock a higher cap than a bare guest — the unlock is the
 *     VERIFICATION step (clicking the magic link), exactly the §5 ladder. We
 *     still report the tier as "identified" so the UI nudge can say "verify the
 *     email you already gave us" rather than "give us an email".
 *
 * WHAT IS GATED: only STARTING a new conversation. Continuing an already-owned
 * thread (sendGuestMessageAction) is NEVER gated — this function is called ONLY
 * from the inquiry-CREATE path (startGuestChatInquiry), AFTER
 * ensureGuestClientByEmail (so the matched client + verification status are
 * known) and BEFORE createInquiryFromIntent.
 *
 * FAIL-OPEN: any infra error (no service-role client, a DB hiccup, a config-read
 * failure) resolves to { allowed: true } — a config/DB blip must NEVER block a
 * real buyer from reaching the agency. This mirrors loadGuestChatSettings's
 * defaults-on contract and the rest of the public guest path.
 *
 * This is a LIB module (not a "use server" action file), so reading
 * `profiles` / `inquiries` directly via the service-role client is correct —
 * the raw-`.from()` ratchet is scoped to server-ACTION files, and `profiles`
 * is not tenant-scoped (a direct admin read is the canonical pattern, e.g.
 * ensureGuestClientByEmail).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

// ─────────────────────────────────────────────────────────────────────────────
// Public types (LOCAL to this lane; the integration agent promotes the small
// cross-cutting pieces into guest-chat-contract.ts — see the lane spec). The
// tier spelling deliberately matches GuestTrustChipProps.identity /
// GuestIdentityTier so the UI toolkit + nudge can consume the same union.
// ─────────────────────────────────────────────────────────────────────────────

export type GuestTrustTier = "guest" | "identified" | "email_verified" | "account";

export type TrustGateDecision =
  | { allowed: true; tier: GuestTrustTier; activeCount: number; limit: number }
  | {
      allowed: false;
      tier: GuestTrustTier;
      activeCount: number;
      limit: number;
      reason: "limit_reached";
    };

// ─────────────────────────────────────────────────────────────────────────────
// Per-tier default caps. Used when a tenant has no tenant_guest_chat_settings
// row (fail-open, exactly like GUEST_CHAT_DEFAULTS in guest-chat-settings.ts)
// or when a column read fails. These mirror the migration column defaults.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_GUEST_LIMIT = 1;
const DEFAULT_EMAIL_VERIFIED_LIMIT = 3;
const DEFAULT_ACCOUNT_LIMIT = 10;

type TierLimits = {
  guest: number;
  email_verified: number;
  account: number;
};

const DEFAULT_TIER_LIMITS: TierLimits = {
  guest: DEFAULT_GUEST_LIMIT,
  email_verified: DEFAULT_EMAIL_VERIFIED_LIMIT,
  account: DEFAULT_ACCOUNT_LIMIT,
};

/**
 * Terminal inquiry statuses that DO NOT count toward the active limit. Mirrors
 * getActiveGuestInquiry exactly: the explicit `cancelled` status plus every
 * status that toThreadStatus() maps to its "closed" bucket. Kept inline here
 * (rather than importing toThreadStatus from the "use server" actions module)
 * so this pure lib never pulls a server-action graph into its import tree.
 */
const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  "cancelled",
  "closed",
  "archived",
  "rejected",
  "expired",
  "closed_lost",
  // toThreadStatus maps these to "booked"/"approved" (NOT closed), so they stay
  // ACTIVE — a guest mid-booking still occupies a conversation slot. Listed here
  // only as a reminder of what is intentionally excluded: booked, converted,
  // approved, qualified, offer_pending → NOT terminal.
]);

function isTerminalStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return TERMINAL_STATUSES.has(status);
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-tier limits — read from tenant_guest_chat_settings. Fail-open to the
// defaults on no row / any error (matches loadGuestChatSettings).
//
// NOTE: tenant_guest_chat_settings is not yet in the generated database.types,
// so the service-role client treats it as untyped here — same as the existing
// loadGuestChatSettings reader. The `as` narrowing is the contract.
// ─────────────────────────────────────────────────────────────────────────────

async function loadTierLimits(
  admin: SupabaseClient,
  tenantId: string,
): Promise<TierLimits> {
  try {
    const { data, error } = await admin
      .from("tenant_guest_chat_settings")
      .select(
        "guest_conversation_limit, email_verified_conversation_limit, account_conversation_limit",
      )
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) {
      logServerError("guest-trust-gate/loadTierLimits", error);
      return DEFAULT_TIER_LIMITS;
    }
    if (!data) return DEFAULT_TIER_LIMITS;

    const row = data as {
      guest_conversation_limit: number | null;
      email_verified_conversation_limit: number | null;
      account_conversation_limit: number | null;
    };

    // Coerce defensively: a NULL/0/negative/non-finite cell falls back to the
    // tier default so a malformed row can never produce a 0 cap (which would
    // hard-block every guest — the opposite of fail-open).
    const coerce = (raw: number | null | undefined, fallback: number): number => {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n) || n < 1) return fallback;
      return Math.floor(n);
    };

    return {
      guest: coerce(row.guest_conversation_limit, DEFAULT_GUEST_LIMIT),
      email_verified: coerce(
        row.email_verified_conversation_limit,
        DEFAULT_EMAIL_VERIFIED_LIMIT,
      ),
      account: coerce(row.account_conversation_limit, DEFAULT_ACCOUNT_LIMIT),
    };
  } catch (err) {
    logServerError("guest-trust-gate/loadTierLimits.unexpected", err);
    return DEFAULT_TIER_LIMITS;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier resolution.
//
//   account        — the matched client user is a REAL registered client
//                     (profiles.account_status === 'active'). profiles is NOT
//                     tenant-scoped, so a direct admin read is correct.
//   email_verified — the contact email is confirmed. Canonical signal in this
//                     codebase = auth.users.email_confirmed_at IS NOT NULL,
//                     read via admin.auth.admin.getUserById (exactly how
//                     mergeGuestActivity gates the guest→account claim). The
//                     find_auth_user_identity_by_email RPC that
//                     ensureGuestClientByEmail uses does NOT expose a
//                     confirmed-at column (it returns user_id / app_role /
//                     account_status / display_name / has_client_profile), so
//                     the established confirmed-at read is getUserById — we do
//                     NOT invent a new RPC.
//   identified     — an email was captured but is not (yet) verified.
//   guest          — no email captured at all.
// ─────────────────────────────────────────────────────────────────────────────

async function resolveTier(
  admin: SupabaseClient,
  clientUserId: string | null,
  contactEmail: string,
): Promise<GuestTrustTier> {
  const hasEmail = contactEmail.trim().length > 0;

  if (!clientUserId) {
    // No client account was matched/created (e.g. an "unlinked" staff/talent
    // email, or no email at all). If an email was nonetheless captured, the
    // guest is "identified"; otherwise a bare "guest".
    return hasEmail ? "identified" : "guest";
  }

  // ── account? — a real registered client has profiles.account_status 'active'.
  let isRegisteredClient = false;
  try {
    const { data: profile, error } = await admin
      .from("profiles")
      .select("account_status")
      .eq("id", clientUserId)
      .maybeSingle();
    if (error) {
      logServerError("guest-trust-gate/resolveTier/profile", error);
    } else if ((profile?.account_status as string | null) === "active") {
      isRegisteredClient = true;
    }
  } catch (err) {
    logServerError("guest-trust-gate/resolveTier/profile.unexpected", err);
  }
  if (isRegisteredClient) return "account";

  // ── email_verified? — auth.users.email_confirmed_at set (same source as the
  // guest→account claim gate in mergeGuestActivity).
  let isEmailVerified = false;
  try {
    const { data: authUser, error } = await admin.auth.admin.getUserById(clientUserId);
    if (error) {
      logServerError("guest-trust-gate/resolveTier/getUserById", error);
    } else if (authUser?.user?.email_confirmed_at) {
      isEmailVerified = true;
    }
  } catch (err) {
    logServerError("guest-trust-gate/resolveTier/getUserById.unexpected", err);
  }
  if (isEmailVerified) return "email_verified";

  // A client account exists but is neither active nor email-confirmed → the
  // guest gave us a (working) email but hasn't proven ownership yet.
  return hasEmail ? "identified" : "guest";
}

// ─────────────────────────────────────────────────────────────────────────────
// Active-conversation count.
//
// Reuses the EXACT query shape from getActiveGuestInquiry: inquiries owned by
// THIS guest session on THIS tenant, dropping terminal statuses. The
// guest_session_id filter IS the ownership gate (we only ever count this
// cookie's own inquiries even via service-role).
//
// For the "account" tier we ALSO count inquiries owned by the matched
// client_user_id on this tenant — so a registered client's cap spans their
// ACCOUNT (across devices / cleared cookies), not just the current cookie. The
// two sets are unioned by inquiry id so a single inquiry carrying BOTH the
// guest_session_id and the client_user_id is not double-counted.
// ─────────────────────────────────────────────────────────────────────────────

async function countActiveConversations(
  admin: SupabaseClient,
  tenantId: string,
  guestSessionId: string,
  clientUserId: string | null,
  countByAccount: boolean,
): Promise<number> {
  const activeIds = new Set<string>();

  // — by guest session (the cookie that's about to start a new conversation).
  const { data: byGuest, error: guestErr } = await admin
    .from("inquiries")
    .select("id, status")
    .eq("guest_session_id", guestSessionId)
    .eq("tenant_id", tenantId)
    .limit(200);
  if (guestErr) {
    // Propagate as "unknown" — the caller fails OPEN on a thrown error. Here we
    // simply skip this dimension and let any account dimension still apply.
    logServerError("guest-trust-gate/countActiveConversations/byGuest", guestErr);
  } else {
    for (const r of byGuest ?? []) {
      if (!isTerminalStatus(r.status as string | null)) activeIds.add(r.id as string);
    }
  }

  // — by account (account tier only): the cap should follow the registered
  // client across sessions, not just the present cookie.
  if (countByAccount && clientUserId) {
    const { data: byAccount, error: accountErr } = await admin
      .from("inquiries")
      .select("id, status")
      .eq("client_user_id", clientUserId)
      .eq("tenant_id", tenantId)
      .limit(200);
    if (accountErr) {
      logServerError(
        "guest-trust-gate/countActiveConversations/byAccount",
        accountErr,
      );
    } else {
      for (const r of byAccount ?? []) {
        if (!isTerminalStatus(r.status as string | null)) activeIds.add(r.id as string);
      }
    }
  }

  return activeIds.size;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE GATE.
//
// Resolve the tier → load the per-tier cap → count active conversations →
// allow when activeCount < limit. Fail-OPEN on ANY error.
// ─────────────────────────────────────────────────────────────────────────────

export async function evaluateGuestConversationGate(args: {
  admin: SupabaseClient;
  tenantId: string;
  guestSessionId: string;
  clientUserId: string | null;
  contactEmail: string;
}): Promise<TrustGateDecision> {
  try {
    const tier = await resolveTier(args.admin, args.clientUserId, args.contactEmail);

    const limits = await loadTierLimits(args.admin, args.tenantId);
    // "identified" shares the bare-guest cap: typing an email does not unlock a
    // higher tier; clicking the magic link (→ email_verified) does.
    const limit =
      tier === "account"
        ? limits.account
        : tier === "email_verified"
          ? limits.email_verified
          : limits.guest;

    const activeCount = await countActiveConversations(
      args.admin,
      args.tenantId,
      args.guestSessionId,
      args.clientUserId,
      tier === "account",
    );

    if (activeCount < limit) {
      return { allowed: true, tier, activeCount, limit };
    }
    return { allowed: false, tier, activeCount, limit, reason: "limit_reached" };
  } catch (err) {
    // FAIL-OPEN: a real buyer must never be blocked by an infra hiccup. We
    // cannot know the true tier/count here, so report a permissive default.
    logServerError("guest-trust-gate/evaluateGuestConversationGate", err);
    return { allowed: true, tier: "guest", activeCount: 0, limit: DEFAULT_GUEST_LIMIT };
  }
}
