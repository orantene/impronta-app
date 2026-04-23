#!/usr/bin/env node
// One-shot: apply Nova Crew distinctive theme tokens via service-role REST.
// Writes theme_json + theme_json_draft, bumps version, inserts a published
// revision so /admin/site-settings/design reflects it.
//
// Used once while the design editor hydration bug is being fixed — in
// normal operation these writes go through publishDesignAction + revalidateTag.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const envPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "web",
  ".env.local",
);
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      if (i < 0) return null;
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
    })
    .filter(Boolean),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const NOVA_TENANT = "33333333-3333-3333-3333-333333333333";

const THEME = {
  "color.primary": "#a855f7",
  "color.secondary": "#2a1855",
  "color.accent": "#22d3ee",
  "color.neutral": "#e2e8f0",
  "color.background": "#1a0d36",
  "typography.heading-preset": "serif-display",
  "typography.body-preset": "sans",
  "radius.base": "lg",
  "spacing.scale": "cozy",
};

const headers = {
  apikey: service,
  Authorization: `Bearer ${service}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

const readRes = await fetch(
  `${url}/rest/v1/agency_branding?tenant_id=eq.${NOVA_TENANT}&select=version,theme_json,theme_json_draft`,
  { headers },
);
if (!readRes.ok) {
  console.error("read failed", readRes.status, await readRes.text());
  process.exit(1);
}
const [row] = await readRes.json();
if (!row) {
  console.error("No agency_branding row for", NOVA_TENANT);
  process.exit(1);
}

const nextVersion = row.version + 1;
const publishedAt = new Date().toISOString();

const updRes = await fetch(
  `${url}/rest/v1/agency_branding?tenant_id=eq.${NOVA_TENANT}&version=eq.${row.version}`,
  {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      theme_json: THEME,
      theme_json_draft: THEME,
      theme_published_at: publishedAt,
      version: nextVersion,
    }),
  },
);
if (!updRes.ok) {
  console.error("update failed", updRes.status, await updRes.text());
  process.exit(1);
}

const revRes = await fetch(`${url}/rest/v1/agency_branding_revisions`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    tenant_id: NOVA_TENANT,
    version: nextVersion,
    kind: "published",
    snapshot: { theme_json: THEME },
  }),
});
if (!revRes.ok) {
  console.error("revision insert failed", revRes.status, await revRes.text());
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, version: nextVersion, theme: THEME }, null, 2));
