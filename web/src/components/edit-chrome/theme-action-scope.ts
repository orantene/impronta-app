"use client";

/**
 * theme-action-scope — the surface-aware seam for the Theme drawer.
 *
 * The ThemeDrawer (+ its Components tab) needs the same five lifecycle moves —
 * load / saveDraft / saveComponentStyles / applyPreset / publish — regardless of
 * which surface mounts it. But WHERE the theme lives differs by surface:
 *
 *   - homepage / workspace_page → TENANT-scoped `agency_branding` (the existing
 *     `design-actions.ts`).
 *   - talent_page               → TALENT-scoped `talent_pages.theme.__design`
 *     (the new `talent-design-actions.ts`), keyed to the signed-in talent's own
 *     page slug (owner-RLS).
 *
 * This module resolves ONE `ThemeActionSet` from the surface kind + page slug so
 * the drawer calls the right backend without hard-importing tenant actions or
 * forking its render. The tenant set ignores the slug (tenant scope is resolved
 * server-side from the session); the talent set threads the slug to target the
 * right `talent_pages` row.
 *
 * Result shapes are identical across both sets (the talent actions deliberately
 * return the SAME `DesignSnapshot` / result types as the tenant actions), so the
 * drawer's state machine is unchanged.
 */

import {
  applyThemePresetFromEditAction,
  loadDesignAction,
  publishDesignFromEditAction,
  saveComponentStylesDraftFromEditAction,
  saveDesignDraftFromEditAction,
  type ComponentStylesSaveResult,
  type DesignLoadResult,
  type DesignPresetResult,
  type DesignPublishResult,
  type DesignSaveResult,
} from "@/lib/site-admin/edit-mode/design-actions";
import {
  applyTalentThemePresetAction,
  loadTalentDesignAction,
  publishTalentDesignAction,
  saveTalentComponentStylesDraftAction,
  saveTalentDesignDraftAction,
} from "@/lib/site-admin/edit-mode/talent-design-actions";
import type { ComponentStyleDefaults } from "@/lib/site-admin/builder-node/component-style-defaults";
import type { BuilderSurfaceKind } from "@/lib/site-admin/builder-core/surface-kind";

/** The five theme lifecycle moves the drawer needs, normalized across surfaces. */
export interface ThemeActionSet {
  load(): Promise<DesignLoadResult>;
  saveDraft(input: {
    patch: Record<string, string>;
    expectedVersion: number;
  }): Promise<DesignSaveResult>;
  saveComponentStyles(input: {
    componentStyles: ComponentStyleDefaults;
    expectedVersion: number;
  }): Promise<ComponentStylesSaveResult>;
  applyPreset(input: {
    presetSlug: string;
    expectedVersion: number;
  }): Promise<DesignPresetResult>;
  publish(input: { expectedVersion: number }): Promise<DesignPublishResult>;
}

/**
 * Resolve the theme action set for a surface. `talent_page` routes to the
 * talent-scoped actions (keyed by `pageSlug`); every other surface keeps the
 * existing tenant-scoped actions UNCHANGED.
 *
 * Returns `null` for a talent surface with no slug (defensive — the drawer then
 * shows a load error rather than calling a tenant action that would 401).
 */
export function resolveThemeActionSet(
  surfaceKind: BuilderSurfaceKind,
  pageSlug: string | null,
): ThemeActionSet | null {
  if (surfaceKind === "talent_page") {
    if (!pageSlug) return null;
    const slug = pageSlug;
    return {
      load: () => loadTalentDesignAction({ pageSlug: slug }),
      saveDraft: (input) => saveTalentDesignDraftAction({ pageSlug: slug, ...input }),
      saveComponentStyles: (input) =>
        saveTalentComponentStylesDraftAction({ pageSlug: slug, ...input }),
      applyPreset: (input) => applyTalentThemePresetAction({ pageSlug: slug, ...input }),
      publish: (input) => publishTalentDesignAction({ pageSlug: slug, ...input }),
    };
  }

  // homepage / workspace_page / platform_lab → tenant-scoped (unchanged).
  return {
    load: () => loadDesignAction(),
    saveDraft: (input) => saveDesignDraftFromEditAction(input),
    saveComponentStyles: (input) => saveComponentStylesDraftFromEditAction(input),
    applyPreset: (input) => applyThemePresetFromEditAction(input),
    publish: (input) => publishDesignFromEditAction(input),
  };
}

// ── platform_default route ──────────────────────────────────────────────────
//
// The Builder Lab → Site Defaults editor edits the PLATFORM DEFAULT THEME
// (the Modern 2026 Site Default every new tenant + talent inherits), which lives
// on the `platform_settings` singleton — NOT on a tenant/talent row. It has no
// CAS version / draft-vs-live distinction (Save IS publish for the singleton),
// so it uses a focused two-move set rather than the five-move `ThemeActionSet`.
// Kept here so the surface-aware theme seam stays in one module.

import {
  loadPlatformDefaultThemeAction,
  savePlatformDefaultThemeAction,
} from "@/lib/server-actions/admin-platform-default-theme";
import type { PlatformDefaultTheme } from "@/lib/platform/default-theme";

/** The two lifecycle moves the focused Site-Defaults editor needs. */
export interface PlatformDefaultThemeActionSet {
  load(): Promise<
    | { ok: true; theme: PlatformDefaultTheme }
    | { ok: false; error: string }
  >;
  /** Save = publish for the singleton (no draft layer). */
  save(input: {
    tokens: Record<string, string>;
    componentStyles: ComponentStyleDefaults;
    presetSlug: string | null;
  }): Promise<{ ok: true } | { ok: false; error: string }>;
}

/**
 * The `platform_default` route — the action set the super-admin Site-Defaults
 * editor calls. Both moves are platform-admin gated inside the actions.
 */
export function resolvePlatformDefaultThemeActionSet(): PlatformDefaultThemeActionSet {
  return {
    load: () => loadPlatformDefaultThemeAction(),
    save: (input) => savePlatformDefaultThemeAction(input),
  };
}
