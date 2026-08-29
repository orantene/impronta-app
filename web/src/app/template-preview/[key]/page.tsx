/**
 * Shared, owner-gated HYDRATED template-preview route (TMPL-2).
 *
 * URL: /template-preview/[key]?kind=<family>&talent=<profileId>
 *
 * Every template picker (talent profile slot-templates AND the Max-site template
 * gallery) opens this ONE route via the shared `getTemplatePreviewUrl` helper.
 * It renders the requested template's tree HYDRATED with real data:
 *
 *   - `?talent=<id>` + the current session OWNS that profile → the talent's real
 *     name / photo / bio / services (owner-gated, see resolvePreviewHydration).
 *   - otherwise (anonymous, non-owner, missing) → a public-safe DEMO persona.
 *
 * The single route serves every template family, selected by `?kind`:
 *   - `talent-site` → slot-based snapshot via `buildTemplateSnapshot`
 *   - `max-site`    → freeform builder tree via `buildMaxSiteTemplateTrees`
 *                     hydrated with `hydrateTalentTree(talentProfileTokens(...))`
 *   - `db-template` → a persisted `builder_templates` row by id (e.g. a
 *                     Default-surfaces pointer), super_admin gated via
 *                     `getTemplateById`. The row's `target_context` decides
 *                     WHICH pipeline renders it (see below).
 *
 * TMPL-3 (the preview used to lie for workspace templates)
 * ────────────────────────────────────────────────────────
 * The `db-template` branch hardcoded `siteKind: "talent_personal"`, hydrated via
 * `hydrateTalentTree` with TALENT tokens, and rendered through
 * `TalentSiteRenderer` with a demo persona and no tenant context — for EVERY
 * persisted row, including the workspace-targeted ones. A platform Default
 * Storefront is a workspace-targeted template by definition, so the one preview
 * an operator would use to vet the platform's default site was showing it
 * through the wrong pipeline: workspace-scoped connected nodes mis-hydrated or
 * vanished, and the empty result read as the design.
 *
 * So `db-template` now forks on the row's target:
 *   - `talent`             → unchanged talent pipeline (below)
 *   - `workspace` / `both` → `WorkspaceTemplatePreview`, which renders the tree
 *                            through `HomepageCmsSections` against a REAL tenant
 *                            id, the same call `agency-home-storefront.tsx`
 *                            makes for the live default storefront.
 * `both` resolves to the storefront path because that is the strictly harder
 * context to fake (connected nodes + tenant theme); a `both` design that reads
 * correctly there is the one worth pointing a default at.
 *
 * Every talent-family preview still renders through the SAME `TalentSiteRenderer`
 * (which branches internally to the shared freeform renderer for freeform
 * snapshots) — no second talent renderer, no per-family render fork.
 *
 * This is NOT the dev harness (`/dev/template-preview/[key]`): that one renders
 * the platform DEFAULT trees with a fixture and no real talent context for Lab
 * QA. This route is the production, owner-data preview the pickers embed.
 */
import { notFound } from "next/navigation";

import { TalentSiteRenderer } from "@/components/talent/site/TalentSiteRenderer";
import {
  previewFamilyForRegistry,
  type TemplatePreviewFamily,
} from "@/lib/site-admin/builder-core/templates/template-def";
import { getTemplateById } from "@/lib/site-admin/builder-core/templates/registry-admin-actions";
import { hydrateTalentTree } from "@/lib/talent-site/default-talent-tree";
import {
  buildMaxSiteTemplateTrees,
  isMaxSiteTemplateKey,
} from "@/lib/talent-site/max-site-templates/registry";
import { resolvePreviewHydration } from "@/lib/talent-site/server/preview-data";
import { resolveWorkspacePreviewContext } from "@/lib/site-admin/server/preview-workspace-context";
import {
  buildTemplateSnapshot,
  isTalentSiteTemplateKey,
} from "@/lib/talent-site/templates/registry";
import type { TalentSiteSnapshot } from "@/lib/talent-site/types";
import { WorkspaceTemplatePreview } from "./workspace-template-preview";

