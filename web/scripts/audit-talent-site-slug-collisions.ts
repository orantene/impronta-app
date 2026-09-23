/**
 * audit-talent-site-slug-collisions.ts — READ-ONLY audit of the shared subdomain
 * namespace, run before validating the `talent_sites_site_slug_dns_label` CHECK.
 *
 * `20261231280000_talent_site_subdomains.sql` adds that constraint NOT VALID
 * because existing `talent_sites.site_slug` values predate it: they were emitted
 * by `slugifySiteName` for a URL PATH (`/t/site/<slug>`), where anything URL-safe
 * was fine, and they were only ever unique among themselves. As a HOSTNAME label
 * they must additionally be a DNS label and must not collide with an agency slug,
 * an agency subdomain host, or a reserved platform label.
 *
 * This script lists every offender so they can be renamed by hand; once it
 * reports clean, a follow-up migration can run
 * `ALTER TABLE public.talent_sites VALIDATE CONSTRAINT talent_sites_site_slug_dns_label`.
 *
 * WRITES NOTHING. Exit code 0 = clean, 1 = findings (or a refused target).
 *
 * LOCAL SUPABASE ONLY. The script reads with the service-role key, so pointing it
 * at a shared project would mean handing a local shell full-table read on
 * production data for a report nobody asked production for. The target host must
 * be loopback; anything else is refused before a client is even constructed.
 *
 * Run from web/:
 *   tsx --env-file=.env.local scripts/audit-talent-site-slug-collisions.ts
 *
 * ENV REQUIRED:
 *   NEXT_PUBLIC_SUPABASE_URL   — must be a local (loopback) Supabase URL
 *   SUPABASE_SERVICE_ROLE_KEY  — local service-role key
 */
import { createClient } from "@supabase/supabase-js";

import { isDnsLabel } from "../src/lib/talent-site/server/derive-site-slug";

/** Loopback hosts a local `supabase start` binds. Nothing else is accepted. */
const LOCAL_SUPABASE_HOSTS = new Set([
  "127.0.0.1",
  "localhost",
  "0.0.0.0",
  "[::1]",
  "::1",
  "host.docker.internal",
  "kong",
]);

/**
 * Reserved platform labels — kept in step with the array inside
 * `platform_subdomain_label_taken`. Duplicated here on purpose: the audit must
 * run against a database that has not applied the migration yet.
 */
const RESERVED_LABELS = new Set([
  "www", "api", "app", "admin", "dashboard", "hub", "auth", "login", "logout",
  "signin", "signup", "register", "account", "billing", "checkout", "support",
  "help", "docs", "status", "mail", "email", "smtp", "ftp", "ns", "ns1", "ns2",
  "cdn", "assets", "static", "media", "files", "uploads", "img", "images",
  "blog", "press", "jobs", "careers", "about", "legal", "privacy", "terms",
  "security", "marketing", "directory", "discover", "search", "t", "w", "c",
  "p", "preview", "staging", "stage", "dev", "test", "beta", "alpha", "demo",
  "example", "internal", "platform", "sandbox", "edge",
]);

function assertLocalTarget(rawUrl: string): void {
  let host: string;
  try {
    host = new URL(rawUrl).hostname;
  } catch {
    console.error(`Refusing to run: NEXT_PUBLIC_SUPABASE_URL is not a URL (${rawUrl}).`);
    process.exit(1);
  }
  if (!LOCAL_SUPABASE_HOSTS.has(host)) {
    console.error(
      `Refusing to run against a non-local Supabase target (${host}).\n` +
        "This audit is read-only but uses the service-role key; point it at a local\n" +
        "`supabase start` instance (NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321).",
    );
    process.exit(1);
  }
}

type Finding = { slug: string; talentProfileId: string; reason: string };

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svcKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (web/.env.local)",
    );
    process.exit(1);
  }
  assertLocalTarget(url);

  const supabase = createClient(url, svcKey, { auth: { persistSession: false } });

  const [sites, agencies, domains] = await Promise.all([
    supabase
      .from("talent_sites")
      .select("talent_profile_id, site_slug")
      .not("site_slug", "is", null),
    supabase.from("agencies").select("id, slug"),
    supabase.from("agency_domains").select("tenant_id, hostname, kind").eq("kind", "subdomain"),
  ]);

  for (const [label, res] of [
    ["talent_sites", sites],
    ["agencies", agencies],
    ["agency_domains", domains],
  ] as const) {
    if (res.error) {
      console.error(`Failed to read ${label}: ${res.error.message}`);
      process.exit(1);
    }
  }

  const agencySlugs = new Map<string, string>();
  for (const row of (agencies.data ?? []) as Array<{ id: string; slug: string | null }>) {
    const slug = (row.slug ?? "").trim().toLowerCase();
    if (slug) agencySlugs.set(slug, row.id);
  }

  const domainLabels = new Map<string, string>();
  for (const row of (domains.data ?? []) as Array<{ hostname: string | null }>) {
    const host = (row.hostname ?? "").trim().toLowerCase();
    const label = host.split(".")[0] ?? "";
    if (label) domainLabels.set(label, host);
  }

  const findings: Finding[] = [];
  const seen = new Map<string, string>();

  for (const row of (sites.data ?? []) as Array<{
    talent_profile_id: string;
    site_slug: string | null;
  }>) {
    const raw = row.site_slug ?? "";
    const slug = raw.trim();
    const lower = slug.toLowerCase();

    if (!isDnsLabel(slug)) {
      findings.push({
        slug: raw,
        talentProfileId: row.talent_profile_id,
        reason: "not a DNS label (would fail the CHECK once validated)",
      });
    }
    if (RESERVED_LABELS.has(lower)) {
      findings.push({
        slug: raw,
        talentProfileId: row.talent_profile_id,
        reason: "reserved platform label",
      });
    }
    if (agencySlugs.has(lower)) {
      findings.push({
        slug: raw,
        talentProfileId: row.talent_profile_id,
        reason: `collides with agencies.slug (tenant ${agencySlugs.get(lower)})`,
      });
    }
    if (domainLabels.has(lower)) {
      findings.push({
        slug: raw,
        talentProfileId: row.talent_profile_id,
        reason: `collides with agency host ${domainLabels.get(lower)}`,
      });
    }
    const other = seen.get(lower);
    if (other) {
      findings.push({
        slug: raw,
        talentProfileId: row.talent_profile_id,
        reason: `case-insensitive duplicate of the slug held by talent ${other}`,
      });
    } else {
      seen.set(lower, row.talent_profile_id);
    }
  }

  const total = (sites.data ?? []).length;
  if (findings.length === 0) {
    console.log(
      `Clean: ${total} talent site slug(s) are DNS labels with no namespace collision.\n` +
        "Safe to VALIDATE CONSTRAINT talent_sites_site_slug_dns_label in a follow-up migration.",
    );
    return;
  }

  console.log(`${findings.length} finding(s) across ${total} talent site slug(s):\n`);
  for (const f of findings) {
    console.log(`  ${f.slug || "(blank)"}  [talent ${f.talentProfileId}]  ${f.reason}`);
  }
  console.log(
    "\nRename the listed slugs (setMaxSiteSlugAction, or a direct update) and re-run.",
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
