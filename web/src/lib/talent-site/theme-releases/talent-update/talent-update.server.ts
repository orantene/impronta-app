import "server-only";

/**
 * THEME RELEASES (Phase 4): the talent update experience, server side.
 *
 *   loadTalentUpdateNotices   rows in an open state (available, previewed, undone) on an open release
 *   previewThemeUpdate        merge in memory, return the report: NO write
 *   loadThemeUpdatePreviewSnapshot  the same merge as a snapshot for the
 *                             owner's `?preview=draft&themeUpdate=<id>` render
 *   applyThemeUpdate          merge → `applyThemeUpdateToDraft` (atomic, draft_rev
 *                             checked, one history entry with the report), then
 *                             the row moves to `applied`
 *   dismissThemeUpdate        `available` → `dismissed`
 *   addThemeUpdateBlock       one new-block item, placed after a chosen section
 *
 * Service-role, always scoped to the caller's own talent_profile_id (the
 * actions resolve it from the session, never from input). Release reads name
 * their columns: `dry_run_report` / `base_payload` never reach a talent; the
 * merge reads `base_payload` server-side only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { applyThemeUpdateToDraft, siteBasePath } from "@/lib/talent-site/history/history.server";
import type { HistorySnapshot } from "@/lib/talent-site/history/types";
import type { WriteSiteDraftResult } from "@/lib/talent-site/history/writer";
import { assertFreeTalentSiteTreeMutation } from "@/lib/talent-site/free-site-tree-guard";
import { loadTalentSiteSaveCapabilities } from "@/lib/talent-site/server/free-site-save-guard";
import { loadReleaseDesign } from "../release-design.server";
import { makeBaseResolver } from "../manager/base-resolver.server";
import { mergeSite, type SiteMergeOutcome } from "../manager/merge-site.server";
import type { ReleaseItem, ReleaseNotes, SiteUpdateState, ThemeRelease } from "../types";
import { countParts } from "../parts";
import { addBlockSummary } from "./copy";
import {
  OPEN_UPDATE_STATES,
  applyItemsOf,
  groupItems,
  nextTokenOrigin,
  placeKeyAfter,
  placementOptions,
  sectionLabel,
  summarizeReport,
  type PlacementOption,
  type TalentReleaseItem,
  type UpdateSummary,
  type WhatsNewGroup,
} from "./view";

/** Talent-readable release columns (migration 20261231299560 grant list). */
export const TALENT_RELEASE_COLUMNS =
  "id, design_slug, from_version, to_version, channel, status, notes, items, critical, published_at";

/**
 * F74: the BANNER needs no item payload. `items` (the What's new list) loads
 * with the sheet's preview call, so opening /talent/site reads a few short
 * columns, not the release body.
 */
export const NOTICE_RELEASE_COLUMNS = "id, design_slug, from_version, to_version, channel, status, notes, critical";

export type TalentRelease = Pick<
  ThemeRelease,
  "id" | "design_slug" | "from_version" | "to_version" | "channel" | "status" | "notes" | "items" | "critical" | "published_at"
>;

export interface UpdateContext {
  updateId: string;
  state: SiteUpdateState;
  siteId: string;
  siteSlug: string | null;
  talentProfileId: string;
  displayName: string;
  pinnedVersion: number | null;
  draftRev: number;
  tokenOrigin: Record<string, string> | null;
  designTitle: string;
  release: TalentRelease;
}

export type MergeFn = (ctx: UpdateContext, items: ReadonlyArray<ReleaseItem> | undefined) => Promise<SiteMergeOutcome>;
/** Free-site rule: null = allowed, else the refusal message. */
export type TreeCheck = (ctx: UpdateContext, prev: BuilderNode[], next: BuilderNode[]) => Promise<string | null>;

export interface UpdateDeps {
  admin: SupabaseClient;
  merge: MergeFn;
  checkTree: TreeCheck;
}

export interface TalentUpdateNotice {
  updateId: string;
  /** `available`, `previewed` or `undone` (F83: shown as "available again"). */
  state: SiteUpdateState;
  releaseId: string;
  designSlug: string;
  designTitle: string;
  fromVersion: number;
  toVersion: number;
  critical: boolean;
  notes: { en: string; es: string };
  draftRev: number;
}

const OPEN_CHANNELS = new Set(["optin", "default"]);

function notesOf(n: ReleaseNotes | null | undefined): { en: string; es: string } {
  return { en: typeof n?.en === "string" ? n.en : "", es: typeof n?.es === "string" ? n.es : "" };
}

