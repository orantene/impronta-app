import "server-only";

/**
 * Talent site history: reads + the restore / undo-update / apply-update writes.
 * Service-role; callers resolve the SIGNED-IN talent's own profile id first.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { enforceLockedPropsOnTree } from "@/lib/site-admin/builder-node/prop-lock";
import { normalizeUnknownBuilderTreeLayout } from "@/lib/site-admin/builder-node/normalize-tree-layout";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { RevisionsLoadResult } from "@/lib/site-admin/edit-mode/revisions-actions";
import type { DesignMergeReport } from "@/lib/talent-site/theme-releases/types";
import { assertFreeTalentSiteTreeMutation } from "@/lib/talent-site/free-site-tree-guard";
import { loadTalentSiteSaveCapabilities } from "@/lib/talent-site/server/free-site-save-guard";

import { CHROME_COPY, restoreSummary, summaryFor, themeUpdateSummary, undoUpdateSummary } from "./copy";
import { diffDraftAgainstLive, type SectionChange } from "./draft-diff";
import {
  isHistorySnapshot,
  isThemeUpdateReport,
  planRestore,
  planUndoUpdate,
} from "./restore-plan";
import { buildTimelineResult, countUnpublishedChanges } from "./timeline";
import type { HistoryRow, HistorySnapshot, ThemeUpdateHistoryReport } from "./types";
import { recordSiteHistory, writeSiteDraft, type WriteSiteDraftResult } from "./writer";
import { createServiceRoleClient } from "@/lib/supabase/admin";

const LIST_COLS =
  "id, site_id, talent_profile_id, at, last_at, actor, kind, summary_en, summary_es, report, undoable, draft_rev, edit_count, created_by";
const LIST_LIMIT = 50;

export interface SiteDraftState {
  siteId: string;
  draftRev: number;
  siteSlug: string | null;
  sitePublishedAt: string | null;
  shell: BuilderNode[];
  shellPublished: BuilderNode[];
  tokens: Record<string, string>;
  tokensLive: Record<string, string>;
  designSlug: string | null;
  designVersion: number | null;
  pages: Array<{
    id: string;
    slug: string;
    title: string;
    isHome: boolean;
    blocks: BuilderNode[];
    blocksPublished: BuilderNode[];
  }>;
}

function tree(v: unknown): BuilderNode[] {
  return Array.isArray(v) ? (v as BuilderNode[]) : [];
}

function tokens(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (typeof x === "string") out[k] = x;
  return out;
}

/** The site row id + draft_rev for a profile (null = no site). */
export async function loadSiteRev(
  admin: SupabaseClient,
  talentProfileId: string,
): Promise<{ siteId: string; draftRev: number } | null> {
  const { data, error } = await admin
    .from("talent_sites")
    .select("id, draft_rev")
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { id: string; draft_rev: number | null };
  return { siteId: row.id, draftRev: typeof row.draft_rev === "number" ? row.draft_rev : 0 };
}

/**
 * The site rev ONLY when `userId` owns the profile. Callers that proved access
 * with an RLS READ must use this before a service-role write: a read policy
 * (published pages are public) is not a write grant.
 */
export async function loadOwnedSiteRev(
  admin: SupabaseClient,
  talentProfileId: string,
  userId: string | null | undefined,
): Promise<{ siteId: string; draftRev: number } | null> {
  if (!userId) return null;
  const { data, error } = await admin
    .from("talent_profiles")
    .select("user_id")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (error || !data || (data as { user_id: string | null }).user_id !== userId) return null;
  return loadSiteRev(admin, talentProfileId);
}

