import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bustTalentSiteCache } from "@/lib/talent-site/cache-tags";
import { ensureGuideServices, publishDemoSite } from "@/lib/talent-site/server/demo-pipeline.server";
import { applyContentFixture, defaultFixtureFor } from "./content-fixture.server";
import { loadContentSnapshot, restoreContentSnapshot } from "./content-state.server";
import type { ContentSnapshot } from "./content-restore";
import {
  loadDemoRows,
  planDemoDesign,
  writeDemoDraft,
  type DemoPlan,
  type DemoRows,
  type DemoSpec,
} from "./design-step.server";
import { assertDemoTarget, type DemoTarget } from "./guard.server";
import { demosFor, findDemo } from "./registry";
import { stableJson } from "./stable";
import type {
  DemoDesign,
  DemoRebuildRequest,
  DemoRebuildResult,
  DemoRebuildRow,
  DemoRegistryEntry,
  DemoStepId,
} from "./types";

/**
 * ONE-COMMAND DEMO REBUILD (Template Factory goal #6).
 *
 * Per demo, in order: guard (assertDemoTarget) -> snapshot -> content (hero
 * facts, location, guide services) -> design (newest released version, demos
 * channel included) -> publish -> cache bust. A stable-JSON compare against the
 * current rows runs first: an identical rerun reports `unchanged` and writes
 * NOTHING, not even a backup row. A dry run (the default) never writes.
 * Before the first write the snapshot lands in `demo_rebuild_runs`; one demo
 * failing marks only that row failed and the run continues.
 */

type Admin = SupabaseClient;

/** Everything the orchestrator touches besides the database client, injectable for tests. */
export interface RebuildPorts {
  assertTarget(admin: Admin, code: string): Promise<DemoTarget>;
  loadRows(admin: Admin, code: string): Promise<DemoRows>;
  plan(admin: Admin, spec: DemoSpec, rows: DemoRows): Promise<DemoPlan>;
  /** Content steps; `write: false` only reports what would change. */
  content(admin: Admin, entry: DemoRegistryEntry, talentProfileId: string, write: boolean): Promise<DemoStepId[]>;
  /** Rows the content step can change, for the backup. Absent = no content snapshot. */
  snapshotContent?(admin: Admin, talentProfileId: string): Promise<ContentSnapshot>;
  writeDraft(admin: Admin, spec: DemoSpec, rows: DemoRows, plan: DemoPlan): Promise<void>;
  publish(admin: Admin, rows: DemoRows): Promise<void>;
  bust(talentProfileId: string, profileCode: string): void;
}

export const DEFAULT_PORTS: RebuildPorts = {
  assertTarget: assertDemoTarget,
  loadRows: loadDemoRows,
  plan: planDemoDesign,
  async content(admin, entry, talentProfileId, write) {
    const res = await applyContentFixture(admin, entry, defaultFixtureFor(entry), { write });
    const changed = [...res.changed];
    const note = await ensureGuideServices({ admin, write, stamp: "rebuild" }, entry.profileCode, talentProfileId);
    if (note && !changed.includes("content")) changed.push("content");
    return changed;
  },
  async snapshotContent(admin, talentProfileId) {
    return (await loadContentSnapshot(admin, talentProfileId)).snapshot;
  },
  writeDraft: writeDemoDraft,
  async publish(admin, rows) {
    await publishDemoSite(
      admin,
      { siteId: rows.site.id, talentProfileId: rows.tp.id, profileCode: rows.tp.profile_code, userId: rows.tp.user_id },
      { skipHttpBust: true },
    );
  },
  bust(talentProfileId, profileCode) {
    try {
      bustTalentSiteCache(talentProfileId, profileCode);
    } catch {
      // Outside a Next request scope revalidation is unavailable; the data is saved.
    }
  },
};

/** What a backup row holds: the rows a rebuild can change. */
export interface DemoSnapshot {
  talent_sites: Record<string, unknown>;
  talent_pages: Array<Record<string, unknown>>;
  /** Offerings, FAQ, field values, languages, location and profile columns the content step can change. */
  content?: ContentSnapshot;
}

export function snapshotOf(rows: DemoRows): DemoSnapshot {
  return { talent_sites: rows.site, talent_pages: rows.pages };
}

