/**
 * WS-A A5 — shared scaffolding for the curated HEADER-WIDGET embed sections.
 *
 * The site-shell builder exposes the live header's interactive widgets
 * (`header_search` / `header_account` / `header_inquiry` / `header_favorites`)
 * as curated `section_embed` presets. Each wraps an EXISTING header widget at
 * render time — it does NOT reimplement one. They share one concern that this
 * module factors out:
 *
 *   editor-vs-published gating. On the in-editor CANVAS the section_embed
 *   renderer passes `preview={true}` (see SectionEmbedRenderContext.editorMode).
 *   In that mode the section renders a static, side-effect-free PLACEHOLDER
 *   chip — NO auth read, NO client island, NO data fetch — so the canvas never
 *   runs the live widget (which would hit Supabase / session / headers and mount
 *   interactive client components). On the published shell `preview` is false and
 *   the section mounts the real widget exactly as the legacy `PublicHeader` does.
 *
 * The placeholder is intentionally plain + self-describing (a labeled icon chip)
 * so an operator sees which interactive control will appear, and that it goes
 * live on publish.
 */
import { BUILDER_ICON_NAMES } from "@/lib/site-admin/builder-node/icon-registry";
import type { BuilderIconName } from "@/lib/site-admin/builder-node/icon-registry";
import { BuilderIconSvg } from "@/lib/site-admin/builder-node/builder-icon-svg";
import type { ReactNode } from "react";
import { z } from "zod";

/**
 * Minimal shared schema for the header-widget sections. They carry no authored
 * content (the widget owns its own data/markup); `presentation` is accepted for
 * parity + future spacing controls. Everything optional ⇒ an empty `{}` config
 * parses, so a freshly-dropped embed is always schema-valid.
 */
export const headerWidgetSchemaV1 = z
  .object({
    /** Optional operator note (unused at render; future-proofing + parity). */
    label: z.string().max(80).optional(),
    /**
     * Override the widget's glyph from the operator icon library.
     *
     * Each widget shipped ONE hardcoded icon with no way to change it — the
     * magnifier, the bookmark, the paper plane were the product's opinion, not
     * the site's. Additive within v1 (the schema is all-optional and
     * passthrough), so no migration and no version bump: absent ⇒ the widget
     * draws exactly what it always drew.
     */
    icon: z.enum(BUILDER_ICON_NAMES).optional(),
    presentation: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export type HeaderWidgetV1 = z.infer<typeof headerWidgetSchemaV1>;

export const headerWidgetSchemasByVersion = { 1: headerWidgetSchemaV1 } as const;

/** No prior versions — these ship at v1. */
export const headerWidgetMigrations: Record<number, (old: unknown) => unknown> =
  {};

/**
 * The editor-canvas placeholder chip. Static markup only — safe to render in the
 * editor (no hooks, no fetch, no client component). One per header widget,
 * keyed by an inline SVG glyph + label so it reads as the control it represents.
 */
export function HeaderWidgetPlaceholder({
  label,
  glyph,
  typeKey,
  icon,
}: {
  label: string;
  glyph: ReactNode;
  typeKey: string;
  /** Operator override; falls back to the widget's own glyph. */
  icon?: BuilderIconName;
}): ReactNode {
  return (
    <span
      className="site-header-widget-embed site-header-widget-embed--placeholder"
      data-header-widget={typeKey}
      data-header-widget-mode="placeholder"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.4rem",
        padding: "0.35rem 0.7rem",
        borderRadius: 999,
        border: "1px dashed var(--token-color-line, rgba(0,0,0,0.22))",
        background: "var(--token-color-surface-raised, rgba(0,0,0,0.03))",
        color: "var(--token-color-muted, #6b7280)",
        fontSize: "0.78rem",
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden style={{ display: "inline-flex" }}>
        {icon ? <BuilderIconSvg name={icon} /> : glyph}
      </span>
      {label}
    </span>
  );
}

/** Shared 18px stroke-icon wrapper so the placeholder glyphs read uniformly. */
export function HeaderWidgetGlyph({ children }: { children: ReactNode }): ReactNode {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {children}
    </svg>
  );
}
