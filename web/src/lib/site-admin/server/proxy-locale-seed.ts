/**
 * TUL-1183: seed the dashboard `locale` cookie in the request proxy, so the FIRST
 * render after sign-in is already in the tenant / talent language.
 *
 * Until now a server layout could not write cookies, so the admin and talent
 * layouts redirected through `/api/admin/locale-seed` and `/api/talent/locale-seed`
 * (TUL-117). That hop sits inside the sign-in soft navigation and was the root of
 * the redirect storm fixed in #3888 by skipping the hop on RSC requests (which
 * left the first post-sign-in render in the default language). The proxy CAN set
 * cookies and rewrite the forwarded request, so the decision moves here.
 *
 * The decision itself is NOT new: `talentLocaleSeedPlan` / `localeSeedMayApply`
 * stay the one planner (never overwrite a deliberate cookie the signed-in user
 * owns; seed + stamp otherwise; write the AUTO marker). This file only decides
 * WHEN the proxy may run it and how to hand the result to the render.
 *
 * Fail-safe by construction: any unknown (no user, a read that fails, no
 * stored language) returns null and the request is left untouched, so the
 * layout hops stay in place as the fallback.
 */

import { getLanguageSettingsForMiddleware } from "@/lib/language-settings/middleware-locale-cache";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { isLocale, type Locale } from "@/lib/site-admin/locales";

import { isLocaleSeedablePath, localeSeedMayApply, talentLocaleSeedPlan } from "./talent-locale-seed";

/** Cookie names, duplicated as plain strings so this file stays free of `next/server` (pure tests). */
export const SEED_LOCALE_COOKIE = "locale";
export const SEED_LOCALE_AUTO_COOKIE = "locale_auto";
export const SEED_LOCALE_OWNER_COOKIE = "locale_owner";
export const SEED_LOCALE_HEADER = "x-impronta-locale";

export type DashboardSeedSurface =
  | { kind: "talent" }
  /** `slug` is null on a branded workspace host (`/admin`), where the host names the tenant. */
  | { kind: "workspace"; slug: string | null };

/** Which dashboard (if any) a browser pathname belongs to. Public pages never match. */
export function dashboardSeedSurface(pathname: string | null | undefined): DashboardSeedSurface | null {
  if (!pathname || typeof pathname !== "string") return null;
  if (pathname === "/talent/register" || pathname.startsWith("/talent/register/")) return null;
  if (isLocaleSeedablePath(pathname)) return { kind: "talent" };
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "admin") return { kind: "workspace", slug: null };
  if (parts.length >= 2 && parts[1] === "admin" && /^[a-z0-9][a-z0-9-]*$/i.test(parts[0]!)) {
    return { kind: "workspace", slug: parts[0]! };
  }
  return null;
}

/**
 * Document loads and RSC soft navigations may seed (the post-sign-in navigation
 * IS an RSC request). Link prefetches must not: they are speculative and would
 * write a cookie nobody visited yet.
 */
export function proxyLocaleSeedRequestAllowed(input: { method: string; prefetch: boolean }): boolean {
  if (input.prefetch) return false;
  return input.method === "GET" || input.method === "HEAD";
}

export type ProxySeedPlan = { locale: string | null; stamp: boolean; userId: string };

/** The Cookie header the render must see: seeded `locale` (+ AUTO marker) and the owner stamp. */
export function seededCookieHeader(cookieHeader: string | null | undefined, plan: ProxySeedPlan): string {
  const drop = new Set<string>([
    ...(plan.locale ? [SEED_LOCALE_COOKIE, SEED_LOCALE_AUTO_COOKIE] : []),
    ...(plan.stamp ? [SEED_LOCALE_OWNER_COOKIE] : []),
  ]);
  const kept = (cookieHeader ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part && !drop.has(part.split("=")[0]!.trim()));
  if (plan.locale) {
    kept.push(`${SEED_LOCALE_COOKIE}=${plan.locale}`, `${SEED_LOCALE_AUTO_COOKIE}=1`);
  }
  if (plan.stamp) kept.push(`${SEED_LOCALE_OWNER_COOKIE}=${plan.userId}`);
  return kept.join("; ");
}

/** Forwarded request headers for the render: seeded cookies AND the resolved-locale header. */
export function seededRequestHeaders(headers: Headers, plan: ProxySeedPlan): Headers {
  const out = new Headers(headers);
  out.set("cookie", seededCookieHeader(headers.get("cookie"), plan));
  if (plan.locale) out.set(SEED_LOCALE_HEADER, plan.locale);
  return out;
}

