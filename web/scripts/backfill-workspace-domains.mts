/**
 * backfill-workspace-domains.mts (TUL-374): register `<slug>.tulala.digital` in
 * agency_domains for business workspaces created before onboarding did it.
 *
 * GUARDED, run by the PM (never by an agent against production):
 *   cd web
 *   tsx --env-file=.env.local scripts/backfill-workspace-domains.mts              # DRY RUN (default): prints the plan, writes nothing
 *   tsx --env-file=.env.local scripts/backfill-workspace-domains.mts --apply      # insert, writes a backup file first
 *   tsx --env-file=.env.local scripts/backfill-workspace-domains.mts --restore <backup.json>   # delete exactly the rows this run inserted
 *
 * Idempotent (rows that exist are skipped), additive only (INSERT; never updates
 * or deletes a row it did not insert), and --restore removes only the ids the
 * backup lists. Uses the same ensureWorkspaceSubdomainRow as provisioning, so
 * is_primary is set only when the tenant has no primary row.
 *
 * ENV: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { ensureWorkspaceSubdomainRow } from "../src/lib/saas/ensure-workspace-domain";
import { planWorkspaceDomainBackfill, type BackfillAgency, type BackfillDomainRow } from "../src/lib/saas/workspace-domain-backfill";

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

async function restore(file: string): Promise<void> {
  const backup = JSON.parse(readFileSync(resolve(file), "utf8")) as { inserted: { id: string; hostname: string }[] };
  for (const row of backup.inserted) {
    const { error } = await admin.from("agency_domains").delete().eq("id", row.id).eq("hostname", row.hostname);
    console.log(error ? `FAILED ${row.hostname}: ${error.message}` : `removed ${row.hostname}`);
  }
}

async function main(): Promise<void> {
  if (restoreIdx >= 0) {
    const file = argv[restoreIdx + 1];
    if (!file) throw new Error("--restore needs the backup file path");
    await restore(file);
    return;
  }
  const { data: agencies, error: aErr } = await admin.from("agencies").select("id, slug, status, workspace_type").eq("workspace_type", "business");
  if (aErr) throw aErr;
  const { data: domains, error: dErr } = await admin.from("agency_domains").select("tenant_id, hostname");
  if (dErr) throw dErr;
  const { plan, skipped } = planWorkspaceDomainBackfill(agencies as BackfillAgency[], (domains ?? []) as BackfillDomainRow[]);
  console.log(`business workspaces: ${agencies?.length ?? 0}; to register: ${plan.length}; skipped: ${skipped.length}`);
  for (const s of skipped) console.log(`  skip ${s.slug ?? s.tenantId}: ${s.reason}`);
  for (const p of plan) console.log(`  ${APPLY ? "register" : "would register"} ${p.hostname} (tenant ${p.tenantId})`);
  if (!APPLY) {
    console.log("DRY RUN: nothing written. Re-run with --apply.");
    return;
  }
  const inserted: { id: string; hostname: string; tenantId: string }[] = [];
  const backupPath = resolve(`.tmp/workspace-domains-backfill-${Date.now()}.json`);
  mkdirSync(dirname(backupPath), { recursive: true });
  // Backup first (the plan), then the inserted ids after each write, so a crash keeps what was done.
  const save = () => writeFileSync(backupPath, JSON.stringify({ plan, inserted }, null, 2));
  save();
  for (const p of plan) {
    const r = await ensureWorkspaceSubdomainRow(admin, { tenantId: p.tenantId, slug: p.slug });
    if (!r.ok) {
      console.log(`  FAILED ${p.hostname}: ${r.error}`);
      continue;
    }
    if (r.created) {
      const { data } = await admin.from("agency_domains").select("id").eq("hostname", p.hostname).maybeSingle();
      if (data) inserted.push({ id: (data as { id: string }).id, hostname: p.hostname, tenantId: p.tenantId });
      save();
    }
  }
  console.log(`done: ${inserted.length} row(s) inserted. Backup: ${backupPath} (undo: --restore ${backupPath})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