/** PURE: short hash of what the demo's site should be after the rebuild. */
export function afterHash(plan: Pick<DemoPlan, "trees" | "nextTokens" | "nextCustom">): string {
  return createHash("sha256")
    .update(stableJson({ s: plan.trees.shellTree, h: plan.trees.homeTree, t: plan.nextTokens, c: plan.nextCustom }))
    .digest("hex")
    .slice(0, 16);
}

/** PURE: the steps a rebuild would run, from the content plan and the design plan. */
export function plannedSteps(
  contentChanged: DemoStepId[],
  plan: Pick<DemoPlan, "draftSame" | "publishedInSync">,
  publish: boolean,
): { changed: DemoStepId[]; needsPublish: boolean } {
  const changed = [...contentChanged];
  if (!plan.draftSame) changed.push("design");
  const needsPublish = publish && (!plan.draftSame || !plan.publishedInSync);
  if (needsPublish) changed.push("publish");
  return { changed, needsPublish };
}

function selectEntries(req: DemoRebuildRequest): { entries: DemoRegistryEntry[]; unknown: string[] } {
  const base = demosFor(req.design);
  if (!req.only?.length) return { entries: base, unknown: [] };
  const unknown = req.only.filter((c) => !findDemo(c));
  return { entries: base.filter((d) => req.only!.includes(d.profileCode)), unknown };
}

