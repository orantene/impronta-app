/**
 * Card Design studio (P2.2) — the workspace-admin control surface that makes
 * "agency admin changes the talent-card design once → it syncs everywhere"
 * real.
 *
 * A KIT (editorial-noir / magazine / minimal-portrait) or a per-token color
 * knob writes the card-family tokens (template.directory-card-family +
 * card.surface / card.name-color / card.muted) into `agency_branding`'s design
 * draft. ONE Publish promotes the draft to live and busts the storefront cache
 * tag, so every surface that renders the canonical <TalentCard> repaints with
 * zero per-card edits.
 *
 * Self-contained sub-route (forms/ precedent): a server page that resolves
 * tenant + capability + current tokens, then hands a typed snapshot to the
 * client studio. The <PageRouteSyncer page="website" /> stays mounted so the
 * admin shell keeps the Website tab highlighted.
 *
 * Route: /{tenantSlug}/admin/website/card-design
 */

import { notFound } from "next/navigation";

import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import {
  loadDesignForStaff,
  loadDesignRevisionsForStaff,
} from "@/lib/site-admin/server/design";
import { tokenDefaults } from "@/lib/site-admin/tokens/registry";
import { listCardKits } from "@/lib/site-admin/presets/card-kits";
import { PageRouteSyncer } from "../../_page-route-syncer";
import {
  WebsiteCardDesignClient,
  type CardDesignRevision,
} from "./card-design-client";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

/**
 * Merge platform defaults under the operator's stored map so the studio always
 * has a value to render for every card token. (Card tokens default to "" =
 * inherit-from-theme, so an unset card token renders as an empty knob — the
 * placeholder copy says "inherit".)
 */
function withDefaults(
  raw: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = { ...tokenDefaults() };
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") {
      out[key] = value;
    }
  }
  return out;
}

export default async function AdminWebsiteCardDesignPage({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  // Capability gate — design.edit lets you open + save a draft; design.publish
  // is checked again at the action layer for the Publish button.
  const canEdit = await userHasCapability(
    "agency.site_admin.design.edit",
    scope.tenantId,
  );
  if (!canEdit) notFound();
  const canPublish = await userHasCapability(
    "agency.site_admin.design.publish",
    scope.tenantId,
  );

  const supabase = await getCachedServerSupabase();
  if (!supabase) notFound();

  // Current design row + recent revisions (newest first). Reads are staff-
  // scoped; the same row the edit-mode actions write through.
  const [row, revisionRows] = await Promise.all([
    loadDesignForStaff(supabase, scope.tenantId),
    loadDesignRevisionsForStaff(supabase, scope.tenantId, 12),
  ]);

  const draftTokens = withDefaults(row?.theme_json_draft);
  const liveTokens = withDefaults(row?.theme_json);
  const version = row?.version ?? 0;
  const themePublishedAt = row?.theme_published_at ?? null;

  // Pass only the card-family slice the studio drives so the client doesn't
  // carry the whole token map. The four card tokens cover the whole kit.
  const cardTokenKeys = [
    "template.directory-card-family",
    "card.surface",
    "card.name-color",
    "card.muted",
  ] as const;
  const draftCardTokens: Record<string, string> = {};
  const liveCardTokens: Record<string, string> = {};
  for (const k of cardTokenKeys) {
    draftCardTokens[k] = draftTokens[k] ?? "";
    liveCardTokens[k] = liveTokens[k] ?? "";
  }

  const revisions: CardDesignRevision[] = revisionRows.map((r) => ({
    id: r.id,
    kind: r.kind,
    version: r.version,
    createdAt: r.created_at,
  }));

  const kits = listCardKits().map((kit) => ({
    slug: kit.slug,
    label: kit.label,
    description: kit.description,
    tokens: kit.tokens,
  }));

  return (
    <>
      {/* Keep the shell's Website tab highlighted while this canonical
          sub-route renders. */}
      <PageRouteSyncer page="website" />
      <WebsiteCardDesignClient
        workspaceName={scope.membership.display_name}
        canEdit={canEdit}
        canPublish={canPublish}
        kits={kits}
        draftCardTokens={draftCardTokens}
        liveCardTokens={liveCardTokens}
        version={version}
        themePublishedAt={themePublishedAt}
        revisions={revisions}
      />
    </>
  );
}
