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
import { ensureSiteThemeUpdates } from "../lazy-fan-out.server";
import { resolveBellsForRows } from "../theme-bells.server";
import { noBaseOfferItems, offerActionableFor, withoutPresentBlocks } from "../offer-actionable.server";
import { loadReleaseDesign } from "../release-design.server";
import { makeBaseResolver } from "../manager/base-resolver.server";
import { mergeSite, type SiteMergeOutcome } from "../manager/merge-site.server";
import type { ReleaseItem, ReleaseNotes, SiteUpdateState, ThemeRelease } from "../types";
import { countCopyKept, countParts, editedKept } from "../parts";
import { findKeyPath } from "../tree-ops";
import { addBlockSummary, releaseVersionLabel } from "./copy";
import {
  OPEN_UPDATE_STATES,
  applyItemsOf,
  combineReleaseItems,
  combinedUpdateState,
  groupItems,
  toTalentItem,
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
  /** Blocks she already added from this release (tracked so a removal is explicit). */
  addedBlocks: string[];
  designTitle: string;
  /**
   * F110: the release the talent is offered. When her site is behind several
   * open releases this is ONE combined release: id/notes of the newest,
   * from_version = her pinned version, to_version = the newest, items deduped
   * across all of them (later wins).
   */
  release: TalentRelease;
  /** Every update row this offer covers (`updateId` = the newest release's row). */
  coveredUpdateIds: string[];
  /**
   * The newest release's OWN from-version. `release.from_version` is her pin on a
   * combined offer, but the release's saved `base_payload` belongs to THIS
   * version: pairing it with her pin would merge from the wrong base (F116).
   */
  baseFromVersion: number;
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
  /** `available`, `previewed`, `undone` (F83: "available again") or `dismissed` (F92: quiet entry only). */
  state: SiteUpdateState;
  releaseId: string;
  designSlug: string;
  designTitle: string;
  fromVersion: number;
  toVersion: number;
  critical: boolean;
  notes: { en: string; es: string };
  /** One entry per open release, oldest first (a combined offer lists each one). */
  releaseNotes: Array<{ toVersion: number; en: string; es: string }>;
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
  opts: { lazyFanOut?: boolean } = {},
): Promise<TalentUpdateNotice[]> {
  // F108: a site below an open release gets its row even if fan-out ran before it arrived.
  if (opts.lazyFanOut !== false) await ensureSiteThemeUpdates(admin, talentProfileId);
  const { data: rows, error } = await admin
    .from("talent_site_theme_updates")
    .select("id, release_id, talent_site_id, state, report")
    .eq("talent_profile_id", talentProfileId)
    // F92: dismissed rows load too, so a dismissed update stays reachable (quiet entry).
    .in("state", [...OPEN_UPDATE_STATES, "dismissed"]);
  if (error) {
    logServerError("themeUpdate.notices", error);
    return [];
  }
  const list = (rows ?? []) as Array<{ id: string; release_id: string; talent_site_id: string; state: string; report?: { addedBlocks?: unknown } | null }>;
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
    admin.from("talent_sites").select("draft_rev, theme_design_version").eq("talent_profile_id", talentProfileId).maybeSingle(),
  ]);
  if (relRes.error) {
    logServerError("themeUpdate.notices.releases", relRes.error);
    return [];
  }
  const releases = (relRes.data ?? []) as unknown as TalentReleaseLean[];
  const byId = new Map(releases.map((r) => [r.id, r]));
  const site = siteRes.data;
  const draftRev = typeof (site as { draft_rev?: number } | null)?.draft_rev === "number" ? (site as { draft_rev: number }).draft_rev : 0;
  const pin = (site as { theme_design_version?: number | null } | null)?.theme_design_version;
  const pinned = typeof pin === "number" ? pin : null;
  const open = list.filter((row) => {
    const rel = byId.get(row.release_id);
    return rel && rel.status === "published" && OPEN_CHANNELS.has(rel.channel) && (pinned === null || rel.to_version > pinned);
  });
  // F110/F111: ONE notice per design, driven by ALL its open rows: labelled
  // from her pin to the newest release; "dismissed" only if every row is.
  const byDesign = new Map<string, typeof open>();
  for (const row of open) {
    const slug = byId.get(row.release_id)!.design_slug;
    byDesign.set(slug, [...(byDesign.get(slug) ?? []), row]);
  }
  const slugs = [...byDesign.keys()];
  const titles = new Map(await Promise.all(slugs.map(async (slug) => [slug, await designTitle(admin, slug)] as const)));
  // F118: an offer with nothing to do (no base and every new block already on
  // her page, or all added) shows no banner, no quiet entry; its rows close.
  const actionable = new Map<string, boolean>();
  for (const [slug, rows] of byDesign) {
    const newest = byId.get([...rows].sort((a, b) => byId.get(a.release_id)!.to_version - byId.get(b.release_id)!.to_version).pop()!.release_id)!;
    const newestRowId = [...rows].sort((a, b) => byId.get(a.release_id)!.to_version - byId.get(b.release_id)!.to_version).pop()!.id;
    const verdict = await offerActionableFor(admin, talentProfileId, slug, pinned, rows, newest, async () => {
      const ctx = await loadUpdateContext(admin, talentProfileId, newestRowId);
      const m = ctx ? await makeSiteMerge(admin)(ctx, applyItemsOf(ctx.release.items ?? [])) : null;
      return !!(m && m.ok && m.critical);
    });
    actionable.set(slug, verdict !== false);
    if (verdict === false) {
      for (const r of rows) {
        await setUpdateState(admin, talentProfileId, r.id, "applied", {
          report: { reason: "nothing_applicable", criticalChecked: true, addedBlocks: addedOf(r.report) },
        });
      }
    }
  }
  const out: TalentUpdateNotice[] = [...byDesign.entries()].filter(([slug]) => actionable.get(slug) !== false).map(([slug, rows]) => {
    const sorted = [...rows].sort((a, b) => byId.get(a.release_id)!.to_version - byId.get(b.release_id)!.to_version);
    const newestRow = sorted[sorted.length - 1]!;
    const rel = byId.get(newestRow.release_id)!;
    const from = pinned !== null ? pinned : rel.from_version; // F130: the real from-version (noBase sites too)
    return {
      updateId: newestRow.id,
      state: combinedUpdateState(sorted.map((r) => r.state as SiteUpdateState)),
      releaseId: rel.id,
      designSlug: slug,
      designTitle: titles.get(slug) ?? slug,
      fromVersion: from,
      toVersion: rel.to_version,
      critical: sorted.some((r) => byId.get(r.release_id)!.critical),
      notes: notesOf(rel.notes),
      releaseNotes: sorted.map((r) => {
        const x = byId.get(r.release_id)!;
        return { toVersion: x.to_version, ...notesOf(x.notes) };
      }),
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
      .select("id, release_id, talent_site_id, state, report")
      .eq("id", updateId)
      .eq("talent_profile_id", talentProfileId)
      .maybeSingle(),
    // supabase-read-unchecked-ok: the name only feeds fallback hydration.
    admin.from("talent_profiles").select("display_name").eq("id", talentProfileId).maybeSingle(),
  ]);
  if (rowRes.error || !rowRes.data) return null;
  const u = rowRes.data as { id: string; release_id: string; talent_site_id: string; state: SiteUpdateState; report?: { addedBlocks?: unknown } | null };
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
  const pinnedVersion = typeof s.theme_design_version === "number" ? s.theme_design_version : null;
  const combined = await combineCoveredUpdates(admin, s.id, release, u, pinnedVersion);
  return {
    updateId: combined.updateId,
    state: combined.state,
    coveredUpdateIds: combined.coveredUpdateIds,
    baseFromVersion: combined.baseFromVersion,
    siteId: s.id,
    siteSlug: s.site_slug,
    talentProfileId,
    displayName: ((prof as { display_name?: string | null } | null)?.display_name ?? "").trim() || "Talent",
    pinnedVersion: typeof s.theme_design_version === "number" ? s.theme_design_version : null,
    draftRev: typeof s.draft_rev === "number" ? s.draft_rev : 0,
    tokenOrigin: s.theme_token_origin && typeof s.theme_token_origin === "object" ? s.theme_token_origin : null,
    addedBlocks: combined.addedBlocks,
    designTitle: await designTitle(admin, release.design_slug),
    release: combined.release,
  };
}

