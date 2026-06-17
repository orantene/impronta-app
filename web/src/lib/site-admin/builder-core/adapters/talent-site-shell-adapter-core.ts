/**
 * Talent-site SHELL freeform adapter — PURE FACTORY (no runtime imports).
 *
 * Mirrors `site-shell-adapter-core.ts`, keyed to a TALENT's site shell instead
 * of the agency's. The "shell" is the header (logo + nav) + footer rendered
 * around every page of a Talent Max Site. It is edited as a freeform
 * `builderTree` and persisted to `talent_sites.shell_tree` (the DRAFT) ; an
 * explicit Publish bakes `shell_tree → shell_published` (the public render reads
 * `shell_published`).
 *
 * Reuses the `site_shell` surface KIND (the builder's "shared header/footer"
 * surface — `buildSiteShellBuilderConfig` already sets `canEditShell: true`),
 * but binds a TALENT action surface that writes `talent_sites`, never
 * `cms_pages`. Mutations call `assertNoLegacyBuilderWrite("site_shell",
 * "talent_sites")` — a no-op (talent_sites is not a legacy slot table), kept for
 * the pattern + the §F static-grep guard.
 *
 * Plan/tier gating is server-enforced: the bound actions go through the
 * owner+Max gate, and `talent_sites` RLS independently allows only the owner to
 * write. The pure factory (this file) has no I/O so a spy test can drive it.
 */

import type {
  CompositionData,
  CompositionLoadResult,
  CompositionSaveInput,
  CompositionSaveResult,
  SaveDraftResult,
  PublishResult,
} from "@/lib/site-admin/edit-mode/composition-actions";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

import type {
  BuilderSurfaceAdapter,
  BuilderSurfaceContext,
  BuilderSurfacePublishInput,
  BuilderSurfaceSaveDraftInput,
} from "../surface-adapter";
import { assertNoLegacyBuilderWrite } from "../legacy-write-guard";

/** Minimal `talent_sites` row shape the talent-shell adapter reads. */
export interface TalentSiteShellRow {
  /** talent_sites.id (informational — the actions key off talentProfileId). */
  id: string;
  /** The DRAFT shell tree (`talent_sites.shell_tree`). `[]` on a fresh site. */
  shellTree: unknown;
  /** The PUBLISHED shell tree — the load fallback when the draft is empty. */
  shellPublished: unknown;
  /** `talent_sites.site_published_at` — surfaces as the live-published marker. */
  sitePublishedAt: string | null;
  updatedAt: string;
}

/** pageVersion = `updated_at` epoch seconds (matches every freeform adapter). */
function versionFromRow(row: TalentSiteShellRow): number {
  return Math.floor(new Date(row.updatedAt).getTime() / 1000);
}

/** Patch the adapter writes to `talent_sites` on a shell save. */
export interface TalentSiteShellPatch {
  shellTree: unknown;
  updatedAt: string;
}

/**
 * Action surface the talent-shell adapter needs. Injected so a spy test can
 * prove ZERO `cms_pages`/`cms_page_sections` writes; production binds real
 * owner-gated `talent_sites` mutations.
 */
export interface TalentSiteShellAdapterActions {
  /** Load the talent's `talent_sites` shell row. Null on hard failure / no row. */
  loadShell: (input: {
    talentProfileId: string;
  }) => Promise<TalentSiteShellRow | null>;
  /** Persist the freeform draft tree to `talent_sites.shell_tree`. */
  saveShell: (input: {
    talentProfileId: string;
    patch: TalentSiteShellPatch;
  }) => Promise<{ ok: true; updatedAt: string } | { ok: false; error: string }>;
  /** Bake `shell_tree → shell_published` (publishes ONLY the shell). */
  publishShell: (input: {
    talentProfileId: string;
  }) => Promise<
    | { ok: true; publishedAt: string; updatedAt: string }
    | { ok: false; error: string }
  >;
}

