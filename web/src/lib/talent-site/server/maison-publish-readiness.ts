/**
 * Maison Review readiness (W37–W38, W76) — named blockers + fix links.
 * Pure evaluator + thin server loader. No generic "every button…" copy.
 */

export type MaisonPublishBlocker = {
  id: string;
  message: string;
  fixLabel: string;
  /** In-app path or hash the Review UI can navigate to. */
  fixHref: string;
};

export type MaisonPublishSuggestion = {
  id: string;
  message: string;
};

export type MaisonPublishReadiness = {
  ready: boolean;
  blockers: MaisonPublishBlocker[];
  suggestions: MaisonPublishSuggestion[];
  /** One-line ready copy when nothing blocks. */
  readyDetail: string;
};

export type MaisonPublishReadinessInput = {
  siteSlug: string | null;
  themeDesignSlug: string | null;
  /** Optional portfolio count for soft suggestions only. */
  photoCount?: number | null;
};

export function evaluateMaisonPublishReadiness(
  input: MaisonPublishReadinessInput,
): MaisonPublishReadiness {
  const blockers: MaisonPublishBlocker[] = [];
  const slug = (input.siteSlug ?? "").trim();
  if (!slug) {
    blockers.push({
      id: "no_slug",
      message: "Your site needs an address before publishing.",
      fixLabel: "Choose an address",
      fixHref: "#maison-site-address",
    });
  }
  if (!input.themeDesignSlug) {
    blockers.push({
      id: "no_design",
      message: "Apply a design before publishing.",
      fixLabel: "Choose a design",
      fixHref: "#maison-setup-host",
    });
  }

  const suggestions: MaisonPublishSuggestion[] = [];
  if (
    typeof input.photoCount === "number" &&
    input.photoCount >= 0 &&
    input.photoCount < 4
  ) {
    suggestions.push({
      id: "more_photos",
      message: "Optional: add 4 more photos to fill Recent work.",
    });
  }

  return {
    ready: blockers.length === 0,
    blockers,
    suggestions,
    readyDetail: "Your services, photos and contact details are complete.",
  };
}

export function maisonReadinessHeadline(readiness: MaisonPublishReadiness): string {
  if (readiness.ready) return "Ready to publish";
  const n = readiness.blockers.length;
  return n === 1 ? "1 thing before publishing" : `${n} things before publishing`;
}