export async function loadSiteDraftState(
  admin: SupabaseClient,
  talentProfileId: string,
): Promise<SiteDraftState | null> {
  const { data: site, error } = await admin
    .from("talent_sites")
    .select(
      "id, draft_rev, site_slug, site_published_at, shell_tree, shell_published, design_tokens_draft, design_tokens, theme_design_slug, theme_design_version",
    )
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (error || !site) {
    if (error) logServerError("talentSiteHistory.loadState.site", error);
    return null;
  }
  const { data: pages, error: pagesErr } = await admin
    .from("talent_pages")
    .select("id, slug, title, is_home, sort_order, blocks, blocks_published")
    .eq("talent_profile_id", talentProfileId)
    .order("sort_order", { ascending: true });
  if (pagesErr) {
    logServerError("talentSiteHistory.loadState.pages", pagesErr);
    return null;
  }
  const s = site as Record<string, unknown>;
  return {
    siteId: s.id as string,
    draftRev: typeof s.draft_rev === "number" ? s.draft_rev : 0,
    siteSlug: (s.site_slug as string | null) ?? null,
    sitePublishedAt: (s.site_published_at as string | null) ?? null,
    shell: tree(s.shell_tree),
    shellPublished: tree(s.shell_published),
    tokens: tokens(s.design_tokens_draft),
    tokensLive: tokens(s.design_tokens),
    designSlug: (s.theme_design_slug as string | null) ?? null,
    designVersion: typeof s.theme_design_version === "number" ? s.theme_design_version : null,
    pages: ((pages ?? []) as Array<Record<string, unknown>>).map((p) => ({
      id: p.id as string,
      slug: p.slug as string,
      title: (p.title as string) ?? "",
      isHome: Boolean(p.is_home),
      blocks: tree(p.blocks),
      blocksPublished: tree(p.blocks_published),
    })),
  };
}

export function siteBasePath(siteSlug: string | null): string | null {
  return siteSlug ? `/t/site/${encodeURIComponent(siteSlug)}` : null;
}

/** The timeline the builder's revisions drawer shows (newest first). */
export async function loadTalentTimeline(
  admin: SupabaseClient,
  talentProfileId: string,
  opts: { pageSlug?: string | null } = {},
): Promise<RevisionsLoadResult> {
  const { data: site } = await admin
    .from("talent_sites")
    .select("id, draft_rev, site_slug")
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  const s = site as { id: string; draft_rev: number | null; site_slug: string | null } | null;
  if (!s) return { ok: false, error: "Personal site not found.", code: "NOT_FOUND" };
  const { data, error } = await admin
    .from("talent_site_history")
    .select(LIST_COLS)
    .eq("site_id", s.id)
    .order("last_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) {
    logServerError("talentSiteHistory.timeline", error);
    return { ok: false, error: "Failed to load history" };
  }
  const rows = (data ?? []) as HistoryRow[];
  const ids = [...new Set(rows.map((r) => r.created_by).filter((v): v is string => !!v))];
  const names = new Map<string, string | null>();
  if (ids.length > 0) {
    const { data: profiles } = await admin.from("profiles").select("id, display_name").in("id", ids);
    for (const p of (profiles ?? []) as Array<{ id: string; display_name: string | null }>) {
      names.set(p.id, p.display_name);
    }
  }
  const pageSlug = opts.pageSlug && opts.pageSlug !== "home" && opts.pageSlug !== "index" ? opts.pageSlug : null;
  return buildTimelineResult(
    rows,
    typeof s.draft_rev === "number" ? s.draft_rev : 0,
    { siteBasePath: siteBasePath(s.site_slug), pageSlug },
    names,
  );
}

/** Owner-scoped snapshot read for the read-only preview render. */
export async function loadHistorySnapshot(
  admin: SupabaseClient,
  talentProfileId: string,
  entryId: string,
): Promise<{ at: string; snapshot: unknown; kind: string; report: unknown } | null> {
  const { data, error } = await admin
    .from("talent_site_history")
    .select("at, kind, report, snapshot_ref")
    .eq("id", entryId)
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { at: string; kind: string; report: unknown; snapshot_ref: unknown };
  return { at: row.at, snapshot: row.snapshot_ref, kind: row.kind, report: row.report };
}

/** The owner's read-only preview of one entry (`?preview=draft&history=<id>`). */
export async function loadHistoryPreviewSnapshot(
  talentProfileId: string,
  entryId: string,
): Promise<HistorySnapshot | null> {
  if (!/^[0-9a-f-]{36}$/i.test(entryId)) return null;
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const entry = await loadHistorySnapshot(admin, talentProfileId, entryId);
  return entry && isHistorySnapshot(entry.snapshot) ? entry.snapshot : null;
}

const guard = (next: BuilderNode[], prev: BuilderNode[]): BuilderNode[] =>
  normalizeUnknownBuilderTreeLayout(enforceLockedPropsOnTree(next, prev)) as BuilderNode[];

