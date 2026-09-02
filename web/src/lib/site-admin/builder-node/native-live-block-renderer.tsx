/**
 * BUILDER 2027 · P2B — the injected LIVE-ENGINE renderer for the three native
 * kinds whose full behaviour needs something `render.tsx` must never import.
 *
 * `render.tsx` is imported by the CLIENT edit-chrome bundle. Statically
 * importing the directory engine (Supabase, the facet catalogs, the AI search
 * client) or the auth area (session reads) from there would drag all of it into
 * that bundle. So this module is the mirror of `section-embed-renderer.tsx`:
 * a server caller builds one bound to its tenant context and passes it in as
 * `renderNativeLiveBlock`.
 *
 * WHAT IT DOES NOT DO
 * ───────────────────
 * It does not reimplement the directory. The native `directory` node's props
 * are, by construction, a NAMED SUBSET of `directorySchemaV1` — same keys, same
 * enum members — so this module hands them to the section's own Zod schema,
 * lets it fill every default, and renders the section's own Component. There is
 * no translation table to drift, and the schema is the validator. Same for the
 * two header widgets.
 *
 * DEGRADATION IS A FIRST-CLASS PATH, NOT AN ERROR PATH
 * ───────────────────────────────────────────────────
 * Returning `null` hands the node back to its own native fallback markup — a
 * real GET-form grid, a real sign-in link, a real inquiry link. So a schema
 * miss, a missing tenant context, or the editor canvas all produce a working
 * block rather than a hole. This function never throws.
 */
import type { ReactNode } from "react";

import { prefixPublicHrefsDeep } from "@/lib/saas/public-hrefs";
import { DirectoryComponent } from "@/lib/site-admin/sections/directory/Component";
import { directorySchemaV1 } from "@/lib/site-admin/sections/directory/schema";
import { HeaderAccountComponent } from "@/lib/site-admin/sections/header_account/Component";
import { headerAccountSchemaV1 } from "@/lib/site-admin/sections/header_account/schema";
import { HeaderInquiryComponent } from "@/lib/site-admin/sections/header_inquiry/Component";
import { headerInquirySchemaV1 } from "@/lib/site-admin/sections/header_inquiry/schema";

import { isNativeLiveBlockKind } from "./native-live-block-kinds";
import type { BuilderNode } from "./types";

/**
 * Tenant render context for the live engines. Deliberately the same fields the
 * `section_embed` renderer takes, so a server caller that already built one
 * context can build this renderer from it without assembling a second.
 */
export interface NativeLiveBlockRenderContext {
  tenantId: string;
  locale: string;
  publicPathPrefix?: string;
  /**
   * TRUE on the in-editor CANVAS. The curated header widgets read this as their
   * `preview` prop and render a static, side-effect-free placeholder instead of
   * mounting a live widget (no auth read, no client island). The directory is
   * NOT rendered live on the canvas at all (see `renderNativeLiveBlock`): its
   * engine mounts a client island that re-queries on every URL change, which on
   * a canvas fights the editor for the URL.
   */
  editorMode?: boolean;
}

export type BuilderNativeLiveBlockRendererFn = (
  node: BuilderNode,
) => ReactNode | null;

/**
 * Build a tenant-bound live-block renderer for `render.tsx`'s
 * `renderNativeLiveBlock` option.
 */
export function makeNativeLiveBlockRenderer(
  context: NativeLiveBlockRenderContext,
): BuilderNativeLiveBlockRendererFn {
  return (node) => renderNativeLiveBlock(node, context);
}

export function renderNativeLiveBlock(
  node: BuilderNode,
  context: NativeLiveBlockRenderContext | null,
): ReactNode | null {
  if (!context?.tenantId) return null;
  const publicPathPrefix = context.publicPathPrefix ?? "";

  try {
    if (node.kind === "directory") {
      // The engine mounts a client island that reads and reconciles the live
      // URL. On the editor canvas that island would re-query on every URL the
      // editor touches, so the canvas keeps the static native grid — which is
      // the affordance an operator needs there anyway (selectable, stylable,
      // no network).
      if (context.editorMode) return null;
      const parsed = directorySchemaV1.safeParse(
        nativeDirectoryPropsToSectionConfig(node.props),
      );
      if (!parsed.success) return null;
      return (
        <DirectoryComponent
          props={prefixPublicHrefsDeep(parsed.data, publicPathPrefix)}
          tenantId={context.tenantId}
          locale={context.locale}
          preview={false}
          sectionId={node.id}
          publicPathPrefix={publicPathPrefix}
        />
      );
    }

    if (node.kind === "header_account") {
      const parsed = headerAccountSchemaV1.safeParse(
        nativeHeaderWidgetPropsToSectionConfig(node.props),
      );
      if (!parsed.success) return null;
      return (
        <HeaderAccountComponent
          props={prefixPublicHrefsDeep(parsed.data, publicPathPrefix)}
          tenantId={context.tenantId}
          locale={context.locale}
          preview={context.editorMode === true}
          sectionId={node.id}
          publicPathPrefix={publicPathPrefix}
        />
      );
    }

    if (node.kind === "header_inquiry") {
      const parsed = headerInquirySchemaV1.safeParse(
        nativeHeaderWidgetPropsToSectionConfig(node.props),
      );
      if (!parsed.success) return null;
      return (
        <HeaderInquiryComponent
          props={prefixPublicHrefsDeep(parsed.data, publicPathPrefix)}
          tenantId={context.tenantId}
          locale={context.locale}
          preview={context.editorMode === true}
          sectionId={node.id}
          publicPathPrefix={publicPathPrefix}
        />
      );
    }
  } catch {
    // Any failure hands the node back to its own working native markup.
    return null;
  }

  return null;
}

