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
import type {
  RevisionRestoreResult,
  RevisionsLoadResult,
} from "@/lib/site-admin/edit-mode/revisions-actions";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

import type {
  BuilderSurfaceAdapter,
  BuilderSurfaceContext,
  BuilderSurfacePublishInput,
  BuilderSurfaceSaveDraftInput,
  BuilderSurfaceRestoreInput,
} from "../surface-adapter";
import { assertNoLegacyBuilderWrite } from "../legacy-write-guard";
import {
  coerceStyleClassRegistry,
  coerceStylePresetRegistry,
  serializeStyleClassRegistry,
  serializeStylePresetRegistry,
} from "@/lib/site-admin/builder-node/style-registry-coerce";

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
  /** STYLE-1 — site-scoped style-class registry (talent_sites.style_classes). */
  styleClasses?: unknown;
  /** STYLE-1 — site-scoped presets envelope (talent_sites.style_presets). */
  stylePresets?: unknown;
}

/** pageVersion = `updated_at` epoch seconds (matches every freeform adapter). */
function versionFromRow(row: TalentSiteShellRow): number {
  return Math.floor(new Date(row.updatedAt).getTime() / 1000);
}

/** Patch the adapter writes to `talent_sites` on a shell save. */
export interface TalentSiteShellPatch {
  shellTree: unknown;
  updatedAt: string;
  /** STYLE-1 — serialized style-class registry (`undefined` = leave untouched). */
  style_classes?: unknown;
  /** STYLE-1 — serialized presets envelope (`undefined` = untouched). */
  style_presets?: unknown;
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
  /**
   * REV-1 — OPTIONAL: restore a `talent_site_revisions` snapshot's freeform
   * `shell_tree` back onto the talent site's DRAFT shell. Re-asserts admin
   * prop-locks (C1 chokepoint) on the restored tree. Returns the new
   * `updated_at`. A shell adapter built WITHOUT this omits `restoreRevision`
   * (call-sites guard on its presence), exactly like the agency `site_shell` /
   * `cms_page` / `talent_page` model. Keys off `talentProfileId`.
   */
  restoreRevision?: (input: {
    talentProfileId: string;
    revisionId: string;
  }) => Promise<{ ok: true; updatedAt: string } | { ok: false; error: string }>;
  /**
   * REV-1b — OPTIONAL: list the talent's shell revisions (newest-first) via an
   * OWNER-gated read of `talent_site_revisions`. The RevisionsDrawer's default
   * list read goes through the STAFF-gated homepage loader; a talent editing
   * their own shell has no staff capability, so that read is denied and the
   * drawer renders empty even though `restoreRevision` works. Supplying this
   * action makes the adapter expose `loadRevisions`, which the drawer prefers
   * over the staff-gated default. Keys off `talentProfileId`. A shell adapter
   * built WITHOUT it omits `loadRevisions` (the drawer keeps the default).
   */
  loadShellRevisions?: (input: {
    talentProfileId: string;
  }) => Promise<RevisionsLoadResult>;
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
      // SEO-1 contract field. The talent site-shell is the shared header/footer,
      // not a public page (capabilities.seo === false), so structured data is null.
      jsonLd: null,
    },
    slots: {},
    builderTree,
    slotDefs: [],
    library: [],
    // STYLE-1 — the talent site registries travel with the SITE row.
    styleClasses: coerceStyleClassRegistry(row.styleClasses),
    stylePresets: coerceStylePresetRegistry(row.stylePresets),
    availableLocales: [locale as CompositionData["locale"]],
  };
}

/** STYLE-1 — map a save input's style registries to the talent-site patch slice. */
function talentSiteShellStyleRegistryPatch(input: {
  styleClasses?: CompositionSaveInput["styleClasses"];
  stylePresets?: CompositionSaveInput["stylePresets"];
}): Pick<TalentSiteShellPatch, "style_classes" | "style_presets"> {
  const patch: Pick<TalentSiteShellPatch, "style_classes" | "style_presets"> = {};
  if (input.styleClasses !== undefined) {
    patch.style_classes = serializeStyleClassRegistry(input.styleClasses);
  }
  if (input.stylePresets !== undefined) {
    patch.style_presets = serializeStylePresetRegistry(input.stylePresets);
  }
  return patch;
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
    stylePatch: Pick<TalentSiteShellPatch, "style_classes" | "style_presets"> = {},
  ): Promise<CompositionSaveResult> {
    guard("talent_sites");
    if (!talentProfileId) {
      return { ok: false, error: "talent_site_shell: talentProfileId is required." };
    }
    const result = await actions.saveShell({
      talentProfileId,
      patch: {
        shellTree: builderTree ?? [],
        updatedAt: new Date().toISOString(),
        ...stylePatch,
      },
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
      return persistTree(
        captured || ctx.pageId || "",
        input.builderTree,
        talentSiteShellStyleRegistryPatch(input),
      );
    },

    async saveDraft(
      ctx: BuilderSurfaceContext,
      input: BuilderSurfaceSaveDraftInput,
    ): Promise<SaveDraftResult> {
      const result = await persistTree(
        captured || ctx.pageId || "",
        input.builderTree,
        talentSiteShellStyleRegistryPatch(input),
      );
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

    // REV-1 — restore a saved shell revision's freeform tree onto the draft.
    // Only present when the action surface supplies `restoreRevision`
    // (production binds it; the spy test omits it to prove a no-revision shell
    // still type-checks). Mirrors the agency `site_shell` adapter; keys off the
    // captured `talentProfileId` (falling back to `ctx.pageId`, as save does).
    ...(actions.restoreRevision
      ? {
          async restoreRevision(
            ctx: BuilderSurfaceContext,
            input: BuilderSurfaceRestoreInput,
          ): Promise<RevisionRestoreResult> {
            guard("talent_sites");
            const talentProfileId = captured || ctx.pageId || "";
            if (!talentProfileId) {
              return {
                ok: false,
                error: "talent_site_shell restoreRevision: talentProfileId is required.",
              };
            }
            const result = await actions.restoreRevision!({
              talentProfileId,
              revisionId: input.revisionId,
            });
            if (!result.ok) return { ok: false, error: result.error };
            return {
              ok: true,
              pageVersion: Math.floor(
                new Date(result.updatedAt).getTime() / 1000,
              ),
            };
          },
        }
      : {}),

    // REV-1b — OWNER-gated revision LIST read. Only present when the action
    // surface supplies `loadShellRevisions` (production binds it; a no-list spy
    // omits it to prove the optional contract). Keys off the captured
    // `talentProfileId` (falling back to `ctx.pageId`, exactly like load/save).
    // Closes the drawer's LIST gap: the talent owns the read, instead of
    // falling through to the staff-gated homepage loader.
    ...(actions.loadShellRevisions
      ? {
          async loadRevisions(
            ctx: BuilderSurfaceContext,
          ): Promise<RevisionsLoadResult> {
            guard("talent_sites");
            const talentProfileId = captured || ctx.pageId || "";
            if (!talentProfileId) {
              return {
                ok: false,
                error:
                  "talent_site_shell loadRevisions: talentProfileId is required.",
              };
            }
            return actions.loadShellRevisions!({ talentProfileId });
          },
        }
      : {}),
  };
}
