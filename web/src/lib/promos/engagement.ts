/**
 * Engagement promo helpers (TUL-1051 part A). Pure: no I/O, no React, no new
 * readers. Everything here maps onto the existing quote() audience, unlock and
 * limits; the engine is not forked.
 */

import { personalCode } from "./redemption/policy";
import type { Audience, ClientStatus, Promo, Unlocked } from "./types";

// ── client eligibility (widgets) ───────────────────────────────────────

export type EngagementClient = {
  /** Signed in with a client account. Guests have no account. */
  signedIn: boolean;
  /** Prior visits as the caller knows them; guests are "new" unless identified. */
  status: ClientStatus;
  customerId?: string | null;
};

export type EngagementState = "guest" | "new" | "returning" | "lapsed";

export type EngagementResult = {
  /** May this client get this promo's price right now (audience and account only; dates and limits stay with quote()). */
  eligible: boolean;
  /** Why not, so a widget can show the right nudge. */
  reason: "ok" | "sign_in" | "audience" | "personal";
  state: EngagementState;
  /** Widgets show the price only when true; false means show a sign-in prompt. */
  showPrice: boolean;
};

export function clientState(client: EngagementClient): EngagementState {
  if (!client.signedIn && client.status === "new") return "guest";
  return client.status;
}

function audienceAllows(audience: Audience, status: ClientStatus): boolean {
  switch (audience) {
    case "new_clients": return status === "new";
    case "returning": return status === "returning" || status === "lapsed";
    case "lapsed": return status === "lapsed";
    default: return true;
  }
}

/**
 * Mirrors quote()'s audience rule and adds the account gate. `requiresAccount`
 * is the signup_unlock template (draft.requires_account).
 */
export function engagementEligibility(
  client: EngagementClient,
  promo: Pick<Promo, "audience" | "customer_id" | "is_single_use"> & { requires_account?: boolean },
): EngagementResult {
  const state = clientState(client);
  if (promo.is_single_use || promo.audience === "one_client") {
    const ok = Boolean(promo.customer_id) && client.customerId === promo.customer_id;
    return { eligible: ok, reason: ok ? "ok" : "personal", state, showPrice: ok };
  }
  if (promo.requires_account && !client.signedIn) {
    return { eligible: false, reason: "sign_in", state, showPrice: false };
  }
  if (!audienceAllows(promo.audience, client.status)) {
    return { eligible: false, reason: "audience", state, showPrice: false };
  }
  return { eligible: true, reason: "ok", state, showPrice: true };
}

// ── signup unlock ──────────────────────────────────────────────────────

/** Small stable 4-char tail from an account id (FNV-1a, base 36). Not a secret: the gate is "signed in", not the code. */
function accountTail(accountId: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < accountId.length; i++) {
    h ^= accountId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).toUpperCase().padStart(4, "0").slice(-4);
}

/** The per-account code recorded on the redemption: "REGISTRO10-K3F9". Deterministic, so a retry never mints a second one. */
export function signupUnlockCode(baseCode: string, accountId: string): string {
  const base = baseCode.trim().toUpperCase();
  return `${base}-${accountTail(accountId)}`;
}

/**
 * Codes to feed quote()'s `unlocked.codes` for a signup_unlock promo: the
 * promo's own code, only when the client is signed in. A guest gets none, so
 * quote() rejects it as "locked" and the widget shows "sign in to see the price".
 */
export function signupUnlockedCodes(client: Pick<EngagementClient, "signedIn">, promo: Pick<Promo, "code">): Unlocked["codes"] {
  return client.signedIn && promo.code ? [promo.code] : [];
}

// ── referral (two-sided) ───────────────────────────────────────────────

export type ReferralReward = {
  /** Mirrors the tenant_promo_codes insert in reissuePersonalPromo. */
  code: string;
  offer_kind: string;
  value: number;
  currency: string | null;
  unlock: "code";
  audience: "one_client";
  customer_id: string;
  is_single_use: true;
  max_redemptions: 1;
  per_customer_limit: 1;
  parent_promo_id: string;
  courtesy_reason: "other";
  starts_at: string;
  ends_at: string;
  leak_guard: false;
};

export type ReferralParent = {
  id: string;
  offer_kind: string;
  value: number;
  currency: string | null;
};

export type ReferralRedemption = {
  status: "held" | "confirmed" | "released" | "cancelled";
  referredCustomerId: string | null;
  /** How many confirmed redemptions of any promo the referred client had BEFORE this one. */
  priorConfirmedCount: number;
};

export type ReferralPlan =
  | { ok: true; reward: ReferralReward }
  | { ok: false; reason: "not_confirmed" | "not_first" | "no_referrer" | "self_referral" | "no_referred" };

export const REFERRAL_REWARD_DAYS = 60;

/**
 * Pure planning: when a referred client's FIRST booking is confirmed, the
 * referrer earns the same offer ("give X, get X") as a single-use personal
 * code. The caller (not this module) inserts the row and must stay idempotent
 * on (parent_promo_id, customer_id, courtesy_reason='other' + name prefix REFERIDO, referred id).
 */
export function planReferralReward(input: {
  parent: ReferralParent;
  redemption: ReferralRedemption;
  referrerCustomerId: string | null;
  referrerFirstName: string | null;
  now: Date;
  randomInt: (maxExclusive: number) => number;
}): ReferralPlan {
  const { parent, redemption, referrerCustomerId } = input;
  if (redemption.status !== "confirmed") return { ok: false, reason: "not_confirmed" };
  if (!redemption.referredCustomerId) return { ok: false, reason: "no_referred" };
  if (!referrerCustomerId) return { ok: false, reason: "no_referrer" };
  if (referrerCustomerId === redemption.referredCustomerId) return { ok: false, reason: "self_referral" };
  if (redemption.priorConfirmedCount > 0) return { ok: false, reason: "not_first" };
  return {
    ok: true,
    reward: {
      code: personalCode(input.referrerFirstName, input.randomInt),
      offer_kind: parent.offer_kind,
      value: parent.value,
      currency: parent.currency,
      unlock: "code",
      audience: "one_client",
      customer_id: referrerCustomerId,
      is_single_use: true,
      max_redemptions: 1,
      per_customer_limit: 1,
      parent_promo_id: parent.id,
      courtesy_reason: "other",
      starts_at: input.now.toISOString(),
      ends_at: new Date(input.now.getTime() + REFERRAL_REWARD_DAYS * 86_400_000).toISOString(),
      leak_guard: false,
    },
  };
}
