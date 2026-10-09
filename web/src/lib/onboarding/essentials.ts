/**
 * TUL-84 · Onboarding 1C: the "essentials" a person confirms after choosing how
 * they work (services, weekly hours, place, first provider), held in
 * `module_state.essentials`, then written for real during the build.
 *
 * Pure: types, defensive parsing, per-trade default packs, currency/timezone
 * from country, and the idempotent write planning. The writers that touch the
 * database live in `essentials.server.ts` behind the `EssentialsStore` seam so
 * the per-choice record set and retry idempotency are unit-tested.
 *
 * The screens (feat/onboarding-1b-screens) read and write `Essentials` only
 * through `parseEssentials`, `suggestedEssentials` and `essentialsReady`.
 */

import type { OnboardingChoice } from "./choice";
import { offeringOwnerFor } from "./offering-owner";
import { isSoleOwnerProvider } from "./owner-hours";

export type DayKey = "0" | "1" | "2" | "3" | "4" | "5" | "6";
export type HourRange = { startMin: number; endMin: number };
/** Sunday = "0" … Saturday = "6" (same shape as `talent_booking_hours.weekly`). */
export type WeeklyEssentialHours = Record<DayKey, HourRange[]>;

export type EssentialService = {
  name: string;
  /** Minutes; null when the person did not say. */
  durationMin: number | null;
  /** Price in minor units; ignored when `quote` is true. */
  priceCents: number | null;
  /** "Price on quote": no number shown, request-to-book. */
  quote: boolean;
  currency: string;
  /** Pack key the suggestion came from (lashes, nails, ...), when any. */
  packKey?: string | null;
};

export type PlaceMode = "studio" | "home" | "client";
export type EssentialPlace = {
  mode: PlaceMode;
  /** Area shown publicly (neighbourhood / city). The exact home address is never stored here. */
  area: string | null;
};

export type Essentials = {
  /** What clients call you / your business. Never derived from the email. */
  name: string | null;
  services: EssentialService[];
  /** null = nothing chosen; the build then applies the Mon-Sat 9-19 default. */
  hours: WeeklyEssentialHours | null;
  /** IANA zone; null falls back to the country default, then the saved city. */
  timezone: string | null;
  place: EssentialPlace | null;
  /** Studio only: the first provider to invite (optional, "Add later"). */
  firstProviderEmail: string | null;
  firstProviderName: string | null;
  /** The person tapped confirm on the essentials screen (or filled it by hand). */
  confirmed: boolean;
  /** Where the lines came from: typed by hand, read by the AI, or a trade pack. */
  source: "manual" | "ai" | "pack";
};

export const MAX_ESSENTIAL_SERVICES = 12;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emptyWeek(): WeeklyEssentialHours {
  return { "0": [], "1": [], "2": [], "3": [], "4": [], "5": [], "6": [] };
}

/** Mon-Sat 09:00-19:00 (the suggestion the notion ticket asks for). Sunday closed. */
export function defaultWeeklyHours(): WeeklyEssentialHours {
  const w = emptyWeek();
  for (const d of ["1", "2", "3", "4", "5", "6"] as const) w[d] = [{ startMin: 9 * 60, endMin: 19 * 60 }];
  return w;
}

export function hoursHaveAnyOpenDay(w: WeeklyEssentialHours | null): boolean {
  return !!w && (Object.values(w) as HourRange[][]).some((r) => r.length > 0);
}

// ── country → currency / timezone ──────────────────────────────────────────

const MX_NAMES = new Set(["mx", "mex", "mexico", "méxico", "méjico", "mejico"]);

export function isMexico(country: string | null | undefined): boolean {
  return !!country && MX_NAMES.has(country.trim().toLowerCase());
}

/** Mexico -> MXN; everything else USD until a screen asks. */
export function currencyForCountry(country: string | null | undefined): string {
  return isMexico(country) ? "MXN" : "USD";
}

export function defaultTimezoneForCountry(country: string | null | undefined): string | null {
  return isMexico(country) ? "America/Mexico_City" : null;
}

