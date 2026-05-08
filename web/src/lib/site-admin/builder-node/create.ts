import type {
  BuilderNode,
  BuilderNodeKind,
  BuilderNodeStyle,
} from "./types";

function makeId(kind: BuilderNodeKind): string {
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

function createHeading(
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

function createParagraph(text: string, style?: BuilderNodeStyle): BuilderNode {
  return {
    id: makeId("paragraph"),
    kind: "paragraph",
    props: { text, style },
  };
}

function createButton(
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

function createImage(index = 0, style?: BuilderNodeStyle): BuilderNode {
  const image = SAMPLE_IMAGES[index % SAMPLE_IMAGES.length]!;
  return {
    id: makeId("image"),
    kind: "image",
    props: { ...image, style },
  };
}

function createAccordionItem(title: string, body: string): BuilderNode {
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
    case "spacer":
      return {
        id: makeId("spacer"),
        kind: "spacer",
        props: { size: "m" },
      };
  }
}

export type BuilderNodeCompositionPresetId =
  | "agency-search-hero"
  | "featured-talent-grid"
  | "editorial-story-split"
  | "location-proof-band"
  | "faq-conversion-stack";

export interface BuilderNodeCompositionPreset {
  id: BuilderNodeCompositionPresetId;
  label: string;
  description: string;
  rootKind: Extract<BuilderNodeKind, "container" | "split" | "accordion">;
  category: "hero" | "data" | "story" | "trust" | "conversion";
  dataMode: "starter" | "data-ready";
  keywords: ReadonlyArray<string>;
  sectionCount: number;
}

export const BUILDER_NODE_COMPOSITION_PRESETS: ReadonlyArray<BuilderNodeCompositionPreset> = [
  {
    id: "agency-search-hero",
    label: "Agency search hero",
    description: "Editorial headline, natural-language search copy, and quick actions.",
    rootKind: "container",
    category: "hero",
    dataMode: "data-ready",
    keywords: ["search", "directory", "lead", "hero", "browse"],
    sectionCount: 5,
  },
  {
    id: "featured-talent-grid",
    label: "Featured talent grid",
    description: "Roster-led cards with real-looking portrait defaults.",
    rootKind: "container",
    category: "data",
    dataMode: "data-ready",
    keywords: ["roster", "talent", "profiles", "featured", "database"],
    sectionCount: 6,
  },
  {
    id: "editorial-story-split",
    label: "Editorial story split",
    description: "Image-led narrative block with CTA and responsive split behavior.",
    rootKind: "split",
    category: "story",
    dataMode: "starter",
    keywords: ["story", "about", "editorial", "image", "brand"],
    sectionCount: 5,
  },
  {
    id: "location-proof-band",
    label: "Location proof band",
    description: "Location buttons, proof copy, and visual map placeholder.",
    rootKind: "container",
    category: "trust",
    dataMode: "data-ready",
    keywords: ["locations", "map", "cities", "market", "proof"],
    sectionCount: 7,
  },
  {
    id: "faq-conversion-stack",
    label: "FAQ conversion stack",
    description: "Accordion answers plus a direct inquiry CTA.",
    rootKind: "container",
    category: "conversion",
    dataMode: "starter",
    keywords: ["faq", "accordion", "questions", "conversion", "inquiry"],
    sectionCount: 6,
  },
] as const;

function createAgencySearchHeroPreset(): Exclude<BuilderNode, { kind: "section" }> {
  return {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "stack",
      gap: "m",
      dataBinding: {
        sourceKey: "tenant_directory_search",
        mode: "auto",
        maxItems: 8,
      },
      style: {
        align: "center",
        maxWidth: "wide",
        paddingY: "l",
        marginBottom: "l",
        responsive: {
          mobile: {
            maxWidth: "full",
            paddingX: "s",
            paddingY: "m",
          },
        },
      },
    },
    children: [
      createHeading("Find the right talent for your brief", 1, {
        align: "center",
        size: "xl",
        tone: "strong",
        maxWidth: "wide",
        marginBottom: "s",
        responsive: {
          mobile: { size: "lg", maxWidth: "full" },
        },
      }),
      createParagraph(
        "Search the directory by role, location, or fit. Agency-managed, no direct contact.",
        {
          align: "center",
          size: "lg",
          tone: "muted",
          maxWidth: "reading",
          marginBottom: "m",
        },
      ),
      {
        id: makeId("container"),
        kind: "container",
        props: {
          layout: "row",
          gap: "s",
          align: "center",
          responsive: {
            mobile: {
              layout: "stack",
              align: "stretch",
            },
          },
          style: {
            align: "center",
            maxWidth: "reading",
            background: "surface",
            radius: "none",
            paddingX: "m",
            paddingY: "s",
          },
        },
        children: [
          createParagraph("Promotional models for a boutique venue opening", {
            size: "md",
            tone: "muted",
            marginBottom: "none",
          }),
          createButton("Search", "/directory", "primary", {
            radius: "none",
            paddingX: "m",
            paddingY: "s",
          }),
        ],
      },
      {
        id: makeId("container"),
        kind: "container",
        props: {
          layout: "row",
          gap: "s",
          align: "center",
          responsive: {
            tablet: { layout: "row", columns: 3 },
            mobile: { layout: "grid", columns: 2 },
          },
          style: {
            align: "center",
            maxWidth: "wide",
            marginTop: "m",
          },
        },
        children: [
          createButton("Models", "/directory?type=models", "secondary", {
            radius: "pill",
            paddingX: "m",
            paddingY: "s",
          }),
          createButton("Hosts", "/directory?type=hosts", "secondary", {
            radius: "pill",
            paddingX: "m",
            paddingY: "s",
          }),
          createButton("Creators", "/directory?type=creators", "secondary", {
            radius: "pill",
            paddingX: "m",
            paddingY: "s",
          }),
        ],
      },
    ],
  };
}

function createFeaturedTalentGridPreset(): Exclude<BuilderNode, { kind: "section" }> {
  return {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "stack",
      gap: "m",
      dataBinding: {
        sourceKey: "featured_talent_profiles",
        mode: "auto",
        maxItems: 4,
      },
      style: {
        maxWidth: "wide",
        marginTop: "l",
        marginBottom: "l",
      },
    },
    children: [
      createHeading("Featured talent", 2, {
        align: "left",
        size: "lg",
        tone: "strong",
        marginBottom: "none",
      }),
      createParagraph("Handpicked by the agency", {
        align: "left",
        size: "lg",
        tone: "muted",
        marginBottom: "m",
      }),
      {
        id: makeId("container"),
        kind: "container",
        props: {
          layout: "grid",
          gap: "m",
          columns: 4,
          responsive: {
            tablet: { layout: "grid", columns: 2 },
            mobile: { layout: "stack", columns: 1 },
          },
        },
        children: [
          createTalentCard("Adriana Vega", "Fashion Model · Cancun, MX", 0),
          createTalentCard("Isabella Flores", "Commercial Model · Cancun, MX", 1),
          createTalentCard("Omar Haddad", "Brand Ambassador · Cancun, MX", 2),
          createTalentCard("Nina Hart", "Influencer · Ibiza, ES", 3),
        ],
      },
    ],
  };
}

