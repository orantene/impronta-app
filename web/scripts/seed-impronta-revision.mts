/**
 * Seed the Impronta homepage editor's draft builderTree. The staff editor loads
 * builderTree from the cms_page_revisions row whose `version` matches
 * cms_pages.version. Set that revision's snapshot.builderTree to the baked
 * impronta tree (/tmp/impronta-tree.json) and empty its composition/slots.
 *
 *   npx tsx --env-file=.env.local scripts/seed-impronta-revision.mts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PAGE = "90552cf6-2230-4a40-8320-c2e303e3ee56";

const tree = JSON.parse(readFileSync("/tmp/impronta-tree.json", "utf8"));
const sb = createClient(url, key, { auth: { persistSession: false } });

const { data: page, error: pErr } = await sb
  .from("cms_pages")
  .select("version")
  .eq("id", PAGE)
  .single();
if (pErr) throw pErr;
const version = page!.version as number;

const { data: rev, error: rErr } = await sb
  .from("cms_page_revisions")
  .select("id, snapshot")
  .eq("page_id", PAGE)
  .eq("version", version)
  .order("created_at", { ascending: false })
  .limit(1)
  .single();
if (rErr) throw rErr;

const snap = (rev!.snapshot ?? {}) as Record<string, unknown>;
const next = { ...snap, builderTree: tree, composition: [], slots: [] };
const { error: upErr } = await sb
  .from("cms_page_revisions")
  .update({ snapshot: next })
  .eq("id", rev!.id);
if (upErr) throw upErr;

console.log(`UPDATED revision ${rev!.id} (version ${version}) → builderTree roots ${tree.length}`);
