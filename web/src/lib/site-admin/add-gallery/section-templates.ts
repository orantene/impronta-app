import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { buildTalentDisciplineDecomposedSection } from "@/lib/site-admin/builder-node/talent-discipline-freeform";
import { buildFeaturedTalentDecomposedSection } from "@/lib/site-admin/builder-node/featured-talent-freeform";
import { buildLocationDiscoveryDecomposedSection } from "@/lib/site-admin/builder-node/location-discovery-freeform";

import {
  tplButton,
  tplContactForm,
  tplContentColumn,
  tplContentColumnLeft,
  tplContainer,
  tplCtaGroup,
  tplDescription,
  tplDirectorySearchForm,
  tplFaqAccordion,
  tplImageLayer,
  tplIntroText,
  tplLabeledParagraph,
  tplMasonryGrid,
  tplSection,
  tplSectionEmbed,
  tplServiceCard,
  tplSplitColumn,
  tplStatCard,
  tplTestimonialCard,
  tplTitle,
} from "./section-template-nodes";

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

function buildHeroSplit(): BuilderNode {
  return tplSection("Hero Split Image Section", [
    tplSplitColumn(
      [
        tplTitle("Headline with visual balance", 1, { align: "left" }),
        tplDescription(
          "Pair a strong message with editorial photography or brand imagery.",
          "Description",
          { align: "left" },
        ),
        tplButton("View roster", "/directory", { layerLabel: "Primary Button" }),
      ],
      [tplImageLayer(0, "Background Image")],
      { ratio: "50-50", layerLabel: "Split Layout" },
    ),
  ]);
}

