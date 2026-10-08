/**
 * TUL-369 — dry-run inventory of stored trees with an English seed base and
 * no `props.i18n.es` for that leaf. Never writes.
 *
 *   NODE_PATH=scripts/demo-talents/stubs \
 *   NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *   npx tsx --tsconfig scripts/demo-talents/tsconfig.json --env-file=<env> \
 *     scripts/heal-seed-i18n-missing-es.mts
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (+ matching
 * DEMO_SEED_TARGET_REF). Heal via `npm run qa:release-theme-i18n` (copy
 * release), not this script.
 */
import { createClient } from "@supabase/supabase-js";

import {
  collectMissingLeaves,
  formatHealSummary,
  summarize,
  type MissingLeaf,
} from "./heal-seed-i18n-missing-es-plan";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const targetRef = process.env.DEMO_SEED_TARGET_REF?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!targetRef || !url.includes(`${targetRef}.supabase.co`) || !key) {
  console.error(
    "REFUSED: set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and a matching DEMO_SEED_TARGET_REF.",
  );
  process.exit(2);
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const missing: MissingLeaf[] = [];

const { data: sites, error: siteErr } = await admin
  .from("talent_sites")
  .select("id, talent_profile_id, shell_tree, shell_published");
if (siteErr) {
  console.error(`read talent_sites: ${siteErr.message}`);
  process.exit(1);
}
for (const row of sites ?? []) {
  const profileId = String(row.talent_profile_id);
  collectMissingLeaves(row.shell_tree, { treeId: `shell:${row.id}`, profileId, treeName: "shell_tree" }, missing);
  collectMissingLeaves(
    row.shell_published,
    { treeId: `shellpub:${row.id}`, profileId, treeName: "shell_published" },
    missing,
  );
}

const { data: pages, error: pageErr } = await admin
  .from("talent_pages")
  .select("id, talent_profile_id, blocks, blocks_published");
if (pageErr) {
  console.error(`read talent_pages: ${pageErr.message}`);
  process.exit(1);
}
for (const row of pages ?? []) {
  const profileId = String(row.talent_profile_id);
  collectMissingLeaves(row.blocks, { treeId: `blocks:${row.id}`, profileId, treeName: "blocks" }, missing);
  collectMissingLeaves(
    row.blocks_published,
    { treeId: `blockspub:${row.id}`, profileId, treeName: "blocks_published" },
    missing,
  );
}

const inv = summarize(missing);
const when = new Date().toISOString().slice(0, 10);
console.log(formatHealSummary(inv, when));
process.exit(0);
