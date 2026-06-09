import {
  createButton,
  createHeading,
  createImage,
  createParagraph,
  createBuilderNode,
  makeId,
} from "@/lib/site-admin/builder-node/create";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

function sectionShell(name: string, children: BuilderNode[]): BuilderNode {
  return {
    id: makeId("section"),
    kind: "section",
    props: {
      sectionTypeKey: "custom",
      label: name,
    },
    children,
  };
}

function contentContainer(children: BuilderNode[]): BuilderNode {
  return {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "stack",
      gap: "l",
      align: "stretch",
      style: {
        maxWidthFree: "1120px",
        marginLeftFree: "auto",
        marginRightFree: "auto",
        paddingTop: "48px",
        paddingBottom: "48px",
        paddingLeft: "40px",
        paddingRight: "40px",
      },
    },
    children,
  };
}

function heroSearchEmbed(): BuilderNode {
  return {
    id: makeId("section_embed"),
    kind: "section_embed",
    props: {
      sectionTypeKey: "hero_search",
      config: {
        eyebrow: "Talent agency",
        headline: "Find the right talent",
        highlight: "for your brief.",
        subheadline:
          "Search the directory by role, location, or fit — agency-managed end to end.",
        search: {
          enabled: true,
          mode: "directory-query",
          placeholder: "Search by role, city, or specialty…",
          actionHref: "/directory",
          submitLabel: "Search",
        },
        primaryCta: { label: "Start an inquiry", href: "/contact" },
        secondaryCta: { label: "Browse roster", href: "/directory" },
        chipsSource: "manual",
        chips: [
          { label: "Models", href: "/directory" },
          { label: "Hosts", href: "/directory" },
          { label: "Creatives", href: "/directory" },
        ],
        statSource: "manual",
        layout: "centered",
        presentation: {
          background: "canvas",
          align: "center",
          paddingTop: "tight",
          paddingBottom: "tight",
        },
      },
    },
  };
}

const SECTION_TEMPLATE_BUILDERS: Readonly<
  Record<string, () => BuilderNode>
> = {
  hero: () =>
    sectionShell("Hero Centered", [
      contentContainer([
        createHeading("Your headline here", 1),
        createParagraph(
          "Introduce your agency, roster, or offer with a clear supporting line.",
        ),
        {
          id: makeId("cta_group"),
          kind: "cta_group",
          props: {},
          children: [
            createButton("Explore talent", "/directory"),
            createButton("Start an inquiry", "/contact", "secondary"),
          ],
        },
      ]),
    ]),
  "hero-centered": () => SECTION_TEMPLATE_BUILDERS.hero(),
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
  "hero-search": () =>
    sectionShell("Hero Search", [heroSearchEmbed()]),
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
  testimonials: () =>
    sectionShell("Testimonials", [
      contentContainer([
        createHeading("What clients say", 2),
        createParagraph(
          "“Replace this with a client quote that reflects your agency’s reputation.”",
        ),
      ]),
    ]),
  cta: () =>
    sectionShell("CTA Banner", [
      contentContainer([
        createHeading("Ready to get started?", 2),
        createParagraph("Invite visitors to inquire, book, or explore talent."),
        createButton("Contact us", "/contact"),
      ]),
    ]),
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
  faq: () =>
    sectionShell("FAQ", [
      contentContainer([
        createHeading("Frequently asked questions", 2),
        createParagraph("How do bookings work? Add answers for common questions."),
      ]),
    ]),
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
