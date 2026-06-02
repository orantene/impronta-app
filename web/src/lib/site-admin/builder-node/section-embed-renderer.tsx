/**
 * `section_embed` renderer — bridges a freeform `BuilderSectionEmbedNode` to the
 * SAME curated section render path the storefront uses for CMS-composed sections
 * (`homepage-cms-sections.tsx`). It does NOT reimplement any section: it looks up
 * the curated `SectionRegistryEntry` by `sectionTypeKey`, migrates + Zod-parses
 * the embed's `config` payload to the registry's current schema version, prefixes
 * tenant-scoped hrefs, and renders the registry's own `Component` (the very same
 * React component — often an async server component that fetches its own data
 * from tenant context).
 *
 * Reused render+fetch path: `SECTION_REGISTRY[key].Component` +
 * `migrateSectionPayload` (`sections/types.ts`) — identical to the storefront's
 * `HomepageCmsSections`.
 *
 * Graceful degradation (a freeform page can never blank out or throw):
 *   - unknown `sectionTypeKey`              → labeled placeholder
 *   - missing tenant/locale render context  → labeled placeholder ("connects on
 *     publish") because curated sections need request-scoped tenant data
 *   - `config` empty / fails schema migrate → labeled placeholder
 *
 * The placeholder is intentionally plain and self-describing so an operator sees
 * exactly which component will render and why it isn't live yet in this context.
 */
import type { ReactNode } from "react";

import { prefixPublicHrefsDeep } from "@/lib/saas/public-hrefs";
import {
  SECTION_REGISTRY,
  type SectionTypeKey,
} from "@/lib/site-admin/sections/registry";
import {
  migrateSectionPayload,
  type SectionRegistryEntry,
} from "@/lib/site-admin/sections/types";

import type { BuilderSectionEmbedNode } from "./types";

/**
 * Tenant render context for curated sections. Present on the storefront /
 * edit-mode server render (`homepage-cms-sections.tsx`); absent in lighter
 * render contexts (tests, previews without a tenant), where the embed shows its
 * placeholder instead of attempting a tenant-scoped fetch.
 */
export interface SectionEmbedRenderContext {
  tenantId: string;
  locale: string;
  publicPathPrefix?: string;
}

/**
 * Injected `section_embed` renderer. The core builder renderer (`render.tsx`)
 * stays free of the section registry by calling this function (bound to tenant
 * context) instead of importing `SECTION_REGISTRY` itself — which would pull
 * every section Component + its server deps into the client edit-chrome bundle.
 */
export type BuilderSectionEmbedRenderer = (
  node: BuilderSectionEmbedNode,
) => ReactNode;

/**
 * Build a tenant-bound `section_embed` renderer for `render.tsx`'s
 * `renderSectionEmbed` option. Server callers (homepage-cms-sections,
 * PublishedShell) create this once from their tenant context and pass it in.
 */
export function makeSectionEmbedRenderer(
  context: SectionEmbedRenderContext,
): BuilderSectionEmbedRenderer {
  return (node) => renderSectionEmbed(node, context);
}

/** Human-facing label for a curated section key (falls back to the key). */
export function sectionEmbedLabel(sectionTypeKey: string): string {
  const entry = SECTION_REGISTRY[sectionTypeKey as SectionTypeKey] as
    | SectionRegistryEntry
    | undefined;
  return entry?.meta.label ?? sectionTypeKey;
}

/** True when `sectionTypeKey` resolves to a registered curated section. */
export function isKnownSectionEmbedKey(sectionTypeKey: string): boolean {
  return sectionTypeKey in SECTION_REGISTRY;
}

function SectionEmbedPlaceholder({
  sectionTypeKey,
  nodeId,
  reason,
}: {
  sectionTypeKey: string;
  nodeId: string;
  reason: "unknown" | "no_context" | "invalid_config";
}): ReactNode {
  const label = sectionEmbedLabel(sectionTypeKey);
  const note =
    reason === "unknown"
      ? "This component is no longer available."
      : reason === "invalid_config"
        ? "Finish configuring this component to go live."
        : "Connects to live data on publish.";
  return (
    <div
      data-builder-node-id={nodeId}
      data-builder-node-kind="section_embed"
      data-section-embed-type-key={sectionTypeKey}
      data-section-embed-placeholder={reason}
      className="site-builder-node site-builder-node--section-embed-placeholder"
    >
      <span className="site-builder-node--section-embed-placeholder-label">
        {label}
      </span>
      <span className="site-builder-node--section-embed-placeholder-note">
        {note}
      </span>
    </div>
  );
}

/**
 * Render a curated section for a `section_embed` node. When tenant context is
 * available AND the config migrates cleanly, returns the live curated Component;
 * otherwise returns a labeled placeholder. Never throws.
 */
export function renderSectionEmbed(
  node: BuilderSectionEmbedNode,
  context: SectionEmbedRenderContext | null,
): ReactNode {
  const { sectionTypeKey } = node.props;

  const registryEntry = SECTION_REGISTRY[sectionTypeKey as SectionTypeKey] as
    | SectionRegistryEntry
    | undefined;
  if (!registryEntry) {
    return (
      <SectionEmbedPlaceholder
        key={node.id}
        nodeId={node.id}
        sectionTypeKey={sectionTypeKey}
        reason="unknown"
      />
    );
  }

  // Curated sections fetch tenant-scoped data from request context (Supabase,
  // host scope). Without tenant/locale we can't render them live, so show the
  // placeholder rather than a half-built or erroring section.
  if (!context) {
    return (
      <SectionEmbedPlaceholder
        key={node.id}
        nodeId={node.id}
        sectionTypeKey={sectionTypeKey}
        reason="no_context"
      />
    );
  }

  // Migrate + parse the embed config exactly like the storefront migrates a
  // CMS section payload. An embed seeded by the picker carries a valid default
  // config; a hand-built / partial config that fails the section schema degrades
  // to the placeholder.
  let payload: unknown;
  try {
    const migrated = migrateSectionPayload(
      registryEntry,
      // section_embed configs are authored against the current schema version.
      registryEntry.currentVersion,
      node.props.config ?? {},
    );
    payload = registryEntry.schemasByVersion[registryEntry.currentVersion]!.parse(
      migrated.payload,
    );
  } catch {
    return (
      <SectionEmbedPlaceholder
        key={node.id}
        nodeId={node.id}
        sectionTypeKey={sectionTypeKey}
        reason="invalid_config"
      />
    );
  }

  const publicPathPrefix = context.publicPathPrefix ?? "";
  const payloadForRender = prefixPublicHrefsDeep(payload, publicPathPrefix);
  const Component = registryEntry.Component;

  // Wrap so the curated section markup is identifiable in the freeform DOM
  // (selection chrome + scoped styling), matching the storefront wrapper.
  return (
    <div
      key={node.id}
      data-builder-node-id={node.id}
      data-builder-node-kind="section_embed"
      data-section-embed-type-key={sectionTypeKey}
      className="site-builder-node site-builder-node--section-embed"
    >
      <Component
        props={payloadForRender as never}
        tenantId={context.tenantId}
        locale={context.locale}
        preview={false}
        sectionId={node.props.sectionId ?? undefined}
        publicPathPrefix={publicPathPrefix}
      />
    </div>
  );
}