type UpdateRowLite = { id: string; state: SiteUpdateState; report?: { addedBlocks?: unknown } | null };

const addedOf = (r: UpdateRowLite["report"]): string[] =>
  Array.isArray(r?.addedBlocks) ? (r!.addedBlocks as unknown[]).filter((x): x is string => typeof x === "string") : [];

/** Open, not-applied update rows of this site for releases above her pin (oldest first). */
async function loadOpenCovered(
  admin: SupabaseClient,
  siteId: string,
  designSlug: string,
  pinned: number | null,
): Promise<Array<{ row: UpdateRowLite; release: TalentRelease }>> {
  const { data: rows, error } = await admin
    .from("talent_site_theme_updates")
    .select("id, release_id, state, report")
    .eq("talent_site_id", siteId);
  if (error || !Array.isArray(rows)) return [];
  const list = rows as Array<UpdateRowLite & { release_id: string }>;
  if (list.length === 0) return [];
  const { data: rels, error: rErr } = await admin
    .from("talent_theme_releases")
    .select(TALENT_RELEASE_COLUMNS)
    .in(
      "id",
      list.map((r) => r.release_id),
    );
  if (rErr || !Array.isArray(rels)) return [];
  const byId = new Map((rels as unknown as TalentRelease[]).map((r) => [r.id, r]));
  const out: Array<{ row: UpdateRowLite; release: TalentRelease }> = [];
  for (const row of list) {
    const release = byId.get(row.release_id);
    if (
      release &&
      release.design_slug === designSlug &&
      release.status === "published" &&
      OPEN_CHANNELS.has(release.channel) &&
      release.to_version > (pinned ?? 0) &&
      row.state !== "applied"
    ) {
      out.push({ row, release });
    }
  }
  return out.sort((a, b) => a.release.to_version - b.release.to_version);
}

