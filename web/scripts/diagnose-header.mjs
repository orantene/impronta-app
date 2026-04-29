// Diagnose the localhost-vs-live header mismatch by inspecting:
//   1. agency_domains: do impronta.local and impronta.tulala.digital map to the same tenant?
//   2. agency_business_identity: which tenants have public_name / tagline?
//   3. agency_branding: which tenants have a brand_mark_svg?
//   4. cms_navigation_menus: which tenants have a published header tree?
//
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from web/.env.local.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync("/Users/oranpersonal/Desktop/impronta-app/web/.env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

console.log("\n══ 1. agency_domains rows for impronta + tulala hosts ══");
const { data: domains, error: e1 } = await supa
  .from("agency_domains")
  .select("*")
  .or("hostname.ilike.%impronta%,hostname.ilike.%tulala%")
  .order("hostname");
if (e1) console.error(e1);
else console.table(domains);

const tenantIds = [...new Set((domains ?? []).map((d) => d.tenant_id).filter(Boolean))];
console.log(`\nUnique tenant ids in matching rows: ${tenantIds.length}`);
console.log(tenantIds);

console.log("\n══ 2. agency_business_identity for those tenants ══");
const { data: ids } = await supa
  .from("agency_business_identity")
  .select("tenant_id, public_name, tagline, default_locale, supported_locales")
  .in("tenant_id", tenantIds);
console.table(ids);

console.log("\n══ 3. agency_branding (brand_mark_svg presence + theme_json keys) ══");
const { data: brands } = await supa
  .from("agency_branding")
  .select("tenant_id, primary_color, brand_mark_svg, font_preset, theme_json")
  .in("tenant_id", tenantIds);
console.table(
  (brands ?? []).map((b) => ({
    tenant_id: b.tenant_id,
    primary_color: b.primary_color,
    has_brand_mark_svg: Boolean(b.brand_mark_svg) ? `yes (${b.brand_mark_svg.length}b)` : "—",
    font_preset: b.font_preset,
    theme_keys: b.theme_json ? Object.keys(b.theme_json).join(",") : "—",
  })),
);

console.log("\n══ 4. cms_navigation_menus (published header trees) ══");
const { data: menus } = await supa
  .from("cms_navigation_menus")
  .select("tenant_id, zone, locale, published_at, version, tree_json")
  .in("tenant_id", tenantIds)
  .eq("zone", "header");
console.table(
  (menus ?? []).map((m) => ({
    tenant_id: m.tenant_id,
    zone: m.zone,
    locale: m.locale,
    published: m.published_at ? "yes" : "—",
    version: m.version,
    items: Array.isArray(m.tree_json) ? m.tree_json.length : 0,
    labels: Array.isArray(m.tree_json) ? m.tree_json.map((n) => n.label).join(" / ") : "—",
  })),
);

console.log("\n══ 5. cms_navigation_items (DRAFT-side) for these tenants ══");
const { data: drafts } = await supa
  .from("cms_navigation_items")
  .select("tenant_id, zone, locale, label, href, sort_order, visible")
  .in("tenant_id", tenantIds)
  .eq("zone", "header")
  .order("sort_order");
console.table(drafts);
