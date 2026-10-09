import "server-only";

/**
 * DESIGN RELEASE UPGRADE, server side: load a site's rows, run the pure
 * `upgradeSiteDesign`, write the result to the DRAFT (same writer + history
 * entry the app's own "What's new" apply uses) and, only when it is safe,
 * publish through the service-role publish path (`publishDemoSite`).
 *
 * "Safe to publish" = the live site already equals the draft, so publishing
 * can only ship the upgrade and never a talent's unpublished edits. Otherwise
 * the draft is upgraded and the site is reported as "needs publish".
 *
 * Used by the release hook (`DESIGN_AUTO_UPGRADE`) and by
 * `scripts/upgrade-site-designs.mjs`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { applyThemeUpdateToDraft } from "@/lib/talent-site/history/history.server";
import { loadTemplateHydrationTokens } from "./server/apply-template-core";
import { publishDemoSite } from "./server/demo-pipeline.server";
import { stableStringify } from "./theme-releases/origin";
import { loadThemeVersionPayload } from "./theme-releases/theme-versions.server";
import { loadReleaseDesign } from "./theme-releases/release-design.server";
import { supersedeStaleUpdateRows } from "./theme-releases/superseded-rows.server";
import { upgradeSiteDesign, type UpgradeResult, type UpgradeSiteInput } from "./design-upgrade";
import type { DesignPayload } from "./theme-catalog/types";

export interface ReleaseRow {
  design_slug: string;
  to_version: number;
  status: string;
  channel?: string | null;
}

/**
 * The latest RELEASED version per design: the highest `to_version` of a
 * published release (optin / default). Draft and demo-channel versions are
 * not released and are never a target.
 */
export function pickLatestReleased(rows: ReadonlyArray<ReleaseRow>): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (r.status !== "published") continue;
    if (r.channel && r.channel !== "optin" && r.channel !== "default") continue;
    if ((out.get(r.design_slug) ?? -1) < r.to_version) out.set(r.design_slug, r.to_version);
  }
  return out;
}

export interface LiveVsDraft {
  shellTree: unknown;
  shellPublished: unknown;
  designTokensDraft: unknown;
  designTokens: unknown;
  /** Count of the talent's pages whose draft body differs from the live body. */
  pagesUnpublished: number;
}

/** True when publishing now would ship nothing but the upgrade. */
export function isLiveEqualToDraft(s: LiveVsDraft): boolean {
  return (
    s.pagesUnpublished === 0 &&
    stableStringify(s.shellTree ?? []) === stableStringify(s.shellPublished ?? []) &&
    stableStringify(s.designTokensDraft ?? {}) === stableStringify(s.designTokens ?? {})
  );
}

export interface SiteUpgradeRow extends UpgradeSiteInput {
  siteId: string;
  talentProfileId: string;
  userId: string;
  profileCode: string;
  homePageId: string | null;
  draftRev: number;
  live: LiveVsDraft;
}

export type SitePlan =
  | { kind: "up_to_date"; row: SiteUpgradeRow }
  | { kind: "error"; row: SiteUpgradeRow; error: string }
  | { kind: "upgrade"; row: SiteUpgradeRow; upgrade: Extract<UpgradeResult, { ok: true; upToDate: false }>; canPublish: boolean };

/** READ-ONLY: what the upgrade would do to one site. */
export async function planSiteUpgrade(
  row: SiteUpgradeRow,
  target: { version: number; payload: DesignPayload },
  loadBase: (version: number) => Promise<DesignPayload | null>,
  loadHydration: (talentProfileId: string) => Promise<Awaited<ReturnType<typeof loadTemplateHydrationTokens>>> = loadTemplateHydrationTokens,
): Promise<SitePlan> {
  if (row.pinnedVersion !== null && row.pinnedVersion >= target.version) return { kind: "up_to_date", row };
  const hydration = await loadHydration(row.talentProfileId);
  if (!hydration) return { kind: "error", row, error: "Hydration tokens unavailable; refusing an empty build." };
  const basePayload = row.pinnedVersion === null ? null : await loadBase(row.pinnedVersion);
  const r = upgradeSiteDesign({ site: row, target, basePayload, hydration });
  if (!r.ok) return { kind: "error", row, error: r.error };
  if (r.upToDate) return { kind: "up_to_date", row };
  return { kind: "upgrade", row, upgrade: r, canPublish: !r.noBase && isLiveEqualToDraft(row.live) };
}

export type ApplyOutcome =
  | { ok: true; published: boolean; note: string }
  | { ok: false; error: string };

