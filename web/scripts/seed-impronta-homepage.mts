/**
 * Seed the Impronta homepage's freeform builderTree from the baked impronta
 * design (/tmp/impronta-tree.json). Writes to published_homepage_snapshot
 * (the editor's draft-init source when there are no draft sections, and the
 * public render source). Backs up the previous snapshot first.
 *
 *   npx tsx --env-file=.env.local scripts/seed-impronta-homepage.mts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PAGE = "90552cf6-2230-4a40-8320-c2e303e3ee56";

const tree = JSON.parse(readFileSync("/tmp/impronta-tree.json", "utf8"));
const sb = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await sb
  .from("cms_pages")
  .select("published_homepage_snapshot")
  .eq("id", PAGE)
  .single();
if (error) throw error;

const snap = (data?.published_homepage_snapshot ?? {}) as Record<string, unknown>;
writeFileSync("/tmp/impronta-pub-backup.json", JSON.stringify(snap));

const next = { ...snap, builderTree: tree, composition: [], slots: [] };
const { error: upErr } = await sb
  .from("cms_pages")
  .update({ published_homepage_snapshot: next })
  .eq("id", PAGE);
if (upErr) throw upErr;

console.log("WROTE builderTree roots:", tree.length, "| snapshot keys:", Object.keys(next).length);
