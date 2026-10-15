/**
 * Promos v1 e2e helpers: service-role seeding, lookups and cleanup.
 *
 * Same contract as `e2e/talent-website/seed.ts`: LOCAL Supabase only (the CI
 * lane's throwaway stack), service role, fixture talents only. Specs import
 * from here, never from `seed.ts` (that module runs `main()` at import).
 *
 * Every promo these specs create is named with `PROMO_PREFIX`, so one delete
 * (`cleanupPromos`) removes them all (redemptions, events and targets cascade
 * from `tenant_promo_codes`). Promos are per TENANT and every rostered fixture
 * shares the platform hub tenant, so a spec that leaves a live "all services"
 * promo behind would re-price every other fixture. Each spec therefore cleans
 * in `beforeAll` (a crashed earlier run) and `afterAll`.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const PROMO_PREFIX = "E2E PROMO";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);

let cached: SupabaseClient | null = null;

/** Service-role client against the local stack. Throws with a reason, never returns null. */
export function adminDb(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "promos e2e needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the local Supabase stack, see talent-website-e2e.yml).",
    );
  }
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`promos e2e refuses to write to non-local Supabase host "${host}".`);
  }
  cached = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return cached;
}

function fail(what: string, err: { message: string } | null): never {
  throw new Error(`promos e2e: ${what}${err ? `: ${err.message}` : ""}`);
}

/** The talent's promo tenant: oldest ACTIVE roster row (what the share kit and the site resolve). */
export async function promoTenantId(db: SupabaseClient, talentProfileId: string): Promise<string> {
  const { data, error } = await db
    .from("agency_talent_roster")
    .select("tenant_id")
    .eq("talent_profile_id", talentProfileId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) fail("roster lookup", error);
  const first = ((data ?? []) as { tenant_id: string }[])[0];
  if (!first) fail(`talent ${talentProfileId} has no active roster row (did seed.ts run?)`, null);
  return first.tenant_id;
}

export type OfferingRef = { id: string; title: string; amountCents: number; currency: string };

export async function offeringByTitle(db: SupabaseClient, talentProfileId: string, title: string): Promise<OfferingRef> {
  const { data, error } = await db
    .from("talent_offerings")
    .select("id, title, amount_cents, currency")
    .eq("talent_profile_id", talentProfileId)
    .eq("title", title)
    .maybeSingle();
  if (error) fail("offering lookup", error);
  const row = data as { id: string; title: string; amount_cents: number; currency: string } | null;
  if (!row) fail(`offering "${title}" not found for talent ${talentProfileId} (did seed.ts run?)`, null);
  return { id: row.id, title: row.title, amountCents: Number(row.amount_cents), currency: row.currency };
}

export type PromoSeed = {
  name: string;
  /** Required for unlock "code". */
  code?: string | null;
  percent?: number;
  unlock: "auto" | "code" | "link";
  showOnSite?: boolean;
  maxRedemptions?: number | null;
  perCustomerLimit?: number;
  linkSlug?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  isPaused?: boolean;
  /** Restrict to these offering ids (promo_targets); omit for every service. */
  serviceIds?: readonly string[];
};

/** Insert one percent promo, returning its id. Names are forced under PROMO_PREFIX. */
export async function seedPromo(db: SupabaseClient, tenantId: string, p: PromoSeed): Promise<string> {
  const { data, error } = await db
    .from("tenant_promo_codes")
    .insert({
      tenant_id: tenantId,
      // Nullable since promos v1 (auto and link promos have no code).
      code: p.code ?? null,
      label: p.name,
      name: `${PROMO_PREFIX} ${p.name}`,
      kind: "percent",
      offer_kind: "percent",
      value: p.percent ?? 20,
      unlock: p.unlock,
      audience: "public",
      scope_kind: p.serviceIds && p.serviceIds.length > 0 ? "services" : "all",
      show_on_site: p.showOnSite ?? false,
      is_active: true,
      is_draft: false,
      is_paused: p.isPaused ?? false,
      max_redemptions: p.maxRedemptions ?? null,
      per_customer_limit: p.perCustomerLimit ?? 1,
      link_slug: p.linkSlug ?? null,
      starts_at: p.startsAt ?? null,
      ends_at: p.endsAt ?? null,
    })
    .select("id")
    .single();
  if (error || !data) fail(`seed promo "${p.name}"`, error);
  const id = (data as { id: string }).id;
  if (p.serviceIds && p.serviceIds.length > 0) {
    const { error: tErr } = await db
      .from("promo_targets")
      .insert(p.serviceIds.map((sid) => ({ promo_id: id, target_kind: "service", target_id: sid })));
    if (tErr) fail("seed promo targets", tErr);
  }
  return id;
}

