import {
  createButton,
  createHeading,
  createImage,
  createParagraph,
  createBuilderNode,
  makeId,
} from "@/lib/site-admin/builder-node/create";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import {
  tplButton,
  tplContainer,
  tplContentColumn,
  tplCtaGroup,
  tplDescription,
  tplDirectorySearchForm,
  tplFaqAccordion,
  tplIntroText,
  tplSection,
  tplTestimonialCard,
  tplTitle,
} from "./section-template-nodes";

function sectionShell(name: string, children: BuilderNode[]): BuilderNode {
  return tplSection(name, children);
}

function contentContainer(children: BuilderNode[]): BuilderNode {
  return tplContentColumn(children);
}

function buildHeroCentered(): BuilderNode {
  return tplSection("Hero Centered Section", [
    tplContentColumn([
      tplIntroText("Talent agency"),
      tplTitle("Your headline here", 1),
      tplDescription(
        "Introduce your agency, roster, or offer with a clear supporting line.",
        "Description",
      ),
      tplCtaGroup(
        [
          tplButton("Explore talent", "/directory", {
            layerLabel: "Primary Button",
          }),
          tplButton("Start an inquiry", "/contact", {
            layerLabel: "Secondary Button",
            tone: "secondary",
          }),
        ],
        { layerLabel: "Button Group" },
      ),
    ]),
  ]);
}

function buildTestimonialsTrio(): BuilderNode {
  return tplSection("Testimonials Section", [
    tplContentColumn([
      tplIntroText("Social proof"),
      tplTitle("Trusted by leading brands", 2),
      tplContainer(
        [
          tplTestimonialCard(
            "Working with this team was seamless from first inquiry to final delivery. The talent matched our brand exactly.",
            "Agency partner",
            "Global campaign lead",
            0,
          ),
          tplTestimonialCard(
            "We've worked with agencies across three continents — this experience stood apart. Responsive, professional, and exceptional results.",
            "Production studio",
            "Executive producer",
            1,
          ),
          tplTestimonialCard(
            "The roster depth is remarkable. We found our lead for a global campaign in under 48 hours.",
            "Brand team",
            "Marketing director",
            2,
          ),
        ],
        {
          layerLabel: "Testimonial Grid",
          layout: "grid",
          columns: 3,
          gap: "m",
        },
      ),
    ]),
  ]);
}

function buildCtaBanner(): BuilderNode {
  return tplSection("CTA Banner Section", [
    tplContentColumn([
      tplIntroText("Ready when you are"),
      tplTitle("Planning an event, shoot, activation, or private experience?", 2),
      tplDescription(
        "Tell us the brief and your market. We'll match the right talent — a coordinator replies personally.",
        "Description",
      ),
      tplCtaGroup(
        [
          tplButton("Start an inquiry", "/contact", {
            layerLabel: "Primary Button",
          }),
          tplButton("Explore talent", "/directory", {
            layerLabel: "Secondary Button",
            tone: "secondary",
          }),
        ],
        { layerLabel: "Button Group" },
      ),
      tplDescription(
        "Agency-managed end to end — no direct talent contact.",
        "Reassurance Text",
        { size: "sm", tone: "muted" },
      ),
    ]),
  ]);
}

function buildFaqAccordion(): BuilderNode {
  return tplSection("FAQ Section", [
    tplContentColumn([
      tplIntroText("Common questions"),
      tplTitle("Things people ask before they book.", 2),
      tplDescription(
        "Answers to the most common questions. Anything else? Reach out.",
        "Description",
      ),
      tplFaqAccordion([
        {
          question: "What's included in a booking?",
          answer:
            "All sessions include scouting, scheduling, and coordination through confirmation.",
        },
        {
          question: "How quickly can you respond?",
          answer: "Inquiries are answered within 24 business hours.",
        },
        {
          question: "Do you travel?",
          answer:
            "Yes — domestic and international. Travel costs are billed at cost.",
        },
      ]),
    ]),
  ]);
}