function createTalentCard(name: string, meta: string, imageIndex: number): BuilderNode {
  return {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "stack",
      gap: "s",
      style: {
        radius: "none",
      },
    },
    children: [
      createImage(imageIndex, {
        radius: "none",
        objectFit: "cover",
        aspectRatio: "3:4",
        maxWidth: "full",
      }),
      createHeading(name, 3, {
        size: "sm",
        tone: "strong",
        marginTop: "s",
        marginBottom: "none",
      }),
      createParagraph(meta, {
        size: "sm",
        tone: "muted",
        marginTop: "none",
      }),
    ],
  };
}

function createEditorialStorySplitPreset(): Exclude<BuilderNode, { kind: "section" }> {
  return {
    id: makeId("split"),
    kind: "split",
    props: {
      ratio: "40-60",
      gap: "l",
      collapseOnMobile: true,
      style: {
        maxWidth: "wide",
        marginTop: "l",
        marginBottom: "l",
      },
    },
    children: [
      {
        id: makeId("container"),
        kind: "container",
        props: { layout: "stack", gap: "m" },
        children: [
          createHeading("Built for agencies that curate, not list", 2, {
            size: "lg",
            tone: "strong",
            maxWidth: "reading",
          }),
          createParagraph(
            "Use this section for brand positioning, booking standards, or a careful explanation of how talent is represented.",
            {
              size: "md",
              tone: "muted",
              maxWidth: "reading",
            },
          ),
          createButton("Start an inquiry", "/inquiry", "primary", {
            radius: "none",
            paddingX: "m",
            paddingY: "s",
          }),
        ],
      },
      createImage(3, {
        radius: "none",
        objectFit: "cover",
        aspectRatio: "4:3",
        maxWidth: "full",
        responsive: {
          mobile: {
            aspectRatio: "1:1",
          },
        },
      }),
    ],
  };
}

