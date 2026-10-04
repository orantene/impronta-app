/**
 * Website settings (WSF F1): pure model over the stores that already exist.
 *
 * Nothing here owns a store. The talent-wide defaults are the
 * `talent_profiles.selling_defaults` blob (read/written by
 * `services-settings-actions.ts`); per-service values live on
 * `talent_offerings`.
 *
 * INHERITED vs CUSTOM is shown only where null genuinely means "use my
 * default": `deposit_pct`, `cancellation_hours` (EditorScreen reads
 * `item.x ?? defaults.x`) and, since WSF-B, `booking_mode` (NULL = inherit the
 * talent default; Reset writes NULL).
 */

import type { SellingDefaults } from "@/lib/talent/services-settings-actions";
import type { TalentBookingPosture } from "@/lib/talent/selling-booking-settings";

export type ServiceMode = "instant" | "request" | "inquiry";

export type ServiceFields = {
  /** null = inherit the talent default booking mode */
  bookingMode: ServiceMode | null;
  /** null = use the talent default */
  depositPct: number | null;
  /** null = use the talent default */
  cancellationHours: number | null;
};

export type SettingsService = {
  /** WSF-C §1 row 4: why instant cannot work yet (first gap), or null. */
  instantGap?: string | null;
  id: string;
  title: string;
  /** Instant booking needs one exact price (DB constraint + validateOffering). */
  canBookInstantly: boolean;
  /**
   * Instant + deposit reserve needs its own 1 to 99 deposit (validateOffering),
   * so its deposit cannot fall back to the default here.
   */
  depositRequired: boolean;
  /** priceDisplay "quote": shown as "Request a quote"; settings never changes it. */
  quote?: boolean;
};

export type SettingsDraft = {
  defaults: SellingDefaults;
  services: Record<string, ServiceFields>;
};

export type ValueSource = "inherited" | "custom";

/** Null-means-inherit fields only (deposit, cancellation). */
export function valueSource(value: unknown): ValueSource {
  return value == null ? "inherited" : "custom";
}

/**
 * What a client gets for this service (report §1): the service's own mode when
 * set, else the talent default. Master switches and readiness are applied by
 * resolveEffectiveBookingMode on the server; this is the settings display.
 */
export function effectiveServiceMode(mode: ServiceMode | null, posture: TalentBookingPosture): ServiceMode {
  return mode ?? posture;
}

export function canBookInstantly(o: {
  priceDisplay?: string | null;
  priceType?: string | null;
  amountCents?: number | null;
}): boolean {
  return o.priceDisplay === "exact" && o.priceType !== "custom" && o.amountCents != null && o.amountCents >= 0;
}

/** validateOffering: instant + deposit reserve needs a 1 to 99 service deposit. */
export function needsOwnDeposit(o: { bookingMode: string | null; reserveMode?: string | null }): boolean {
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
  const defaults: string[] = DEFAULT_KEYS.filter((k) => saved.defaults[k] !== draft.defaults[k]);
  if ((saved.defaults.inPersonMethods ?? []).join(",") !== (draft.defaults.inPersonMethods ?? []).join(",")) {
    defaults.push("inPersonMethods");
  }
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

/** WSF-C: changed talent_sites switches (chat greeting not edited here). */
export function switchChangeCount(
  saved: { acceptingBookings: boolean; acceptingInquiries: boolean; chatEnabled: boolean },
  draft: { acceptingBookings: boolean; acceptingInquiries: boolean; chatEnabled: boolean },
): number {
  return (["acceptingBookings", "acceptingInquiries", "chatEnabled"] as const).filter((k) => saved[k] !== draft[k]).length;
}

/**
 * WSF-C partial-save honesty: what is still unsaved, named by group or
 * service, so a failed save can say "Some changes saved" and list the rest.
 * Retry resends exactly these (the saved snapshot already holds the rest).
 */
export function pendingChangeLabels(input: {
  saved: SettingsDraft;
  draft: SettingsDraft;
  savedSwitches: { acceptingBookings: boolean; acceptingInquiries: boolean; chatEnabled: boolean };
  draftSwitches: { acceptingBookings: boolean; acceptingInquiries: boolean; chatEnabled: boolean };
  serviceTitle: (id: string) => string;
  labels: { defaults: string; bookings: string; chat: string };
}): string[] {
  const d = diffDraft(input.saved, input.draft);
  const out: string[] = [];
  if (d.defaults.length > 0) out.push(input.labels.defaults);
  for (const id of d.services) out.push(input.serviceTitle(id));
  const s = input.savedSwitches;
  const n = input.draftSwitches;
  if (s.acceptingBookings !== n.acceptingBookings) out.push(input.labels.bookings);
  if (s.acceptingInquiries !== n.acceptingInquiries || s.chatEnabled !== n.chatEnabled) out.push(input.labels.chat);
  return out;
}

/**
 * WSF B2 impact preview for a default-mode change: services that follow the
 * default (bookingMode null) move; services with their own setting stay.
 */
export function defaultModeImpact(services: Record<string, ServiceFields>): { follows: number; own: number } {
  const all = Object.values(services);
  const own = all.filter((f) => f.bookingMode != null).length;
  return { follows: all.length - own, own };
}