/** Write one planned upgrade to the draft (CAS on draft_rev) and publish only when safe. */
export async function applySitePlan(
  admin: SupabaseClient,
  plan: Extract<SitePlan, { kind: "upgrade" }>,
  designTitle: string,
  releaseId: string | null,
): Promise<ApplyOutcome> {
  const { row, upgrade } = plan;
  if (upgrade.noBase) return { ok: false, error: "No exact base snapshot for the pinned version; not applied." };
  if (!row.homePageId) return { ok: false, error: "Home page not found." };
  const res = await applyThemeUpdateToDraft(admin, {
    siteId: row.siteId,
    homePageId: row.homePageId,
    expectedDraftRev: row.draftRev,
    shell: upgrade.shell,
    home: upgrade.home,
    tokens: upgrade.tokens,
    report: upgrade.report,
    designName: designTitle,
    fromVersion: upgrade.fromVersion,
    toVersion: upgrade.toVersion,
    releaseId,
    updateId: null,
    kind: "theme_update",
    actor: "tulala",
    actorId: null,
    tokenOrigin: upgrade.tokenOrigin,
  });
  if (!res.ok) return { ok: false, error: `${res.code ?? "write"}: ${res.error}` };
  // THEME CORE P1: the pin moved; open rows at or below it close.
  await supersedeStaleUpdateRows(admin, [
    { siteId: row.siteId, talentProfileId: row.talentProfileId, designSlug: row.designSlug, pin: upgrade.toVersion },
  ]);
  if (!plan.canPublish) return { ok: true, published: false, note: "needs publish" };
  await publishDemoSite(admin, {
    siteId: row.siteId,
    talentProfileId: row.talentProfileId,
    profileCode: row.profileCode,
    userId: row.userId,
  });
  return { ok: true, published: true, note: "published" };
}

/**
 * Release hook (flag `DESIGN_AUTO_UPGRADE`, default off): after a design
 * version reaches `default`, upgrade every published, non-demo site on that
 * design that sits below it. Per-site failures are collected, never thrown.
 */
export function isDesignAutoUpgradeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.DESIGN_AUTO_UPGRADE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

export async function upgradePublishedSites(
  admin: SupabaseClient,
  release: { id: string; design_slug: string; to_version: number },
  designTitle: string,
): Promise<{ improved: number; failures: string[] }> {
  const out = { improved: 0, failures: [] as string[] };
  const design = await loadReleaseDesign(admin, release);
  if (!design) return { ...out, failures: ["design not found"] };
  const target = { version: release.to_version, payload: design.payload };
  const baseCache = new Map<number, DesignPayload | null>();
  const loadBase = async (v: number) => {
    if (!baseCache.has(v)) baseCache.set(v, await loadThemeVersionPayload(admin, release.design_slug, v));
    return baseCache.get(v) ?? null;
  };
  const { data: sites, error } = await admin
    .from("talent_sites")
    .select(
      "id, talent_profile_id, theme_design_slug, theme_design_version, theme_look_slug, theme_token_origin, shell_tree, shell_published, design_tokens_draft, design_tokens, draft_rev",
    )
    .eq("theme_design_slug", release.design_slug)
    .not("site_published_at", "is", null)
    .lt("theme_design_version", release.to_version);
  if (error) return { ...out, failures: [error.message] };
  for (const s of (sites ?? []) as Array<Record<string, unknown>>) {
    const profileId = s.talent_profile_id as string;
    try {
      const [profRes, pagesRes] = await Promise.all([
        admin.from("talent_profiles").select("user_id, profile_code, is_demo").eq("id", profileId).is("deleted_at", null).maybeSingle(),
        admin.from("talent_pages").select("id, blocks, blocks_published, is_home").eq("talent_profile_id", profileId),
      ]);
      if (profRes.error || pagesRes.error) throw new Error(profRes.error?.message ?? pagesRes.error?.message ?? "read failed");
      const p = profRes.data as { user_id: string; profile_code: string; is_demo: boolean } | null;
      if (!p || p.is_demo) continue; // demos are updated by "Publish to demos"
      const list = (pagesRes.data ?? []) as Array<{ id: string; blocks: unknown; blocks_published: unknown; is_home: boolean }>;
      const home = list.find((x) => x.is_home);
      const row: SiteUpgradeRow = {
        siteId: s.id as string,
        talentProfileId: profileId,
        userId: p.user_id,
        profileCode: p.profile_code,
        designSlug: release.design_slug,
        pinnedVersion: typeof s.theme_design_version === "number" ? s.theme_design_version : null,
        shellTree: s.shell_tree,
        homeBlocks: home?.blocks ?? [],
        designTokensDraft: s.design_tokens_draft,
        themeTokenOrigin: s.theme_token_origin,
        themeLookSlug: (s.theme_look_slug as string | null) ?? null,
        homePageId: home?.id ?? null,
        draftRev: typeof s.draft_rev === "number" ? s.draft_rev : 0,
        live: {
          shellTree: s.shell_tree,
          shellPublished: s.shell_published,
          designTokensDraft: s.design_tokens_draft,
          designTokens: s.design_tokens,
          pagesUnpublished: list.filter((x) => stableStringify(x.blocks ?? []) !== stableStringify(x.blocks_published ?? [])).length,
        },
      };
      const plan = await planSiteUpgrade(row, target, loadBase);
      if (plan.kind === "error") out.failures.push(`${p.profile_code}: ${plan.error}`);
      if (plan.kind !== "upgrade") continue;
      const r = await applySitePlan(admin, plan, designTitle, release.id);
      if (r.ok) out.improved += 1;
      else out.failures.push(`${p.profile_code}: ${r.error}`);
    } catch (err) {
      logServerError("designUpgrade.hook", err);
      out.failures.push(`${profileId}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }
  return out;
}