// ── per-trade default packs (beauty first) ─────────────────────────────────

export type PackService = { en: string; es: string; durationMin: number; mxnCents: number };
export type TradePack = { key: string; services: PackService[] };

export const BEAUTY_PACKS: Record<string, TradePack> = {
  lashes: { key: "lashes", services: [
    { en: "Classic lash set", es: "Pestañas clásicas", durationMin: 120, mxnCents: 90000 },
    { en: "Volume lash set", es: "Pestañas volumen", durationMin: 150, mxnCents: 120000 },
    { en: "Lash lift", es: "Lifting de pestañas", durationMin: 60, mxnCents: 70000 },
    { en: "Lash refill", es: "Retoque de pestañas", durationMin: 75, mxnCents: 60000 },
  ] },
  nails: { key: "nails", services: [
    { en: "Manicure", es: "Manicura", durationMin: 45, mxnCents: 25000 },
    { en: "Gel manicure", es: "Manicura en gel", durationMin: 60, mxnCents: 35000 },
    { en: "Acrylic set", es: "Uñas acrílicas", durationMin: 90, mxnCents: 55000 },
    { en: "Pedicure", es: "Pedicura", durationMin: 60, mxnCents: 35000 },
  ] },
  brows: { key: "brows", services: [
    { en: "Brow shaping", es: "Diseño de cejas", durationMin: 30, mxnCents: 25000 },
    { en: "Brow lamination", es: "Laminado de cejas", durationMin: 60, mxnCents: 60000 },
    { en: "Brow tint", es: "Tinte de cejas", durationMin: 30, mxnCents: 20000 },
  ] },
  hair: { key: "hair", services: [
    { en: "Haircut", es: "Corte de cabello", durationMin: 45, mxnCents: 35000 },
    { en: "Color", es: "Color", durationMin: 120, mxnCents: 120000 },
    { en: "Blowout", es: "Peinado y secado", durationMin: 45, mxnCents: 30000 },
    { en: "Hair treatment", es: "Tratamiento capilar", durationMin: 60, mxnCents: 60000 },
  ] },
  makeup: { key: "makeup", services: [
    { en: "Day makeup", es: "Maquillaje de día", durationMin: 60, mxnCents: 80000 },
    { en: "Event makeup", es: "Maquillaje de evento", durationMin: 90, mxnCents: 120000 },
    { en: "Bridal makeup", es: "Maquillaje de novia", durationMin: 120, mxnCents: 250000 },
  ] },
};

const TRADE_PATTERNS: Array<[string, RegExp]> = [
  ["lashes", /lash|pesta/i],
  ["nails", /nail|u[ñn]a|manicur|pedicur/i],
  ["brows", /brow|ceja/i],
  ["makeup", /make-?up|maquill|\bmua\b/i],
  ["hair", /hair|cabello|peluq|barber|stylist|estilista|colorist/i],
];

/** Pack key for a trade slug or free-text discipline; null when no pack exists. */
export function packKeyForTrade(...candidates: Array<string | null | undefined>): string | null {
  for (const c of candidates) {
    if (!c) continue;
    for (const [key, re] of TRADE_PATTERNS) if (re.test(c)) return key;
  }
  return null;
}

export type PackContext = { trade?: string | null; discipline?: string | null; country?: string | null; locale: "en" | "es" };

/** Suggested services for a trade, with MX defaults (MXN) in Mexico; other countries get durations and "quote". */
export function suggestedServices(ctx: PackContext): EssentialService[] {
  const key = packKeyForTrade(ctx.trade, ctx.discipline);
  if (!key) return [];
  const currency = currencyForCountry(ctx.country);
  const mx = currency === "MXN";
  return BEAUTY_PACKS[key].services.map((s) => ({
    name: ctx.locale === "es" ? s.es : s.en,
    durationMin: s.durationMin,
    priceCents: mx ? s.mxnCents : null,
    quote: !mx,
    currency,
    packKey: key,
  }));
}