function buildHeroSearch(): BuilderNode {
  return tplSection("Hero Search Section", [
    tplContainer(
      [
        tplContentColumn([
          tplIntroText("Talent agency"),
          tplTitle("Find the right talent for your brief.", 1),
          tplDescription(
            "Search the directory by role, location or fit — agency-managed end to end.",
            "Subtitle",
          ),
          tplDirectorySearchForm(
            "Search by role, city, or specialty…",
            "Search",
          ),
          tplCtaGroup(
            [
              tplButton("Start an inquiry", "/contact", {
                layerLabel: "Start Inquiry Button",
              }),
              tplButton("Apply as talent", "/register", {
                layerLabel: "Apply as Talent Link",
                tone: "secondary",
              }),
            ],
            { layerLabel: "Button Group" },
          ),
          tplContainer(
            [
              tplButton("Riviera Maya", "/directory", {
                layerLabel: "Riviera Maya Chip",
                tone: "secondary",
                style: { radius: "pill" },
              }),
              tplButton("Mexico City", "/directory", {
                layerLabel: "Mexico City Chip",
                tone: "secondary",
                style: { radius: "pill" },
              }),
              tplButton("Buenos Aires", "/directory", {
                layerLabel: "Buenos Aires Chip",
                tone: "secondary",
                style: { radius: "pill" },
              }),
            ],
            {
              layerLabel: "Location Chips",
              layout: "row",
              gap: "s",
              align: "center",
            },
          ),
          {
            id: makeId("paragraph"),
            kind: "paragraph",
            props: {
              text: "27+ represented talent · agency-managed end to end",
              layerLabel: "Stats Text",
              style: { align: "center", size: "sm", tone: "muted" },
            },
          },
        ]),
      ],
      {
        layerLabel: "Container",
        layout: "stack",
        align: "center",
        style: {
          background: "surface",
          paddingTop: "48px",
          paddingBottom: "48px",
        },
      },
    ),
  ]);
}

const SECTION_TEMPLATE_BUILDERS: Readonly<
  Record<string, () => BuilderNode>