async function designTitle(admin: SupabaseClient, slug: string): Promise<string> {
  // supabase-read-unchecked-ok: the title is decoration; the slug stands in.
  const { data } = await admin
    .from("talent_theme_catalog")
    .select("title")
    .eq("kind", "design")
    .eq("slug", slug)
    .maybeSingle();
  return ((data as { title?: string } | null)?.title ?? "").trim() || slug;
}

/**
 * Open update notices for one talent (state available / previewed / undone,
 * release open). F74: after the rows, the release columns, the site's draft
 * rev and the design titles are independent reads, so they run in ONE parallel
 * step (was four sequential round trips), and the release read is the lean
 * banner column set.
 */
export async function loadTalentUpdateNotices(
  admin: SupabaseClient,
  talentProfileId: string,
): Promise<TalentUpdateNotice[]> {
  const { data: rows, error } = await admin
    .from("talent_site_theme_updates")
    .select("id, release_id, talent_site_id, state")
    .eq("talent_profile_id", talentProfileId)
    .in("state", [...OPEN_UPDATE_STATES]);
  if (error) {
    logServerError("themeUpdate.notices", error);
    return [];
  }
  const list = (rows ?? []) as Array<{ id: string; release_id: string; talent_site_id: string; state: string }>;
  if (list.length === 0) return [];
  const [relRes, siteRes] = await Promise.all([
    admin
      .from("talent_theme_releases")
      .select(NOTICE_RELEASE_COLUMNS)
      .in(
        "id",
        list.map((r) => r.release_id),
      ),
    // supabase-read-unchecked-ok: a missing rev only weakens the race check to "reload".
    admin.from("talent_sites").select("draft_rev").eq("talent_profile_id", talentProfileId).maybeSingle(),
  ]);
  if (relRes.error) {
    logServerError("themeUpdate.notices.releases", relRes.error);
    return [];
  }
  const releases = (relRes.data ?? []) as unknown as TalentReleaseLean[];
  const byId = new Map(releases.map((r) => [r.id, r]));
  const site = siteRes.data;
  const draftRev = typeof (site as { draft_rev?: number } | null)?.draft_rev === "number" ? (site as { draft_rev: number }).draft_rev : 0;
  const open = list.filter((row) => {
    const rel = byId.get(row.release_id);
    return rel && rel.status === "published" && OPEN_CHANNELS.has(rel.channel);
  });
  const slugs = [...new Set(open.map((row) => byId.get(row.release_id)!.design_slug))];
  const titles = new Map(await Promise.all(slugs.map(async (slug) => [slug, await designTitle(admin, slug)] as const)));
  const out: TalentUpdateNotice[] = open.map((row) => {
    const rel = byId.get(row.release_id)!;
    return {
      updateId: row.id,
      state: row.state as SiteUpdateState,
      releaseId: rel.id,
      designSlug: rel.design_slug,
      designTitle: titles.get(rel.design_slug) ?? rel.design_slug,
      fromVersion: rel.from_version,
      toVersion: rel.to_version,
      critical: rel.critical,
      notes: notesOf(rel.notes),
      draftRev,
    };
  });
  return out.sort((a, b) => b.toVersion - a.toVersion);
}

type TalentReleaseLean = Pick<
  ThemeRelease,
  "id" | "design_slug" | "from_version" | "to_version" | "channel" | "status" | "notes" | "critical"
>;

