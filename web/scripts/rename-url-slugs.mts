/**
 * rename-url-slugs.mts: give workspaces whose slug is URL soup a clean slug.
 *   "https-www-airstriplasvegas-com" -> "airstriplasvegas"
 *   "https-www-instagram-com-thebarbe" -> "thebarbe" (flagged: the handle may be cut off, check it)
 *
 * GUARDED, run by the PM (never by an agent against production):
 *   cd web
 *   tsx --env-file=.env.local scripts/rename-url-slugs.mts                        # DRY RUN (default): prints the plan, writes nothing
 *   tsx --env-file=.env.local scripts/rename-url-slugs.mts --only <tenant-id|old-slug>[,...]
 *   tsx --env-file=.env.local scripts/rename-url-slugs.mts --apply [--only ...]    # writes a backup file first
 *   tsx --env-file=.env.local scripts/rename-url-slugs.mts --restore <backup.json> # puts the old slug/hostname back
 *
 * What changes per tenant: agencies.slug and that tenant's platform subdomain row in
 * agency_domains (`<old>.tulala.digital` -> `<new>.tulala.digital`). The old address stops
 * resolving (no redirect is created), so only run it for tenants nobody has linked to.
 * The new slug is checked against every existing slug and the reserved list.
 *
 * ENV: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { workspaceSubdomainHostname } from "../src/lib/saas/ensure-workspace-domain";
import { planSlugRenames, type RenameAgency } from "../src/lib/saas/workspace-slug-rename";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } }) as SupabaseClient;
const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const restoreIdx = argv.indexOf("--restore");
const onlyIdx = argv.indexOf("--only");
const ONLY = onlyIdx >= 0 ? new Set((argv[onlyIdx + 1] ?? "").split(",").map((v) => v.trim().toLowerCase()).filter(Boolean)) : null;
if (onlyIdx >= 0 && (!ONLY || ONLY.size === 0)) {
  console.error("--only needs a comma list of tenant ids or old slugs");
  process.exit(1);
}

type Done = { tenantId: string; from: string; to: string; domainId: string | null };

async function restore(file: string): Promise<void> {
  const backup = JSON.parse(readFileSync(resolve(file), "utf8")) as { done: Done[] };
  for (const d of backup.done) {
    const a = await admin.from("agencies").update({ slug: d.from }).eq("id", d.tenantId).eq("slug", d.to);
    if (d.domainId) {
      await admin.from("agency_domains").update({ hostname: workspaceSubdomainHostname(d.from) }).eq("id", d.domainId);
    }
    console.log(a.error ? `FAILED ${d.to}: ${a.error.message}` : `restored ${d.to} -> ${d.from}`);
  }
}

async function main(): Promise<void> {
  if (restoreIdx >= 0) {
    const file = argv[restoreIdx + 1];
    if (!file) throw new Error("--restore needs the backup file path");
    await restore(file);
    return;
  }
  const { data: all, error } = await admin.from("agencies").select("id, slug, status");
  if (error) throw error;
  const rows = (all ?? []) as RenameAgency[];
  const taken = new Set(rows.map((r) => (r.slug ?? "").toLowerCase()).filter(Boolean));
  const { plan: full, skipped } = planSlugRenames(rows, taken);
  const plan = ONLY ? full.filter((p) => ONLY.has(p.tenantId.toLowerCase()) || ONLY.has(p.from.toLowerCase())) : full;
  console.log(`url-soup slugs to rename: ${plan.length}; cannot derive: ${skipped.length}`);
  for (const s of skipped) console.log(`  skip ${s.slug}: ${s.reason}`);
  for (const p of plan) console.log(`  ${APPLY ? "rename" : "would rename"} ${p.from} -> ${p.to}${p.truncatedHandle ? "   (CHECK: handle may be cut off)" : ""}`);
  if (!APPLY) {
    console.log("DRY RUN: nothing written. Re-run with --apply (optionally --only).");
    return;
  }
  const done: Done[] = [];
  const backupPath = resolve(`.tmp/rename-url-slugs-${Date.now()}.json`);
  mkdirSync(dirname(backupPath), { recursive: true });
  const save = () => writeFileSync(backupPath, JSON.stringify({ plan, done }, null, 2));
  save();
  for (const p of plan) {
    const { data: dom } = await admin.from("agency_domains").select("id").eq("tenant_id", p.tenantId).eq("hostname", workspaceSubdomainHostname(p.from)).maybeSingle();
    const upd = await admin.from("agencies").update({ slug: p.to }).eq("id", p.tenantId).eq("slug", p.from);
    if (upd.error) {
      console.log(`  FAILED ${p.from}: ${upd.error.message}`);
      continue;
    }
    const domainId = (dom as { id: string } | null)?.id ?? null;
    if (domainId) {
      const d = await admin.from("agency_domains").update({ hostname: workspaceSubdomainHostname(p.to) }).eq("id", domainId);
      if (d.error) console.log(`  domain row for ${p.to} failed: ${d.error.message} (slug already renamed; use --restore to undo)`);
    }
    done.push({ tenantId: p.tenantId, from: p.from, to: p.to, domainId });
    save();
  }
  console.log(`done: ${done.length} renamed. Backup: ${backupPath} (undo: --restore ${backupPath})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