export const dynamic = "force-dynamic";

function parseFamily(raw: string | undefined): TemplatePreviewFamily {
  if (raw === "max-site") return "max-site";
  if (raw === "talent-site") return "talent-site";
  if (raw === "db-template") return "db-template";
  // Tolerate a registry-kind value (page-design etc.) → map to a family.
  if (raw === "page-design") return previewFamilyForRegistry("page-design");
  return "talent-site";
}

export default async function TemplatePreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ kind?: string; talent?: string; tenant?: string }>;
}) {
  const [{ key }, sp] = await Promise.all([params, searchParams]);
  const family = parseFamily(sp.kind);
  const talentProfileId = sp.talent;

  // Owner-gated data resolution — real profile only when the session owns it,
  // otherwise the public-safe demo persona (never leaks; never 403s).
  const hydration = await resolvePreviewHydration(talentProfileId);

  let snapshot: TalentSiteSnapshot | null = null;

  if (family === "db-template") {
    // Persisted-template family: `key` is a `builder_templates.id` (e.g. a
    // Default-surfaces pointer). `getTemplateById` is super_admin-gated, so a
    // non-admin / unknown id resolves to notFound() (the panel pre-validates the
    // pointer, so this is the safety net for the ghost stale-pointer case rather
    // than a silent blank render).
    const loaded = await getTemplateById(key);
    if (!loaded.ok) notFound();

    // WORKSPACE / BOTH → the storefront pipeline, against a real tenant. This
    // is the branch that makes the preview honest for a platform default.
    if (
      loaded.data.target_context === "workspace" ||
      loaded.data.target_context === "both"
    ) {
      const tenant = await resolveWorkspacePreviewContext(sp.tenant ?? null);
      return (
        <WorkspaceTemplatePreview
          title={loaded.data.title}
          metaDescription={loaded.data.description}
          builderTree={loaded.data.builder_tree}
          tenant={tenant}
          locale="en"
        />
      );
    }

    // TALENT (and the unreachable `platform`) → the untouched talent pipeline.
    const tree = hydrateTalentTree(loaded.data.builder_tree, hydration.tokens);
    snapshot = {
      version: 1,
      siteKind: "talent_personal",
      templateKey: loaded.data.slug,
      compositionMode: "freeform",
      publishedAt: null,
      pageVersion: 1,
      locale: "en",
      fields: {
        title: loaded.data.title,
        metaDescription: loaded.data.description,
        introTagline: hydration.tokens.tagline || null,
      },
      templateSchemaVersion: 1,
      slots: [],
      builderTree: tree,
    };
  } else if (family === "talent-site") {
    if (!isTalentSiteTemplateKey(key)) notFound();
    snapshot = buildTemplateSnapshot(key, {
      profile: hydration.profile,
      media: hydration.media,
    });
  } else {
    // Max-site freeform family — build the home tree, hydrate it with the
    // talent's tokens, wrap it as a freeform snapshot so the SAME renderer
    // handles it. Unknown key → 404 (no silent demo for a bad key).
    if (!isMaxSiteTemplateKey(key)) notFound();
    const { homeTree } = buildMaxSiteTemplateTrees(key, {
      displayName: hydration.tokens.displayName,
    });
    const tree = hydrateTalentTree(homeTree, hydration.tokens);
    snapshot = {
      version: 1,
      siteKind: "talent_personal",
      templateKey: key,
      compositionMode: "freeform",
      publishedAt: null,
      pageVersion: 1,
      locale: "en",
      fields: {
        title: hydration.tokens.displayName,
        metaDescription: hydration.tokens.tagline || null,
        introTagline: hydration.tokens.tagline || null,
      },
      templateSchemaVersion: 1,
      slots: [],
      builderTree: tree,
    };
  }

  if (!snapshot) notFound();

  return (
    <div style={{ minHeight: "100vh", background: "#fff" }}>
      {/* No tenant context in a preview → embeds (none in these trees) degrade
          to nothing; the freeform renderer applies the platform-default theme. */}
      <TalentSiteRenderer snapshot={snapshot} locale="en" />
    </div>
  );
}