/**
 * Map a native `directory` node's props onto the curated section's config.
 *
 * Every key here exists on BOTH sides with the same name and the same enum
 * members — that is the whole reason the native kind was specified as a subset
 * of the section rather than a parallel vocabulary. Keys the node does not
 * carry are simply omitted so the section schema supplies its own default; an
 * `undefined` passed explicitly would be identical, but omitting keeps the
 * parsed object honest about what the operator actually chose.
 *
 * Exported for the wiring test, which asserts that a node authored with a
 * non-default scope produces a section config carrying that scope — the check
 * that catches a rename on either side.
 */
export function nativeDirectoryPropsToSectionConfig(
  props: Extract<BuilderNode, { kind: "directory" }>["props"],
): Record<string, unknown> {
  const put = (
    out: Record<string, unknown>,
    key: string,
    value: unknown,
  ): void => {
    if (value !== undefined) out[key] = value;
  };
  const config: Record<string, unknown> = {};

  put(config, "eyebrow", props.eyebrow);
  put(config, "headline", props.headline);
  put(config, "copy", props.copy);
  put(config, "headerAlign", props.headerAlign);
  put(config, "showHeading", props.showHeading);
  put(config, "entityLabel", props.entityLabel);
  put(config, "scope", props.scope);
  put(config, "talentTypeKeys", props.talentTypeKeys);
  put(config, "tagKeys", props.tagKeys);
  put(config, "manualProfileCodes", props.manualProfileCodes);
  put(config, "pinnedProfileCodes", props.pinnedProfileCodes);
  put(config, "excludedProfileCodes", props.excludedProfileCodes);
  put(config, "requirePhoto", props.requirePhoto);
  put(config, "excludeUnavailable", props.excludeUnavailable);
  put(config, "minTrustTier", props.minTrustTier);
  put(config, "defaultSort", props.defaultSort);
  put(config, "pagination", props.pagination);
  put(config, "pageSize", props.pageSize);
  put(config, "columnsDesktop", props.columnsDesktop);
  put(config, "columnsTablet", props.columnsTablet);
  put(config, "columnsMobile", props.columnsMobile);
  put(config, "density", props.density);
  put(config, "containerWidth", props.containerWidth);
  put(config, "cardStyle", props.cardStyle);
  put(config, "cardAspect", props.cardAspect);
  put(config, "showName", props.showName);
  put(config, "showTalentType", props.showTalentType);
  put(config, "showLocation", props.showLocation);
  put(config, "showAvailability", props.showAvailability);
  put(config, "showBadges", props.showBadges);
  put(config, "showSave", props.showSave);
  put(config, "showAddToInquiry", props.showAddToInquiry);
  put(config, "showQuickView", props.showQuickView);
  put(config, "cardClickAction", props.cardClickAction);
  put(config, "filterSearchBox", props.filterSearchBox);
  put(config, "topBarMode", props.topBarMode);
  put(config, "sortControlShow", props.sortControlShow);
  put(config, "showResultCount", props.showResultCount);
  put(config, "sidebarShow", props.sidebarShow);
  put(config, "sidebarPosition", props.sidebarPosition);
  put(config, "emptyStateTitle", props.emptyStateTitle);
  put(config, "emptyStateText", props.emptyStateText);
  put(config, "emptyStateCtaLabel", props.emptyStateCtaLabel);
  put(config, "emptyStateCtaHref", props.emptyStateCtaHref);

  return config;
}

/**
 * Map a native header widget node's props onto the shared header-widget config.
 *
 * The shared schema is `.passthrough()`, so anything handed to it survives —
 * which is exactly why this mapper is explicit rather than a spread of
 * `node.props`. A spread would carry `style`, `layerLabel` and `href` into the
 * curated section's payload, where `prefixPublicHrefsDeep` would then rewrite
 * an href the LIVE widget does not read, and a future `presentation` collision
 * would land silently. Only the two keys the widget actually honours cross.
 */
export function nativeHeaderWidgetPropsToSectionConfig(props: {
  label?: string;
  icon?: string;
}): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  const label = props.label?.trim();
  if (label) config.label = label;
  if (props.icon) config.icon = props.icon;
  return config;
}

/**
 * Re-exported so a caller that already imports this renderer does not need a
 * second import for the predicate. The definition lives in
 * `native-live-block-kinds.ts`, which is import-free and therefore safe for
 * pure tests and client code.
 */
export { isNativeLiveBlockKind };
