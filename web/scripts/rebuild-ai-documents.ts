/**
 * Backfill `talent_profiles.ai_search_document` for approved public profiles.
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Run from `web/`: npx tsx scripts/rebuild-ai-documents.ts [--limit=500]
 *
 * Then run: node --env-file=.env.local scripts/embed-talents.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { rebuildAiSearchDocument } from "../src/lib/ai/rebuild-ai-search-document";

function argLimit(): number {
  const raw = process.argv.find((a) => a.startsWith("--limit="));
  if (!raw) return 2000;
  const n = Number(raw.split("=")[1]);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 20000) : 2000;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const skey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !skey) {
    console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const limit = argLimit();
  const supabase = createClient(url, skey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: rows, error } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("workflow_status", "approved")
    .eq("visibility", "public")
    .is("deleted_at", null)
    .limit(limit);

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  let ok = 0;
  let failed = 0;
  for (const row of rows ?? []) {
    const { error: e } = await rebuildAiSearchDocument(supabase, row.id);
    if (e) {
      failed++;
      console.warn(row.id, e);
    } else {
      ok++;
    }
  }
  console.log(`rebuild-ai-documents: ok=${ok} failed=${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
