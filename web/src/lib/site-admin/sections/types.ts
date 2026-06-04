/**
 * Phase 5 — section registry types.
 *
 * Section types are platform-owned. A tenant creates reusable section
 * *instances* from a type (cms_sections row); homepage composition uses
 * cms_page_sections to order section references on a page.
 *
 * Per-type directory structure (locked):
 *   sections/{type-key}/
 *     schema.ts      // Zod schemas per version
 *     migrations.ts  // version-to-version migrators
 *     meta.ts        // SectionMeta object
 *     Component.tsx  // public render
 *     Editor.tsx     // admin edit form
 */

import type { ComponentType } from "react";
import type { z } from "zod";

export type SectionBusinessPurpose =
  | "hero"
  | "conversion"
  | "trust"
  | "promo"
  | "feature"
  | "footer";

/**
 * Phase D — picker-side category. Eight curated buckets driving the
 * §8 Add-section library tab strip. Distinct from `businessPurpose`
 * (which stays for analytics + non-picker consumers; low blast radius
 * keeps both for now).
 */
export type SectionCategory =
  | "hero"
  | "trust"
  | "showcase"
  | "story"
  | "convert"
  | "form"
  | "embed"
  | "navigation";

/**
 * Phase D — surfaced as a small pill on the picker tile. Restrained
 * vocabulary: only `new` (blue) for recently-added types, and `premium`
 * (neutral) for elevated / distinctive types. No BETA / EXPERIMENTAL /
 * DEPRECATED proliferation.
 */
export type SectionTag = "new" | "premium";

export interface SectionMeta {
  key: string;
  label: string;
  description: string;
  /** Business purpose (legacy field; kept for analytics + non-picker uses). */
  businessPurpose: SectionBusinessPurpose;
  /** Agency-visible when TRUE; platform-internal when FALSE. */
  visibleToAgency: boolean;
  /**
   * Phase D — picker category for the §8 tab strip. Required for any
   * `visibleToAgency: true` section. The picker uses this to group tiles.
   */
  category: SectionCategory;
  /**
   * Phase D — true when this section appears in the curated default
   * picker view (~15 types). False = revealed only by the "Show advanced
   * sections" toggle. Search across all sections regardless.
   */
  inDefault: boolean;
  /** Phase D — optional pill on the tile preview. Restrained on purpose. */
  tag?: SectionTag;
}

export interface SectionComponentProps<TShape> {
  props: TShape;
  tenantId: string;
  locale: string;
  preview: boolean;
  /**
   * Phase 8 — instance id of this section row. Available to renderers
   * that need a stable, server-resolvable handle (form-submission
   * routing, section-scoped analytics, etc.). Optional in the type so
   * legacy renderers / test harnesses keep working without changes.
   */
  sectionId?: string;
  /**
   * Path prefix for public tenant storefronts rendered as
   * `/<tenantSlug>/...` on the hub/marketing/local app host.
   */
  publicPathPrefix?: string;
  /**
   * Server-resolved Google Maps JS API key for this tenant (BYO custom key
   * when the tenant chose `credential_mode='custom'`, otherwise the inherited
   * platform key; `null`/absent when nothing resolves). Resolved on the server
   * via `resolveGoogleMapsKeyForClient(tenantId)` and threaded down so map
   * sections (e.g. `location_discovery` orbit map) render with the right key
   * without a client component importing a server-only module. When this is
   * null the section keeps its graceful non-map fallback.
   */
  mapsApiKey?: string | null;
  /**
   * Server-resolved captcha widget config for this tenant's storefront forms
   * (the contact_form section reads it to render the right widget + site key).
   * The tenant's own provider+site_key when configured, else the platform
   * fallback, else provider 'none'. Resolved once at the render seam via
   * `resolveTenantCaptcha(tenantId)` and threaded down (mirrors `mapsApiKey`),
   * so a form section never imports a server-only module. The server-side
   * SECRET used to verify a token lives only in the submit route, never here.
   */
  captcha?: {
    provider: "hcaptcha" | "turnstile" | "none";
    siteKey: string | null;
  } | null;
  /**
   * Optional BuilderNode identity hints for componentized sections.
   * `sectionNodeId` is the wrapper's section node; `nodeIdsByRole` maps
   * semantic child roles (e.g. headline, subheadline, primaryCta) to
   * BuilderNode ids so live DOM can be selected at child-node granularity.
   */
  builderNodeBindings?: {
    sectionNodeId?: string | null;
    nodeIdsByRole?: Readonly<Record<string, string>>;
  };
}

export interface SectionEditorProps<TShape> {
  initial: TShape;
  onChange: (next: TShape) => void;
  /**
   * Tenant scope for editor affordances like MediaPicker that need to
   * query tenant-scoped resources. Optional so existing tests / editors
   * keep working; any editor that uses it should render a degraded path
   * (no picker) when tenantId is undefined.
   */
  tenantId?: string;
}

export interface SectionRegistryEntry<TShape = unknown> {
  meta: SectionMeta;
  currentVersion: number;
  schemasByVersion: Record<number, z.ZodType<TShape>>;
  migrations: Record<number, (old: unknown) => unknown>;
  Component: ComponentType<SectionComponentProps<TShape>>;
  Editor: ComponentType<SectionEditorProps<TShape>>;
}

export function migrateSectionPayload(
  registry: SectionRegistryEntry,
  persistedVersion: number,
  persistedPayload: unknown,
): { version: number; payload: unknown } {
  let version = persistedVersion;
  let payload = persistedPayload;
  while (version < registry.currentVersion) {
    const step = registry.migrations[version];
    if (!step) {
      throw new Error(
        `section ${registry.meta.key} missing migration from v${version}`,
      );
    }
    payload = step(payload);
    version += 1;
  }
  return { version, payload };
}
