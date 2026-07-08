/**
 * Prepare the improved Impronta home builderTree to /tmp/impronta-tree.json so
 * the existing seed script (scripts/seed-impronta-homepage.mts) can publish it.
 *
 * Reads the CURRENT live published tree from Supabase (read-only), applies the
 * surgical edits, self-verifies (exactly one hero change, node count preserved),
 * and writes ONLY the temp file + a durable backup. Writes NOTHING to the DB.
 *
 * Edit applied:
 *   1. Hero carousel `heightMode` "fixed" -> "large" — the CSS then resolves the
 *      hero to a full-bleed 78svh cinematic fold instead of a 600px band
 *      (see render.tsx: `--bn-hero-min-h` is only pinned when heightMode==="fixed";
 *      "large" falls back to 78svh). One property; nothing else changes.
 *
 * Two-step supervised apply (the publish needs your approval — it writes prod):
 *   npx tsx --env-file=.env.local scripts/marathon-prep-home-tree.mts   # read + prep (safe)
 *   npx tsx --env-file=.env.local scripts/seed-impronta-homepage.mts     # publish (prod write)
 *
 * Rollback: the seed script backs the previous snapshot up to
 *   /tmp/impronta-pub-backup.json; write its `.builderTree` back to publish it.
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — run with --env-file=.env.local");
}
const PAGE = "90552cf6-2230-4a40-8320-c2e303e3ee56";
const OUT = "/tmp/impronta-tree.json";
const BACKUP = "/tmp/impronta-home-tree-prebackup.json";

const sb = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await sb
  .from("cms_pages")
  .select("published_homepage_snapshot")
  .eq("id", PAGE)
  .single();
if (error) throw error;

const snap = (data?.published_homepage_snapshot ?? {}) as Record<string, unknown>;
writeFileSync(BACKUP, JSON.stringify(snap, null, 2));
const tree = (snap.builderTree ?? []) as unknown[];

let nodeCount = 0;
let heroChanged = 0;
function walk(node: unknown) {
  if (!node || typeof node !== "object") return;
  const n = node as Record<string, unknown>;
  nodeCount++;
  const kind = n.kind ?? n.type;
  const props = (n.props ?? {}) as Record<string, unknown>;
  if (kind === "carousel" && props.variant === "hero" && props.heightMode === "fixed") {
    props.heightMode = "large";
    heroChanged++;
  }
  const children = (n.children ?? props.children ?? []) as unknown[];
  if (Array.isArray(children)) for (const c of children) walk(c);
}
for (const root of tree) walk(root);

if (heroChanged !== 1) {
  throw new Error(`ABORT: expected exactly 1 hero heightMode change, got ${heroChanged} (already applied, or hero shape changed).`);
}

writeFileSync(OUT, JSON.stringify(tree));
console.log(`OK: wrote ${OUT} | roots=${tree.length} nodes=${nodeCount} heroChanged=${heroChanged}`);
console.log(`Backup of the current live snapshot: ${BACKUP}`);
console.log(`Next (prod write, your approval): npx tsx --env-file=.env.local scripts/seed-impronta-homepage.mts`);
