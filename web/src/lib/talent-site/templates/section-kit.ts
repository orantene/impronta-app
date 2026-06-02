/**
 * Section kit — reusable, schema-valid section factories for talent personal
 * site templates.
 *
 * Every factory returns a {@link SlotSpec} (a section type key + props object);
 * {@link compose} stamps each with a unique slotKey, sortOrder, and id. All
 * props validate against the platform section registry schemas
 * (web/src/lib/site-admin/sections/<key>/schema.ts).
 *
 * IMPORTANT: every image field in the section schemas is `z.string().url()`,
 * which rejects root-relative paths. So all image URLs passed here MUST be
 * absolute (http/https). The demo preview route absolutises /public paths via
 * the request origin; live applies use absolute Supabase storage URLs.
 */
import type { TalentSiteSnapshotSection } from "../types";

export type SlotSpec = {
  type: string;
  name: string;
  props: Record<string, unknown>;
};

export type Cta = { label: string; href: string };

/** Inquiry deep-link for a talent's public profile (falls back to an anchor). */
export function inquireHref(profileCode: string): string {
  return profileCode ? `/t/${profileCode}?inquire=1` : "#contact";
}

type PresetTone =
  | "canvas"
  | "ivory"
  | "champagne"
  | "espresso"
  | "blush"
  | "sage"
  | "muted-surface";

type Pad = "none" | "tight" | "standard" | "airy" | "editorial";
type Width = "narrow" | "standard" | "wide" | "editorial" | "full-bleed";

/** Tasteful presentation block. All fields optional; only set what we use. */
export function pres(opts: {
  background?: PresetTone;
  top?: Pad;
  bottom?: Pad;
  width?: Width;
  align?: "left" | "center" | "right";
  onDark?: boolean;
  entry?: "none" | "fade" | "fade-up" | "fade-down" | "slide-left" | "slide-right" | "scale-in";
  reveal?: "none" | "fade" | "fade-up" | "fade-down" | "fade-left" | "fade-right" | "zoom";
}): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (opts.background) p.background = opts.background;
  if (opts.top) p.paddingTop = opts.top;
  if (opts.bottom) p.paddingBottom = opts.bottom;
  if (opts.width) p.containerWidth = opts.width;
  if (opts.align) p.align = opts.align;
  if (opts.onDark) p.textTone = "on-dark";
  if (opts.entry) {
    p.animations = { entry: opts.entry };
  }
  if (opts.reveal) p.scrollReveal = opts.reveal;
  return p;
}

/** Stamp slot specs with unique keys + ordering. Null/undefined specs drop. */
export function compose(
  specs: Array<SlotSpec | null | undefined>,
): TalentSiteSnapshotSection[] {
  return specs
    .filter((s): s is SlotSpec => Boolean(s))
    .map((s, i) => ({
      slotKey: `${s.type}-${i}`,
      sortOrder: i,
      sectionId: crypto.randomUUID(),
      sectionTypeKey: s.type,
      schemaVersion: 1,
      name: s.name,
      props: s.props,
    }));
}

// ── Heroes ────────────────────────────────────────────────────────────────

/** Full-bleed cinematic hero. 1 image = static; 2+ = auto-advancing reel. */
export function heroReel(opts: {
  eyebrow?: string;
  title: string;
  tagline?: string;
  primary: Cta;
  secondary?: Cta;
  images: string[];
  overlay?: "none" | "gradient-scrim" | "aurora" | "soft-vignette";
  mood?: "clean" | "editorial" | "cinematic";
  overlayOpacity?: number;
  background?: PresetTone;
}): SlotSpec {
  const imgs = opts.images.filter(Boolean).slice(0, 6);
  return {
    type: "hero",
    name: "Hero",
    props: {
      headline: opts.title,
      ...(opts.tagline ? { subheadline: opts.tagline } : {}),
      overlay: opts.overlay ?? "gradient-scrim",
      mood: opts.mood ?? "cinematic",
      primaryCta: opts.primary,
      ...(opts.secondary ? { secondaryCta: opts.secondary } : {}),
      ...(imgs.length
        ? {
            slides: imgs.map((url) => ({
              backgroundImageUrl: url,
              backgroundImageAlt: opts.title,
              overlayOpacity: opts.overlayOpacity ?? 44,
            })),
            autoplayMs: 4600,
          }
        : {}),
      presentation: pres({
        background: opts.background ?? "espresso",
        top: "editorial",
        bottom: "editorial",
        width: "full-bleed",
        align: "center",
        onDark: true,
      }),
    },
  };
}

