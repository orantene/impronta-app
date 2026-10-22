/**
 * TUL-964: a signed-in client on a talent's page submits through the
 * directory InquiryDrawer, which always says source "agency_site". That is
 * not a hub-sourced channel, so the engine resolved the talent's owning party
 * as an agency and seated the agency coordinator instead of the talent. A
 * guest on the same page goes through startGuestChatInquiry with source
 * "public_talent_profile" and reaches the talent.
 *
 * This puts the signed-in submit on the guest's routing when, and only when,
 * it came from a /t/<code> page about exactly that one talent. Directory,
 * agency home and multi-talent lineups keep agency routing.
 */
import type { InquiryIntent } from "./inquiry-intent";

// An optional locale segment (`/es/t/<code>`, `/en/t/<code>`) is part of the same page.
const TALENT_PAGE = /^(?:\/(?:es|en))?\/t\/([^/?#]+)\/?(?:[?#].*)?$/;

/**
 * `pageHint` is the path of the page that posted the server action (from the
 * Referer header). The drawer's own `source_context.referrer_page` is not always
 * the profile path (the directory sheet falls back to "/directory", and a locale
 * prefix used to defeat the match), so the hint is a second chance, never an override
 * of a referrer that already names a talent page.
 */
export function normalizeTalentPageIntent(intent: InquiryIntent, pageHint?: string | null): InquiryIntent {
  if (intent.source !== "agency_site") return intent;
  const sc = (intent.source_context ?? {}) as Record<string, unknown>;
  const referrer = typeof sc.referrer_page === "string" ? sc.referrer_page : "";
  const match = TALENT_PAGE.exec(referrer) ?? (pageHint ? TALENT_PAGE.exec(pageHint) : null);
  const ids = intent.talent?.selected_ids ?? [];
  if (!match || ids.length !== 1) return intent;
  return {
    ...intent,
    source: "public_talent_profile",
    talent: { ...intent.talent, selected_ids: ids, selection_mode: "i_know_who" },
    source_context: { ...sc, public_profile_code: sc.public_profile_code ?? decodeURIComponent(match[1]!) },
  };
}