/**
 * F110: fold every open release her site is behind on into ONE offer, from her
 * pinned version to the newest. A site on its release's version (or past it)
 * keeps the single-release context (skipped blocks, applied state).
 */
async function combineCoveredUpdates(
  admin: SupabaseClient,
  siteId: string,
  release: TalentRelease,
  u: UpdateRowLite,
  pinned: number | null,
): Promise<{
  updateId: string;
  state: SiteUpdateState;
  coveredUpdateIds: string[];
  baseFromVersion: number;
  addedBlocks: string[];
  release: TalentRelease;
}> {
  const single = { updateId: u.id, state: u.state, coveredUpdateIds: [u.id], baseFromVersion: release.from_version, addedBlocks: addedOf(u.report), release };
  if (u.state === "applied" || (pinned ?? 0) >= release.to_version) return single;
  const covered = await loadOpenCovered(admin, siteId, release.design_slug, pinned);
  if (covered.length < 2 || !covered.some((c) => c.row.id === u.id)) return single;
  const newest = covered[covered.length - 1]!;
  return {
    updateId: newest.row.id,
    state: combinedUpdateState(covered.map((c) => c.row.state)),
    coveredUpdateIds: covered.map((c) => c.row.id),
    baseFromVersion: newest.release.from_version,
    addedBlocks: [...new Set(covered.flatMap((c) => addedOf(c.row.report)))],
    release: {
      ...newest.release,
      from_version: pinned ?? covered[0]!.release.from_version,
      critical: covered.some((c) => c.release.critical),
      items: combineReleaseItems(covered.map((c) => c.release)),
    },
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
      // The saved base_payload is the newest release's own from-version payload (F116).
      from_version: ctx.baseFromVersion,
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
        published: false,
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
  /** F87: no exact base for her site; only new blocks are offered, Apply is unavailable. */
  noBase: boolean;
  /** What's new list, loaded here so the banner never reads the release body (F74). */
  groups: Array<{ group: WhatsNewGroup; items: TalentReleaseItem[] }>;
  /** F125: a noBase site has an important fix that can be applied on its own. */
  criticalFix: boolean;
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

export async function homeTree(admin: SupabaseClient, talentProfileId: string): Promise<BuilderNode[]> {
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
      noBase: m.noBase,
      groups: groupItems(
        m.noBase
          ? noBaseOfferItems(items, ctx.addedBlocks, tree, m.critical?.itemIds ?? [])
          : withoutPresentBlocks(items, ctx.addedBlocks, tree),
      ),
      criticalFix: !!m.critical,
      hasApplicable: !m.noBase && applyItemsOf(items).length > 0,
      previewUrl: themeUpdatePreviewUrl(ctx.siteSlug, updateId),
      placements: placementOptions(tree, m.noBase ? undefined : m.result.trees.home),
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
  else if (state === "applied" || state === "dismissed") await resolveBellsForRows(admin, talentProfileId, [updateId]);
  return !error;
}

export interface ApplyOutcome {
  draftRev: number;
  kept: number;
  copyKept?: number; // texts she changed that the update left alone (copy conflicts)
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
  // F87: no exact base means only new blocks can be offered; Apply never runs.
  if (m.noBase) return { ok: false, code: "no_base", error: "Your site is older than this version. You can add the new blocks." };
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
    versionLabel: releaseVersionLabel(ctx.release.notes),
    releaseId: ctx.release.id,
    updateId: ctx.updateId,
    updateIds: ctx.coveredUpdateIds,
    actor: "talent",
    kind: "theme_update",
    actorId: input.actorId,
    tokenOrigin: nextTokenOrigin(ctx.tokenOrigin, m.result.report),
  });
  if (!res.ok) return writeFailure(res);
  // F110: every covered row moves to `applied` together.
  for (const id of ctx.coveredUpdateIds) {
    await setUpdateState(deps.admin, ctx.talentProfileId, id, "applied", {
      report: { ...summarizeReport(m.result.report), addedBlocks: ctx.addedBlocks },
    });
  }
  return { ok: true, value: { draftRev: res.draftRev, kept: countParts(editedKept(m.result.report.kept)), copyKept: countCopyKept(m.result.report.conflicts), historyId: res.historyId } };
}