/** One update row + its release + the site, owner-scoped. */
export async function loadUpdateContext(
  admin: SupabaseClient,
  talentProfileId: string,
  updateId: string,
): Promise<UpdateContext | null> {
  // F74: the update row and the profile name do not depend on each other.
  const [rowRes, profRes] = await Promise.all([
    admin
      .from("talent_site_theme_updates")
      .select("id, release_id, talent_site_id, state")
      .eq("id", updateId)
      .eq("talent_profile_id", talentProfileId)
      .maybeSingle(),
    // supabase-read-unchecked-ok: the name only feeds fallback hydration.
    admin.from("talent_profiles").select("display_name").eq("id", talentProfileId).maybeSingle(),
  ]);
  if (rowRes.error || !rowRes.data) return null;
  const u = rowRes.data as { id: string; release_id: string; talent_site_id: string; state: SiteUpdateState };
  // The release and the site are independent reads keyed off the update row.
  const [relRes, siteRes] = await Promise.all([
    admin.from("talent_theme_releases").select(TALENT_RELEASE_COLUMNS).eq("id", u.release_id).maybeSingle(),
    admin
      .from("talent_sites")
      .select("id, site_slug, draft_rev, theme_design_version, theme_token_origin")
      .eq("id", u.talent_site_id)
      .eq("talent_profile_id", talentProfileId)
      .maybeSingle(),
  ]);
  if (relRes.error || !relRes.data) return null;
  const release = relRes.data as TalentRelease;
  if (release.status !== "published" || !OPEN_CHANNELS.has(release.channel)) return null;
  if (siteRes.error || !siteRes.data) return null;
  const s = siteRes.data as {
    id: string;
    site_slug: string | null;
    draft_rev: number | null;
    theme_design_version: number | null;
    theme_token_origin: Record<string, string> | null;
  };
  const prof = profRes.data;
  return {
    updateId: u.id,
    state: u.state,
    siteId: s.id,
    siteSlug: s.site_slug,
    talentProfileId,
    displayName: ((prof as { display_name?: string | null } | null)?.display_name ?? "").trim() || "Talent",
    pinnedVersion: typeof s.theme_design_version === "number" ? s.theme_design_version : null,
    draftRev: typeof s.draft_rev === "number" ? s.draft_rev : 0,
    tokenOrigin: s.theme_token_origin && typeof s.theme_token_origin === "object" ? s.theme_token_origin : null,
    designTitle: await designTitle(admin, release.design_slug),
    release,
  };
}

/** The real merge: catalog Design at to_version, base = her pinned version. */
export function makeSiteMerge(admin: SupabaseClient): MergeFn {
  return async (ctx, items) => {
    // F74: the target design and the merge-base payload are independent reads.
    const [design, baseRes] = await Promise.all([
      loadReleaseDesign(admin, ctx.release),
      // Admin-only column, read server-side for the merge base; never returned.
      admin.from("talent_theme_releases").select("base_payload").eq("id", ctx.release.id).maybeSingle(),
    ]);
    if (!design) return { ok: false, error: "Design not found." };
    const { data, error } = baseRes;
    if (error) return { ok: false, error: error.message };
    const release = {
      design_slug: ctx.release.design_slug,
      from_version: ctx.release.from_version,
      to_version: ctx.release.to_version,
      base_payload: (data as { base_payload?: unknown } | null)?.base_payload ?? null,
    };
    return mergeSite(
      admin,
      release,
      design,
      {
        siteId: ctx.siteId,
        talentProfileId: ctx.talentProfileId,
        userId: "",
        profileCode: "",
        displayName: ctx.displayName,
        locale: null,
        pinnedVersion: ctx.pinnedVersion,
        isDemo: false,
      },
      items,
      makeBaseResolver(admin, release),
    );
  };
}

export const saveGuardTreeCheck: TreeCheck = async (ctx, prev, next) => {
  const caps = await loadTalentSiteSaveCapabilities(ctx.talentProfileId);
  if (!caps) return null;
  const v = assertFreeTalentSiteTreeMutation({ previousTree: prev, nextTree: next, canInsertSections: caps.personalSiteSections });
  return v.ok ? null : v.message;
};

export function defaultUpdateDeps(): UpdateDeps | null {
  const admin = createServiceRoleClient();
  return admin ? { admin, merge: makeSiteMerge(admin), checkTree: saveGuardTreeCheck } : null;
}

// ── Preview (no write) ───────────────────────────────────────────────────────

export interface UpdatePreview {
  summary: UpdateSummary;
  /** What's new list, loaded here so the banner never reads the release body (F74). */
  groups: Array<{ group: WhatsNewGroup; items: TalentReleaseItem[] }>;
  /** False when the release only offers new blocks: nothing for Apply to do (F78). */
  hasApplicable: boolean;
  previewUrl: string | null;
  placements: PlacementOption[];
  draftRev: number;
}

export type UpdateResult<T> = { ok: true; value: T } | { ok: false; code: string; error: string; currentRev?: number | null };

const NOT_FOUND = { ok: false as const, code: "not_found", error: "This update is no longer available." };

export function themeUpdatePreviewUrl(siteSlug: string | null, updateId: string): string | null {
  const base = siteBasePath(siteSlug);
  return base ? `${base}?preview=draft&themeUpdate=${encodeURIComponent(updateId)}` : null;
}