async function insertRun(
  admin: Admin,
  entry: DemoRegistryEntry,
  talentProfileId: string,
  before: DemoSnapshot,
  actorId?: string,
): Promise<string> {
  const { data, error } = await admin
    .from("demo_rebuild_runs")
    .insert({
      design: entry.design,
      profile_code: entry.profileCode,
      talent_profile_id: talentProfileId,
      before,
      // Flipped to "wrote" once every step lands; a crash leaves the backup marked failed.
      status: "failed",
      error: "in progress",
      created_by: actorId ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`could not save the backup: ${error.message}`);
  return (data as { id: string }).id;
}

async function finishRun(admin: Admin, runId: string, patch: { status: "wrote" | "failed"; error: string | null; afterHash?: string }) {
  await admin
    .from("demo_rebuild_runs")
    .update({ status: patch.status, error: patch.error, ...(patch.afterHash ? { after_hash: patch.afterHash } : {}) })
    .eq("id", runId);
}

async function rebuildOne(
  admin: Admin,
  entry: DemoRegistryEntry,
  opts: { dryRun: boolean; publish: boolean; actorId?: string },
  ports: RebuildPorts,
): Promise<DemoRebuildRow> {
  const base = { profileCode: entry.profileCode, design: entry.design };
  const target = await ports.assertTarget(admin, entry.profileCode);
  if (!target.ok) return { ...base, version: null, status: "refused", changed: [], error: target.reason };

  const rows = await ports.loadRows(admin, entry.profileCode);
  const spec: DemoSpec = {
    design: entry.design,
    palette: entry.palette,
    ...(entry.keepLook ? { keepLook: true } : {}),
    profileCode: entry.profileCode,
    live: Array.isArray(rows.site.shell_published) || !!rows.site.site_published_at,
  };
  const contentChanged = await ports.content(admin, entry, target.talentProfileId, false);
  const plan = await ports.plan(admin, spec, rows);
  const version = plan.design.version;
  const { changed, needsPublish } = plannedSteps(contentChanged, plan, opts.publish);
  if (changed.length === 0) return { ...base, version, status: "unchanged", changed: [] };
  if (opts.dryRun) return { ...base, version, status: "would_write", changed };

  const content = ports.snapshotContent ? await ports.snapshotContent(admin, target.talentProfileId) : undefined;
  const runId = await insertRun(admin, entry, target.talentProfileId, { ...snapshotOf(rows), ...(content ? { content } : {}) }, opts.actorId);
  try {
    if (contentChanged.length) await ports.content(admin, entry, target.talentProfileId, true);
    if (!plan.draftSame) await ports.writeDraft(admin, spec, rows, plan);
    if (needsPublish) await ports.publish(admin, rows);
    ports.bust(target.talentProfileId, entry.profileCode);
    await finishRun(admin, runId, { status: "wrote", error: null, afterHash: afterHash(plan) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "rebuild failed";
    await finishRun(admin, runId, { status: "failed", error: message });
    return { ...base, version, status: "failed", changed: [], runId, error: message };
  }
  return { ...base, version, status: "wrote", changed, runId };
}

export async function rebuildDemos(
  admin: Admin,
  req: DemoRebuildRequest = {},
  actorId?: string | null,
  ports: RebuildPorts = DEFAULT_PORTS,
): Promise<DemoRebuildResult> {
  const startedAt = new Date().toISOString();
  const dryRun = req.dryRun !== false;
  const publish = req.publish !== false;
  const { entries, unknown } = selectEntries(req);
  const rows: DemoRebuildRow[] = unknown.map((code) => ({
    profileCode: code,
    design: (req.design ?? "maison-v2") as DemoDesign,
    version: null,
    status: "refused",
    changed: [],
    error: `${code} is not in the demo registry.`,
  }));
  for (const entry of entries) {
    try {
      rows.push(await rebuildOne(admin, entry, { dryRun, publish, ...(actorId ? { actorId } : {}) }, ports));
    } catch (err) {
      rows.push({
        profileCode: entry.profileCode,
        design: entry.design,
        version: null,
        status: "failed",
        changed: [],
        error: err instanceof Error ? err.message : "rebuild failed",
      });
    }
  }
  return {
    ok: rows.every((r) => r.status !== "failed" && r.status !== "refused"),
    dryRun,
    startedAt,
    finishedAt: new Date().toISOString(),
    rows,
  };
}

/** Columns a restore never writes back. */
const KEEP = new Set(["id", "created_at", "talent_profile_id"]);
const writable = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).filter(([k]) => !KEEP.has(k)));

export type RestoreResult = { ok: true; profileCode: string } | { ok: false; error: string };

/** Put a demo's site and page rows back from a backup run, then mark the run `restored`. */
export async function restoreDemoRun(
  admin: Admin,
  runId: string,
  ports: Pick<RebuildPorts, "assertTarget" | "bust"> & { restoreContent?: typeof restoreContentSnapshot } = DEFAULT_PORTS,
): Promise<RestoreResult> {
  const { data: run, error } = await admin
    .from("demo_rebuild_runs")
    .select("id, profile_code, status, before")
    .eq("id", runId)
    .maybeSingle();
  if (error) return { ok: false, error: "Could not read the backup." };
  if (!run) return { ok: false, error: "Backup not found." };
  const r = run as { profile_code: string; status: string; before: DemoSnapshot };
  if (r.status === "restored") return { ok: false, error: "This backup was already restored." };
  const target = await ports.assertTarget(admin, r.profile_code);
  if (!target.ok) return { ok: false, error: target.reason };
  const site = r.before?.talent_sites;
  if (!site || typeof site.id !== "string" || !Array.isArray(r.before.talent_pages)) {
    return { ok: false, error: "The backup is incomplete." };
  }
  const { error: sErr } = await admin
    .from("talent_sites")
    .update(writable(site))
    .eq("id", site.id)
    .eq("talent_profile_id", target.talentProfileId);
  if (sErr) return { ok: false, error: `Could not restore the site: ${sErr.message}` };
  for (const page of r.before.talent_pages) {
    if (typeof page.id !== "string") continue;
    const { error: pErr } = await admin
      .from("talent_pages")
      .update(writable(page))
      .eq("id", page.id)
      .eq("talent_profile_id", target.talentProfileId);
    if (pErr) return { ok: false, error: `Could not restore a page: ${pErr.message}` };
  }
  if (r.before.content) {
    try {
      await (ports.restoreContent ?? restoreContentSnapshot)(admin, r.profile_code, r.before.content);
    } catch (e) {
      return { ok: false, error: `Could not restore the content: ${e instanceof Error ? e.message : "failed"}` };
    }
  }
  await admin.from("demo_rebuild_runs").update({ status: "restored", error: null }).eq("id", runId);
  ports.bust(target.talentProfileId, r.profile_code);
  return { ok: true, profileCode: r.profile_code };
}
