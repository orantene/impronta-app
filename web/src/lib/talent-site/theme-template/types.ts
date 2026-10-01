/**
 * PLATFORM TEMPLATE EDITOR (Template Factory goal #2): the CONTRACT shared by
 * the drafts store, the builder surface (adapter/config/route), the canvas,
 * the token actions and "Publish as vN+1". Pure types; no runtime code.
 *
 * A platform admin opens a talent DESIGN (e.g. folio) in the real page
 * builder. The editor holds the UN-HYDRATED canonical design payload
 * ({{placeholders}}, `token:` refs, slotKey/originRole, frozen designKey);
 * hydration with a demo talent's content happens only on the canvas.
 * Shell and home are two builder mounts over ONE draft row (CAS on `rev`).
 *
 * Route: /platform/admin/builder-lab/designs/[slug]/edit?tree=home|shell&subject=<TAL-code>&look=<look-slug>&lang=es|en
 * Surface kind: "theme_template".
 */
import type { DesignPayload } from "@/lib/talent-site/theme-catalog/types";

export const THEME_TEMPLATE_SURFACE = "theme_template" as const;
export const THEME_TEMPLATE_EDITOR_FLAG = "THEME_TEMPLATE_EDITOR_ENABLED";

export type ThemeDraftTree = "home" | "shell";

export type ThemeDraftStatus = "open" | "published" | "discarded";

/** Editor-only preview settings; never published into the design. */
export interface ThemeDraftPreview {
  /** Demo talent whose content hydrates the canvas (profile code). */
  subject?: string;
  /** Look slug used for the preview colours. */
  look?: string;
  /** Look-owned tokens the admin tried while editing (preview only). */
  previewTokens?: Record<string, string>;
}

/** Row of public.talent_theme_drafts (service role only). */
export interface ThemeDraft {
  id: string;
  design: string;
  /** Snapshot version the draft was opened from. */
  baseVersion: number;
  /** Canonical, un-hydrated, design keys frozen. */
  payload: DesignPayload;
  preview: ThemeDraftPreview;
  /** CAS counter; every save must send the rev it read. */
  rev: number;
  status: ThemeDraftStatus;
  publishedVersion: number | null;
  releaseId: string | null;
  updatedAt: string;
}

export type ThemeDraftResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: "not_found" | "stale_rev" | "invalid" | "forbidden" | "conflict" | "error"; error: string };

/**
 * Server API (theme-template/drafts.server.ts). Every caller is already gated
 * as platform admin; these take the service-role client.
 *
 *   openThemeDraft(admin, design, actorId)            -> existing open draft, or a new one from the latest snapshot (keys frozen)
 *   loadThemeDraft(admin, design)                     -> the open draft or not_found
 *   saveThemeDraftTree(admin, { design, tree, nodes, expectedRev, actorId })  -> new rev
 *   saveThemeDraftTokens(admin, { design, patch, expectedRev, actorId })      -> new rev (style tokens -> payload.tokenDefaults; look-owned -> preview.previewTokens)
 *   savePreviewSettings(admin, { design, preview })   -> preview only, no rev bump
 *   discardThemeDraft(admin, design, actorId)
 *
 * Publish (theme-template/publish.server.ts):
 *   previewThemeDraftPublish(admin, design) -> { nextVersion, items, notes, contentOnly } (no writes)
 *   publishThemeDraft(admin, { design, expectedRev, actorId }) -> { version, releaseId }
 */
export interface ThemeDraftSaveTree {
  design: string;
  tree: ThemeDraftTree;
  nodes: DesignPayload["homeTree"];
  expectedRev: number;
  actorId: string | null;
}

export interface ThemeDraftSaveTokens {
  design: string;
  patch: Record<string, string | null>;
  expectedRev: number;
  actorId: string | null;
}

export interface ThemeDraftPublishPreview {
  nextVersion: number;
  /** Release items from diffDesignPayloads(base, draft). */
  itemCount: number;
  notes: { en: string; es: string };
  /** Changes that only affect NEW sites (content paths, unbinding). */
  contentOnly: string[];
}

export interface ThemeDraftPublished {
  version: number;
  releaseId: string;
}

export function themeTemplateEditHref(
  design: string,
  opts: { tree?: ThemeDraftTree; subject?: string; look?: string; lang?: "en" | "es" } = {},
): string {
  const q = new URLSearchParams();
  if (opts.tree && opts.tree !== "home") q.set("tree", opts.tree);
  if (opts.subject) q.set("subject", opts.subject);
  if (opts.look) q.set("look", opts.look);
  if (opts.lang) q.set("lang", opts.lang);
  const qs = q.toString();
  return `/platform/admin/builder-lab/designs/${encodeURIComponent(design)}/edit${qs ? `?${qs}` : ""}`;
}
