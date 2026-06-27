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
 *   draft / lineup non-empty                 -> "Your lineup ({n})"
 *   sent (submitted / coordination)          -> "Inquiry sent"
 *   replied (coordinator spoke last)         -> "{agency} replied"
 *   terminal (declined/expired/booked/...)   -> closed-state copy (NO forward CTA)
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
): string {
  switch (state.kind) {
    case "live_conversation":
      // Coordinator (or the viewer) has spoken — the thread is two-way.
      return interpolate(t("public.guestChat.ctaReplied"), { agency: agencyName });
    case "sent_awaiting":
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
    case "pick_inquiry":
    case "resume_draft":
    case "add_first":
    default:
      return interpolate(t("public.guestChat.ctaMessage"), { agency: agencyName });
  }
}
