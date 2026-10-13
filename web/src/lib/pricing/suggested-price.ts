/**
 * TUL-633 · The price a new talent's service arrives with ("Suggested, tap to change").
 *
 * These are prices a TALENT charges THEIR CLIENTS (manicure, haircut...), used only to
 * pre-fill services at signup. Not Tulala plan prices.
 *
 * Source order: an APPROVED row of `service_price_suggestions` for (country, service key),
 * else today's Mexico pack (MXN), else null (caller keeps "quote"). Drafts are never read.
 * Service key = `<packKey>:<slug of the English pack name>`, e.g. "nails:gel-manicure".
 */

import { BEAUTY_PACKS } from "@/lib/onboarding/essentials";

export type SuggestedPrice = { amountMinor: number; currency: string; durationMinutes: number | null; source: "table" | "pack" };

type ApprovedRow = { amount_minor: number; currency: string; duration_minutes: number | null };
export type SuggestedPriceDeps = {
  readApproved?: (countryCode: string, serviceKey: string) => Promise<ApprovedRow | null>;
};

const COUNTRY_ALIASES: Record<string, string> = {
  mexico: "MX", "méxico": "MX", mejico: "MX", "méjico": "MX", mex: "MX",
  "united states": "US", usa: "US", "estados unidos": "US", eeuu: "US", "ee.uu.": "US", "united states of america": "US",
  colombia: "CO",
  argentina: "AR",
  spain: "ES", "españa": "ES", espana: "ES",
  switzerland: "CH", suiza: "CH", schweiz: "CH", suisse: "CH",
  "united kingdom": "GB", uk: "GB", "reino unido": "GB", "great britain": "GB", england: "GB", inglaterra: "GB",
};

/** ISO alpha-2 from a code or a country name in English/Spanish; null when unknown. */
export function normalizeCountryCode(raw: string | null | undefined): string | null {
  const t = raw?.trim().toLowerCase();
  if (!t) return null;
  if (t === "gb" || t === "uk") return "GB";
  if (/^[a-z]{2}$/.test(t)) return t.toUpperCase();
  return COUNTRY_ALIASES[t] ?? null;
}

export function slugServiceName(en: string): string {
  return en.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** The stable key a pack service is stored under in the table. */
export function serviceKeyFor(packKey: string, enName: string): string {
  return `${packKey}:${slugServiceName(enName)}`;
}

function packFallback(serviceKey: string): SuggestedPrice | null {
  const [packKey, slug] = serviceKey.split(":");
  const pack = packKey ? BEAUTY_PACKS[packKey] : undefined;
  const hit = pack?.services.find((s) => slugServiceName(s.en) === slug);
  return hit ? { amountMinor: hit.mxnCents, currency: "MXN", durationMinutes: hit.durationMin, source: "pack" } : null;
}

async function readApprovedFromDb(countryCode: string, serviceKey: string): Promise<ApprovedRow | null> {
  const { createServiceRoleClient } = await import("@/lib/supabase/admin");
  const db = createServiceRoleClient();
  if (!db) return null;
  const { data, error } = await db
    .from("service_price_suggestions")
    .select("amount_minor,currency,duration_minutes")
    .eq("country_code", countryCode)
    .eq("service_key", serviceKey)
    .eq("status", "approved")
    .maybeSingle();
  if (error) {
    // Logged, then treated as "no approved row" so signup falls back to the pack instead of failing.
    const { logServerError } = await import("@/lib/server/safe-error");
    logServerError("pricing.suggested-price.read", error);
    return null;
  }
  return (data as ApprovedRow | null) ?? null;
}

export async function getSuggestedPrice(
  input: { countryCode: string | null; serviceKey: string },
  deps?: SuggestedPriceDeps,
): Promise<SuggestedPrice | null> {
  const country = normalizeCountryCode(input.countryCode);
  if (!country || !input.serviceKey) return null;
  const read = deps?.readApproved ?? readApprovedFromDb;
  let row: ApprovedRow | null = null;
  try {
    row = await read(country, input.serviceKey);
  } catch {
    row = null; // a table outage must never block signup; fall through to the pack
  }
  if (row && Number.isInteger(row.amount_minor) && row.amount_minor > 0 && row.currency) {
    return { amountMinor: row.amount_minor, currency: row.currency.toUpperCase(), durationMinutes: row.duration_minutes ?? null, source: "table" };
  }
  return country === "MX" ? packFallback(input.serviceKey) : null;
}