export type HistoryWriteResult =
  | WriteSiteDraftResult
  | { ok: false; code: "not_found" | "not_undoable"; error: string };

/** Restore an entry's snapshot to the DRAFT. Adds a `restore` entry; deletes nothing. */
export async function restoreHistoryEntry(
  admin: SupabaseClient,
  input: { talentProfileId: string; entryId: string; expectedDraftRev: number | null; actorId: string | null },
): Promise<HistoryWriteResult> {
  const entry = await loadHistorySnapshot(admin, input.talentProfileId, input.entryId);
  if (!entry || !isHistorySnapshot(entry.snapshot)) {
    return { ok: false, code: "not_found", error: "That version is no longer available." };
  }
  const state = await loadSiteDraftState(admin, input.talentProfileId);
  if (!state) return { ok: false, code: "not_found", error: "Site not found." };
  const plan = planRestore(
    entry.snapshot,
    { shell: state.shell, pages: Object.fromEntries(state.pages.map((p) => [p.id, p.blocks])) },
    guard,
  );
  // Free-site rule: a restore writes trees, so it carries the save path's rule
  // (a lapsed Web Office talent cannot reinstate refused sections by restoring).
  const caps = await loadTalentSiteSaveCapabilities(input.talentProfileId);
  if (caps) {
    const checks = [
      ...(plan.site.shell_tree ? [{ prev: state.shell, next: plan.site.shell_tree }] : []),
      ...plan.pages.map((p) => ({
        prev: state.pages.find((x) => "id" in p && x.id === p.id)?.blocks ?? [],
        next: p.patch.blocks,
      })),
    ];
    for (const c of checks) {
      const verdict = assertFreeTalentSiteTreeMutation({
        previousTree: c.prev,
        nextTree: c.next,
        canInsertSections: caps.personalSiteSections,
      });
      if (!verdict.ok) return { ok: false, code: "error", error: verdict.message };
    }
  }
  const summary = restoreSummary(entry.at);
  return writeSiteDraft(admin, {
    siteId: state.siteId,
    expectedDraftRev: input.expectedDraftRev,
    site: { ...plan.site, ...(input.actorId ? { updated_by: input.actorId } : {}) },
    pages: plan.pages,
    history: {
      kind: "restore",
      summaryEn: summary.en,
      summaryEs: summary.es,
      report: { from: input.entryId, skippedPages: plan.skippedPages },
      createdBy: input.actorId,
    },
  });
}

/** Undo ONE theme update (its entry's report), keeping every later edit. */
export async function undoThemeUpdateEntry(
  admin: SupabaseClient,
  input: { talentProfileId: string; entryId: string; expectedDraftRev: number | null; actorId: string | null },
): Promise<HistoryWriteResult> {
  const entry = await loadHistorySnapshot(admin, input.talentProfileId, input.entryId);
  if (!entry || (entry.kind !== "theme_update" && entry.kind !== "auto_improve") || !isThemeUpdateReport(entry.report)) {
    return { ok: false, code: "not_undoable", error: "This entry cannot be undone." };
  }
  const state = await loadSiteDraftState(admin, input.talentProfileId);
  const home = state?.pages.find((p) => p.isHome) ?? state?.pages[0];
  if (!state || !home) return { ok: false, code: "not_found", error: "Site not found." };
  const report = entry.report;
  const plan = planUndoUpdate({
    report,
    shell: state.shell,
    home: home.blocks,
    homePageId: home.id,
    tokens: state.tokens,
  });
  const summary = undoUpdateSummary(plan.reverted, plan.kept);
  const res = await writeSiteDraft(admin, {
    siteId: state.siteId,
    expectedDraftRev: input.expectedDraftRev,
    site: plan.site,
    pages: plan.pages,
    history: {
      kind: "theme_update",
      summaryEn: summary.en,
      summaryEs: summary.es,
      report: { undoOf: input.entryId, reverted: plan.reverted, kept: plan.kept },
      undoOf: input.entryId,
      createdBy: input.actorId,
    },
  });
  if (res.ok && report.updateId) {
    await admin
      .from("talent_site_theme_updates")
      .update({ state: "undone", updated_at: new Date().toISOString() })
      .eq("id", report.updateId)
      .eq("talent_profile_id", input.talentProfileId);
  }
  return res;
}

