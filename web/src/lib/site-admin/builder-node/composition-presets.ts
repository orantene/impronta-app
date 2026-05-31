/**
 * Builder-node composition presets — ready-made multi-node blocks the
 * inspector surfaces as one-click "Section packs". Extracted from create.ts
 * (god-file decomposition); shares the leaf factories exported there.
 */

import type { BuilderNode, BuilderNodeKind } from "./types";
import {
  makeId,
  createHeading,
  createParagraph,
  createButton,
  createImage,
  createAccordionItem,
} from "./create";

export type BuilderNodeCompositionPresetId =
  | "agency-search-hero"
  | "featured-talent-grid"
  | "editorial-story-split"
  | "location-proof-band"
  | "faq-conversion-stack"
  | "cta-band"
  | "feature-trio"
  | "stat-band";

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
  {
    id: "cta-band",
    label: "CTA band",
    description: "Centered headline, supporting line, and a single primary action.",
    rootKind: "container",
    category: "conversion",
    dataMode: "starter",
    keywords: ["cta", "call to action", "convert", "banner", "signup", "contact"],
    sectionCount: 3,
  },
  {
    id: "feature-trio",
    label: "Feature trio",
    description: "Three side-by-side feature cards with heading and copy.",
    rootKind: "container",
    category: "story",
    dataMode: "starter",
    keywords: ["features", "benefits", "three", "columns", "cards", "grid"],
    sectionCount: 4,
  },
  {
    id: "stat-band",
    label: "Stat band",
    description: "Three big-number stats with labels — instant social proof.",
    rootKind: "container",
    category: "trust",
    dataMode: "starter",
    keywords: ["stats", "numbers", "metrics", "proof", "results", "kpi"],
    sectionCount: 4,
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
        mode: "bound",
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
            tablet: { layout: "grid", columns: 3 },
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
        mode: "bound",
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
        mode: "bound",
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
            tablet: { layout: "grid", columns: 2 },
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

function createCtaBandPreset(): Exclude<BuilderNode, { kind: "section" }> {
  return {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "stack",
      gap: "s",
      align: "center",
      style: {
        align: "center",
        maxWidth: "reading",
        background: "surface",
        paddingX: "l",
        paddingY: "l",
        marginTop: "l",
        marginBottom: "l",
        responsive: {
          mobile: { maxWidth: "full", paddingX: "m", paddingY: "m" },
        },
      },
    },
    children: [
      createHeading("Ready to get started?", 2, {
        align: "center",
        size: "xl",
        tone: "strong",
        maxWidth: "reading",
        marginBottom: "s",
        responsive: { mobile: { size: "lg" } },
      }),
      createParagraph(
        "Tell us what you need and we'll take it from there — no commitment required.",
        {
          align: "center",
          size: "lg",
          tone: "muted",
          maxWidth: "reading",
          marginBottom: "m",
        },
      ),
      createButton("Get in touch", "/contact", "primary", {
        align: "center",
      }),
    ],
  };
}

function createFeatureCard(
  title: string,
  body: string,
  imageIndex: number,
): BuilderNode {
  return {
    id: makeId("card"),
    kind: "card",
    props: {
      style: {
        background: "surface",
        radius: "md",
        paddingX: "m",
        paddingY: "m",
      },
    },
    children: [
      createImage(imageIndex, {
        radius: "md",
        objectFit: "cover",
        aspectRatio: "16:9",
        maxWidth: "full",
        marginBottom: "s",
      }),
      createHeading(title, 3, {
        size: "md",
        tone: "strong",
        marginBottom: "none",
      }),
      createParagraph(body, {
        size: "sm",
        tone: "muted",
        marginTop: "none",
      }),
    ],
  };
}

function createFeatureTrioPreset(): Exclude<BuilderNode, { kind: "section" }> {
  return {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "stack",
      gap: "m",
      style: { maxWidth: "wide", marginTop: "l", marginBottom: "l" },
    },
    children: [
      createHeading("What you get", 2, {
        align: "center",
        size: "lg",
        tone: "strong",
        marginBottom: "m",
      }),
      {
        id: makeId("container"),
        kind: "container",
        props: {
          layout: "grid",
          gap: "m",
          columns: 3,
          responsive: {
            tablet: { layout: "grid", columns: 3 },
            mobile: { layout: "stack", columns: 1 },
          },
        },
        children: [
          createFeatureCard(
            "Fast to launch",
            "Go from blank canvas to a polished page in minutes, not weeks.",
            0,
          ),
          createFeatureCard(
            "Fully yours",
            "Every element is editable — type, colour, spacing, and layout.",
            1,
          ),
          createFeatureCard(
            "Always on brand",
            "Built on your design tokens so everything stays consistent.",
            2,
          ),
        ],
      },
    ],
  };
}

function createStat(value: string, label: string): BuilderNode {
  return {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "stack",
      gap: "s",
      align: "center",
      style: { align: "center" },
    },
    children: [
      createHeading(value, 2, {
        align: "center",
        size: "xl",
        tone: "strong",
        marginBottom: "none",
      }),
      createParagraph(label, {
        align: "center",
        size: "sm",
        tone: "muted",
        marginTop: "none",
      }),
    ],
  };
}

function createStatBandPreset(): Exclude<BuilderNode, { kind: "section" }> {
  return {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "grid",
      gap: "m",
      columns: 3,
      responsive: {
        tablet: { layout: "grid", columns: 3 },
        mobile: { layout: "stack", columns: 1 },
      },
      style: {
        maxWidth: "wide",
        background: "surface",
        paddingX: "l",
        paddingY: "l",
        marginTop: "l",
        marginBottom: "l",
      },
    },
    children: [
      createStat("500+", "Projects delivered"),
      createStat("98%", "Client satisfaction"),
      createStat("24h", "Average response time"),
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
    case "cta-band":
      return createCtaBandPreset();
    case "feature-trio":
      return createFeatureTrioPreset();
    case "stat-band":
      return createStatBandPreset();
  }
}