/** Delete every promo these specs created for the tenant. Cascades redemptions, events, targets. */
export async function cleanupPromos(db: SupabaseClient, tenantId: string, namePrefix = PROMO_PREFIX): Promise<void> {
  const { error } = await db
    .from("tenant_promo_codes")
    .delete()
    .eq("tenant_id", tenantId)
    .like("name", `${namePrefix}%`);
  if (error) fail("cleanup promos", error);
}

export type RedemptionRow = {
  id: string;
  status: string;
  order_id: string | null;
  discount_cents: number | null;
  list_cents: number | null;
  amount_cents: number;
  source: string | null;
  source_channel: string | null;
  voided_at: string | null;
  hold_expires_at: string | null;
};

const REDEMPTION_COLUMNS =
  "id, status, order_id, discount_cents, list_cents, amount_cents, source, source_channel, voided_at, hold_expires_at";

export async function redemptionsFor(db: SupabaseClient, promoId: string): Promise<RedemptionRow[]> {
  const { data, error } = await db
    .from("tenant_promo_redemptions")
    .select(REDEMPTION_COLUMNS)
    .eq("promo_code_id", promoId)
    .order("created_at", { ascending: true });
  if (error) fail("read redemptions", error);
  return (data ?? []) as RedemptionRow[];
}

export type RpcVerdict = { ok: boolean; reason?: string; already?: boolean; redemption_id?: string; released?: number };

export async function rpcVerdict(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<RpcVerdict> {
  const { data, error } = await db.rpc(fn, args);
  if (error) fail(`rpc ${fn}`, error);
  return (data ?? { ok: false, reason: "no_data" }) as RpcVerdict;
}

/** "$1,240.50", "MX$ 240", "240,00 €" -> cents. First number in the string wins. */
export function moneyToCents(text: string): number {
  const m = /\d[\d.,\s]*/.exec(text);
  if (!m) throw new Error(`no amount in "${text}"`);
  const raw = m[0].trim().replace(/\s/g, "");
  const lastSep = Math.max(raw.lastIndexOf("."), raw.lastIndexOf(","));
  const decimals = lastSep >= 0 && raw.length - lastSep - 1 <= 2 ? raw.slice(lastSep + 1) : "";
  const whole = (lastSep >= 0 && decimals ? raw.slice(0, lastSep) : raw).replace(/[.,]/g, "");
  return Number(whole) * 100 + (decimals ? Number(decimals.padEnd(2, "0")) : 0);
}

/** Mirror of `serviceSlug` in src/lib/talent-site/service-page.ts (kept local: that module pulls app aliases). */
export function serviceSlugFor(o: { id: string; title: string }): string {
  const id8 = o.id.replace(/-/g, "").slice(0, 8).toLowerCase();
  const t = o.title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
  return `servicio-${t ? `${t}-` : ""}${id8}`;
}

/**
 * Weekday booking hours so the live slot picker has times. Only inserts when the
 * talent has none; returns true when it created the row (the caller removes it).
 * Same shape as `ensureBookingHours` in e2e/talent-website/seed.ts.
 */
export async function ensureBookingHoursIfMissing(
  db: SupabaseClient,
  talentProfileId: string,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("talent_booking_hours")
    .select("talent_profile_id")
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (error) fail("read booking hours", error);
  if (data) return false;
  const day = [{ startMin: 600, endMin: 1140 }];
  const { error: insErr } = await db.from("talent_booking_hours").insert({
    talent_profile_id: talentProfileId,
    tenant_id: tenantId,
    timezone: "America/Merida",
    weekly: { 0: day, 1: day, 2: day, 3: day, 4: day, 5: day, 6: day },
    exceptions: [],
    slot_minutes: 30,
    buffer_before_min: 0,
    buffer_after_min: 0,
    min_notice_min: 60,
    horizon_days: 60,
    updated_at: new Date().toISOString(),
  });
  if (insErr) fail("insert booking hours", insErr);
  return true;
}

export async function removeBookingHours(db: SupabaseClient, talentProfileId: string): Promise<void> {
  const { error } = await db.from("talent_booking_hours").delete().eq("talent_profile_id", talentProfileId);
  if (error) fail("remove booking hours", error);
}
