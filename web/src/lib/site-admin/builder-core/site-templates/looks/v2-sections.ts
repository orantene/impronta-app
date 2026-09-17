/**
 * looks/v2-sections.ts — the motion-first section library for Looks v2
 * (D-TPL-36). Everything here is a node kind the renderer already ships:
 *
 *   cinematicHero   carousel(variant hero): full-viewport, Ken Burns, grain,
 *                   crossfade over the tenant's own images, shared copy overlay
 *   marqueeBand     marquee: a scrolling strip of the business's words
 *   statement       one oversized line on a contrast band, rising into view
 *   stickyStory     sticky_scroll: a pinned picture beside scrolling blocks
 *   railGallery     carousel(variant rail): peeking slides, autoplay, hover zoom
 *   liftCard        card that lifts and its picture zooms on hover
 *   reveal()        style mixin: entrance animation on scroll, staggered
 *
 * Copy stays `{{copy.*}}` markers and images `look://image/<slot>` markers
 * (nested ones too; `instantiateSite` resolves both), so a v2 Look composes
 * exactly like a v1 Look and any business type's components drop in.
 */

import type { BuilderNode, BuilderNodeStyleValue } from "@/lib/site-admin/builder-node/types";

import { copy, img, stack, tplId } from "../dsl";
import { IMAGE_MARKER_PREFIX, type ImageSlotKey } from "../types";

type Style = BuilderNodeStyleValue & Record<string, unknown>;

// ── Motion mixins ───────────────────────────────────────────────────────────

export type RevealPreset = "rise" | "fade-in" | "blur-in" | "zoom-in" | "fade-left" | "fade-right" | "slide-up" | "bounce-in";

/** Entrance on scroll (the Animation lane, which ships its own observer on every page). */
export function reveal(preset: RevealPreset = "rise", delayMs = 0, durationMs = 700): Style {
  return {
    animationPreset: preset,
    animationTrigger: "scroll",
    animationRepeat: "once",
    animationDuration: `${durationMs}ms`,
    animationDelay: `${delayMs}ms`,
    animationEasing: "smooth",
    animationDistance: preset === "rise" || preset === "slide-up" ? "28px" : undefined,
  };
}

/** Apply `reveal()` to each child with a stagger, without touching anything else. */
export function stagger(children: BuilderNode[], preset: RevealPreset = "rise", stepMs = 90, startMs = 0): BuilderNode[] {
  return children.map((n, i) => withStyle(n, reveal(preset, startMs + i * stepMs)));
}

export function withStyle(node: BuilderNode, extra: Style): BuilderNode {
  const props = (node.props ?? {}) as Record<string, unknown>;
  const style = { ...((props.style as Style | undefined) ?? {}), ...extra };
  return { ...node, props: { ...props, style } } as BuilderNode;
}

/** Hover lift for cards/buttons: rises 4px, deeper shadow, smooth. */
export const LIFT: Style = {
  transitionProperty: "transform, box-shadow",
  transitionDuration: "320ms",
  transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
  hover: { translate: "0 -4px", boxShadow: "0 24px 48px -24px rgba(0,0,0,0.45)" },
};

/** Picture that zooms inside its rounded frame on hover (frame clips). */
export function zoomPicture(slot: ImageSlotKey, style: Style = {}, frame: Style = {}): BuilderNode {
  const picture = img(slot, {
    width: "100%",
    height: "100%",
    transitionProperty: "transform",
    transitionDuration: "900ms",
    transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
    hover: { scale: "1.06", parentHover: true },
    ...style,
  });
  return stack([picture], { overflow: "hidden", radius: "lg", width: "100%", ...frame }, { gap: "s" });
}

// ── Hero ────────────────────────────────────────────────────────────────────

export interface CinematicHeroInput {
  slides: ImageSlotKey[];
  eyebrowKey?: string;
  headingKey: string;
  subKey?: string;
  primary: { labelKey: string; href: string };
  secondary?: { labelKey: string; href: string };
  align?: "bl" | "bc" | "cc" | "cl";
  tone?: "dark" | "light";
  heightMode?: "viewport" | "large";
}

/**
 * Full-viewport hero: the tenant's pictures crossfade with a slow Ken Burns
 * drift under a vignette scrim; one shared copy block (name, line, two pill
 * buttons) sits over every slide. Grain on, autoplay 6 s, pauses on hover.
 */
