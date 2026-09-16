/**
 * Arrival — one headline, one fact, one button, built only from what was
 * really made. The compose stamp (`agencies.settings.site_compose`) is the
 * only source for the business facts; nothing is recomputed, nothing claimed
 * beyond the stamp. Pure.
 */

import type { OnboardingPath } from "./module-state";

/** The stamp fields arrival reads (a subset of `SiteComposeStamp`). */
export type ArrivalStamp = {
  outcome: "composed" | "fallback_used" | "missing_logo" | "failed";
  copySource?: "model" | "defaults";
  placed?: {
    photos?: { hero?: "owner" | "type" | "family" | "universal" | null };
    menuItems?: number;
    hoursPresent?: boolean;
    whatsappPresent?: boolean;
    logoPresent?: boolean;
  };
} | null;

export type ArrivalVariant = "talent" | "business" | "both" | "fallback" | "existing_workspace";

export type ArrivalPayload = {
  variant: ArrivalVariant;
  /** For the fallback variant: what fell short, so the copy tells the truth. */
  fallbackReason?: "copy" | "photos" | "failed" | "none";
  headlineName: string | null;
  businessName: string | null;
  link: { display: string; href: string } | null;
  fact: { services: number; city: string | null; logo: boolean; hours: boolean; whatsapp: boolean; menuItems: number; photos: boolean };
  primary: { label: "finish_my_page" | "open_my_website" | "open_my_workspace"; href: string };
  quiet: "signed_in_as" | "own_page_drafted" | null;
};

export function parseArrivalStamp(raw: unknown): ArrivalStamp {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const outcome = r.outcome;
  if (outcome !== "composed" && outcome !== "fallback_used" && outcome !== "missing_logo" && outcome !== "failed") return null;
  const placed = (r.placed && typeof r.placed === "object" ? r.placed : {}) as ArrivalStamp extends infer S ? (S extends { placed?: infer P } ? P : never) : never;
  const copySource = r.copySource === "model" || r.copySource === "defaults" ? r.copySource : undefined;
  return { outcome, copySource, placed };
}

export function arrivalFromStamp(input: {
  path: OnboardingPath;
  stamp: ArrivalStamp;
  reusedExisting?: boolean;
  person: { name: string | null; city: string | null };
  businessName: string | null;
  services: number;
  /** Public site URL (no params) and the builder deep link, when a tenant exists. */
  site: { publicUrl: string; editorUrl: string; adminPath: string } | null;
  /** Talent page URL and the Today deep link, when a profile exists. */
  talent: { publicUrl: string | null; todayUrl: string } | null;
}): ArrivalPayload {
  const placed = input.stamp?.placed ?? {};
  const fact = {
    services: input.services,
    city: input.person.city,
    logo: placed.logoPresent === true,
    hours: placed.hoursPresent === true,
    whatsapp: placed.whatsappPresent === true,
    menuItems: typeof placed.menuItems === "number" ? placed.menuItems : 0,
    // Only a type-level (or better) hero counts as "photos"; family and
    // universal are the shared fallback and must not be claimed.
    photos: placed.photos?.hero === "type" || placed.photos?.hero === "owner",
  };

  if (input.path === "talent") {
    return {
      variant: "talent",
      headlineName: input.person.name,
      businessName: null,
      link: input.talent?.publicUrl ? { display: input.talent.publicUrl.replace(/^https?:\/\//, ""), href: input.talent.publicUrl } : null,
      fact,
      primary: { label: "finish_my_page", href: input.talent?.todayUrl ?? "/talent/today" },
      quiet: "signed_in_as",
    };
  }

  if (!input.site) {
    return {
      variant: "fallback",
      headlineName: input.person.name,
      businessName: input.businessName,
      link: null,
      fact,
      primary: { label: "open_my_workspace", href: "/" },
      quiet: "signed_in_as",
    };
  }

  if (input.reusedExisting) {
    return {
      variant: "existing_workspace",
      headlineName: input.person.name,
      businessName: input.businessName,
      link: { display: input.site.publicUrl.replace(/^https?:\/\//, ""), href: input.site.publicUrl },
      fact,
      primary: { label: "open_my_workspace", href: input.site.adminPath },
      quiet: "signed_in_as",
    };
  }

  const degraded = !input.stamp || input.stamp.outcome === "fallback_used" || input.stamp.outcome === "failed";
  const fallbackReason = !degraded
    ? undefined
    : !input.stamp || input.stamp.outcome === "failed"
      ? "failed"
      : input.stamp.copySource === "defaults"
        ? "copy"
        : !fact.photos
          ? "photos"
          : "none";
  return {
    variant: degraded ? "fallback" : input.path === "both" ? "both" : "business",
    fallbackReason,
    headlineName: input.person.name,
    businessName: input.businessName,
    link: { display: input.site.publicUrl.replace(/^https?:\/\//, ""), href: input.site.publicUrl },
    fact,
    primary: { label: "open_my_website", href: input.site.editorUrl },
    quiet: input.path === "both" ? "own_page_drafted" : "signed_in_as",
  };
}
