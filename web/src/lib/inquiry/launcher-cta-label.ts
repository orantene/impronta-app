/**
 * launcher-cta-label.ts — maps the pure `resolveInquiryCta` state to the
 * lifecycle-aware launcher PILL label (Phase 3 / locked owner decision 1).
 *
 * The resolver (inquiry-context-resolver.ts) owns the STATE; this module owns
 * the surface-specific COPY for the floating chat launcher only. It carries no
 * React and fetches nothing — it takes a resolved `InquiryCtaState`, a
 * translator, and the agency name, and returns the single pill string.
 *
 * Locked label map (decision 1):
 *   empty lineup, no active inquiry          -> "Message {agency}"
 *   draft / lineup non-empty                 -> "Your lineup · {n}"
 *   stale resumable draft (prior session)    -> "Finish your inquiry ({n})"
 *   sent / seen two-way (sent_awaiting|live) -> "Inquiry sent"
 *   replied (UNSEEN agency reply, W2-B)      -> "{agency} replied" (+ pulse)
 *   terminal (declined/expired/booked/...)   -> closed-state copy (NO forward CTA)
 *
 * Phase 8 (returning-visitor nudges): the resume_draft kind now renders a
 * distinct "Finish your inquiry (N)" label so a STALE draft a returning visitor
 * left behind reads differently from the fresh "Your lineup (N)" working set.
 * The resolver already owns WHEN this kind fires (stale lastActivityAt); this
 * module only owns the resumed-draft COPY.
 *
 * House rules: never "buyer"/"cart" — "lineup" only. No em dashes.
 */

import { interpolate } from "@/i18n/interpolate";

import type { InquiryCtaState } from "./inquiry-context-resolver";

/** Base translator shape (createTranslator's `t(key)` — no vars). */
export type LauncherCtaTranslator = (key: string) => string;

/**
 * Resolve the launcher pill label for a CTA state.
 *
 * `agencyName` is the brand voice ("Message {agency}", "{agency} replied"). For
 * a talent-focused launcher the caller passes the talent first name as the
 * brand voice instead, so the empty-state still reads "Message {name}".
 */
export function launcherLabelForCta(
  state: InquiryCtaState,
  t: LauncherCtaTranslator,
  agencyName: string,
  /**
   * Phase 8 — the live lineup count, used ONLY by the resume_draft label so the
   * returning-visitor nudge can read "Finish your inquiry (N)". The resume_draft
   * state itself carries no count (it discriminates on draftInquiryId), so the
   * caller forwards the cart count. Defaults to 0 -> the count is dropped from
   * the copy when unknown.
   */
  lineupCount = 0,
): string {
  switch (state.kind) {
    case "replied":
      // W2-B — the ONLY state that reads "{agency} replied". Fires solely when an
      // UNSEEN agency reply is waiting; opening the thread clears the signal and
      // the state collapses back to live_conversation / sent_awaiting below.
      return interpolate(t("public.guestChat.ctaReplied"), { agency: agencyName });
    case "live_conversation":
    case "sent_awaiting":
      // A SENT inquiry with no unseen reply reads honestly as "Inquiry sent" —
      // whether it is still a one-way airlock (sent_awaiting) or a SEEN two-way
      // thread (live_conversation). "{agency} replied" is reserved for `replied`
      // so the pill never keeps claiming a reply the visitor has already read.
      return t("public.guestChat.ctaSent");
    case "terminal":
      // A closed inquiry must never present a forward-motion label. Render the
      // neutral closed-state copy (the resolver already guards forward kinds).
      return interpolate(t("public.guestChat.ctaClosed"), { agency: agencyName });
    case "in_lineup":
    case "add_to_lineup":
    case "review_lineup":
      // Any non-empty lineup (focused-talent in/out + the cart-review surface)
      // reads as "Your lineup (N)" once at least one talent is shortlisted.
      return state.lineupCount > 0
        ? interpolate(t("public.guestChat.ctaLineup"), { count: state.lineupCount })
        : interpolate(t("public.guestChat.ctaMessage"), { agency: agencyName });
    case "resume_draft":
      // Phase 8 returning-visitor nudge: a STALE draft resumed cross-session.
      // Distinct from the fresh "Your lineup (N)" so it reads as "pick up where
      // you left off", not a brand-new working set. With a known count we surface
      // it ("Finish your inquiry (N)"); without one we fall back to the
      // count-less resume copy rather than print "(0)".
      return lineupCount > 0
        ? interpolate(t("public.guestChat.ctaResumeDraft"), { count: lineupCount })
        : t("public.guestChat.ctaResumeDraftNoCount");
    case "pick_inquiry":
    case "add_first":
    default:
      return interpolate(t("public.guestChat.ctaMessage"), { agency: agencyName });
  }
}