> = {
  hero: buildHeroCentered,
  "hero-centered": buildHeroCentered,
  "hero-split": () =>
    sectionShell("Hero Split Image", [
      {
        id: makeId("split"),
        kind: "split",
        props: { ratio: "50-50", gap: "l", collapseOnMobile: true },
        children: [
          contentContainer([
            createHeading("Headline with visual balance", 1),
            createParagraph(
              "Pair a strong message with editorial photography or brand imagery.",
            ),
            createButton("View roster", "/directory"),
          ]),
          {
            id: makeId("container"),
            kind: "container",
            props: { layout: "stack", gap: "m" },
            children: [createImage(0)],
          },
        ],
      },
    ]),
  "hero-minimal": () =>
    sectionShell("Hero Minimal", [
      contentContainer([
        createHeading("A focused headline", 1),
        createParagraph("One line of supporting copy. Nothing extra."),
        createButton("Get started", "/contact"),
      ]),
    ]),
  "hero-search": buildHeroSearch,
  "testimonials-trio": buildTestimonialsTrio,
  about: () =>
    sectionShell("About Simple", [
      contentContainer([
        createHeading("About us", 2),
        createParagraph(
          "Share your story, approach, and what makes your agency distinctive.",
        ),
      ]),
    ]),
  "about-split": () =>
    sectionShell("About Split Image", [
      {
        id: makeId("split"),
        kind: "split",
        props: { ratio: "40-60", gap: "l", collapseOnMobile: true },
        children: [
          contentContainer([
            createHeading("Our story", 2),
            createParagraph(
              "Tell visitors who you are, how you work, and why clients trust your team.",
            ),
          ]),
          {
            id: makeId("container"),
            kind: "container",
            props: { layout: "stack" },
            children: [createImage(1)],
          },
        ],
      },
    ]),
  "about-stats": () =>
    sectionShell("About Stats", [
      contentContainer([
        createHeading("Built for scale", 2),
        createParagraph("Key figures that reinforce your agency credibility."),
        {
          id: makeId("container"),
          kind: "container",
          props: { layout: "row", gap: "l" },
          children: [
            {
              id: makeId("card"),
              kind: "card",
              props: {},
              children: [
                createHeading("200+", 3),
                createParagraph("Talent represented"),
              ],
            },
            {
              id: makeId("card"),
              kind: "card",
              props: {},
              children: [
                createHeading("12", 3),
                createParagraph("Years of experience"),
              ],
            },
            {
              id: makeId("card"),
              kind: "card",
              props: {},
              children: [
                createHeading("40+", 3),
                createParagraph("Markets worldwide"),
              ],
            },
          ],
        },
      ]),
    ]),
  services: () =>
    sectionShell("Services Grid", [
      contentContainer([
        createHeading("Services", 2),
        createParagraph("Outline the packages and support you provide."),
        {
          id: makeId("container"),
          kind: "container",
          props: { layout: "row", gap: "m" },
          children: [
            {
              id: makeId("card"),
              kind: "card",
              props: {},
              children: [
                createHeading("Representation", 3),
                createParagraph("Talent management, bookings, and career support."),
              ],
            },
            {
              id: makeId("card"),
              kind: "card",
              props: {},
              children: [
                createHeading("Casting", 3),
                createParagraph("Brief matching and roster curation."),
              ],
            },
            {
              id: makeId("card"),
              kind: "card",
              props: {},
              children: [
                createHeading("Production", 3),
                createParagraph("On-set coordination and client liaison."),
              ],
            },
          ],
        },
      ]),
    ]),
  "services-list": () =>
    sectionShell("Services List", [
      contentContainer([
        createHeading("What we offer", 2),
        createParagraph("• Talent representation and bookings"),
        createParagraph("• Casting and brief matching"),
        createParagraph("• On-set coordination and logistics"),
      ]),
    ]),
  gallery: () =>
    sectionShell("Gallery Grid", [
      contentContainer([
        createHeading("Gallery", 2),
        createParagraph("Showcase editorial photography and recent work."),
        {
          id: makeId("masonry"),
          kind: "masonry",
          props: { columns: 3, gap: "m" },
          children: [createImage(0), createImage(1), createImage(2)],
        },
      ]),
    ]),
  testimonials: buildTestimonialsTrio,
  cta: buildCtaBanner,
  "cta-banner": buildCtaBanner,
  "faq-accordion": buildFaqAccordion,
  "cta-split": () =>
    sectionShell("CTA Split", [
      {
        id: makeId("split"),
        kind: "split",
        props: { ratio: "60-40", gap: "l", collapseOnMobile: true },
        children: [
          contentContainer([
            createHeading("Let's work together", 2),
            createParagraph("Tell us about your project and we'll respond quickly."),
          ]),
          {
            id: makeId("container"),
            kind: "container",
            props: { layout: "stack", align: "center" },
            children: [createButton("Start an inquiry", "/contact")],
          },
        ],
      },
    ]),
  faq: buildFaqAccordion,
  contact: () =>
    sectionShell("Contact", [
      contentContainer([
        createHeading("Get in touch", 2),
        createParagraph("Share how clients can reach your team."),
        createButton("Send an inquiry", "/contact"),
      ]),
    ]),
  "contact-form": () =>
    sectionShell("Contact Form", [
      contentContainer([
        createHeading("Contact us", 2),
        createParagraph("Send a message and our team will get back to you."),
        createBuilderNode("form"),
      ]),
    ]),
};

export function buildAddGallerySectionTemplate(
  templateId: string,
): BuilderNode | null {
  const build = SECTION_TEMPLATE_BUILDERS[templateId];
  return build ? build() : null;
}

export function sectionTemplateIdForItem(
  item: import("./types").AddGalleryItem,
): string | null {
  return item.sectionTemplateId ?? null;
}

export function collectSectionTemplateLayerLabels(
  node: BuilderNode,
  acc: string[] = [],
): string[] {
  const label = (node.props as { layerLabel?: string }).layerLabel?.trim();
  if (label) acc.push(label);
  if ("children" in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      collectSectionTemplateLayerLabels(child, acc);
    }
  }
  return acc;
}

export function sectionTemplateContainsKind(
  node: BuilderNode,
  kind: BuilderNode["kind"],
): boolean {
  if (node.kind === kind) return true;
  if ("children" in node && Array.isArray(node.children)) {
    return node.children.some((child) => sectionTemplateContainsKind(child, kind));
  }
  return false;
}
