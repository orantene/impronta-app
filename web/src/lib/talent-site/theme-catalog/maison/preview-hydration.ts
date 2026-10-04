/**
 * Maison preview hydration (W13) — Demo | My content at preview time only.
 * Never stored on the site. Demo CTAs stay inert (W15 / CatalogBookingSheet).
 */
import type { DemoPayload } from "../types";
import { MAISON_BUILTIN_DEMO } from "./builtins";
import type { TalentFaqItemRow } from "./faq-bind";

export type MaisonPreviewContentMode = "demo" | "mine";

export type MaisonPreviewHydration = {
  mode: MaisonPreviewContentMode;
  /** True when using the talent's real data (My content). */
  isReal: boolean;
  /** Site content pack for token hydration (demo pack or omitted for mine). */
  siteContent: Record<string, unknown> | null;
  /** FAQ rows for bound accordion — demo prompts (empty answers) or caller-supplied. */
  faqItems: TalentFaqItemRow[];
  /** Catalog booking must stay demo when previewing the Demo pack. */
  catalogBookingLive: false | boolean;
};

/**
 * Resolve preview-time hydration for Maison Theme detail / gallery preview.
 * `mineFaq` / real offerings are supplied by the caller (server); this module
 * only chooses which pack wins.
 */
export function resolveMaisonPreviewHydration(opts: {
  mode: MaisonPreviewContentMode;
  demo?: DemoPayload;
  mineFaq?: readonly TalentFaqItemRow[];
}): MaisonPreviewHydration {
  const demo = opts.demo ?? MAISON_BUILTIN_DEMO.buildPayload();
  if (opts.mode === "demo") {
    const prompts = demo.starter_content.faq_prompts ?? [];
    const faqItems: TalentFaqItemRow[] = prompts.map((question, i) => ({
      id: `demo-faq-${i}`,
      question,
      answer: "",
      sort_order: i,
    }));
    return {
      mode: "demo",
      isReal: false,
      siteContent: (demo.hydration?.site_content as Record<string, unknown>) ?? null,
      faqItems,
      catalogBookingLive: false,
    };
  }
  return {
    mode: "mine",
    isReal: true,
    siteContent: null,
    faqItems: opts.mineFaq ? [...opts.mineFaq] : [],
    // My content preview on a draft / gallery iframe still must not write bookings.
    catalogBookingLive: false,
  };
}
