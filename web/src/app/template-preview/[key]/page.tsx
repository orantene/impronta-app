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
 * The single route serves BOTH template families, selected by `?kind`:
 *   - `talent-site` → slot-based snapshot via `buildTemplateSnapshot`
 *   - `max-site`    → freeform builder tree via `buildMaxSiteTemplateTrees`
 *                     hydrated with `hydrateTalentTree(talentProfileTokens(...))`
 * Both render through the SAME `TalentSiteRenderer` (which branches internally to
 * the shared freeform renderer for freeform snapshots) — no second preview
 * endpoint, no per-family render fork.
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
import { hydrateTalentTree } from "@/lib/talent-site/default-talent-tree";
import {
  buildMaxSiteTemplateTrees,
  isMaxSiteTemplateKey,
} from "@/lib/talent-site/max-site-templates/registry";
import { resolvePreviewHydration } from "@/lib/talent-site/server/preview-data";
import {
  buildTemplateSnapshot,
  isTalentSiteTemplateKey,
} from "@/lib/talent-site/templates/registry";
import type { TalentSiteSnapshot } from "@/lib/talent-site/types";

export const dynamic = "force-dynamic";

function parseFamily(raw: string | undefined): TemplatePreviewFamily {
  if (raw === "max-site") return "max-site";
  if (raw === "talent-site") return "talent-site";
  // Tolerate a registry-kind value (page-design etc.) → map to a family.
  if (raw === "page-design") return previewFamilyForRegistry("page-design");
  return "talent-site";
}

export default async function TemplatePreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ kind?: string; talent?: string }>;
}) {
  const [{ key }, sp] = await Promise.all([params, searchParams]);
  const family = parseFamily(sp.kind);
  const talentProfileId = sp.talent;

  // Owner-gated data resolution — real profile only when the session owns it,
  // otherwise the public-safe demo persona (never leaks; never 403s).
  const hydration = await resolvePreviewHydration(talentProfileId);

  let snapshot: TalentSiteSnapshot | null = null;

  if (family === "talent-site") {
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
