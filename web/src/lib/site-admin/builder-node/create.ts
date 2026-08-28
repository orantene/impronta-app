import type {
  BuilderNode,
  BuilderNodeKind,
  BuilderNodeStyle,
} from "./types";
import { createBuilderSectionEmbed } from "./section-embed-presets";
import { makeId, randomUuid } from "./make-id";

// Re-exported so existing `import { makeId } from "./create"` consumers keep
// working; the canonical home is now the dependency-light `./make-id`.
// randomUuid is the secure-context-safe raw-id generator (see make-id.ts).
export { makeId, randomUuid };

const SAMPLE_IMAGES = [
  {
    src: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=1200&q=80",
    alt: "Editorial portrait",
  },
  {
    src: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=1200&q=80",
    alt: "Studio portrait",
  },
  {
    src: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=1200&q=80",
    alt: "Natural light portrait",
  },
  {
    src: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=80",
    alt: "Fashion portrait",
  },
] as const;

const SAMPLE_VIDEO = {
  src: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
  poster:
    "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=1200&q=80",
} as const;

export function createHeading(
  text: string,
  level: 1 | 2 | 3 | 4 = 2,
  style?: BuilderNodeStyle,
): BuilderNode {
  return {
    id: makeId("heading"),
    kind: "heading",
    props: { text, level, style },
  };
}

export function createParagraph(text: string, style?: BuilderNodeStyle): BuilderNode {
  return {
    id: makeId("paragraph"),
    kind: "paragraph",
    props: { text, style },
  };
}

export function createButton(
  label: string,
  href = "/",
  tone: "primary" | "secondary" = "primary",
  style?: BuilderNodeStyle,
): BuilderNode {
  return {
    id: makeId("button"),
    kind: "button",
    props: { label, href, tone, style },
  };
}

export function createImage(index = 0, style?: BuilderNodeStyle): BuilderNode {
  const image = SAMPLE_IMAGES[index % SAMPLE_IMAGES.length]!;
  return {
    id: makeId("image"),
    kind: "image",
    props: { ...image, style },
  };
}

export function createPricingTable(style?: BuilderNodeStyle): BuilderNode {
  return {
    id: makeId("pricing_table"),
    kind: "pricing_table",
    props: {
      style,
      tiers: [
        {
          id: makeId("pricing_table"),
          name: "Starter",
          description: "For focused launches and light-touch support.",
          price: "$1,200",
          period: "project",
          ctaLabel: "Choose Starter",
          ctaHref: "/inquire",
          features: [
            { label: "Discovery call" },
            { label: "Launch checklist" },
            { label: "Priority revisions", included: false },
          ],
        },
        {
          id: makeId("pricing_table"),
          name: "Signature",
          description: "A fuller package with guided strategy and polish.",
          price: "$2,800",
          period: "project",
          ctaLabel: "Choose Signature",
          ctaHref: "/inquire",
          highlighted: true,
          features: [
            { label: "Discovery call" },
            { label: "Launch checklist" },
            { label: "Priority revisions" },
          ],
        },
      ],
    },
  };
}

export function createNav(style?: BuilderNodeStyle): BuilderNode {
  return {
    id: makeId("nav"),
    kind: "nav",
    props: {
      brand: "Brand",
      brandHref: "/",
      collapseAt: "mobile",
      menuLabel: "Menu",
      ariaLabel: "Primary",
      links: [
        { id: randomUuid(), label: "Work", href: "/work" },
        { id: randomUuid(), label: "About", href: "/about" },
        { id: randomUuid(), label: "Services", href: "/services" },
        // No "Contact" entry. On an agency host `/contact` is a CMS clean-URL
        // (proxy.ts rewrites unmatched single-segment paths to /p/<slug>), so
        // it 404s until the operator actually creates a contact page. A default
        // that ships a dead link is worse than a shorter nav.
      ],
      style,
    },
  };
}

export function createSocialLinks(style?: BuilderNodeStyle): BuilderNode {
  return {
    id: makeId("social_links"),
    kind: "social_links",
    props: {
      size: "md",
      shape: "circle",
      ariaLabel: "Social links",
      links: [
        { id: randomUuid(), platform: "instagram", href: "https://instagram.com/" },
        { id: randomUuid(), platform: "tiktok", href: "https://tiktok.com/" },
        { id: randomUuid(), platform: "facebook", href: "https://facebook.com/" },
      ],
      style,
    },
  };
}

export function createAccordionItem(title: string, body: string): BuilderNode {
  return {
    id: makeId("accordion_item"),
    kind: "accordion_item",
    props: { title },
    children: [createParagraph(body)],
  };
}

function createTabPanel(
  title: string,
  headline: string,
  body: string,
): BuilderNode {
  return {
    id: makeId("tab_panel"),
    kind: "tab_panel",
    props: { title },
    children: [createHeading(headline, 3), createParagraph(body)],
  };
}

