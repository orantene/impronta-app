/**
 * Re-sync the built-in talent Designs + Looks into `talent_theme_catalog`
 * (catalog rows only; no talent, site or page is touched). Run after any
 * design or look payload change, otherwise the stored row wins over the code.
 *
 * Run (from web/):
 *   NODE_PATH=scripts/demo-talents/stubs DEMO_SEED_TARGET_REF=<ref> \
 *     npx tsx --tsconfig scripts/demo-talents/tsconfig.json --env-file=<env> \
 *     scripts/demo-talents/sync-catalog.mts
 */
import { createClient } from "@supabase/supabase-js";
import { syncBuiltinTalentThemes } from "../../src/lib/talent-site/theme-catalog/sync-builtins.server";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const targetRef = process.env.DEMO_SEED_TARGET_REF?.trim();
if (!targetRef || !url.includes(`${targetRef}.supabase.co`)) {
  throw new Error(`REFUSE: DEMO_SEED_TARGET_REF (${targetRef}) does not match ${url}`);
}
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const result = await syncBuiltinTalentThemes(admin, null);
console.log(JSON.stringify(result, null, 2));