/** Build a freeform composition from the talent shell row. Pure — no I/O. */
export function buildTalentSiteShellComposition(
  row: TalentSiteShellRow,
  locale: string,
): CompositionData {
  // Prefer the freeform DRAFT; fall back to the published tree so a freshly
  // provisioned shell opens against its live header/footer.
  const draftTree = Array.isArray(row.shellTree) ? (row.shellTree as BuilderNodeTree) : [];
  const publishedTree = Array.isArray(row.shellPublished)
    ? (row.shellPublished as BuilderNodeTree)
    : [];
  const builderTree: BuilderNodeTree = draftTree.length > 0 ? draftTree : publishedTree;
  return {
    locale: locale as CompositionData["locale"],
    pageId: row.id,
    pageVersion: versionFromRow(row),
    liveSitePublishedAt: row.sitePublishedAt,
    metadata: {
      title: "Site shell",
      metaTitle: null,
      metaDescription: null,
      introTagline: null,
      ogTitle: null,
      ogDescription: null,
      ogImageUrl: null,
      canonicalUrl: null,
      noindex: false,
    },
    slots: {},
    builderTree,
    slotDefs: [],
    library: [],
    styleClasses: undefined,
    availableLocales: [locale as CompositionData["locale"]],
  };
}

/**
 * Build the talent-site_shell freeform adapter over a given action surface.
 *
 * `BuilderSurfaceContext` mapping: `ctx.pageId` carries the `talentProfileId`
 * (the key every action scopes on); `ctx.locale` is the active locale.
 * Mutations call `assertNoLegacyBuilderWrite("site_shell", "talent_sites")`
 * before any I/O (a no-op backstop — talent_sites is not a legacy slot table).
 */
export function createTalentSiteShellAdapter(
  actions: TalentSiteShellAdapterActions,
  opts?: {
    assertNoLegacyWrite?: (table: string) => void;
    /** Talent profile id to scope every DB op. One adapter per talent. */
    talentProfileId?: string;
  },
): BuilderSurfaceAdapter {
  const guard =
    opts?.assertNoLegacyWrite ??
    ((table: string) => assertNoLegacyBuilderWrite("site_shell", table));

  const captured = opts?.talentProfileId ?? "";

  async function persistTree(
    talentProfileId: string,
    builderTree: BuilderNodeTree | undefined,
  ): Promise<CompositionSaveResult> {
    guard("talent_sites");
    if (!talentProfileId) {
      return { ok: false, error: "talent_site_shell: talentProfileId is required." };
    }
    const result = await actions.saveShell({
      talentProfileId,
      patch: { shellTree: builderTree ?? [], updatedAt: new Date().toISOString() },
    });
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      pageVersion: Math.floor(new Date(result.updatedAt).getTime() / 1000),
    };
  }

  return {
    kind: "site_shell",

    async load(ctx: BuilderSurfaceContext): Promise<CompositionLoadResult> {
      const talentProfileId = captured || ctx.pageId || "";
      const row = await actions.loadShell({ talentProfileId });
      if (!row) {
        return { ok: false, error: "Your site shell isn't ready yet." };
      }
      return { ok: true, data: buildTalentSiteShellComposition(row, ctx.locale) };
    },

    async save(
      ctx: BuilderSurfaceContext,
      input: CompositionSaveInput,
    ): Promise<CompositionSaveResult> {
      return persistTree(captured || ctx.pageId || "", input.builderTree);
    },

    async saveDraft(
      ctx: BuilderSurfaceContext,
      input: BuilderSurfaceSaveDraftInput,
    ): Promise<SaveDraftResult> {
      const result = await persistTree(captured || ctx.pageId || "", input.builderTree);
      if (!result.ok) return { ok: false, error: result.error };
      return {
        ok: true,
        pageVersion: result.pageVersion,
        savedAt: new Date().toISOString(),
      };
    },

    async publish(
      ctx: BuilderSurfaceContext,
      _input: BuilderSurfacePublishInput,
    ): Promise<PublishResult> {
      guard("talent_sites");
      const talentProfileId = captured || ctx.pageId || "";
      if (!talentProfileId) {
        return { ok: false, error: "talent_site_shell publish: talentProfileId is required." };
      }
      const result = await actions.publishShell({ talentProfileId });
      if (!result.ok) return { ok: false, error: result.error };
      return {
        ok: true,
        pageVersion: Math.floor(new Date(result.updatedAt).getTime() / 1000),
        publishedAt: result.publishedAt,
      };
    },
  };
}