export function cinematicHero(input: CinematicHeroInput): BuilderNode {
  const slides = [...new Set(input.slides)].slice(0, 5);
  return {
    id: tplId("carousel"),
    kind: "carousel",
    props: {
      variant: "hero",
      heightMode: input.heightMode ?? "viewport",
      transition: "crossfade",
      transitionMs: 1400,
      autoplayMs: 6000,
      loop: true,
      pauseOnHover: true,
      kenBurns: true,
      kenBurnsAmount: 0.12,
      grain: true,
      showArrows: false,
      showDots: slides.length > 1,
      overlay: { scrim: true, tone: input.tone ?? "dark", vignette: true },
      contentAlign: input.align ?? "bl",
      contentMode: "shared",
      sharedContent: {
        eyebrow: input.eyebrowKey ? copy(input.eyebrowKey) : undefined,
        headingLead: copy(input.headingKey),
        sub: input.subKey ? copy(input.subKey) : undefined,
        primaryCta: { label: copy(input.primary.labelKey), href: input.primary.href },
        secondaryCta: input.secondary ? { label: copy(input.secondary.labelKey), href: input.secondary.href } : undefined,
      },
      layerLabel: "Hero",
      style: {},
    },
    children: slides.map((slot) => img(slot, {}, true)),
  };
}

// ── Bands ───────────────────────────────────────────────────────────────────

/** A scrolling strip of the business's own words (name, city, the nav words). Never a fact it did not state. */
export function marqueeBand(itemKeys: string[], opts: { speed?: "slow" | "medium" | "fast"; separator?: "dot" | "slash" | "diamond"; style?: Style } = {}): BuilderNode {
  return {
    id: tplId("marquee"),
    kind: "marquee",
    props: {
      items: itemKeys.map((k) => ({ text: copy(k) })),
      speed: opts.speed ?? "slow",
      direction: "left",
      separator: opts.separator ?? "diamond",
      variant: "text",
      pauseOnHover: true,
      layerLabel: "Marquee",
      style: { paddingY: "s", ...(opts.style ?? {}) },
    },
  };
}

/** A pinned picture beside three blocks that scroll past it. */
export function stickyStory(input: { imageSlot: ImageSlotKey; eyebrowKey: string; headlineKey: string; blockKeys: Array<{ title: string; body: string }>; side?: "media-left" | "media-right"; variant?: "bordered" | "minimal"; style?: Style }): BuilderNode {
  return {
    id: tplId("sticky"),
    kind: "sticky_scroll",
    props: {
      eyebrow: copy(input.eyebrowKey),
      headline: copy(input.headlineKey),
      imageUrl: `${IMAGE_MARKER_PREFIX}${input.imageSlot}`,
      imageAlt: "",
      blocks: input.blockKeys.map((b) => ({ title: copy(b.title), body: copy(b.body) })),
      side: input.side ?? "media-left",
      variant: input.variant ?? "minimal",
      layerLabel: "Story",
      style: input.style ?? {},
    },
  };
}

/** Peeking-slide rail of pictures, autoplaying, each zooming on hover. */
export function railGallery(slots: ImageSlotKey[], opts: { perView?: 1 | 2 | 3 | 4; autoplayMs?: number; ratio?: Style["aspectRatio"] } = {}): BuilderNode {
  return {
    id: tplId("carousel"),
    kind: "carousel",
    props: {
      variant: "rail",
      slidesPerView: opts.perView ?? 3,
      responsive: { tablet: { slidesPerView: 2 }, mobile: { slidesPerView: 1 } },
      autoplayMs: opts.autoplayMs ?? 4500,
      loop: true,
      showArrows: true,
      showDots: false,
      pauseOnHover: true,
      layerLabel: "Gallery rail",
      style: {},
    },
    children: slots.map((s) => zoomPicture(s, { aspectRatio: opts.ratio ?? "3:4" })),
  };
}

/** A card that lifts on hover, with a picture that zooms inside its frame. */
export function liftCard(children: BuilderNode[], style: Style = {}): BuilderNode {
  return { id: tplId("card"), kind: "card", props: { variant: "elevated", style: { paddingX: "m", paddingY: "m", ...LIFT, ...style } }, children };
}
