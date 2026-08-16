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

import type { BuilderNode, BuilderSectionEmbedNode } from "./types";
import { resolveSectionEmbedSubjectScope } from "./section-embed-preview-subject";
// Wrapper-style helpers (section_embed restyle support). render.tsx imports
// only this module's TYPE, so importing its values here is not a runtime cycle.
import { builderNodeStyleAttrs, sharedNodeStyle } from "./render";

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
  /**
   * Server-resolved captcha (provider + PUBLIC site key) for this tenant, from
   * `resolveTenantCaptcha`. A curated section rendered INSIDE a freeform tree
   * needs this exactly as much as one rendered through the section list: the
   * contact form only shows its widget when it has BOTH `props.captcha` and a
   * resolved site key. Omitting it here meant every freeform page silently
   * rendered its contact form with NO captcha, however the operator had
   * configured it — the section list threaded it, this path did not.
   */
  captcha?: { provider: "hcaptcha" | "turnstile" | "none"; siteKey: string | null } | null;
  /**
   * Server-resolved Google Maps browser key (`resolveGoogleMapsKeyForClient`).
   * Exactly the same gap as `captcha` above: a curated map section embedded in
   * a freeform tree got no key and silently fell back to its editorial
   * placeholder, while the identical section rendered through the section list
   * showed a live map. Threading both here keeps the two paths equivalent.
   */
  mapsApiKey?: string | null;
  /**
   * WS-A A5 — TRUE when the embed is rendered onto the in-editor CANVAS (not the
   * published storefront). Threaded down to the curated Component as its
   * `preview` prop, so an interactive curated section (the header-widget embeds:
   * `header_search` / `header_account` / `header_inquiry` / `header_favorites`)
   * can render a static, side-effect-free PLACEHOLDER on the canvas instead of
   * mounting its live widget (no auth read, no client island, no data fetch).
   *
   * The published shell ALWAYS omits this (⇒ `preview={false}`), so a published
   * render is byte-identical to its pre-A5 behaviour. Pure-render embeds ignore
   * `preview` entirely, so they too render the same on canvas and live.
   */
  editorMode?: boolean;
  /**
   * In-editor PREVIEW SUBJECT (Builder Lab / talent + workspace previews, WS4).
   *
   * When set AND its `kind` matches the section embed's subject kind
   * (see `sectionEmbedPreviewSubjectKind`), the curated section is rendered
   * scoped to `previewSubject.id` instead of the active `tenantId` — e.g. a
   * platform operator previewing a template against a chosen workspace sees
   * THAT workspace's roster/directory data, not the platform tenant's.
   *
   * The published storefront ALWAYS passes `null` / omits this field, so a
   * published render is byte-identical to its pre-WS4 behaviour.
   */
  previewSubject?: {
    kind: "talent" | "workspace";
    id: string;
    locale?: string;
  } | null;
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

/**
 * Depth-first collect every `section_embed` node in a tree. Used by the
 * client-canvas path (W3 Sub-step B) so the server can pre-render each embed
 * island once and hand the canvas an id→ReactNode map; `section_embed` stays a
 * server-rendered island while the rest of the tree paints client-side.
 */
export function collectBuilderSectionEmbedNodes(
  nodes: ReadonlyArray<BuilderNode>,
): BuilderSectionEmbedNode[] {
  const out: BuilderSectionEmbedNode[] = [];
  const visit = (node: BuilderNode) => {
    if (node.kind === "section_embed") {
      out.push(node);
    }
    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) visit(child);
    }
  };
  for (const node of nodes) visit(node);
  return out;
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

  // §D — when an in-editor preview subject matches this section's subject kind,
  // resolve the section's tenant-scoped data against the subject id instead of
  // the active tenant. `previewSubject == null` (the published default) returns
  // the active tenant id + locale unchanged → byte-identical published render.
  const scope = resolveSectionEmbedSubjectScope({
    sectionTypeKey,
    tenantId: context.tenantId,
    locale: context.locale,
    previewSubject: context.previewSubject,
  });

  // Wrap so the curated section markup is identifiable in the freeform DOM
  // (selection chrome + scoped styling), matching the storefront wrapper.
  return (
    <div
      key={node.id}
      data-builder-node-id={node.id}
      data-builder-node-kind="section_embed"
      data-section-embed-type-key={sectionTypeKey}
      className="site-builder-node site-builder-node--section-embed"
      {...builderNodeStyleAttrs(node.props.style)}
      style={sharedNodeStyle(node.props.style)}
    >
      <Component
        props={payloadForRender as never}
        tenantId={scope.tenantId}
        locale={scope.locale}
        preview={context.editorMode === true}
        sectionId={node.props.sectionId ?? undefined}
        publicPathPrefix={publicPathPrefix}
        captcha={context.captcha ?? undefined}
        mapsApiKey={context.mapsApiKey ?? undefined}
      />
    </div>
  );
}
