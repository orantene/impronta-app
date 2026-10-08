/**
 * Composition data types (pure, no directive). Extracted verbatim from
 * `composition-actions.ts`, which re-exports every name so import paths stay
 * byte-stable.
 */

import type { Locale } from "@/lib/site-admin/locales";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import type {
  BuilderStyleClassRegistry,
  BuilderStylePresetRegistry,
} from "@/lib/site-admin/builder-node/style-classes";

export interface CompositionSectionRef {
  sectionId: string;
  sortOrder: number;
  sectionTypeKey: string;
  name: string;
  /**
   * Per-section visibility lifted from `props.presentation.visibility` so
   * the navigator panel can render the eye state without round-tripping
   * each section. Optional — pre-existing rows that never set
   * presentation.visibility serialise as `undefined` (treated as "always").
   */
  visibility?: "always" | "desktop-only" | "mobile-only" | "hidden";
}

export interface CompositionSlotDef {
  key: string;
  label: string;
  required: boolean;
  allowedSectionTypes: readonly string[] | null;
}

export interface CompositionLibraryEntry {
  typeKey: string;
  label: string;
  description: string;
  /** Legacy `businessPurpose` value — kept for analytics + legacy callers. */
  purpose: string;
  /**
   * Phase D — picker category (one of the 8 buckets in the §8 tab strip:
   * hero / trust / showcase / story / convert / form / embed / navigation).
   */
  category: string;
  /**
   * Phase D — when true the entry appears in the curated default picker
   * view (~15 types). When false it is revealed by the "Show advanced
   * sections" toggle. Search hits both regardless.
   */
  inDefault: boolean;
  /** Phase D — optional pill ("new" | "premium") shown on the tile preview. */
  tag?: "new" | "premium";
}

export interface CompositionData {
  locale: Locale;
  /** The cms_pages.id for the page being edited. All mutations thread this
   *  back so they target the correct page regardless of page type. */
  pageId: string;
  pageVersion: number;
  /**
   * When the visitor-facing site last had this page published (`cms_pages.published_at`).
   * `null` when the row has never been published. Draft autosave does not move this —
   * it updates after a successful Publish (next composition refresh).
   */
  liveSitePublishedAt: string | null;
  metadata: {
    title: string;
    metaTitle: string | null;
    metaDescription: string | null;
    introTagline: string | null;
    ogTitle: string | null;
    ogDescription: string | null;
    ogImageUrl: string | null;
    canonicalUrl: string | null;
    noindex: boolean;
    /**
     * SEO-1 — structured-data (JSON-LD) payload carried through the SAME shared
     * metadata envelope as the OG/canonical set, so every surface describes SEO
     * identically (storefront already backs this with `cms_pages.json_ld`;
     * talent-site backs it with the SEO-1 `talent_pages.json_ld` migration).
     * Nullable: a surface with no structured data (or a not-yet-migrated read)
     * degrades to `null`, never throws.
     */
    jsonLd: unknown | null;
  };
  slots: Record<string, CompositionSectionRef[]>;
  /**
   * Phase 4 current-builder bridge. This mirrors the existing slot
   * composition as typed section nodes so the live EditShell can gain node
   * semantics without replacing the section renderer or creating a second
   * builder surface.
   */
  builderTree: BuilderNodeTree;
  slotDefs: CompositionSlotDef[];
  library: CompositionLibraryEntry[];
  /** Linked style classes from the latest draft revision snapshot. */
  styleClasses?: BuilderStyleClassRegistry;
  /**
   * STYLE-1 — site-scoped style presets + copy/paste clipboard, carried through
   * the SAME surface-agnostic envelope as `styleClasses`. Every adapter reads it
   * from its surface's `style_presets` column (or `null`/absent → undefined for a
   * not-yet-migrated row, which degrades to the localStorage seed).
   */
  stylePresets?: BuilderStylePresetRegistry;
  /** Locales available for the active tenant (read-only here — used for the
   *  Topbar locale switcher and the clone-from-locale command). */
  availableLocales: ReadonlyArray<Locale>;
  /**
   * W1-L2 — the WS1-D `edit_session_id` stamped on the page row by the LAST
   * draft write (`null` on legacy rows or after an unstamped write). Lets the
   * client tell "my own reload after my own beacon bump" (stamp === my per-tab
   * session token) apart from a genuinely foreign write — used to keep the
   * persisted undo stack across a same-session reload instead of dropping it
   * on the version mismatch the beacon itself caused. Optional: surfaces that
   * don't stamp (talent/site-shell adapters) omit it and rehydrate keeps the
   * strict version-match rule.
   */
  lastWriterEditSessionId?: string | null;
  printArtboard?: { widthMm: number; heightMm: number; bleedMm: number }; // slice 1c — fixed mm print artboard (bleed incl.) from print_designs.size; undefined off-print
}

export type CompositionLoadResult =
  | { ok: true; data: CompositionData }
  | { ok: false; error: string; code?: string };

export type CompositionSaveResult =
  | { ok: true; pageVersion: number }
  | { ok: false; error: string; code?: string; currentVersion?: number };

export type CreateAndInsertResult =
  | {
      ok: true;
      section: {
        id: string;
        name: string;
        sectionTypeKey: string;
        version: number;
        props: Record<string, unknown>;
      };
      pageVersion: number;
    }
  | { ok: false; error: string; code?: string; currentVersion?: number };
