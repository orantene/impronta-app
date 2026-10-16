/**
 * TUL-75 · back-fill plan, step 1: a READ-ONLY report of accounts created before the three onboarding
 * choices, grouped by shape (src/lib/onboarding/single-role-report.ts). It writes nothing and has no
 * apply mode; an approved back-fill is a separate change that reuses the writer each shape names.
 * Output is counts plus profile codes / workspace id prefixes only (no names, no contact details).
 *
 * Usage (env must hold NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY of the target):
 *   cd web && npx tsx --tsconfig tsconfig.json scripts/onboarding-single-role-dry-run.mts [--production] [--samples=10]
 *
 * --production is required for anything that is not the isolated project (fxlankepwnvelxjrahwk).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { SHAPE_FIX, classifySingleRole, type SingleRoleShape } from "../src/lib/onboarding/single-role-report";

const ISOLATED_REF = "fxlankepwnvelxjrahwk";
const argv = process.argv.slice(2);
const PRODUCTION = argv.includes("--production");
const SAMPLES = Math.max(0, Number(argv.find((a) => a.startsWith("--samples="))?.slice(10) ?? 10) || 0);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
const isolated = url.includes(ISOLATED_REF);
if (!isolated && !PRODUCTION) throw new Error(`REFUSED: ${new URL(url).host} is not the isolated project. Pass --production to report on it deliberately.`);

const admin = createClient(url, key, { auth: { persistSession: false } });
console.log(`target: ${new URL(url).host} (${isolated ? "ISOLATED" : "PRODUCTION"}) · mode: READ-ONLY REPORT`);

type Page = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
async function readAll<T>(table: string, page: (from: number, to: number) => Page): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

const db: SupabaseClient = admin;
type Profile = { id: string; user_id: string | null; profile_code: string | null; is_demo: boolean | null };
const profiles = await readAll<Profile>("talent_profiles", (a, b) =>
  db.from("talent_profiles").select("id, user_id, profile_code, is_demo").is("deleted_at", null).not("user_id", "is", null).order("id").range(a, b),
);
const sites = await readAll<{ talent_profile_id: string; site_published_at: string | null }>("talent_sites", (a, b) =>
  db.from("talent_sites").select("talent_profile_id, site_published_at").order("talent_profile_id").range(a, b),
);
const owners = await readAll<{ profile_id: string; tenant_id: string }>("agency_memberships", (a, b) =>
  db.from("agency_memberships").select("profile_id, tenant_id").eq("role", "owner").eq("status", "active").order("id").range(a, b),
);
const roster = await readAll<{ tenant_id: string; talent_profile_id: string }>("agency_talent_roster", (a, b) =>
  db.from("agency_talent_roster").select("tenant_id, talent_profile_id").eq("status", "active").order("id").range(a, b),
);

const published = new Set(sites.filter((s) => s.site_published_at).map((s) => s.talent_profile_id));
const profileByUser = new Map(profiles.map((p) => [p.user_id as string, p]));
const ownedByUser = new Map<string, string[]>();
for (const o of owners) ownedByUser.set(o.profile_id, [...(ownedByUser.get(o.profile_id) ?? []), o.tenant_id]);
const rosterByProfile = new Map<string, string[]>();
for (const r of roster) rosterByProfile.set(r.talent_profile_id, [...(rosterByProfile.get(r.talent_profile_id) ?? []), r.tenant_id]);

const users = new Set<string>([...profileByUser.keys(), ...ownedByUser.keys()]);
const byShape = new Map<SingleRoleShape, string[]>();
for (const userId of users) {
  const p = profileByUser.get(userId) ?? null;
  const owned = ownedByUser.get(userId) ?? [];
  const shape = classifySingleRole({
    talentProfileId: p?.id ?? null,
    profileCode: p?.profile_code ?? null,
    isDemo: Boolean(p?.is_demo),
    ownSitePublished: p ? published.has(p.id) : false,
    ownedTenantIds: owned,
    selfRosterTenantIds: p ? rosterByProfile.get(p.id) ?? [] : [],
  });
  const label = p?.profile_code ?? `workspace ${owned.map((t) => t.slice(0, 8)).join(",")}`;
  byShape.set(shape, [...(byShape.get(shape) ?? []), label]);
}

console.log(`accounts: ${users.size}`);
for (const shape of Object.keys(SHAPE_FIX) as SingleRoleShape[]) {
  const rows = byShape.get(shape) ?? [];
  console.log(`\n${shape}: ${rows.length}  · fix: ${SHAPE_FIX[shape]}`);
  if (shape !== "complete" && shape !== "excluded") for (const r of rows.slice(0, SAMPLES)) console.log(`  ${r}`);
}
