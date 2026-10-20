/**
 * Solace (TH04) hero: the cover headline is "An hour to {rotate}" with talent-
 * authored rotating words (W-10), English base + Spanish overlay seeded by
 * seed-i18n ("Una hora para soltar / respirar / descansar"). The talent's name
 * stays in the site header and the kicker line; every word is editable.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

export const SOLACE_HERO_HEADLINE = "An hour to {rotate}";
export const SOLACE_ROTATING_WORDS = ["let go", "breathe", "unwind"] as const;
export const SOLACE_ROTATE_MS = 3200;

function swap(node: BuilderNode): BuilderNode {
  const children = "children" in node && Array.isArray(node.children) ? node.children : null;
  const props = (node.props ?? {}) as Record<string, unknown>;
  const isNameHeading = node.kind === "heading" && typeof props.text === "string" && props.text.includes("{{displayName}}");
  return {
    ...node,
    props: isNameHeading
      ? {
          ...props,
          text: SOLACE_HERO_HEADLINE,
          rotatingWords: SOLACE_ROTATING_WORDS.map((text) => ({ text })),
          rotateMs: SOLACE_ROTATE_MS,
        }
      : props,
    ...(children ? { children: children.map(swap) } : {}),
  } as BuilderNode;
}

export function solaceRotatingHero(hero: BuilderNode): BuilderNode {
  return swap(hero);
}