async function homeTree(admin: SupabaseClient, talentProfileId: string): Promise<BuilderNode[]> {
  // supabase-read-unchecked-ok: no home page yields no placement choices.
  const { data } = await admin
    .from("talent_pages")
    .select("blocks")
    .eq("talent_profile_id", talentProfileId)
    .eq("is_home", true)
    .maybeSingle();
  const b = (data as { blocks?: unknown } | null)?.blocks;
  return Array.isArray(b) ? (b as BuilderNode[]) : [];
}

/** READ-ONLY: what applying would do to her draft. Writes nothing. */
export async function previewThemeUpdate(
  deps: UpdateDeps,
  talentProfileId: string,
  updateId: string,
): Promise<UpdateResult<UpdatePreview>> {
  const ctx = await loadUpdateContext(deps.admin, talentProfileId, updateId);
  if (!ctx) return NOT_FOUND;
  const items = Array.isArray(ctx.release.items) ? ctx.release.items : [];
  // F74: the merge and the placement tree are independent reads.
  const [m, tree] = await Promise.all([
    deps.merge(ctx, applyItemsOf(items)),
    homeTree(deps.admin, talentProfileId),
  ]);
  if (!m.ok) return { ok: false, code: "merge_failed", error: m.error };
  return {
    ok: true,
    value: {
      summary: summarizeReport(m.result.report),
      groups: groupItems(items),
      hasApplicable: applyItemsOf(items).length > 0,
      previewUrl: themeUpdatePreviewUrl(ctx.siteSlug, updateId),
      placements: placementOptions(tree),
      draftRev: ctx.draftRev,
    },
  };
}

/** The owner's preview render: her draft with the update merged in memory. */
export async function loadThemeUpdatePreviewSnapshot(
  talentProfileId: string,
  updateId: string,
  deps: UpdateDeps | null = defaultUpdateDeps(),
): Promise<HistorySnapshot | null> {
  if (!deps || !/^[0-9a-f-]{36}$/i.test(updateId)) return null;
  const ctx = await loadUpdateContext(deps.admin, talentProfileId, updateId);
  if (!ctx) return null;
  const m = await deps.merge(ctx, applyItemsOf(ctx.release.items ?? []));
  if (!m.ok || !m.homePageId) return null;
  // F76: opening the preview is measurement. Record `previewed` on the update
  // row only; her site is untouched. Never downgrades applied/dismissed/undone.
  await setUpdateState(deps.admin, talentProfileId, updateId, "previewed", { onlyFrom: ["available"] });
  return {
    v: 1,
    source: "draft",
    rev: ctx.draftRev,
    shell: m.result.trees.shell ?? null,
    tokens: m.result.tokens,
    pages: { [m.homePageId]: m.result.trees.home ?? null },
  };
}

// ── Writes ───────────────────────────────────────────────────────────────────

function writeFailure(res: Exclude<WriteSiteDraftResult, { ok: true }>): UpdateResult<never> {
  return res.code === "conflict"
    ? { ok: false, code: "VERSION_CONFLICT", error: res.error, currentRev: res.currentRev }
    : { ok: false, code: res.code, error: res.error };
}

export async function setUpdateState(
  admin: SupabaseClient,
  talentProfileId: string,
  updateId: string,
  state: SiteUpdateState,
  extra: { report?: unknown; onlyFrom?: SiteUpdateState[] } = {},
): Promise<boolean> {
  const now = new Date().toISOString();
  let q = admin
    .from("talent_site_theme_updates")
    .update({
      state,
      ...(extra.report !== undefined ? { report: extra.report } : {}),
      ...(state === "applied" ? { applied_at: now } : {}),
      updated_at: now,
    } as never)
    .eq("id", updateId)
    .eq("talent_profile_id", talentProfileId);
  if (extra.onlyFrom) q = q.in("state", extra.onlyFrom);
  const { error } = await q;
  if (error) logServerError("themeUpdate.setState", error);
  return !error;
}

export interface ApplyOutcome {
  draftRev: number;
  kept: number;
  historyId: string | null;
}

