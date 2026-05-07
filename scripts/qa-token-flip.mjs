// QA test: flip nav-alignment to "split-around-logo" then back, verify
// the rendered HTML changes accordingly.
//
// Defaults to the path-based tenant storefront URL on localhost because local
// host-header routing may not map custom domains in every dev setup.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const requireFromWeb = createRequire(
  new URL("../web/package.json", import.meta.url),
);
const { createClient } = requireFromWeb("@supabase/supabase-js");

const env = Object.fromEntries(
  readFileSync("/Users/oranpersonal/Desktop/impronta-app/web/.env.local", "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const tenantId = "00000000-0000-0000-0000-000000000001";
const baseUrl = process.env.QA_TOKEN_FLIP_BASE_URL?.trim() || "http://localhost:3000";
const explicitStorefrontUrl = process.env.QA_TOKEN_FLIP_URL?.trim() || "";
const hostHeader = process.env.QA_TOKEN_FLIP_HOST?.trim() || "";

const { data: agencyRow } = await supa
  .from("agencies")
  .select("slug")
  .eq("id", tenantId)
  .maybeSingle();
const tenantSlug = agencyRow?.slug || "impronta";
const storefrontUrl =
  explicitStorefrontUrl || `${baseUrl.replace(/\/+$/, "")}/${tenantSlug}`;

// Snapshot current theme_json so we restore exactly after.
const before = await supa
  .from("agency_branding")
  .select("theme_json, version")
  .eq("tenant_id", tenantId)
  .single();
if (before.error) { console.error(before.error); process.exit(1); }
const originalTheme = before.data.theme_json ?? {};
const originalVersion = before.data.version ?? 0;

console.log("[before] nav-alignment =", originalTheme["shell.header-nav-alignment"] ?? "(unset)");

// Step 1: Set to split-around-logo
const flipResult = await supa
  .from("agency_branding")
  .update({
    theme_json: { ...originalTheme, "shell.header-nav-alignment": "split-around-logo" },
    version: originalVersion + 1,
  })
  .eq("tenant_id", tenantId)
  .eq("version", originalVersion);
if (flipResult.error) { console.error(flipResult.error); process.exit(1); }
console.log("[set] split-around-logo applied");

// Step 2: Bust cache so storefront reads fresh.
// Public reads use `unstable_cache`; in dev mode the cache is per-process
// and short-lived. We rely on Next dev's HMR to re-fetch. Wait briefly.
await new Promise((r) => setTimeout(r, 1500));

// Step 3: Fetch the storefront and look for the new attr.
const fetchHeaders = hostHeader ? { Host: hostHeader } : undefined;
const r = await fetch(storefrontUrl, { headers: fetchHeaders, cache: "no-store" });
const html = await r.text();
const m = html.match(/data-token-shell-header-nav-alignment="([^"]+)"/);
console.log("[target]", storefrontUrl, hostHeader ? `(Host: ${hostHeader})` : "");
console.log("[render after flip]", m?.[1] ?? "(not found)");

// Step 4: Restore to whatever was original.
const restoreResult = await supa
  .from("agency_branding")
  .update({ theme_json: originalTheme, version: originalVersion + 2 })
  .eq("tenant_id", tenantId)
  .eq("version", originalVersion + 1);
if (restoreResult.error) { console.error(restoreResult.error); process.exit(1); }
console.log("[restore] original theme + version", originalVersion + 2);

const verdict = m?.[1] === "split-around-logo" ? "PASS — token flowed to render" : "FAIL — token did NOT propagate";
console.log("\n", verdict);
