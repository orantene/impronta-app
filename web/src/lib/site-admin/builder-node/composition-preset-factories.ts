// Composition-preset factory functions — build the ready-made block subtrees.
// Split out of composition-presets.ts to satisfy max-lines.
import type { BuilderNode } from "./types";
import { makeId, createHeading, createParagraph, createButton, createImage, createAccordionItem } from "./create";

export function createAgencySearchHeroPreset(): Exclude<BuilderNode, { kind: "section" }> {
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

export function createFeaturedTalentGridPreset(): Exclude<BuilderNode, { kind: "section" }> {
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

export function createEditorialStorySplitPreset(): Exclude<BuilderNode, { kind: "section" }> {
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

export function createLocationProofBandPreset(): Exclude<BuilderNode, { kind: "section" }> {
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

export function createFaqConversionStackPreset(): Exclude<BuilderNode, { kind: "section" }> {
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

export function createCtaBandPreset(): Exclude<BuilderNode, { kind: "section" }> {
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

export function createFeatureTrioPreset(): Exclude<BuilderNode, { kind: "section" }> {
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

export function createStatBandPreset(): Exclude<BuilderNode, { kind: "section" }> {
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

export function createPricingCardPreset(): Exclude<BuilderNode, { kind: "section" }> {
  return {
    id: makeId("card"),
    kind: "card",
    props: {
      style: {
        background: "surface",
        radius: "lg",
        paddingX: "l",
        paddingY: "l",
        maxWidth: "reading",
        align: "center",
      },
    },
    children: [
      createHeading("Pro", 3, {
        align: "center",
        size: "sm",
        tone: "muted",
        marginBottom: "none",
      }),
      createHeading("$29/mo", 2, {
        align: "center",
        size: "xl",
        tone: "strong",
        marginBottom: "s",
      }),
      createParagraph(
        "Everything in Starter · Unlimited pages · Custom domain · Priority support",
        {
          align: "center",
          size: "sm",
          tone: "muted",
          maxWidth: "reading",
          marginBottom: "m",
        },
      ),
      createButton("Choose Pro", "/signup", "primary", { align: "center" }),
    ],
  };
}

export function createTestimonialCardPreset(): Exclude<
  BuilderNode,
  { kind: "section" }
> {
  return {
    id: makeId("card"),
    kind: "card",
    props: {
      style: {
        background: "surface",
        radius: "lg",
        paddingX: "l",
        paddingY: "l",
        maxWidth: "reading",
      },
    },
    children: [
      createParagraph(
        "“This is the fastest we've ever shipped a site. It just feels right — everything is editable and on brand.”",
        { size: "lg", tone: "strong", marginBottom: "s" },
      ),
      createParagraph("Alex Rivera · Creative Director, Studio North", {
        size: "sm",
        tone: "muted",
        marginTop: "none",
      }),
    ],
  };
}

export function createLogoCloudPreset(): Exclude<BuilderNode, { kind: "section" }> {
  return {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "stack",
      gap: "m",
      align: "center",
      style: { align: "center", maxWidth: "wide", marginTop: "l", marginBottom: "l" },
    },
    children: [
      createParagraph("Trusted by teams at", {
        align: "center",
        size: "sm",
        tone: "muted",
        marginBottom: "s",
      }),
      {
        id: makeId("container"),
        kind: "container",
        props: {
          layout: "row",
          gap: "l",
          align: "center",
          responsive: { mobile: { layout: "stack", align: "center" } },
          style: { align: "center" },
        },
        children: [0, 1, 2, 3].map((i) =>
          createImage(i, {
            maxWidth: "narrow",
            objectFit: "contain",
            opacity: 0.7,
          }),
        ),
      },
    ],
  };
}

export function createGalleryStripPreset(): Exclude<BuilderNode, { kind: "section" }> {
  return {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "stack",
      gap: "m",
      style: { maxWidth: "wide", marginTop: "l", marginBottom: "l" },
    },
    children: [
      createHeading("Gallery", 2, {
        align: "left",
        size: "lg",
        tone: "strong",
        marginBottom: "s",
      }),
      {
        id: makeId("container"),
        kind: "container",
        props: {
          layout: "grid",
          gap: "s",
          columns: 4,
          responsive: {
            tablet: { layout: "grid", columns: 2 },
            mobile: { layout: "grid", columns: 2 },
          },
        },
        children: [0, 1, 2, 3].map((i) =>
          createImage(i, {
            radius: "md",
            objectFit: "cover",
            aspectRatio: "1:1",
            maxWidth: "full",
          }),
        ),
      },
    ],
  };
}

export function createNewsletterSignupPreset(): Exclude<
  BuilderNode,
  { kind: "section" }
> {
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
      },
    },
    children: [
      createHeading("Stay in the loop", 2, {
        align: "center",
        size: "lg",
        tone: "strong",
        marginBottom: "s",
      }),
      createParagraph(
        "Get occasional updates — new work, behind the scenes, and the odd good idea.",
        {
          align: "center",
          size: "md",
          tone: "muted",
          maxWidth: "reading",
          marginBottom: "m",
        },
      ),
      createButton("Subscribe", "/subscribe", "primary", { align: "center" }),
    ],
  };
}