/** Apply the whole release to her DRAFT (one atomic write + one history entry). */
export async function applyThemeUpdate(
  deps: UpdateDeps,
  input: { talentProfileId: string; updateId: string; expectedDraftRev: number | null; actorId: string | null },
): Promise<UpdateResult<ApplyOutcome>> {
  const ctx = await loadUpdateContext(deps.admin, input.talentProfileId, input.updateId);
  if (!ctx) return NOT_FOUND;
  if (ctx.state === "applied") return { ok: false, code: "already_applied", error: "This update is already in your draft." };
  const m = await deps.merge(ctx, applyItemsOf(ctx.release.items ?? []));
  if (!m.ok) return { ok: false, code: "merge_failed", error: m.error };
  if (!m.homePageId) return { ok: false, code: "not_found", error: "Home page not found." };
  const home = m.result.trees.home ?? [];
  const refused = await deps.checkTree(ctx, await homeTree(deps.admin, ctx.talentProfileId), home);
  if (refused) return { ok: false, code: "plan_required", error: refused };
  const res = await applyThemeUpdateToDraft(deps.admin, {
    siteId: ctx.siteId,
    homePageId: m.homePageId,
    expectedDraftRev: input.expectedDraftRev,
    shell: m.result.trees.shell ?? [],
    home,
    tokens: m.result.tokens,
    report: m.result.report,
    designName: ctx.designTitle,
    fromVersion: ctx.pinnedVersion,
    toVersion: ctx.release.to_version,
    releaseId: ctx.release.id,
    updateId: ctx.updateId,
    actor: "talent",
    kind: "theme_update",
    actorId: input.actorId,
    tokenOrigin: nextTokenOrigin(ctx.tokenOrigin, m.result.report),
  });
  if (!res.ok) return writeFailure(res);
  await setUpdateState(deps.admin, ctx.talentProfileId, ctx.updateId, "applied", {
    report: summarizeReport(m.result.report),
  });
  return { ok: true, value: { draftRev: res.draftRev, kept: countParts(m.result.report.kept), historyId: res.historyId } };
}

/** Not now: the banner goes quiet; the update stays in What's new history. */
export async function dismissThemeUpdate(
  admin: SupabaseClient,
  talentProfileId: string,
  updateId: string,
): Promise<UpdateResult<null>> {
  const ok = await setUpdateState(admin, talentProfileId, updateId, "dismissed", {
    onlyFrom: [...OPEN_UPDATE_STATES],
  });
  return ok ? { ok: true, value: null } : { ok: false, code: "error", error: "Could not save." };
}

/** Add ONE new-block item to her draft, after the section she picked. */
export async function addThemeUpdateBlock(
  deps: UpdateDeps,
  input: {
    talentProfileId: string;
    updateId: string;
    itemId: string;
    afterId: string | null;
    expectedDraftRev: number | null;
    actorId: string | null;
  },
): Promise<UpdateResult<{ draftRev: number }>> {
  const ctx = await loadUpdateContext(deps.admin, input.talentProfileId, input.updateId);
  if (!ctx) return NOT_FOUND;
  const item = (ctx.release.items ?? []).find(
    (i) => i.type === "new-block" && (i.id ?? `${i.type}:${i.key}`) === input.itemId,
  );
  if (!item) return { ok: false, code: "not_found", error: "That block is not part of this update." };
  const m = await deps.merge(ctx, [item]);
  if (!m.ok) return { ok: false, code: "merge_failed", error: m.error };
  if (!m.homePageId) return { ok: false, code: "not_found", error: "Home page not found." };
  const added = m.result.report.added;
  if (added.length === 0) return { ok: false, code: "already_added", error: "This block is already on your page." };
  let home = m.result.trees.home ?? [];
  for (const e of added) {
    if (e.tree === "home" && !e.parentKey) home = placeKeyAfter(home, e.key, input.afterId);
  }
  const prev = await homeTree(deps.admin, ctx.talentProfileId);
  const refused = await deps.checkTree(ctx, prev, home);
  if (refused) return { ok: false, code: "plan_required", error: refused };
  const first = added[0]!;
  const label = first.node ? sectionLabel(first.node) : first.key;
  const res = await applyThemeUpdateToDraft(deps.admin, {
    siteId: ctx.siteId,
    homePageId: m.homePageId,
    expectedDraftRev: input.expectedDraftRev,
    shell: m.result.trees.shell ?? [],
    home,
    tokens: m.result.tokens,
    report: m.result.report,
    designName: ctx.designTitle,
    // No re-pin: the rest of the update is still on offer.
    fromVersion: null,
    toVersion: null,
    releaseId: ctx.release.id,
    updateId: null,
    actor: "talent",
    kind: "theme_update",
    actorId: input.actorId,
    summary: addBlockSummary(ctx.designTitle, label),
    tokenOrigin: nextTokenOrigin(ctx.tokenOrigin, m.result.report),
  });
  if (!res.ok) return writeFailure(res);
  return { ok: true, value: { draftRev: res.draftRev } };
}