/** What the essentials screen opens with: pack services, Mon-Sat 9-19, country currency/timezone. */
export function suggestedEssentials(ctx: PackContext & { name?: string | null }): Essentials {
  const services = suggestedServices(ctx);
  return {
    name: ctx.name?.trim() || null,
    services,
    hours: defaultWeeklyHours(),
    timezone: defaultTimezoneForCountry(ctx.country),
    place: null,
    firstProviderEmail: null,
    firstProviderName: null,
    confirmed: false,
    source: services.length ? "pack" : "manual",
  };
}

/** AI-read service names -> essentials services, matching the pack for durations/prices (names are kept as said). */
export function servicesFromFacts(names: string[], ctx: PackContext): EssentialService[] {
  const currency = currencyForCountry(ctx.country);
  const pack = (() => { const k = packKeyForTrade(ctx.trade, ctx.discipline); return k ? BEAUTY_PACKS[k] : null; })();
  const seen = new Set<string>();
  const out: EssentialService[] = [];
  for (const raw of names) {
    const name = raw.trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    const hit = pack?.services.find((s) => s.en.toLowerCase() === key || s.es.toLowerCase() === key);
    out.push({
      name,
      durationMin: hit?.durationMin ?? null,
      priceCents: hit && currency === "MXN" ? hit.mxnCents : null,
      quote: !(hit && currency === "MXN"),
      currency,
      packKey: hit ? pack!.key : null,
    });
  }
  return out.slice(0, MAX_ESSENTIAL_SERVICES);
}

// ── parsing (module_state is free JSON) ────────────────────────────────────

function posInt(v: unknown, max: number): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.min(Math.trunc(v), max) : null;
}

function parseWeek(raw: unknown): WeeklyEssentialHours | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out = emptyWeek();
  for (const d of ["0", "1", "2", "3", "4", "5", "6"] as const) {
    const ranges = r[d];
    if (!Array.isArray(ranges)) continue;
    for (const x of ranges) {
      if (!x || typeof x !== "object") continue;
      const { startMin, endMin } = x as Record<string, unknown>;
      if (typeof startMin === "number" && typeof endMin === "number" && Number.isInteger(startMin) && Number.isInteger(endMin)
        && startMin >= 0 && endMin <= 1440 && endMin > startMin) out[d].push({ startMin, endMin });
    }
  }
  return out;
}

export function parseEssentialService(raw: unknown, fallbackCurrency = "USD"): EssentialService | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim().slice(0, 120) : "";
  if (!name) return null;
  const priceCents = typeof r.priceCents === "number" && Number.isFinite(r.priceCents) && r.priceCents >= 0 ? Math.round(r.priceCents) : null;
  const currency = typeof r.currency === "string" && /^[A-Za-z]{3}$/.test(r.currency) ? r.currency.toUpperCase() : fallbackCurrency;
  return {
    name,
    durationMin: posInt(r.durationMin, 1440),
    priceCents,
    // No number given means a quote; a quote never carries a number.
    quote: r.quote === true || priceCents === null,
    currency,
    packKey: typeof r.packKey === "string" ? r.packKey : null,
  };
}

export function parseEssentials(raw: unknown): Essentials | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const services = (Array.isArray(r.services) ? r.services : [])
    .map((s) => parseEssentialService(s))
    .filter((s): s is EssentialService => !!s)
    .slice(0, MAX_ESSENTIAL_SERVICES);
  const placeRaw = r.place && typeof r.place === "object" ? (r.place as Record<string, unknown>) : null;
  const mode = placeRaw?.mode;
  const place: EssentialPlace | null = mode === "studio" || mode === "home" || mode === "client"
    ? { mode, area: typeof placeRaw?.area === "string" && placeRaw.area.trim() ? placeRaw.area.trim().slice(0, 120) : null }
    : null;
  const email = typeof r.firstProviderEmail === "string" ? r.firstProviderEmail.trim().toLowerCase() : "";
  return {
    name: typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, 120) : null,
    services,
    hours: parseWeek(r.hours),
    timezone: typeof r.timezone === "string" && r.timezone.trim() ? r.timezone.trim().slice(0, 80) : null,
    place,
    firstProviderEmail: EMAIL_RE.test(email) ? email : null,
    firstProviderName: typeof r.firstProviderName === "string" && r.firstProviderName.trim() ? r.firstProviderName.trim().slice(0, 120) : null,
    confirmed: r.confirmed === true,
    source: r.source === "ai" || r.source === "pack" ? r.source : "manual",
  };
}