export type ProxySeedDeps = {
  talentPrimary: (userId: string) => Promise<string | null>;
  workspacePrimary: (tenantId: string) => Promise<string | null>;
  tenantIdForSlug: (slug: string) => Promise<string | null>;
};

export type ProxySeedInput = {
  method: string;
  prefetch: boolean;
  pathname: string;
  /** The verified signed-in user (`x-impronta-actor-id`), never a client header. */
  actorId: string | null | undefined;
  cookieLocale: string | null | undefined;
  cookieIsAuto: boolean;
  cookieOwner: string | null | undefined;
  /** The host's tenant on a branded workspace host, else null. */
  hostTenantId: string | null | undefined;
};

/** The plan to apply to this request, or null when nothing should change. Never throws. */
export async function planDashboardLocaleSeed(
  input: ProxySeedInput,
  deps: ProxySeedDeps = defaultSeedDeps,
): Promise<ProxySeedPlan | null> {
  try {
    if (!proxyLocaleSeedRequestAllowed(input)) return null;
    const userId = (input.actorId ?? "").trim();
    if (!userId) return null;
    const surface = dashboardSeedSurface(input.pathname);
    if (!surface) return null;
    const state = {
      cookieLocale: input.cookieLocale,
      cookieIsAuto: input.cookieIsAuto,
      cookieOwner: input.cookieOwner,
    };
    // Steady state: a deliberate cookie the user owns needs no read at all.
    if (!localeSeedMayApply({ ...state, userId })) return null;

    let primary: string | null = null;
    if (surface.kind === "talent") {
      primary = await deps.talentPrimary(userId);
    } else {
      const tenantId = input.hostTenantId || (surface.slug ? await deps.tenantIdForSlug(surface.slug) : null);
      primary = tenantId ? await deps.workspacePrimary(tenantId) : null;
    }
    if (!primary) return null;
    const plan = talentLocaleSeedPlan({ ...state, userId, primary });
    if (!plan.locale && !plan.stamp) return null;
    return { locale: plan.locale, stamp: plan.stamp, userId };
  } catch {
    return null;
  }
}

// ── proxy-safe loaders (service-role / anon reads only, no React cache, no next/headers) ──

const TTL_MS = 60_000;
const SLUG_TTL_MS = 5 * 60_000;
const workspaceCache = new Map<string, { at: number; value: string | null }>();
const slugCache = new Map<string, { at: number; value: string | null }>();

async function publicLocales(): Promise<readonly string[] | null> {
  const settings = await getLanguageSettingsForMiddleware().catch(() => null);
  return settings?.publicLocales?.length ? settings.publicLocales : null;
}

/** A stored language may seed the cookie only when it is a real, publicly enabled locale. */
export function seedablePrimary(preferred: string | null | undefined, locales: readonly string[] | null): Locale | null {
  if (!locales || !isLocale(preferred)) return null;
  return locales.includes(preferred) ? preferred : null;
}

const defaultSeedDeps: ProxySeedDeps = {
  async talentPrimary(userId) {
    const admin = createServiceRoleClient();
    if (!admin) return null;
    const { data, error } = await admin
      .from("talent_profiles")
      .select("preferred_locale")
      .eq("user_id", userId)
      .maybeSingle<{ preferred_locale: string | null }>();
    if (error || !data) return null;
    return seedablePrimary(data.preferred_locale, await publicLocales());
  },
  async workspacePrimary(tenantId) {
    const hit = workspaceCache.get(tenantId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
    const supabase = createPublicSupabaseClient();
    if (!supabase) return null;
    const read = await supabase
      .from("agency_business_identity")
      .select("default_locale")
      .eq("tenant_id", tenantId)
      .maybeSingle<{ default_locale: string | null }>();
    const locales = await publicLocales();
    if (read.error || !read.data || !locales) return null;
    const value = seedablePrimary(read.data.default_locale, locales);
    workspaceCache.set(tenantId, { at: Date.now(), value });
    return value;
  },
  async tenantIdForSlug(slug) {
    const hit = slugCache.get(slug);
    if (hit && Date.now() - hit.at < SLUG_TTL_MS) return hit.value;
    const admin = createServiceRoleClient();
    if (!admin) return null;
    const { data, error } = await admin.from("agencies").select("id").eq("slug", slug).maybeSingle<{ id: string }>();
    if (error) return null;
    const value = data?.id ?? null;
    slugCache.set(slug, { at: Date.now(), value });
    return value;
  },
};