/** Editorial split hero — copy beside a single statement image. */
export function heroSplit(opts: {
  eyebrow?: string;
  title: string;
  tagline?: string;
  primary: Cta;
  secondary?: Cta;
  imageUrl: string;
  imageAlt?: string;
  side?: "media-right" | "media-left";
  variant?: "card" | "fullbleed" | "asymmetric";
  background?: PresetTone;
}): SlotSpec {
  return {
    type: "hero_split",
    name: "Hero",
    props: {
      ...(opts.eyebrow ? { eyebrow: opts.eyebrow } : {}),
      headline: opts.title,
      ...(opts.tagline ? { subheadline: opts.tagline } : {}),
      primaryCta: opts.primary,
      ...(opts.secondary ? { secondaryCta: opts.secondary } : {}),
      imageUrl: opts.imageUrl,
      imageAlt: opts.imageAlt ?? opts.title,
      side: opts.side ?? "media-right",
      variant: opts.variant ?? "asymmetric",
      presentation: pres({
        background: opts.background ?? "canvas",
        top: "airy",
        bottom: "airy",
        width: "wide",
      }),
    },
  };
}

// ── Motion / rhythm ─────────────────────────────────────────────────────────

export function marquee(opts: {
  items: string[];
  separator?: "dot" | "slash" | "diamond" | "none";
  variant?: "text" | "tags";
  background?: PresetTone;
  onDark?: boolean;
}): SlotSpec {
  return {
    type: "marquee",
    name: "Marquee",
    props: {
      items: opts.items.slice(0, 40).map((text) => ({ text })),
      speed: "medium",
      direction: "left",
      separator: opts.separator ?? "diamond",
      variant: opts.variant ?? "text",
      presentation: pres({
        background: opts.background ?? "espresso",
        top: "tight",
        bottom: "tight",
        width: "full-bleed",
        onDark: opts.onDark ?? true,
      }),
    },
  };
}

export function anchorNav(links: Cta[]): SlotSpec {
  return {
    type: "anchor_nav",
    name: "Section nav",
    props: {
      links: links.slice(0, 20),
      variant: "pills",
      sticky: true,
      align: "center",
      presentation: pres({ background: "ivory", top: "tight", bottom: "tight", width: "full-bleed" }),
    },
  };
}

// ── About / story ───────────────────────────────────────────────────────────

export function aboutStory(opts: {
  eyebrow?: string;
  headline?: string;
  title: string;
  body: string;
  italicTagline?: string;
  imageUrl?: string;
  imageAlt?: string;
  listItems?: string[];
  side?: "image-left" | "image-right";
  cta?: Cta;
  background?: PresetTone;
}): SlotSpec {
  return {
    type: "image_copy_alternating",
    name: "About",
    props: {
      eyebrow: opts.eyebrow ?? "About",
      ...(opts.headline ? { headline: opts.headline } : {}),
      items: [
        {
          title: opts.title,
          ...(opts.italicTagline ? { italicTagline: opts.italicTagline } : {}),
          body: opts.body,
          ...(opts.imageUrl ? { imageUrl: opts.imageUrl, imageAlt: opts.imageAlt ?? opts.title } : {}),
          ...(opts.listItems?.length ? { listItems: opts.listItems.slice(0, 8) } : {}),
          ...(opts.cta ? { primaryCta: opts.cta } : {}),
          side: opts.side ?? "image-right",
        },
      ],
      variant: "editorial-alternating",
      gap: "airy",
      imageRatio: "5/6",
      presentation: pres({ background: opts.background ?? "canvas", top: "airy", bottom: "airy", width: "wide" }),
    },
  };
}

