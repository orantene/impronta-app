import type {
  BuilderNode,
  BuilderNodeKind,
  BuilderNodeStyle,
} from "./types";

export function makeId(kind: BuilderNodeKind): string {
  return `builder-${kind}-${crypto.randomUUID()}`;
}

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
