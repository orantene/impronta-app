// SUPERSEDED by `npm run demos:rebuild` (scripts/demo-talents/rebuild.mjs): one command, backup + restore, dry run by default.
console.error("[demo-talents] superseded: use `npm run demos:rebuild` (dry run by default, --write to apply).");
/**
 * Give the Maison v2 demo talents their hero facts (release 2.7): a headline, a
 * tagline, years of craft, languages and an Instagram, written to the PROFILE
 * fields the website reads at render time (see hero-facts.ts for the list and the
 * rules). Nothing is written to a site: the demos' hero and footer follow the profile.
 *
 * Needs migration 20261231299620 (the `identity.headline` field definition).
 * Dry run by default (prints what would be written); pass --yes-write to write.
 *
 * Run (from web/):
 *   NODE_PATH=scripts/demo-talents/stubs DEMO_SEED_TARGET_REF=<ref> \
 *     npx tsx --tsconfig scripts/demo-talents/tsconfig.json --env-file=.env.local \
 *     scripts/demo-talents/apply-hero-facts.mts [--only TAL-93020,TAL-93103] [--yes-write]
 */
import { createClient } from "@supabase/supabase-js";

import { applyHeroFacts, HERO_FACTS } from "./hero-facts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const targetRef = process.env.DEMO_SEED_TARGET_REF?.trim();
if (!targetRef || !url.includes(`${targetRef}.supabase.co`)) {
  throw new Error(`REFUSE: DEMO_SEED_TARGET_REF (${targetRef}) does not match ${url}`);
}
const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const write = args.includes("--yes-write");
const only = opt("--only")?.split(",");

const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// The platform hub differs per project; resolve it the way seed.mts does.
const { data: hubs, error: hubErr } = await admin
  .from("agencies")
  .select("id")
  .eq("kind", "hub")
  .eq("plan_tier", "network")
  .eq("status", "active");
if (hubErr) throw hubErr;
if (hubs?.length !== 1) throw new Error(`expected exactly one active hub, found ${hubs?.length ?? 0}`);
const hubTenantId = hubs[0]!.id as string;

for (const profileCode of Object.keys(HERO_FACTS).filter((c) => !only || only.includes(c))) {
  const res = await applyHeroFacts(admin, { profileCode, hubTenantId, write });
  console.log(res ? `${res.profileCode}: ${res.wrote.length ? res.wrote.join(", ") : "already complete"}` : `${profileCode}: not found`);
}
console.log(write ? "done" : "dry run done (pass --yes-write to apply)");