/** True when the essentials are enough to build without any description text (the manual path). */
export function essentialsReady(e: Essentials | null): boolean {
  return !!e && e.confirmed && e.services.length > 0;
}

// ── idempotent catalog planning ────────────────────────────────────────────

export type ExistingOffering = { id: string; title: string; status: string };

export type OfferingRowDraft = {
  title: string;
  description: null;
  kind: "service";
  price_type: "flat_package" | "custom";
  price_display: "exact" | "quote";
  amount_cents: number | null;
  currency: string;
  booking_mode: "instant" | "request";
  reserve_mode: "free" | "full";
  allow_pay_in_person: boolean;
  duration_minutes: number | null;
  category: string | null;
  status: "published";
  visibility: "public";
  sort_order: number;
};

export function offeringRowFor(s: EssentialService, sortOrder: number): OfferingRowDraft {
  const exact = !s.quote && s.priceCents !== null && s.priceCents > 0;
  return {
    title: s.name.trim(),
    description: null,
    kind: "service",
    price_type: exact ? "flat_package" : "custom",
    price_display: exact ? "exact" : "quote",
    amount_cents: exact ? s.priceCents : null,
    currency: s.currency,
    // Instant needs a fixed price; a quote is a request. Fresh accounts have
    // no card processor, so a direct booking reserves without payment and the
    // client pays at the appointment.
    booking_mode: exact ? "instant" : "request",
    reserve_mode: "free",
    allow_pay_in_person: true,
    duration_minutes: s.durationMin,
    category: s.packKey ?? null,
    status: "published",
    visibility: "public",
    sort_order: sortOrder,
  };
}

export type OfferingPlan = {
  insert: OfferingRowDraft[];
  /** Same title already there (e.g. the AI draft): publish it with the confirmed details. */
  update: Array<{ id: string; patch: OfferingRowDraft }>;
};

const norm = (t: string) => t.trim().toLowerCase();