function buildHeroMinimal(): BuilderNode {
  return tplSection("Hero Minimal Section", [
    tplContentColumn([
      tplTitle("A focused headline", 1),
      tplDescription("One line of supporting copy. Nothing extra.", "Description"),
      tplButton("Get started", "/contact", { layerLabel: "Primary Button" }),
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
          tplLabeledParagraph(
            "27+ represented talent · agency-managed end to end",
            "Stats Text",
            { align: "center", size: "sm", tone: "muted" },
          ),
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

function buildAboutSimple(): BuilderNode {
  return tplSection("About Simple Section", [
    tplContentColumn([
      tplIntroText("Our agency"),
      tplTitle("About us", 2),
      tplDescription(
        "Share your story, approach, and what makes your agency distinctive.",
        "Description",
      ),
    ]),
  ]);
}

function buildAboutSplit(): BuilderNode {
  return tplSection("About Split Image Section", [
    tplSplitColumn(
      [
        tplTitle("Our story", 2, { align: "left" }),
        tplDescription(
          "Tell visitors who you are, how you work, and why clients trust your team.",
          "Description",
          { align: "left" },
        ),
      ],
      [tplImageLayer(1, "Background Image")],
      { ratio: "40-60", layerLabel: "Split Layout" },
    ),
  ]);
}

function buildAboutStats(): BuilderNode {
  return tplSection("About Stats Section", [
    tplContentColumn([
      tplTitle("Built for scale", 2),
      tplDescription(
        "Key figures that reinforce your agency credibility.",
        "Description",
      ),
      tplContainer(
        [
          tplStatCard("200+", "Talent represented", 0),
          tplStatCard("12", "Years of experience", 1),
          tplStatCard("40+", "Markets worldwide", 2),
        ],
        {
          layerLabel: "Stats Row",
          layout: "grid",
          columns: 3,
          gap: "l",
          align: "stretch",
          responsive: {
            tablet: { columns: 3 },
            mobile: { layout: "stack", columns: 1 },
          },
        },
      ),
    ]),
  ]);
}

function buildServicesGrid(): BuilderNode {
  return tplSection("Services Grid Section", [
    tplContentColumn([
      tplTitle("Services", 2),
      tplDescription("Outline the packages and support you provide.", "Description"),
      tplContainer(
        [
          tplServiceCard(
            "Representation",
            "Talent management, bookings, and career support.",
            0,
          ),
          tplServiceCard("Casting", "Brief matching and roster curation.", 1),
          tplServiceCard(
            "Production",
            "On-set coordination and client liaison.",
            2,
          ),
        ],
        {
          layerLabel: "Service Grid",
          layout: "grid",
          columns: 3,
          gap: "m",
          responsive: {
            tablet: { columns: 2 },
            mobile: { layout: "stack", columns: 1 },
          },
        },
      ),
    ]),
  ]);
}

function buildServicesList(): BuilderNode {
  return tplSection("Services List Section", [
    tplContentColumnLeft([
      tplTitle("What we offer", 2, { align: "left" }),
      tplLabeledParagraph("• Talent representation and bookings", "Service Item 1", {
        align: "left",
      }),
      tplLabeledParagraph("• Casting and brief matching", "Service Item 2", {
        align: "left",
      }),
      tplLabeledParagraph("• On-set coordination and logistics", "Service Item 3", {
        align: "left",
      }),
    ]),
  ]);
}

function buildGalleryGrid(): BuilderNode {
  return tplSection("Gallery Grid Section", [
    tplContentColumn([
      tplTitle("Gallery", 2),
      tplDescription(
        "Showcase editorial photography and recent work.",
        "Description",
      ),
      tplMasonryGrid(3, {
        layerLabel: "Gallery Grid",
        columns: 3,
        imageLabelPrefix: "Gallery Image",
      }),
    ]),
  ]);
}

function buildGalleryStrip(): BuilderNode {
  return tplSection("Gallery Strip Section", [
    tplContentColumn([
      tplTitle("Recent work", 2),
      tplDescription("Editorial mosaic image rail.", "Description"),
      tplContainer(
        [
          tplImageLayer(0, "Gallery Image 1"),
          tplImageLayer(1, "Gallery Image 2"),
          tplImageLayer(2, "Gallery Image 3"),
          tplImageLayer(3, "Gallery Image 4"),
        ],
        {
          layerLabel: "Gallery Strip",
          layout: "row",
          gap: "s",
          align: "stretch",
          responsive: {
            mobile: { layout: "stack" },
          },
        },
      ),
    ]),
  ]);
}

function buildFeaturedTalentWrapper(): BuilderNode {
  return buildFeaturedTalentDecomposedSection({
    eyebrow: "Agency picks",
    headline: "Featured talent",
    subheadline: "Curated roster highlights — live profiles from your collection.",
    seeAllLabel: "See all talent",
    seeAllHref: "/directory",
  });
}

function buildMarketsWrapper(): BuilderNode {
  return buildLocationDiscoveryDecomposedSection({
    eyebrow: "Talent network",
    headline: "Local faces, international reach.",
    seeAllLabel: "Browse the directory",
    seeAllHref: "/directory",
  });
}

function buildRosterWrapper(): BuilderNode {
  return tplSection("Roster Section", [
    tplContentColumn([
      tplTitle("Talent directory", 2),
      tplDescription(
        "Browse the full filterable roster — search by role, location, or specialty.",
        "Description",
      ),
      tplSectionEmbed("directory", "Directory Grid"),
    ]),
  ]);
}

function buildTalentDisciplineWrapper(): BuilderNode {
  return buildTalentDisciplineDecomposedSection();
}

function buildAgencyLogo(): BuilderNode {
  return tplSection("Agency Logo Section", [
    tplContentColumn([
      tplTitle("Trusted by leading brands", 2),
      tplContainer(
        [
          tplImageLayer(0, "Logo 1", { maxWidth: "narrow" }),
          tplImageLayer(1, "Logo 2", { maxWidth: "narrow" }),
          tplImageLayer(2, "Logo 3", { maxWidth: "narrow" }),
          tplImageLayer(3, "Logo 4", { maxWidth: "narrow" }),
        ],
        {
          layerLabel: "Logo Row",
          layout: "row",
          gap: "l",
          align: "center",
          responsive: {
            mobile: { layout: "stack" },
          },
        },
      ),
    ]),
  ]);
}

function buildInquiryCta(): BuilderNode {
  return tplSection("Inquiry CTA Section", [
    tplContentColumn([
      tplTitle("Ready to start?", 2),
      tplDescription(
        "Tell us about your project and our team will respond personally.",
        "Description",
      ),
      tplButton("Start an inquiry", "/contact", { layerLabel: "Primary Button" }),
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
          responsive: {
            tablet: { columns: 2 },
            mobile: { layout: "stack", columns: 1 },
          },
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

function buildCtaSplit(): BuilderNode {
  return tplSection("CTA Split Section", [
    tplSplitColumn(
      [
        tplTitle("Let's work together", 2, { align: "left" }),
        tplDescription(
          "Tell us about your project and we'll respond quickly.",
          "Description",
          { align: "left" },
        ),
      ],
      [tplButton("Start an inquiry", "/contact", { layerLabel: "Primary Button" })],
      { ratio: "60-40", layerLabel: "Split Layout" },
    ),
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

function buildContactForm(): BuilderNode {
  return tplSection("Contact Form Section", [
    tplContentColumn([
      tplIntroText("Get in touch"),
      tplTitle("Contact us", 2),
      tplDescription(
        "Send a message and our team will get back to you.",
        "Description",
      ),
      tplContactForm(),
    ]),
  ]);
}

const SECTION_TEMPLATE_BUILDERS: Readonly<
  Record<string, () => BuilderNode>
> = {
  hero: buildHeroCentered,
  "hero-centered": buildHeroCentered,
  "hero-split": buildHeroSplit,
  "hero-minimal": buildHeroMinimal,
  "hero-search": buildHeroSearch,
  about: buildAboutSimple,
  "about-split": buildAboutSplit,
  "about-stats": buildAboutStats,
  services: buildServicesGrid,
  "services-list": buildServicesList,
  gallery: buildGalleryGrid,
  "gallery-strip": buildGalleryStrip,
  "featured-talent-wrapper": buildFeaturedTalentWrapper,
  "roster-wrapper": buildRosterWrapper,
  "talent-discipline-wrapper": buildTalentDisciplineWrapper,
  "markets-wrapper": buildMarketsWrapper,
  "location-discovery-wrapper": buildMarketsWrapper,
  "agency-logo": buildAgencyLogo,
  "inquiry-cta": buildInquiryCta,
  testimonials: buildTestimonialsTrio,
  "testimonials-trio": buildTestimonialsTrio,
  cta: buildCtaBanner,
  "cta-banner": buildCtaBanner,
  "cta-split": buildCtaSplit,
  "faq-accordion": buildFaqAccordion,
  faq: buildFaqAccordion,
  contact: buildContactForm,
  "contact-form": buildContactForm,
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

/** Test helper — asserts a template exposes all required layerLabel values. */
export function assertTemplateLayerLabels(
  templateId: string,
  requiredLabels: readonly string[],
): void {
  const root = buildAddGallerySectionTemplate(templateId);
  if (!root) {
    throw new Error(`Template "${templateId}" not found.`);
  }
  const labels = collectSectionTemplateLayerLabels(root);
  for (const required of requiredLabels) {
    if (!labels.includes(required)) {
      throw new Error(
        `Template "${templateId}" missing layerLabel "${required}". Found: ${labels.join(", ")}`,
      );
    }
  }
}
