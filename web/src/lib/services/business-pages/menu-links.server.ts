/**
 * Server read for menu item links (one pass per render, no per-item queries).
 *
 * Gate: `businessServicePagesOn` (flag + plan). Rows: `loadBusinessServiceRows` (the same
 * eligibility the page route uses, so a link can never point at a 404). Any failure returns
 * `undefined` and the board renders plain text, exactly as before.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { buildTenantLocaleAlternates } from "@/lib/seo/locale-alternates";
import { logServerError } from "@/lib/server/safe-error";

import { businessServicePagesOn, loadBusinessServiceRows } from "./load.server";
import { buildMenuServiceHrefs, type MenuServiceHrefMap } from "./menu-links";

type Db = Pick<SupabaseClient, "from">;

/** `""`, `/en`, `/es`, or a path-based tenant prefix: whatever precedes a locale-free path. */
async function localePrefix(locale: string): Promise<string> {
  const alt = await buildTenantLocaleAlternates(locale, "/");
  const canonical = alt.alternates?.canonical;
  if (!canonical) return "";
  try {
    return new URL(String(canonical)).pathname.replace(/\/+$/, "");
  } catch {
    return String(canonical).replace(/\/+$/, "");
  }
}

export async function loadMenuServiceHrefs(input: {
  db: Db;
  tenantId: string;
  locale: string;
  offeringIds: readonly string[];
  flagOn?: boolean;
}): Promise<MenuServiceHrefMap | undefined> {
  if (input.offeringIds.length === 0) return undefined;
  try {
    if (!(await businessServicePagesOn(input.db, input.tenantId, input.flagOn))) return undefined;
    const loaded = await loadBusinessServiceRows(input.db, input.tenantId);
    if (!loaded) return undefined;
    const wanted = new Set(input.offeringIds.map(String));
    const rows = loaded.rows.filter((r) => wanted.has(String(r.id)));
    if (rows.length === 0) return undefined;
    const map = buildMenuServiceHrefs(rows, { locale: input.locale, prefix: await localePrefix(input.locale) });
    return Object.keys(map).length > 0 ? map : undefined;
  } catch (error) {
    logServerError("business-service-pages/menu-links", error);
    return undefined;
  }
}
