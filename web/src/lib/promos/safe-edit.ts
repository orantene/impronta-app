/**
 * Editing a live promo safely (design B4), ending it, and the downgrade rules
 * (L7). Pure.
 *
 * B4: always safe = name, a later end, more uses, more services. Restricting
 * changes are allowed and existing bookings keep the terms they booked with
 * (redemption rows snapshot the amount). After the first use the offer type,
 * code text and audience cannot change: duplicate and end instead.
 */

import { addDays, instantToLocalDate, localToInstant, todayLocal, type PromoDraft } from "./templates";
import type { Promo } from "./types";

export type LockedField = "offer_kind" | "code" | "audience";

export type Restriction =
  | "lower_value"
  | "earlier_end"
  | "fewer_uses"
  | "fewer_services";

export type EditVerdict = {
  /** False when a locked field changed (the server reverts those and asks for duplicate & end). */
  ok: boolean;
  locked: LockedField[];
  restricting: Restriction[];
  /** True when people already booked and a restricting change applies: they keep their terms. */
  keepsTerms: boolean;
  suggestDuplicate: boolean;
};

/** Higher is more generous to the client. */
function generosity(d: Pick<PromoDraft, "offer_kind" | "value">): number {
  return d.offer_kind === "fixed_price" ? -d.value : d.value;
}

export function classifyEdit(current: PromoDraft, next: PromoDraft, used: number): EditVerdict {
  const locked: LockedField[] = [];
  if (used > 0) {
    if (next.offer_kind !== current.offer_kind) locked.push("offer_kind");
    if ((next.code ?? "").toUpperCase() !== (current.code ?? "").toUpperCase()) locked.push("code");
    if (next.audience !== current.audience) locked.push("audience");
  }
  const restricting: Restriction[] = [];
  if (next.offer_kind === current.offer_kind && generosity(next) < generosity(current)) restricting.push("lower_value");
  if (current.ends_at === null ? next.ends_at !== null : next.ends_at !== null && next.ends_at < current.ends_at) {
    restricting.push("earlier_end");
  }
  const curMax = current.max_uses;
  if (next.max_uses !== null && (curMax === null || next.max_uses < curMax)) restricting.push("fewer_uses");
  const removed = current.target_ids.some((id) => !next.target_ids.includes(id));
  if ((current.target_ids.length === 0 && next.target_ids.length > 0) || (current.target_ids.length > 0 && next.target_ids.length > 0 && removed)) {
    restricting.push("fewer_services");
  }
  return {
    ok: locked.length === 0,
    locked,
    restricting,
    keepsTerms: used > 0 && restricting.length > 0,
    suggestDuplicate: locked.length > 0,
  };
}

/** The draft to persist: locked fields are reverted to the stored values, so a forged payload cannot change them. */
export function applyEdit(current: PromoDraft, next: PromoDraft, used: number): { draft: PromoDraft; verdict: EditVerdict } {
  const verdict = classifyEdit(current, next, used);
  const draft: PromoDraft = { ...next, id: current.id, template: current.template };
  if (verdict.locked.includes("offer_kind")) {
    draft.offer_kind = current.offer_kind;
    draft.value = current.value;
    draft.addon_id = current.addon_id;
  }
  if (verdict.locked.includes("code")) draft.code = current.code;
  if (verdict.locked.includes("audience")) {
    draft.audience = current.audience;
    draft.customer_id = current.customer_id;
  }
  return { draft, verdict };
}

// ── end now ────────────────────────────────────────────────────────────

export type EndPatch =
  | { kind: "expire"; ends_at: string }
  | { kind: "archive"; archived_at: string };

/**
 * End a promo immediately. A promo that has not started (or would end before it
 * starts) is archived; otherwise its end moves to one second ago, which the
 * status engine reads as expired.
 */
export function endNowPatch(promo: Pick<Promo, "starts_at" | "tz">, now: Date): EndPatch {
  const endMs = now.getTime() - 1000;
  const startMs = promo.starts_at ? Date.parse(localInstantOf(promo.starts_at, promo.tz)) : null;
  if (startMs !== null && startMs >= endMs) return { kind: "archive", archived_at: now.toISOString() };
  return { kind: "expire", ends_at: new Date(endMs).toISOString() };
}

function localInstantOf(value: string, tz: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? localToInstant(`${value}T00:00:00`, tz) : value;
}

// ── downgrade (L7) ─────────────────────────────────────────────────────

export const DOWNGRADE_DATED_CAP_DAYS = 30;
export const DOWNGRADE_OPEN_ENDED_DAYS = 14;

export type DowngradeOutcome =
  | { action: "none" }
  | { action: "keep" }
  | { action: "to_draft" }
  | { action: "end_on"; endDate: string };

type DowngradePromo = Pick<Promo, "ends_at" | "tz" | "audience" | "is_single_use" | "is_trial" | "is_draft" | "archived_at">;

/**
 * What happens to one promo when the talent drops to the free plan.
 * `status` is promoStatus(); bookings already made are always honoured (the
 * price is snapshotted), which this never touches.
 */
export function downgradeOutcome(
  promo: DowngradePromo,
  status: "draft" | "archived" | "paused" | "scheduled" | "live" | "sold_out" | "expired",
  downgradedAt: string | Date,
): DowngradeOutcome {
  if (status === "draft" || status === "archived" || status === "expired") return { action: "none" };
  // The lifetime trial promo was never a paid feature.
  if (promo.is_trial) return { action: "keep" };
  // A personal offer already sent is a promise to one client: valid until its own expiry.
  if (promo.audience === "one_client" || promo.is_single_use) return { action: "keep" };
  if (status === "scheduled") return { action: "to_draft" };
  const day = todayLocal(downgradedAt, promo.tz);
  const capped = addDays(day, DOWNGRADE_DATED_CAP_DAYS);
  if (!promo.ends_at) return { action: "end_on", endDate: addDays(day, DOWNGRADE_OPEN_ENDED_DAYS) };
  const own = instantToLocalDate(promo.ends_at, promo.tz) ?? capped;
  return { action: "end_on", endDate: own < capped ? own : capped };
}

/** For the downgrade screen: "Tus 2 promos activas terminan el 28 oct". */
export function downgradeSummary(
  items: readonly { promo: DowngradePromo; status: Parameters<typeof downgradeOutcome>[1] }[],
  downgradedAt: string | Date,
): { endingCount: number; firstEnd: string | null; toDraftCount: number } {
  let endingCount = 0;
  let toDraftCount = 0;
  let firstEnd: string | null = null;
  for (const it of items) {
    const o = downgradeOutcome(it.promo, it.status, downgradedAt);
    if (o.action === "end_on") {
      endingCount += 1;
      if (firstEnd === null || o.endDate < firstEnd) firstEnd = o.endDate;
    } else if (o.action === "to_draft") toDraftCount += 1;
  }
  return { endingCount, firstEnd, toDraftCount };
}
