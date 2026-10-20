/**
 * TUL-1374: the Friends collective preset (Model E): a small group of sellers
 * in any trade on a Free (or any) workspace where ONE owner coordinates, takes
 * a % or a fixed amount per member, and the members never see the client chat.
 *
 * Pure rules only: the screens, checkout and messaging readers call these, and
 * nothing here names a trade or a tenant. The owner's cap is 90% (Oran,
 * 2026-10-19), the same cap the terms card uses, so a member always keeps at
 * least 10% of what the client pays for her work.
 *
 * The three behaviours that already exist and that this preset relies on are
 * pinned in friends-collective.test.ts: the workspace owner is the default
 * coordinator (inquiry/coordinator-assignment.ts), a talent is the seller only
 * on the hub and never reads the client thread elsewhere (messaging/
 * talent-pov.ts, thread-rule.ts), and the Free roster cap is 5
 * (saas/plan-seat-caps.ts).
 */
import { seatCapForPlan } from "@/lib/saas/plan-seat-caps";

export const FRIENDS_COLLECTIVE_MODEL = "friends_collective" as const;

/** The owner may take at most 90% of a member's line, in basis points. */
export const COLLECTIVE_OWNER_SHARE_CAP_BPS = 9000;

export type OwnerShare =
  | { kind: "percent"; bps: number }
  | { kind: "fixed"; amountCents: number; currency: string };

export type OwnerShareCheck =
  | { ok: true }
  | { ok: false; reason: "percent_out_of_range" | "fixed_invalid" | "currency_missing" };

export function validateOwnerShare(share: OwnerShare): OwnerShareCheck {
  if (share.kind === "percent") {
    const ok = Number.isInteger(share.bps) && share.bps >= 0 && share.bps <= COLLECTIVE_OWNER_SHARE_CAP_BPS;
    return ok ? { ok: true } : { ok: false, reason: "percent_out_of_range" };
  }
  if (!Number.isInteger(share.amountCents) || share.amountCents < 0) return { ok: false, reason: "fixed_invalid" };
  if (!share.currency?.trim()) return { ok: false, reason: "currency_missing" };
  return { ok: true };
}

/**
 * What the owner takes from a member's line of `priceCents`. Percent rounds to
 * the cent; a fixed take is capped so the member keeps at least 10%. An invalid
 * share, or a non-positive price, takes nothing: fail closed for the member.
 */
export function ownerTakeCents(priceCents: number, share: OwnerShare): number {
  if (!Number.isInteger(priceCents) || priceCents <= 0) return 0;
  if (!validateOwnerShare(share).ok) return 0;
  const cap = Math.floor((priceCents * COLLECTIVE_OWNER_SHARE_CAP_BPS) / 10_000);
  const raw = share.kind === "percent" ? Math.round((priceCents * share.bps) / 10_000) : share.amountCents;
  return Math.min(raw, cap);
}

/** The member's side: always exactly the price minus the owner's take. */
export function memberNetCents(priceCents: number, share: OwnerShare): number {
  if (!Number.isInteger(priceCents) || priceCents <= 0) return 0;
  return priceCents - ownerTakeCents(priceCents, share);
}

export type CollectiveRole = "owner" | "member";

export type CollectiveAccess = {
  jobCard: boolean;
  talentThread: boolean;
  clientThread: boolean;
  clientContact: boolean;
  otherMembersShares: boolean;
};

/** Members: the job card and their talent thread only. The owner coordinates and sees all. */
export function collectiveAccess(role: CollectiveRole): CollectiveAccess {
  return role === "owner"
    ? { jobCard: true, talentThread: true, clientThread: true, clientContact: true, otherMembersShares: true }
    : { jobCard: true, talentThread: true, clientThread: false, clientContact: false, otherMembersShares: false };
}

/** Reviews are collected on the owner's page; the member gets private feedback. */
export function collectiveReviewRouting(): { publicOn: "owner_page"; memberGets: "private_feedback" } {
  return { publicOn: "owner_page", memberGets: "private_feedback" };
}

/** Seats on the plan: Free is 5; an unknown plan is held to the Free cap. */
export function collectiveSeatState(plan: string, activeMembers: number): { cap: number | null; remaining: number | null; canAdd: boolean } {
  const cap = seatCapForPlan(plan);
  if (cap === null) return { cap: null, remaining: null, canAdd: true };
  const remaining = Math.max(0, cap - Math.max(0, activeMembers));
  return { cap, remaining, canAdd: remaining > 0 };
}

/** "Ana · $500.00": the member's price is always shown with her name; no name, no line. */
export function memberPriceLine(input: { name: string; priceCents: number; currency: string }, locale: "en" | "es"): string | null {
  const name = input.name?.trim();
  if (!name || !Number.isInteger(input.priceCents) || input.priceCents < 0) return null;
  let money: string;
  try {
    money = new Intl.NumberFormat(locale === "es" ? "es-MX" : "en-US", { style: "currency", currency: input.currency.toUpperCase() }).format(input.priceCents / 100);
  } catch {
    money = `${(input.priceCents / 100).toFixed(2)} ${input.currency.toUpperCase()}`;
  }
  return `${name} · ${money}`;
}

export type PresetDecision =
  | { ok: true; changed: boolean; set: { work_model: typeof FRIENDS_COLLECTIVE_MODEL; default_coordinator_user_id: string } }
  | { ok: false; reason: "owner_only" | "over_seat_cap" | "model_already_set" };

/**
 * Applying the Friends collective preset to a workspace: only the OWNER can (it
 * puts every request in her inbox), it must fit the plan's seat cap, and it
 * never silently switches a workspace away from another model. Idempotent.
 * Pure: the action reads the facts and writes `set`.
 */
export function decideFriendsCollectivePreset(input: {
  role: string | null;
  ownerUserId: string;
  currentModel: string | null;
  defaultCoordinatorUserId: string | null;
  seatOk: boolean;
}): PresetDecision {
  if (input.role !== "owner") return { ok: false, reason: "owner_only" };
  if (!input.seatOk) return { ok: false, reason: "over_seat_cap" };
  if (input.currentModel && input.currentModel !== FRIENDS_COLLECTIVE_MODEL) return { ok: false, reason: "model_already_set" };
  const set = { work_model: FRIENDS_COLLECTIVE_MODEL, default_coordinator_user_id: input.ownerUserId } as const;
  const changed = input.currentModel !== FRIENDS_COLLECTIVE_MODEL || input.defaultCoordinatorUserId !== input.ownerUserId;
  return { ok: true, changed, set };
}