function createLocationProofBandPreset(): Exclude<BuilderNode, { kind: "section" }> {
  return {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "stack",
      gap: "m",
      dataBinding: {
        sourceKey: "talent_locations",
        mode: "auto",
        maxItems: 6,
      },
      style: {
        align: "center",
        maxWidth: "wide",
        marginTop: "l",
        marginBottom: "l",
      },
    },
    children: [
      createHeading("Explore by location", 2, {
        align: "center",
        size: "lg",
        tone: "strong",
      }),
      createParagraph("Where we operate", {
        align: "center",
        size: "lg",
        tone: "muted",
        marginBottom: "m",
      }),
      {
        id: makeId("container"),
        kind: "container",
        props: {
          layout: "row",
          gap: "s",
          align: "center",
          responsive: {
            mobile: { layout: "grid", columns: 2 },
          },
        },
        children: [
          createButton("Cancun · 7 talents", "/directory?location=cancun", "secondary", {
            radius: "none",
            paddingX: "m",
            paddingY: "s",
          }),
          createButton("Ibiza · 4 talents", "/directory?location=ibiza", "secondary", {
            radius: "none",
            paddingX: "m",
            paddingY: "s",
          }),
          createButton("Tulum · 4 talents", "/directory?location=tulum", "secondary", {
            radius: "none",
            paddingX: "m",
            paddingY: "s",
          }),
        ],
      },
      {
        id: makeId("container"),
        kind: "container",
        props: {
          layout: "stack",
          gap: "s",
          style: {
            background: "contrast",
            radius: "none",
            paddingX: "l",
            paddingY: "l",
            marginTop: "m",
          },
        },
        children: [
          createHeading("Map / location data module", 3, {
            align: "center",
            size: "md",
            tone: "strong",
          }),
          createParagraph(
            "Placeholder for the live locations map. Replace this block with a data-bound map section when the integration is enabled.",
            {
              align: "center",
              tone: "muted",
              maxWidth: "reading",
            },
          ),
        ],
      },
    ],
  };
}

function createFaqConversionStackPreset(): Exclude<BuilderNode, { kind: "section" }> {
  return {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "stack",
      gap: "m",
      style: {
        maxWidth: "reading",
        marginTop: "l",
        marginBottom: "l",
      },
    },
    children: [
      createHeading("Booking questions", 2, {
        align: "center",
        size: "lg",
        tone: "strong",
      }),
      {
        id: makeId("accordion"),
        kind: "accordion",
        props: { allowMultiple: false },
        children: [
          createAccordionItem(
            "How are talent requests reviewed?",
            "The agency reviews the brief, confirms availability, and replies with curated options.",
          ),
          createAccordionItem(
            "Can I book talent directly?",
            "No. Contact stays agency-managed so representation, rates, and privacy remain consistent.",
          ),
          createAccordionItem(
            "What should I include in a brief?",
            "Include location, dates, usage, role, budget range, and any visual references.",
          ),
        ],
      },
      createButton("Send a brief", "/inquiry", "primary", {
        align: "center",
        radius: "none",
        paddingX: "m",
        paddingY: "s",
        marginTop: "m",
      }),
    ],
  };
}

export function createBuilderNodeCompositionPreset(
  presetId: BuilderNodeCompositionPresetId,
): Exclude<BuilderNode, { kind: "section" }> {
  switch (presetId) {
    case "agency-search-hero":
      return createAgencySearchHeroPreset();
    case "featured-talent-grid":
      return createFeaturedTalentGridPreset();
    case "editorial-story-split":
      return createEditorialStorySplitPreset();
    case "location-proof-band":
      return createLocationProofBandPreset();
    case "faq-conversion-stack":
      return createFaqConversionStackPreset();
  }
}