export function createBuilderNode(kind: BuilderNodeKind): BuilderNode {
  switch (kind) {
    case "social_feed":
      // Seeded EMPTY (same rule as social_post): placeholder posts would put
      // someone else's content on the page. The editor renders a designed
      // empty state until items are added.
      return {
        id: makeId("social_feed"),
        kind: "social_feed",
        props: {
          layout: "grid",
          provider: "instagram",
          columns: 3,
          initialCount: 6,
          gap: "sm",
          aspect: "square",
          hover: "zoom-caption",
          lightbox: true,
          loadMore: "button",
          autoplayVideos: true,
          items: [],
        },
      };
    // WS7 Phase 0 — NATIVE data blocks. Both seed with real, editable copy and
    // their LIVE source already selected: a search hero whose bar actually
    // queries the tenant directory, and a discipline grid in dynamic mode. That
    // is the whole point of these blocks — an operator who has to configure a
    // data source before seeing anything has been handed a placeholder.
    case "hero_search":
      return {
        id: makeId("hero_search"),
        kind: "hero_search",
        props: {
          eyebrow: "",
          headline: "Find the right talent",
          highlight: "",
          subheadline: "Search the roster by role, location or fit.",
          searchEnabled: true,
          searchPlaceholder: "Search talent by role, location or fit",
          searchSubmitLabel: "Search",
          chips: [],
          statSource: "tenant_talent_count",
          statCountLabel: "represented talent",
          layout: "centered",
        },
      };
    case "talent_type_grid":
      return {
        id: makeId("talent_type_grid"),
        kind: "talent_type_grid",
        props: {
          eyebrow: "",
          headline: "Talent, by discipline",
          subheadline: "",
          mode: "dynamic",
          items: [],
          maxItems: 7,
          columns: 4,
          showCount: true,
          showImages: false,
          showDescriptions: false,
          cardRatio: "3/4",
          textPosition: "below",
          seeAllLabel: "See all",
          seeAllHref: "/directory",
        },
      };
    case "social_post":
      // Seeded EMPTY on purpose: a placeholder post URL would render someone
      // else's content on the operator's page until they noticed. The inspector
      // shows an empty state until a real URL is pasted.
      return {
        id: makeId("social_post"),
        kind: "social_post",
        props: { provider: "instagram", url: "" },
      };
    case "section":
      return {
        id: makeId("section"),
        kind: "section",
        props: {
          sectionTypeKey: "custom",
        },
        children: [],
      };
    case "container":
      return {
        id: makeId("container"),
        kind: "container",
        props: { layout: "stack", gap: "m" },
        children: [
          createHeading("New content block"),
          createParagraph("Add copy, media, or nested layout blocks here."),
          createButton("Call to action"),
        ],
      };
    case "split":
      return {
        id: makeId("split"),
        kind: "split",
        props: { ratio: "50-50", gap: "m", collapseOnMobile: true },
        children: [
          {
            id: makeId("container"),
            kind: "container",
            props: { layout: "stack", gap: "m" },
            children: [
              createHeading("Feature headline"),
              createParagraph(
                "Use this column for supporting copy and conversion context.",
              ),
              createButton("Learn more", "/", "secondary"),
            ],
          },
          {
            id: makeId("container"),
            kind: "container",
            props: { layout: "stack", gap: "m" },
            children: [createImage(0)],
          },
        ],
      };
    case "accordion_item":
      return {
        id: makeId("accordion_item"),
        kind: "accordion_item",
        props: { title: "Accordion item" },
        children: [createParagraph("Add the answer or supporting detail here.")],
      };
    case "accordion":
      return {
        id: makeId("accordion"),
        kind: "accordion",
        props: { allowMultiple: false },
        children: [
          createAccordionItem(
            "What is included?",
            "Describe the package, service, or process in plain language.",
          ),
          createAccordionItem(
            "How does booking work?",
            "Explain the next step and what the visitor should expect after reaching out.",
          ),
          createAccordionItem(
            "Can this be customized?",
            "Set expectations for custom requests, timelines, and availability.",
          ),
        ],
      };
    case "tab_panel":
      return {
        id: makeId("tab_panel"),
        kind: "tab_panel",
        props: { title: "Tab panel" },
        children: [
          createHeading("Tab headline", 3),
          createParagraph("Add focused content for this tab."),
        ],
      };
    case "tabs":
      return {
        id: makeId("tabs"),
        kind: "tabs",
        props: {},
        children: [
          createTabPanel(
            "Overview",
            "Overview",
            "Introduce the offer, roster, or service category.",
          ),
          createTabPanel(
            "Details",
            "Details",
            "Add deeper information without making the page feel crowded.",
          ),
          createTabPanel(
            "Booking",
            "Booking",
            "Explain next steps and connect the visitor to the right action.",
          ),
        ],
      };
    case "carousel":
      return {
        id: makeId("carousel"),
        kind: "carousel",
        props: { slidesPerView: 1, showArrows: true, showDots: true },
        children: [createImage(0), createImage(1), createImage(2)],
      };
    case "masonry":
      return {
        id: makeId("masonry"),
        kind: "masonry",
        props: { columns: 3, gap: "m" },
        children: [
          createImage(0),
          createImage(1),
          createImage(2),
          createImage(3),
        ],
      };
    case "heading":
      return createHeading("Heading");
    case "paragraph":
      return createParagraph("Paragraph");
    case "button":
      return createButton("Button");
    case "image":
      return createImage(0);
    case "video":
      return {
        id: makeId("video"),
        kind: "video",
        props: {
          src: SAMPLE_VIDEO.src,
          poster: SAMPLE_VIDEO.poster,
          controls: true,
          muted: true,
        },
      };
    case "embed":
      return {
        id: makeId("embed"),
        kind: "embed",
        props: {
          src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
          title: "Embedded video",
          provider: "youtube",
          allowFullScreen: true,
          style: { aspectRatio: "16:9" },
        },
      };
    case "icon":
      return {
        id: makeId("icon"),
        kind: "icon",
        props: {
          icon: "sparkle",
          label: "Sparkle",
          size: "lg",
        },
      };
    case "pricing_table":
      return createPricingTable();
    case "rich_text":
      return {
        id: makeId("rich_text"),
        kind: "rich_text",
        props: {
          text: "Write {b}rich copy{/b}, {i}editorial emphasis{/i}, and [safe links](/directory).",
        },
      };
    case "code":
      return {
        id: makeId("code"),
        kind: "code",
        props: {
          html: '<div style="padding:24px;text-align:center;font:500 15px/1.5 system-ui,sans-serif;color:#475569;border:1px dashed #cbd5e1;border-radius:12px">Paste any HTML/CSS here. It renders in a sandboxed frame.</div>',
          minHeight: 120,
        },
      };
    case "divider":
      return {
        id: makeId("divider"),
        kind: "divider",
        props: { tone: "default" },
      };
    case "spacer":
      return {
        id: makeId("spacer"),
        kind: "spacer",
        props: { size: "m" },
      };
    case "card":
      return {
        id: makeId("card"),
        kind: "card",
        props: { variant: "elevated" },
        children: [
          createHeading("Card title", 3),
          createParagraph("Supporting copy for this card."),
          createButton("Primary action"),
        ],
      };
    case "cta_group":
      return {
        id: makeId("cta_group"),
        kind: "cta_group",
        props: { layout: "row", gap: "m", align: "center" },
        children: [
          createButton("Primary", "/", "primary"),
          createButton("Secondary", "/", "secondary"),
        ],
      };
    case "nav":
      return createNav();
    case "social_links":
      return createSocialLinks();
    case "form":
      return {
        id: makeId("form"),
        kind: "form",
        props: {
          action: "internal",
          honeypotName: "website",
          fields: [
            {
              id: randomUuid(),
              name: "name",
              type: "text",
              label: "Name",
              placeholder: "Your name",
              required: true,
            },
            {
              id: randomUuid(),
              name: "email",
              type: "email",
              label: "Email",
              placeholder: "you@example.com",
              required: true,
            },
            {
              id: randomUuid(),
              name: "message",
              type: "textarea",
              label: "Message",
              placeholder: "How can we help?",
            },
            {
              id: randomUuid(),
              name: "submit",
              type: "submit",
              label: "Send",
            },
          ],
        },
      };
    case "section_embed":
      // A bare "section_embed" insert has no chosen section. Default to the
      // Directory component (seeded with its preset config). The picker inserts
      // a specific Tulala component via createBuilderSectionEmbed(typeKey).
      return createBuilderSectionEmbed("directory");
  }
}


// Composition presets live in ./composition-presets (kept out of this file
// to satisfy max-lines). Re-exported here so existing import sites that pull
// them from "./create" keep working.
export {
  BUILDER_NODE_COMPOSITION_PRESETS,
  createBuilderNodeCompositionPreset,
} from "./composition-presets";
export type {
  BuilderNodeCompositionPresetId,
  BuilderNodeCompositionPreset,
} from "./composition-presets";

// Curated Tulala-component embeds (Directory / Featured talent / Booking / CTA)
// — presets + factory live in ./section-embed-presets; re-exported here so the
// element-library picker and insert plumbing import them from one place.
export {
  SECTION_EMBED_PRESETS,
  getSectionEmbedPreset,
  sectionEmbedTypeLabel,
  createBuilderSectionEmbed,
} from "./section-embed-presets";
export type { SectionEmbedPreset } from "./section-embed-presets";