/** Multi-row alternating image + copy — services / offerings. */
export function servicesAlternating(opts: {
  eyebrow?: string;
  headline?: string;
  items: Array<{
    title: string;
    body?: string;
    imageUrl?: string;
    imageAlt?: string;
    iconKey?: string;
    listItems?: string[];
    cta?: Cta;
  }>;
  background?: PresetTone;
}): SlotSpec {
  return {
    type: "image_copy_alternating",
    name: "Services",
    props: {
      eyebrow: opts.eyebrow ?? "Services",
      ...(opts.headline ? { headline: opts.headline } : {}),
      items: opts.items.slice(0, 12).map((it) => ({
        title: it.title,
        ...(it.body ? { body: it.body } : {}),
        ...(it.imageUrl ? { imageUrl: it.imageUrl, imageAlt: it.imageAlt ?? it.title } : {}),
        ...(it.iconKey ? { iconKey: it.iconKey } : {}),
        ...(it.listItems?.length ? { listItems: it.listItems.slice(0, 8) } : {}),
        ...(it.cta ? { primaryCta: it.cta } : {}),
        side: "auto",
      })),
      variant: "editorial-alternating",
      gap: "airy",
      imageRatio: "4/5",
      presentation: pres({ background: opts.background ?? "ivory", top: "airy", bottom: "airy", width: "wide" }),
    },
  };
}

export function valuesTrio(opts: {
  eyebrow?: string;
  headline?: string;
  items: Array<{ numberLabel?: string; title: string; detail?: string }>;
  variant?: "numbered-cards" | "iconed";
  background?: PresetTone;
}): SlotSpec {
  return {
    type: "values_trio",
    name: "Highlights",
    props: {
      ...(opts.eyebrow ? { eyebrow: opts.eyebrow } : {}),
      ...(opts.headline ? { headline: opts.headline } : {}),
      items: opts.items.slice(0, 5),
      variant: opts.variant ?? "numbered-cards",
      numberStyle: "serif-italic",
      presentation: pres({ background: opts.background ?? "canvas", top: "airy", bottom: "airy", width: "standard", align: "center" }),
    },
  };
}

// ── Galleries / media ───────────────────────────────────────────────────────

export function gallery(opts: {
  eyebrow?: string;
  headline?: string;
  images: string[];
  alt?: string;
  variant?: "mosaic" | "scroll-rail" | "grid-uniform";
  caption?: string;
  background?: PresetTone;
}): SlotSpec | null {
  const items = opts.images.filter(Boolean).slice(0, 16);
  if (items.length < 3) return null;
  const aspects = ["wide", "tall", "square"] as const;
  return {
    type: "gallery_strip",
    name: "Portfolio",
    props: {
      eyebrow: opts.eyebrow ?? "Portfolio",
      ...(opts.headline ? { headline: opts.headline } : {}),
      items: items.map((src, i) => ({
        src,
        alt: opts.alt ?? "",
        aspect: aspects[i % 3],
      })),
      variant: opts.variant ?? "mosaic",
      ...(opts.caption ? { caption: opts.caption } : {}),
      presentation: pres({ background: opts.background ?? "ivory", top: "standard", bottom: "airy", width: "editorial" }),
    },
  };
}

export function masonry(opts: {
  eyebrow?: string;
  headline?: string;
  images: string[];
  alt?: string;
  columns?: number;
  background?: PresetTone;
}): SlotSpec | null {
  const items = opts.images.filter(Boolean).slice(0, 48);
  if (items.length < 2) return null;
  return {
    type: "masonry",
    name: "Gallery",
    props: {
      eyebrow: opts.eyebrow ?? "Gallery",
      ...(opts.headline ? { headline: opts.headline } : {}),
      items: items.map((src) => ({ src, alt: opts.alt ?? "" })),
      columnsDesktop: opts.columns ?? 3,
      gap: "standard",
      presentation: pres({ background: opts.background ?? "canvas", top: "standard", bottom: "standard", width: "wide" }),
    },
  };
}