/**
 * Phase 4 entry point: land a merged update on the DRAFT in one atomic write
 * with its history entry (report stored for "Undo this update").
 */
export async function applyThemeUpdateToDraft(
  admin: SupabaseClient,
  input: {
    siteId: string;
    homePageId: string;
    expectedDraftRev: number | null;
    shell: BuilderNode[];
    home: BuilderNode[];
    tokens: Record<string, string>;
    report: DesignMergeReport;
    designName: string | null;
    fromVersion: number | null;
    toVersion: number | null;
    releaseId?: string | null;
    updateId?: string | null;
    actor?: "talent" | "tulala" | "system";
    kind?: "theme_update" | "auto_improve";
    actorId?: string | null;
  },
): Promise<WriteSiteDraftResult> {
  const stored: ThemeUpdateHistoryReport = {
    merge: input.report,
    releaseId: input.releaseId ?? null,
    updateId: input.updateId ?? null,
    fromVersion: input.fromVersion,
    toVersion: input.toVersion,
  };
  const summary = themeUpdateSummary(input.designName, input.toVersion, input.report.kept.length);
  return writeSiteDraft(admin, {
    siteId: input.siteId,
    expectedDraftRev: input.expectedDraftRev,
    site: {
      shell_tree: input.shell,
      design_tokens_draft: input.tokens,
      ...(typeof input.toVersion === "number" ? { theme_design_version: input.toVersion } : {}),
    },
    pages: [{ id: input.homePageId, patch: { blocks: input.home } }],
    history: {
      kind: input.kind ?? "theme_update",
      actor: input.actor ?? (input.kind === "auto_improve" ? "tulala" : "talent"),
      summaryEn: summary.en,
      summaryEs: summary.es,
      report: stored,
      undoable: true,
      createdBy: input.actorId ?? null,
    },
  });
}

/** A publish lands in the site history (best-effort; never fails the publish). */
export async function recordSitePublish(siteId: string, createdBy: string | null): Promise<void> {
  const admin = createServiceRoleClient();
  if (!admin) return;
  const summary = summaryFor("publish");
  await recordSiteHistory(admin, siteId, {
    kind: "publish",
    summaryEn: summary.en,
    summaryEs: summary.es,
    source: "published",
    createdBy,
  });
}

export interface GoLiveSummary {
  draftRev: number;
  unpublishedCount: number;
  changes: SectionChange[];
  sitePublishedAt: string | null;
  lastPublishAt: string | null;
  siteUrl: string | null;
}

/** "Draft · N unpublished changes" + the What-will-go-live list. */
export async function loadGoLiveSummary(
  admin: SupabaseClient,
  talentProfileId: string,
  locale: "en" | "es",
): Promise<GoLiveSummary | null> {
  const state = await loadSiteDraftState(admin, talentProfileId);
  if (!state) return null;
  const { data } = await admin
    .from("talent_site_history")
    .select("kind, last_at")
    .eq("site_id", state.siteId)
    .order("last_at", { ascending: false })
    .limit(LIST_LIMIT);
  const rows = (data ?? []) as Array<{ kind: HistoryRow["kind"]; last_at: string }>;
  const changes = diffDraftAgainstLive(
    {
      shell: { draft: state.shell, live: state.shellPublished },
      pages: state.pages.map((p) => ({ id: p.id, title: p.title, draft: p.blocks, live: p.blocksPublished })),
      tokens: { draft: state.tokens, live: state.tokensLive },
    },
    { header: CHROME_COPY.header[locale], colours: CHROME_COPY.colours[locale] },
  );
  const lastPublish = rows.find((r) => r.kind === "publish");
  return {
    draftRev: state.draftRev,
    // History counts the entries; no diff means nothing to publish; a site
    // without history yet falls back to the diff.
    unpublishedCount:
      changes.length === 0 ? 0 : rows.length > 0 ? Math.max(1, countUnpublishedChanges(rows)) : changes.length,
    changes,
    sitePublishedAt: state.sitePublishedAt,
    lastPublishAt: lastPublish?.last_at ?? null,
    siteUrl: siteBasePath(state.siteSlug),
  };
}