/** The update rows one offer covers (falls back to just the given row). */
async function coveredIdsFor(admin: SupabaseClient, talentProfileId: string, updateId: string): Promise<string[]> {
  const { data: row, error } = await admin
    .from("talent_site_theme_updates")
    .select("talent_site_id, release_id")
    .eq("id", updateId)
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (error || !row) return [updateId];
  const r = row as { talent_site_id: string; release_id: string };
  const [relRes, siteRes] = await Promise.all([
    admin.from("talent_theme_releases").select("design_slug").eq("id", r.release_id).maybeSingle(),
    admin.from("talent_sites").select("theme_design_version").eq("id", r.talent_site_id).maybeSingle(),
  ]);
  const slug = (relRes.data as { design_slug?: string } | null)?.design_slug;
  if (relRes.error || !slug) return [updateId];
  const pin = (siteRes.data as { theme_design_version?: number | null } | null)?.theme_design_version;
  const covered = await loadOpenCovered(admin, r.talent_site_id, slug, typeof pin === "number" ? pin : null);
  return [...new Set([updateId, ...covered.map((c) => c.row.id)])];
}

/** Not now: the banner goes quiet; the update stays in What's new history. */
export async function dismissThemeUpdate(
  admin: SupabaseClient,
  talentProfileId: string,
  updateId: string,
): Promise<UpdateResult<null>> {
  // F111: "Not now" dismisses every row the combined offer covers, not just the newest.
  const ids = await coveredIdsFor(admin, talentProfileId, updateId);
  let ok = true;
  for (const id of ids) {
    ok = (await setUpdateState(admin, talentProfileId, id, "dismissed", { onlyFrom: [...OPEN_UPDATE_STATES] })) && ok;
  }
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
  const item = (ctx.release.items ?? []).find((i) => i.type === "new-block" && (i.id ?? `${i.type}:${i.key}`) === input.itemId);
  if (!item) return { ok: false, code: "not_found", error: "That block is not part of this update." };
  // A block she skipped stays on offer after Apply (the site is re-pinned past
  // it). Merge against the release's FROM version so a never-added block reads
  // as new, never as a block she deleted. Only an added block's removal counts.
  const mergeCtx = ctx.state === "applied" || (ctx.pinnedVersion ?? 0) >= ctx.release.to_version ? { ...ctx, pinnedVersion: ctx.release.from_version } : ctx;
  const m = await deps.merge(mergeCtx, [item]);
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
  const label = first.node ? { en: sectionLabel(first.node), es: sectionLabel(first.node, "es") } : first.key;
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
  await recordAddedBlock(deps.admin, ctx, input.itemId);
  return { ok: true, value: { draftRev: res.draftRev } };
}