export function lookbook(opts: {
  eyebrow?: string;
  headline?: string;
  images: string[];
  captions?: string[];
  alt?: string;
  ratio?: "3/4" | "4/5" | "1/1";
  background?: PresetTone;
}): SlotSpec | null {
  const pages = opts.images.filter(Boolean).slice(0, 20);
  if (pages.length < 2) return null;
  return {
    type: "lookbook",
    name: "Lookbook",
    props: {
      eyebrow: opts.eyebrow ?? "Lookbook",
      ...(opts.headline ? { headline: opts.headline } : {}),
      pages: pages.map((imageUrl, i) => ({
        imageUrl,
        alt: opts.alt ?? "",
        ...(opts.captions?.[i] ? { caption: opts.captions[i] } : {}),
      })),
      variant: "spread",
      ratio: opts.ratio ?? "4/5",
      presentation: pres({ background: opts.background ?? "champagne", top: "editorial", bottom: "editorial", width: "full-bleed" }),
    },
  };
}

export function beforeAfter(opts: {
  eyebrow?: string;
  headline?: string;
  beforeUrl: string;
  afterUrl: string;
  beforeLabel?: string;
  afterLabel?: string;
  ratio?: "16/9" | "4/3" | "1/1" | "5/4";
  background?: PresetTone;
}): SlotSpec {
  return {
    type: "before_after",
    name: "Before / after",
    props: {
      eyebrow: opts.eyebrow ?? "Transformations",
      ...(opts.headline ? { headline: opts.headline } : {}),
      beforeUrl: opts.beforeUrl,
      afterUrl: opts.afterUrl,
      beforeLabel: opts.beforeLabel ?? "Before",
      afterLabel: opts.afterLabel ?? "After",
      initialPosition: 50,
      ratio: opts.ratio ?? "4/3",
      presentation: pres({ background: opts.background ?? "canvas", top: "standard", bottom: "standard", width: "wide" }),
    },
  };
}

export function videoReel(opts: {
  eyebrow?: string;
  headline?: string;
  videoUrl: string;
  posterUrl?: string;
  ratio?: "16/9" | "4/3" | "1/1" | "21/9" | "9/16";
  background?: PresetTone;
}): SlotSpec {
  return {
    type: "video_reel",
    name: "Showreel",
    props: {
      eyebrow: opts.eyebrow ?? "Watch",
      ...(opts.headline ? { headline: opts.headline } : {}),
      videoUrl: opts.videoUrl,
      ...(opts.posterUrl ? { posterUrl: opts.posterUrl } : {}),
      ratio: opts.ratio ?? "16/9",
      controls: true,
      loop: false,
      muted: false,
      autoplay: false,
      presentation: pres({ background: opts.background ?? "espresso", top: "airy", bottom: "airy", width: "wide", onDark: true }),
    },
  };
}

// ── Trust / proof ────────────────────────────────────────────────────────────

export function stats(opts: {
  eyebrow?: string;
  headline?: string;
  items: Array<{ value: string; label: string; caption?: string }>;
  variant?: "row" | "grid" | "split";
  background?: PresetTone;
  onDark?: boolean;
}): SlotSpec {
  return {
    type: "stats",
    name: "By the numbers",
    props: {
      ...(opts.eyebrow ? { eyebrow: opts.eyebrow } : {}),
      ...(opts.headline ? { headline: opts.headline } : {}),
      items: opts.items.slice(0, 6),
      variant: opts.variant ?? "row",
      align: "center",
      presentation: pres({
        background: opts.background ?? "espresso",
        top: "standard",
        bottom: "standard",
        width: "wide",
        onDark: opts.onDark ?? true,
      }),
    },
  };
}

export function testimonials(opts: {
  eyebrow?: string;
  headline?: string;
  items: Array<{ quote: string; author?: string; context?: string; location?: string }>;
  variant?: "trio-card" | "single-hero" | "carousel-row";
  background?: PresetTone;
}): SlotSpec {
  return {
    type: "testimonials_trio",
    name: "Testimonials",
    props: {
      eyebrow: opts.eyebrow ?? "Kind words",
      ...(opts.headline ? { headline: opts.headline } : {}),
      items: opts.items.slice(0, 4),
      variant: opts.variant ?? "trio-card",
      defaultAccent: "auto",
      presentation: pres({ background: opts.background ?? "blush", top: "editorial", bottom: "editorial", width: "wide", align: "center" }),
    },
  };
}

