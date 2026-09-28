/**
 * Website settings (WSF F1): pure model over the stores that already exist.
 *
 * Nothing here owns a store. The talent-wide defaults are the
 * `talent_profiles.selling_defaults` blob (read/written by
 * `services-settings-actions.ts`); per-service values live on
 * `talent_offerings`.
 *
 * INHERITED vs CUSTOM is shown only where null genuinely means "use my
 * default" today: `deposit_pct` and `cancellation_hours` (EditorScreen reads
 * `item.x ?? defaults.x`). `booking_mode` is NOT NULL DEFAULT 'request', so an
 * inherited mode cannot be told apart from an explicit one; F1 shows and
 * writes each service's mode explicitly (inheritance arrives with a nullable
 * column in a later PR).
 */

import type { SellingDefaults } from "@/lib/talent/services-settings-actions";
import type { TalentBookingPosture } from "@/lib/talent/selling-booking-settings";

export type ServiceMode = "instant" | "request";

export type ServiceFields = {
  bookingMode: ServiceMode;
  /** null = use the talent default */
  depositPct: number | null;
  /** null = use the talent default */
  cancellationHours: number | null;
};

export type SettingsService = {
  id: string;
  title: string;
  /** Instant booking needs one exact price (DB constraint + validateOffering). */
  canBookInstantly: boolean;
  /**
   * Instant + deposit reserve needs its own 1 to 99 deposit (validateOffering),
   * so its deposit cannot fall back to the default here.
   */
  depositRequired: boolean;
};

export type SettingsDraft = {
  defaults: SellingDefaults;
  services: Record<string, ServiceFields>;
};

export type ValueSource = "inherited" | "custom";

/** Null-means-inherit fields only (deposit, cancellation). */
export function valueSource(value: number | null | undefined): ValueSource {
  return value == null ? "inherited" : "custom";
}

/** What a client actually gets for this service on the live sheet. */
export function effectiveServiceMode(mode: ServiceMode, posture: TalentBookingPosture): "instant" | "inquiry" {
  return posture === "on_demand" && mode === "instant" ? "instant" : "inquiry";
}

export function canBookInstantly(o: {
  priceDisplay?: string | null;
  priceType?: string | null;
  amountCents?: number | null;
}): boolean {
  return o.priceDisplay === "exact" && o.priceType !== "custom" && o.amountCents != null && o.amountCents >= 0;
}

/** validateOffering: instant + deposit reserve needs a 1 to 99 service deposit. */
export function needsOwnDeposit(o: { bookingMode: string; reserveMode?: string | null }): boolean {
  return o.bookingMode === "instant" && o.reserveMode === "deposit";
}

export function countCustom(
  services: Record<string, ServiceFields>,
  field: "depositPct" | "cancellationHours",
): number {
  return Object.values(services).filter((f) => valueSource(f[field]) === "custom").length;
}

export const DEFAULT_KEYS = [
  "bookingPosture",
  "whoPrimaryCta",
  "bufferBeforeMin",
  "bufferAfterMin",
  "depositPct",
  "cancelHours",
  "rescheduleHours",
] as const satisfies ReadonlyArray<keyof SellingDefaults>;

const SERVICE_KEYS = ["bookingMode", "depositPct", "cancellationHours"] as const;

/** Changed default keys and changed service ids between saved and draft. */
export function diffDraft(
  saved: SettingsDraft,
  draft: SettingsDraft,
): { defaults: string[]; services: string[] } {
  const defaults = DEFAULT_KEYS.filter((k) => saved.defaults[k] !== draft.defaults[k]);
  const services = Object.keys(draft.services).filter((id) => {
    const a = saved.services[id];
    const b = draft.services[id];
    return !a || SERVICE_KEYS.some((k) => a[k] !== b[k]);
  });
  return { defaults, services };
}

export function changeCount(saved: SettingsDraft, draft: SettingsDraft): number {
  const d = diffDraft(saved, draft);
  // whoPrimaryCta moves with the posture; count the pair as one change.
  const paired = d.defaults.includes("bookingPosture") && d.defaults.includes("whoPrimaryCta") ? 1 : 0;
  return d.defaults.length - paired + d.services.length;
}

/** Posture change, keeping the inquiry-never-confirms rule the sheet parser applies. */
export function withPosture(defaults: SellingDefaults, posture: TalentBookingPosture): SellingDefaults {
  return {
    ...defaults,
    bookingPosture: posture,
    whoPrimaryCta:
      posture === "inquiry" && defaults.whoPrimaryCta === "confirm_now" ? "contact" : defaults.whoPrimaryCta,
  };
}
