/**
 * Mono Design = DEFAULTS only, ported from the owner original TH20-Mono
 * (1440px screenshot). Every value is an editable token; "Reset to design
 * default" restores this map. No hex in components.
 *
 * Read off the screenshot (assumptions are listed in the PR notes):
 *  - Manrope throughout, display at 800 with tight tracking
 *  - white page, near-black ink, one deep teal accent
 *  - pill buttons and pill chips, soft cards
 *  - header is the name and city only (the `no_nav` chrome), no link strip
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

export const MONO_HEADING_FONT = "Manrope, system-ui, sans-serif";
export const MONO_BODY_FONT = "Manrope, system-ui, sans-serif";

export const MONO_PALETTE = {
  page: "#FFFFFF",
  surface: "#F4F4F2",
  line: "#E3E3E0",
  ink: "#0F0F0F",
  accent: "#0E6B6B",
  onAccent: "#FFFFFF",
  muted: "#5F5F5B",
} as const;

export const MONO_STYLE_TOKEN_DEFAULTS: Readonly<Record<string, string>> = {
  "button.radius": "999px",
  "button.height": "44px",
  "button.padding-x": "22px",
  "button.font-size": "14px",
  "button.font-weight": "700",
  "type.display-weight": "800",
  "type.display-tracking": "-0.04em",
  "type.label-size": "11px",
  "type.label-weight": "700",
  "type.label-tracking": "0.14em",
};

export const MONO_REGISTRY_TOKEN_DEFAULTS: Readonly<Record<string, string>> = {
  "radius.base": "lg",
  "radius.scale-preset": "pill",
  "shadow.preset": "none",
};

export const MONO_DESIGN_TOKEN_DEFAULTS: Readonly<Record<string, string>> = {
  ...MONO_STYLE_TOKEN_DEFAULTS,
  ...MONO_REGISTRY_TOKEN_DEFAULTS,
};

/** TH20 hero is left-aligned and wide (name at display size), not a centered reading column. */
export function monoLeftHero(hero: BuilderNode): BuilderNode {
  const children = "children" in hero && Array.isArray(hero.children) ? hero.children : null;
  const props = (hero.props ?? {}) as Record<string, unknown>;
  const style = (props.style ?? {}) as Record<string, unknown>;
  const isRoot = props.slotKey === "hero";
  const next: Record<string, unknown> = { ...props };
  if (props.align === "center") next.align = "start";
  if (style.align === "center" || isRoot) {
    const { align: _a, ...rest } = style;
    void _a;
    next.style = { ...rest, ...(isRoot ? { maxWidth: "wide" } : {}), ...(style.align === "center" ? { align: "start" } : {}) };
  }
  return {
    ...hero,
    props: next,
    ...(children ? { children: children.map(monoLeftHero) } : {}),
  } as BuilderNode;
}
