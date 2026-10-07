/**
 * TUL-133: a `transparent` header paints WHITE text (token-presets.css), written
 * for Noir & Or, whose first band is a full-bleed dark photo with a scrim. Over a
 * light hero (a split hero, a centred type-only hero) the brand, nav and ES/EN
 * switch vanish. So the server decides from the page tree whether the first band
 * is a full-bleed dark media hero and stamps `data-over-hero="true"` on the header
 * wrapper; the white-text rule is gated on it. Without the marker a transparent
 * header inherits the theme ink. The tone itself is never changed. Pure.
 *
 * Qualifying first band (the hero kit's COVER hero and Noir's cinematic hero):
 *  - a hero carousel with a dark scrim, or
 *  - a container/split with a moving `backgroundMedia`, or
 *  - a full-width container whose `style.backgroundImage` is a photo under a
 *    gradient scrim (`linear-gradient(...), url(...)`).
 * A photo with no scrim cannot promise white text reads, so it does not qualify.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

type Loose = BuilderNode & { children?: BuilderNode[] };
type Props = Record<string, unknown>;

const propsOf = (n: BuilderNode): Props => ((n as { props?: unknown }).props ?? {}) as Props;

/** The first band: step through bare wrappers (a section/container holding one child, no paint). */
function firstBand(tree: ReadonlyArray<BuilderNode>): BuilderNode | null {
  let node: BuilderNode | undefined = tree[0];
  for (let depth = 0; node && depth < 3; depth++) {
    const kids = (node as Loose).children;
    const style = (propsOf(node).style ?? {}) as Props;
    const paints = Boolean(style.backgroundImage) || Boolean(propsOf(node).backgroundMedia);
    if (node.kind === "carousel" || paints || !Array.isArray(kids) || kids.length !== 1) return node;
    node = kids[0];
  }
  return node ?? null;
}

function isDarkMediaHero(node: BuilderNode): boolean {
  const props = propsOf(node);
  if (node.kind === "carousel") {
    const overlay = (props.overlay ?? {}) as { scrim?: unknown; tone?: unknown };
    return props.variant === "hero" && overlay.scrim !== false && overlay.tone !== "light";
  }
  const media = props.backgroundMedia as { src?: unknown } | undefined;
  if (media && typeof media.src === "string" && media.src) return true;
  const style = (props.style ?? {}) as { backgroundImage?: unknown; maxWidth?: unknown };
  const img = style.backgroundImage;
  const fullWidth = style.maxWidth === undefined || style.maxWidth === "full";
  return fullWidth && typeof img === "string" && img.includes("url(") && img.includes("gradient(");
}

/** True when the page's first band is a full-bleed dark media hero (header may paint white over it). */
export function headerOverlayAllowed(homeTree: ReadonlyArray<BuilderNode>): boolean {
  const band = firstBand(homeTree);
  return band ? isDarkMediaHero(band) : false;
}