/** Remember the block was added, so removing it later is an explicit removal. */
async function recordAddedBlock(admin: SupabaseClient, ctx: UpdateContext, itemId: string): Promise<void> {
  const addedBlocks = [...new Set([...ctx.addedBlocks, itemId])];
  const { error } = await admin
    .from("talent_site_theme_updates")
    .update({ report: { addedBlocks }, updated_at: new Date().toISOString() } as never)
    .in("id", ctx.coveredUpdateIds)
    .eq("talent_profile_id", ctx.talentProfileId);
  if (error) logServerError("themeUpdate.recordAddedBlock", error);
}

// ── Available blocks (skipped new blocks stay reachable after Apply) ─────────

export interface AvailableBlock {
  updateId: string;
  item: TalentReleaseItem;
}

export interface AvailableBlocks {
  blocks: AvailableBlock[];
  placements: PlacementOption[];
  draftRev: number;
}

const stripTree = (key: string) => key.replace(/^(shell|home):/, "");

/**
 * New-block items from releases her site is ON or PAST (update row `applied`)
 * that are not on her page and were never added by her. A block she added and
 * later removed is an explicit removal and is not offered again.
 */
export async function loadAvailableBlocks(admin: SupabaseClient, talentProfileId: string): Promise<AvailableBlocks> {
  const empty: AvailableBlocks = { blocks: [], placements: [], draftRev: 0 };
  const { data: rows, error } = await admin
    .from("talent_site_theme_updates")
    .select("id, release_id, state, report")
    .eq("talent_profile_id", talentProfileId)
    .eq("state", "applied");
  if (error) {
    logServerError("themeUpdate.availableBlocks", error);
    return empty;
  }
  const list = (rows ?? []) as Array<{ id: string; release_id: string; report?: { addedBlocks?: unknown } | null }>;
  if (list.length === 0) return empty;
  const [relRes, tree, siteRes] = await Promise.all([
    admin.from("talent_theme_releases").select(TALENT_RELEASE_COLUMNS).in("id", list.map((r) => r.release_id)),
    homeTree(admin, talentProfileId),
    // supabase-read-unchecked-ok: a missing rev only weakens the race check to "reload".
    admin.from("talent_sites").select("draft_rev").eq("talent_profile_id", talentProfileId).maybeSingle(),
  ]);
  const releases = new Map(((relRes.data ?? []) as TalentRelease[]).map((r) => [r.id, r]));
  const draftRev = (siteRes.data as { draft_rev?: number } | null)?.draft_rev ?? 0;
  const blocks: AvailableBlock[] = [];
  const seen = new Set<string>();
  const ordered = [...list].sort((a, b) => (releases.get(b.release_id)?.to_version ?? 0) - (releases.get(a.release_id)?.to_version ?? 0));
  for (const row of ordered) {
    const rel = releases.get(row.release_id);
    if (!rel || rel.status !== "published") continue;
    const added = new Set(Array.isArray(row.report?.addedBlocks) ? (row.report!.addedBlocks as unknown[]) : []);
    for (const item of Array.isArray(rel.items) ? rel.items : []) {
      if (item.type !== "new-block") continue;
      const view = toTalentItem(item);
      if (seen.has(view.id) || added.has(view.id)) continue;
      if (findKeyPath(tree, stripTree(item.key))) continue;
      seen.add(view.id);
      blocks.push({ updateId: row.id, item: view });
    }
  }
  return { blocks, placements: placementOptions(tree), draftRev };
}