export function faq(opts: {
  eyebrow?: string;
  headline?: string;
  intro?: string;
  items: Array<{ question: string; answer: string }>;
  background?: PresetTone;
}): SlotSpec {
  return {
    type: "faq_accordion",
    name: "FAQ",
    props: {
      eyebrow: opts.eyebrow ?? "Good to know",
      headline: opts.headline ?? "Questions, answered",
      ...(opts.intro ? { intro: opts.intro } : {}),
      items: opts.items.slice(0, 20),
      variant: "bordered",
      defaultOpen: 0,
      presentation: pres({ background: opts.background ?? "champagne", top: "standard", bottom: "airy", width: "standard" }),
    },
  };
}

export function contentTabs(opts: {
  eyebrow?: string;
  headline?: string;
  tabs: Array<{ label: string; body: string }>;
  background?: PresetTone;
}): SlotSpec {
  return {
    type: "content_tabs",
    name: "Details",
    props: {
      ...(opts.eyebrow ? { eyebrow: opts.eyebrow } : {}),
      ...(opts.headline ? { headline: opts.headline } : {}),
      tabs: opts.tabs.slice(0, 8),
      variant: "underline",
      defaultTab: 0,
      presentation: pres({ background: opts.background ?? "ivory", top: "standard", bottom: "standard", width: "standard" }),
    },
  };
}

export function timeline(opts: {
  eyebrow?: string;
  headline?: string;
  items: Array<{ date: string; title: string; body?: string }>;
  background?: PresetTone;
}): SlotSpec {
  return {
    type: "timeline",
    name: "Experience",
    props: {
      eyebrow: opts.eyebrow ?? "Experience",
      ...(opts.headline ? { headline: opts.headline } : {}),
      items: opts.items.slice(0, 40),
      variant: "left-rail",
      numberStyle: "year",
      presentation: pres({ background: opts.background ?? "ivory", top: "airy", bottom: "airy", width: "standard" }),
    },
  };
}

// ── Conversion ───────────────────────────────────────────────────────────────

/** Calendar booking embed (Calendly / Cal.com / etc). url must be allow-listed. */
export function bookingCal(opts: {
  eyebrow?: string;
  headline?: string;
  intro?: string;
  url: string;
  background?: PresetTone;
}): SlotSpec {
  return {
    type: "booking_widget",
    name: "Book",
    props: {
      eyebrow: opts.eyebrow ?? "Availability",
      headline: opts.headline ?? "Reserve a date",
      ...(opts.intro ? { intro: opts.intro } : {}),
      url: opts.url,
      variant: "inline",
      ratio: "4/3",
      minHeight: 640,
      presentation: pres({ background: opts.background ?? "ivory", top: "standard", bottom: "standard", width: "standard" }),
    },
  };
}

export function ctaBook(opts: {
  eyebrow?: string;
  headline: string;
  copy?: string;
  reassurance?: string;
  primary: Cta;
  secondary?: Cta;
  backgroundImageUrl?: string;
  variant?: "centered-overlay" | "split-image" | "minimal-band";
  bandTone?: "ivory" | "champagne" | "espresso" | "blush";
}): SlotSpec {
  const variant = opts.variant ?? (opts.backgroundImageUrl ? "centered-overlay" : "minimal-band");
  return {
    type: "cta_banner",
    name: "Contact",
    props: {
      ...(opts.eyebrow ? { eyebrow: opts.eyebrow } : {}),
      headline: opts.headline,
      ...(opts.copy ? { copy: opts.copy } : {}),
      ...(opts.reassurance ? { reassurance: opts.reassurance } : {}),
      primaryCta: opts.primary,
      ...(opts.secondary ? { secondaryCta: opts.secondary } : {}),
      ...(opts.backgroundImageUrl
        ? { backgroundImageUrl: opts.backgroundImageUrl, backgroundImageAlt: opts.headline, overlayOpacity: 52 }
        : {}),
      variant,
      bandTone: opts.bandTone ?? "espresso",
      insetCard: true,
      presentation: pres({ background: "canvas", top: "editorial", bottom: "editorial", width: "wide", align: "center" }),
    },
  };
}
