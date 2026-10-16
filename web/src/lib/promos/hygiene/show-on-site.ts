/**
 * Single rule for tenant_promo_codes.show_on_site.
 *
 * The flag means "this promo may be advertised on the hub, site, badges and
 * share surfaces". Only a public, auto-applying promo that is not a draft,
 * paused, archived or already expired qualifies. Readers still check
 * promoStatus(), this keeps the stored flag truthful.
 */
export type ShowOnSiteInput = {
  unlock: string | null;
  audience: string | null;
  is_draft?: boolean | null;
  is_paused?: boolean | null;
  archived_at?: string | null;
  ends_at?: string | null;
};

export function showOnSiteFor(promo: ShowOnSiteInput, now: Date = new Date()): boolean {
  if (promo.unlock !== "auto" || promo.audience !== "public") return false;
  if (promo.is_draft || promo.is_paused || promo.archived_at) return false;
  if (promo.ends_at) {
    const end = Date.parse(promo.ends_at);
    if (Number.isFinite(end) && end < now.getTime()) return false;
  }
  return true;
}

import type { EndPatch } from "../safe-edit";

type Row = ShowOnSiteInput;

/** Patch for an "end now" action: carries show_on_site=false in the same update. */
export function endPromoUpdate(patch: EndPatch): { archived_at: string; show_on_site: false } | { ends_at: string; show_on_site: false } {
  return patch.kind === "archive"
    ? { archived_at: patch.archived_at, show_on_site: false }
    : { ends_at: patch.ends_at, show_on_site: false };
}

/** Pause hides; resume recomputes from the rule. */
export function pausePatch(paused: boolean, row: Row, now: Date = new Date()): { is_paused: boolean; show_on_site: boolean } {
  return { is_paused: paused, show_on_site: showOnSiteFor({ ...row, is_paused: paused }, now) };
}

export function goLivePatch(row: Row, isTrial: boolean, now: Date = new Date()) {
  return {
    is_draft: false,
    is_paused: false,
    is_trial: isTrial,
    show_on_site: showOnSiteFor({ ...row, is_draft: false, is_paused: false }, now),
  };
}
