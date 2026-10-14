import { promoStatus } from "@/lib/promos/quote";
import type { Promo, PromoStatus, PromoUsage } from "@/lib/promos/types";

/**
 * What a promo link shows (L8). Pure. Every state is HTTP 200: stories and QR
 * prints live forever, and a dead promo still tries to convert.
 */
export type LandingState =
  | "live"
  | "scheduled"
  | "ended"
  | "sold_out"
  /** Paused behaves like ended for the visitor: nothing to claim right now. */
  | "paused"
  /** Deleted, draft, or archived over 180 days: show the talent's home. */
  | "gone"
  /** Personal promo opened without a valid token: generic card, no details. */
  | "personal_locked";

export type LandingInput = {
  promo: Promo | null;
  usage?: Pick<PromoUsage, "used"> | null;
  now: string | Date;
  tokenOk: boolean;
};

export type Landing = {
  state: LandingState;
  status: PromoStatus | null;
  /** True only when visiting should pin the promo to the visitor (cookie). */
  applyCookie: boolean;
  /** Code and personal pages also send X-Robots-Tag. Every promo page is noindex regardless. */
  robotsHeader: boolean;
  isPersonal: boolean;
};

const ARCHIVE_GONE_DAYS = 180;

export function isPersonalPromo(p: Promo): boolean {
  return p.audience === "one_client" || !!p.customer_id;
}

export function classifyLanding(input: LandingInput): Landing {
  const { promo, now } = input;
  if (!promo || promo.is_draft) {
    return { state: "gone", status: null, applyCookie: false, robotsHeader: false, isPersonal: false };
  }
  const personal = isPersonalPromo(promo);
  const robotsHeader = personal || promo.unlock === "code";
  if (personal && !input.tokenOk) {
    return { state: "personal_locked", status: null, applyCookie: false, robotsHeader: true, isPersonal: true };
  }
  const nowMs = new Date(now).getTime();
  if (promo.archived_at) {
    const days = (nowMs - new Date(promo.archived_at).getTime()) / 86_400_000;
    if (days > ARCHIVE_GONE_DAYS) {
      return { state: "gone", status: "archived", applyCookie: false, robotsHeader, isPersonal: personal };
    }
  }
  const status = promoStatus(promo, now, input.usage ?? null);
  const state: LandingState =
    status === "live" ? "live"
      : status === "scheduled" ? "scheduled"
      : status === "sold_out" ? "sold_out"
      : status === "paused" ? "paused"
      : "ended"; // expired, archived within 180 days
  return { state, status, applyCookie: state === "live", robotsHeader, isPersonal: personal };
}

/** One service targeted -> land on it; otherwise the site home. */
export type LandingTarget = { kind: "service"; serviceId: string } | { kind: "home" };

export function landingTarget(p: Promo): LandingTarget {
  const ids = p.target_ids ?? [];
  if (p.scope === "services" && ids.length === 1) return { kind: "service", serviceId: ids[0]! };
  return { kind: "home" };
}