/** Dedupe by title: a retry plans nothing new; an existing draft is upgraded in place. */
export function planOfferingWrites(existing: ExistingOffering[], services: EssentialService[]): OfferingPlan {
  const byTitle = new Map(existing.filter((o) => o.status !== "archived").map((o) => [norm(o.title), o]));
  const plan: OfferingPlan = { insert: [], update: [] };
  const seen = new Set<string>();
  services.forEach((s, i) => {
    const key = norm(s.name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    const row = offeringRowFor(s, i);
    const hit = byTitle.get(key);
    if (!hit) plan.insert.push(row);
    else if (hit.status === "draft") plan.update.push({ id: hit.id, patch: row });
  });
  return plan;
}

// ── the writer seam ────────────────────────────────────────────────────────

export type OfferingOwnerRef =
  | { kind: "talent"; talentProfileId: string; tenantId: string }
  | { kind: "workspace"; tenantId: string };

export type EssentialsStore = {
  listOfferings(owner: OfferingOwnerRef): Promise<ExistingOffering[]>;
  insertOfferings(owner: OfferingOwnerRef, rows: OfferingRowDraft[]): Promise<void>;
  updateOffering(id: string, patch: OfferingRowDraft): Promise<void>;
  /** Upsert `talent_booking_hours`. Returns false when no timezone is known. */
  upsertTalentHours(args: { talentProfileId: string; tenantId: string; weekly: WeeklyEssentialHours; timezone: string | null }): Promise<boolean>;
  /** `booking_terms.directBookingOptIn = true` (merge). */
  setTalentBookable(talentProfileId: string): Promise<void>;
  /** Merge place into the talent profile's booking terms. */
  setTalentPlace(talentProfileId: string, place: EssentialPlace): Promise<void>;
  /** Merge workspace opening hours + place into `agencies.settings`. */
  setWorkspaceBusinessInfo(tenantId: string, info: { hours: WeeklyEssentialHours; place: EssentialPlace | null }): Promise<void>;
  /** Merge `agencies.settings.appointments.enabled = true` without clobbering siblings. */
  enableWorkspaceAppointments(tenantId: string, opts: { timezone: string | null; presetId: "salon" | "default" }): Promise<void>;
  hasActiveProvider(tenantId: string): Promise<boolean>;
  /** TUL-77b: the owner's talent profile + active roster provider count; null when the owner is not on the roster. Optional: absent = house offerings. */
  ownerProvider?(tenantId: string): Promise<{ talentProfileId: string; providerCount: number } | null>;
  /** #178: true when this talent already has a `talent_booking_hours` row with an open day (never overwritten). */
  talentHasOpenHours?(talentProfileId: string): Promise<boolean>;
  inviteFirstProvider(args: { tenantId: string; tenantSlug: string; email: string; name: string | null }): Promise<"invited" | "already" | "failed">;
};

export type EssentialsRunInput = {
  choice: OnboardingChoice;
  essentials: Essentials;
  talent: { talentProfileId: string; tenantId: string } | null;
  workspace: { tenantId: string; tenantSlug: string } | null;
};

export type EssentialsRunResult = {
  offeringsCreated: number;
  offeringsUpdated: number;
  hoursWritten: boolean;
  /** #178: a solo studio owner's own booking hours were written. */
  ownerHoursWritten: boolean;
  ownerBookable: boolean;
  appointmentsEnabled: boolean;
  providerInvite: "invited" | "already" | "failed" | "skipped";
  warnings: string[];
};

/**
 * Persist the essentials for one choice. Every step looks first and writes
 * only what is missing (offerings by title, hours upserted, flags merged), so
 * a retry after a failure changes nothing it already finished.
 *
 *   myself : her offerings + hours + bookable + place            (hub tenant)
 *   both   : her offerings + hours + bookable + place            (workspace tenant)
 *            + workspace appointments ON (timezone)
 *   studio : house offerings + opening hours + place + workspace
 *            appointments ON (timezone, same writer as both); first provider invite
 *            (#178 owner hours when solo). TUL-457: do not wait for a roster
 *            provider before writing settings.appointments — both never did.
 */
export async function runEssentialsWrites(store: EssentialsStore, input: EssentialsRunInput): Promise<EssentialsRunResult> {
  const { choice, essentials: e, talent, workspace } = input;
  const out: EssentialsRunResult = { offeringsCreated: 0, offeringsUpdated: 0, hoursWritten: false, ownerHoursWritten: false, ownerBookable: false, appointmentsEnabled: false, providerInvite: "skipped", warnings: [] };
  const weekly = hoursHaveAnyOpenDay(e.hours) ? e.hours! : defaultWeeklyHours();
  const step = async (label: string, fn: () => Promise<void>) => {
    try { await fn(); } catch (err) { out.warnings.push(`essentials:${label}:${err instanceof Error ? err.message : String(err)}`); }
  };

  const writeOfferings = (owner: OfferingOwnerRef, skipTitles?: ReadonlySet<string>) => step("offerings", async () => {
    const services = skipTitles ? e.services.filter((s) => !skipTitles.has(norm(s.name))) : e.services;
    const plan = planOfferingWrites(await store.listOfferings(owner), services);
    if (plan.insert.length) await store.insertOfferings(owner, plan.insert);
    for (const u of plan.update) await store.updateOffering(u.id, u.patch);
    out.offeringsCreated += plan.insert.length;
    out.offeringsUpdated += plan.update.length;
  });

  // TUL-77b: a solo owner's services are the owner-provider's; a studio's stay house-owned.
  const writeStudioOfferings = async (tenantId: string) => {
    const solo: { id: string | null } = { id: null };
    await step("ownerProvider", async () => {
      const op = store.ownerProvider ? await store.ownerProvider(tenantId) : null;
      if (op) solo.id = offeringOwnerFor({ choice, ownerTalentProfileId: op.talentProfileId, providerCount: op.providerCount + (e.firstProviderEmail ? 1 : 0) });
    });
    const soloId = solo.id;
    if (!soloId) return writeOfferings({ kind: "workspace", tenantId });
    // A house row with the same title already there is left alone (no second one).
    const house = new Set((await store.listOfferings({ kind: "workspace", tenantId })).filter((o) => o.status !== "archived").map((o) => norm(o.title)));
    return writeOfferings({ kind: "talent", talentProfileId: soloId, tenantId }, house);
  };

  if (choice !== "studio" && talent) {
    const tenantId = choice === "both" && workspace ? workspace.tenantId : talent.tenantId;
    await writeOfferings({ kind: "talent", talentProfileId: talent.talentProfileId, tenantId });
    await step("hours", async () => {
      out.hoursWritten = await store.upsertTalentHours({ talentProfileId: talent.talentProfileId, tenantId, weekly, timezone: e.timezone });
      if (!out.hoursWritten) out.warnings.push("essentials:hours:no_timezone");
    });
    await step("bookable", async () => { await store.setTalentBookable(talent.talentProfileId); out.ownerBookable = true; });
    if (e.place) { const place = e.place; await step("place", () => store.setTalentPlace(talent.talentProfileId, place)); }
  }

  if (choice === "both" && workspace) {
    // Root cause of the 2026-10-08 run4 defect: the block above wrote only the
    // owner's talent-owned rows, but the workspace readers (menu/offering
    // blocks, setup checklist) select owner_kind = 'workspace', so the business
    // site had nothing. Also write the house rows; the owner's own rows stay
    // the bookable ones (a house row has no capacity pool, /book skips it).
    await writeOfferings({ kind: "workspace", tenantId: workspace.tenantId });
    // TUL-77: the owner is the bookable provider; the workspace shows her
    // opening hours and place too (the same week she confirmed).
    await step("businessInfo", () => store.setWorkspaceBusinessInfo(workspace.tenantId, { hours: weekly, place: e.place }));
    await step("appointments", async () => {
      await store.enableWorkspaceAppointments(workspace.tenantId, { timezone: e.timezone, presetId: "salon" });
      out.appointmentsEnabled = true;
    });
  }

  if (choice === "studio" && workspace) {
    await writeStudioOfferings(workspace.tenantId);
    await step("businessInfo", () => store.setWorkspaceBusinessInfo(workspace.tenantId, { hours: weekly, place: e.place }));
    // #178: a solo owner is the provider; /book reads THEIR hours. Only when none are set yet.
    await step("ownerHours", async () => {
      const owner = store.ownerProvider ? await store.ownerProvider(workspace.tenantId) : null;
      if (!owner || !isSoleOwnerProvider(owner, !!e.firstProviderEmail)) return;
      if (store.talentHasOpenHours && (await store.talentHasOpenHours(owner.talentProfileId))) return;
      out.ownerHoursWritten = await store.upsertTalentHours({ talentProfileId: owner.talentProfileId, tenantId: workspace.tenantId, weekly, timezone: e.timezone });
      if (!out.ownerHoursWritten) out.warnings.push("essentials:ownerHours:no_timezone");
    });
    if (e.firstProviderEmail) {
      const email = e.firstProviderEmail;
      await step("invite", async () => {
        out.providerInvite = await store.inviteFirstProvider({ tenantId: workspace.tenantId, tenantSlug: workspace.tenantSlug, email, name: e.firstProviderName });
        if (out.providerInvite === "failed") out.warnings.push("essentials:invite:failed");
      });
    }
    // TUL-457: same appointments writer as both — timezone (and enabled) land at
    // onboarding even when the roster is still empty. Capacity /book still needs
    // a provider; the missing settings.appointments object was the bug.
    await step("appointments", async () => {
      await store.enableWorkspaceAppointments(workspace.tenantId, { timezone: e.timezone, presetId: "salon" });
      out.appointmentsEnabled = true;
    });
  }
  return out;
}
