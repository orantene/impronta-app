import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildLegacySectionBuilderTree,
  deriveLegacySectionChildNodes,
  isCompositionOwnedSectionType,
} from "./legacy-section-tree";
import {
  builderSectionNodeAddressKey,
  indexBuilderSectionChildNodes,
  indexBuilderSectionChildNodeIds,
  indexBuilderSectionNodeIds,
  indexBuilderSectionNodes,
  reconcileBuilderTreeWithLegacySlots,
  resolveSnapshotBuilderTree,
  resolveSnapshotBuilderTreeForPublish,
  summarizeBuilderTreeIssues,
} from "./snapshot-tree";
import { BUILDER_NODE_REGISTRY } from "./registry";
import { validateBuilderNodeTree } from "./validate";

test("validates a registry-backed node tree", () => {
  const result = validateBuilderNodeTree([
    {
      id: "root-content",
      kind: "container",
      props: {
        layout: "stack",
        gap: "m",
        dataBinding: {
          sourceKey: "featured_talent_profiles",
          mode: "bound",
          maxItems: 4,
        },
      },
      children: [
        {
          id: "headline",
          kind: "heading",
          props: { text: "Builder-owned content", level: 2 },
        },
        {
          id: "body",
          kind: "paragraph",
          props: { text: "This is a typed node inside the current builder foundation." },
        },
      ],
    },
  ]);
  assert.equal(result.ok, true);
});

test("validates advanced layout/container kinds", () => {
  const result = validateBuilderNodeTree([
    {
      id: "section-root",
      kind: "section",
      props: {
        sectionTypeKey: "feature_layout",
        dataBinding: {
          sourceKey: "talent_profiles",
          mode: "bound",
          maxItems: 12,
        },
      },
      children: [
        {
          id: "split-1",
          kind: "split",
          props: { ratio: "40-60", collapseOnMobile: true },
          children: [
            {
              id: "left-copy",
              kind: "paragraph",
              props: { text: "Left copy column" },
            },
            {
              id: "right-carousel",
              kind: "carousel",
              props: { slidesPerView: 2, autoplayMs: 6000, showDots: true },
              children: [
                {
                  id: "slide-image-1",
                  kind: "image",
                  props: { src: "https://example.com/a.jpg", alt: "A" },
                },
              ],
            },
          ],
        },
        {
          id: "accordion-1",
          kind: "accordion",
          props: { allowMultiple: true },
          children: [
            {
              id: "accordion-item-1",
              kind: "accordion_item",
              props: { title: "FAQ 1" },
              children: [
                {
                  id: "accordion-item-1-body",
                  kind: "paragraph",
                  props: { text: "Answer one." },
                },
              ],
            },
          ],
        },
      ],
    },
  ]);
  assert.equal(result.ok, true);
});

test("validates button state-style props and responsive container overrides", () => {
  const result = validateBuilderNodeTree([
    {
      id: "container-responsive",
      kind: "container",
      props: {
        layout: "grid",
        columns: 4,
        responsive: {
          tablet: { columns: 2, layout: "grid", gap: "m" },
          mobile: { columns: 1, layout: "stack", gap: "s" },
        },
      },
      children: [
        {
          id: "cta-node",
          kind: "button",
          props: {
            label: "Book now",
            href: "/inquiry",
            tone: "primary",
            stateStyles: {
              hover: { tone: "secondary" },
              focus: { tone: "secondary" },
              active: { tone: "primary" },
              disabled: { tone: "secondary" },
            },
          },
        },
      ],
    },
  ]);
  assert.equal(result.ok, true);
});

test("rejects invalid container columns when non-grid layouts declare multi-column", () => {
  const result = validateBuilderNodeTree([
    {
      id: "container-invalid-columns",
      kind: "container",
      props: {
        layout: "row",
        columns: 3,
      },
      children: [],
    },
  ]);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.issues.some((issue) =>
        issue.message.includes('columns > 1 is only valid when layout is "grid"'),
      ),
    );
  }
});

test("rejects invalid mobile stack column counts", () => {
  const result = validateBuilderNodeTree([
    {
      id: "container-invalid-mobile-stack-columns",
      kind: "container",
      props: {
        layout: "grid",
        columns: 3,
        responsive: {
          mobile: {
            layout: "stack",
            columns: 2,
          },
        },
      },
      children: [],
    },
  ]);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.issues.some((issue) =>
        issue.message.includes("stack layout must use exactly 1 column"),
      ),
    );
  }
});

test("rejects mobile column override without base or tablet column intent", () => {
  const result = validateBuilderNodeTree([
    {
      id: "container-mobile-columns-without-cascade",
      kind: "container",
      props: {
        layout: "grid",
        responsive: {
          mobile: {
            layout: "grid",
            columns: 2,
          },
        },
      },
      children: [],
    },
  ]);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.issues.some((issue) =>
        issue.message.includes(
          "mobile columns override requires base or tablet columns",
        ),
      ),
    );
  }
});

test("rejects invalid advanced node relationships", () => {
  const result = validateBuilderNodeTree([
    {
      id: "tabs-root",
      kind: "tabs",
      props: {},
      children: [
        {
          id: "invalid-direct-paragraph",
          kind: "paragraph",
          props: { text: "Paragraph is not a tab panel." },
        },
      ],
    },
  ]);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.issues.some((issue) =>
        issue.message.includes('not allowed under "tabs"'),
      ),
    );
  }
});

test("rejects duplicate node ids", () => {
  const result = validateBuilderNodeTree([
    {
      id: "dup",
      kind: "container",
      props: { layout: "stack" },
      children: [],
    },
    {
      id: "dup",
      kind: "container",
      props: { layout: "stack" },
      children: [],
    },
  ]);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.issues.some((issue) => issue.message.includes("Duplicate node id")));
  }
});

test("rejects children for leaf nodes", () => {
  const result = validateBuilderNodeTree([
    {
      id: "root-content",
      kind: "container",
      props: { layout: "stack" },
      children: [
        {
          id: "heading-with-child",
          kind: "heading",
          props: { text: "Invalid", level: 2 },
          children: [
            {
              id: "child",
              kind: "paragraph",
              props: { text: "Should not exist" },
            },
          ],
        },
      ],
    },
  ]);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.issues.some((issue) =>
        issue.message.includes('does not allow children'),
      ),
    );
  }
});

test("rejects leaf nodes at root", () => {
  const result = validateBuilderNodeTree([
    {
      id: "headline-root",
      kind: "heading",
      props: { text: "Root heading", level: 1 },
    },
  ]);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.issues.some((issue) =>
        issue.message.includes('Root cannot contain node kind "heading"'),
      ),
    );
  }
});

test("rejects invalid nested child kinds for strict containers", () => {
  const result = validateBuilderNodeTree([
    {
      id: "tabs-with-wrong-child",
      kind: "tabs",
      props: {},
      children: [
        {
          id: "paragraph-direct",
          kind: "paragraph",
          props: { text: "Should be tab_panel first" },
        },
      ],
    },
  ]);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.issues.some((issue) =>
        issue.message.includes('not allowed under "tabs"'),
      ),
    );
  }
});

test("buildLegacySectionBuilderTree maps snapshot slots to section nodes", () => {
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "hero",
      sortOrder: 0,
      sectionId: "11111111-1111-4111-8111-111111111111",
      sectionTypeKey: "hero",
      name: "Homepage Hero",
    },
  ]);

  assert.equal(tree.length, 1);
  assert.equal(tree[0]?.kind, "section");
  if (tree[0]?.kind === "section") {
    assert.equal(tree[0].props.sectionTypeKey, "hero");
    assert.equal(tree[0].props.slotKey, "hero");
    assert.equal(tree[0].props.sortOrder, 0);
    assert.equal(Array.isArray(tree[0].children), false);
  }
});

test("buildLegacySectionBuilderTree derives hero child nodes from section props", () => {
  const sectionId = "11111111-1111-4111-8111-111111111111";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 0,
      sectionId,
      sectionTypeKey: "hero",
      name: "Hero",
      props: {
        headline: "Builder 2.0",
        subheadline: "Structured freedom for roster pages",
        primaryCta: { label: "Book now", href: "/book" },
        secondaryCta: { label: "Browse roster", href: "/directory" },
      },
    },
  ]);

  assert.equal(tree.length, 1);
  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 4);
    assert.equal(node.children?.[0]?.id.endsWith(":heading:headline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[2]?.id.endsWith(":button:primaryCta"), true);
    assert.equal(node.children?.[3]?.id.endsWith(":button:secondaryCta"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives cta_banner child nodes from section props", () => {
  const sectionId = "22222222-2222-4222-8222-222222222222";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 1,
      sectionId,
      sectionTypeKey: "cta_banner",
      name: "CTA Banner",
      props: {
        eyebrow: "Ready when you are",
        headline: "Let's book your next campaign",
        copy: "Tell us what you need and we will curate fast.",
        primaryCta: { label: "Start booking", href: "/inquiry/new" },
        secondaryCta: { label: "See roster", href: "/directory" },
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 5);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
    assert.equal(node.children?.[2]?.id.endsWith(":paragraph:copy"), true);
    assert.equal(node.children?.[3]?.id.endsWith(":button:primaryCta"), true);
    assert.equal(node.children?.[4]?.id.endsWith(":button:secondaryCta"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives featured_talent child nodes from section props", () => {
  const sectionId = "33333333-3333-4333-8333-333333333333";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 2,
      sectionId,
      sectionTypeKey: "featured_talent",
      name: "Featured Talent",
      props: {
        eyebrow: "Featured now",
        headline: "Five picks this month",
        copy: "A short list always on call.",
        footerCta: { label: "Explore full roster", href: "/directory" },
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 4);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
    assert.equal(node.children?.[2]?.id.endsWith(":paragraph:copy"), true);
    assert.equal(node.children?.[3]?.id.endsWith(":button:footerCta"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives category_grid child nodes from section props", () => {
  const sectionId = "55555555-5555-4555-8555-555555555555";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 3,
      sectionId,
      sectionTypeKey: "category_grid",
      name: "Category grid",
      props: {
        eyebrow: "Services",
        headline: "Support options",
        copy: "Choose the package that fits your team.",
        footerCta: { label: "See all", href: "/services" },
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 4);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
    assert.equal(node.children?.[2]?.id.endsWith(":paragraph:copy"), true);
    assert.equal(node.children?.[3]?.id.endsWith(":button:footerCta"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives contact_form child nodes from section props", () => {
  const sectionId = "c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 4,
      sectionId,
      sectionTypeKey: "contact_form",
      name: "Contact form",
      props: {
        eyebrow: "Let's connect",
        headline: "Tell us what you need",
        intro: "Share your goals and timeline.",
        submitLabel: "Send request",
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 4);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
    assert.equal(node.children?.[2]?.id.endsWith(":paragraph:copy"), true);
    assert.equal(node.children?.[3]?.id.endsWith(":button:primaryCta"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives faq_accordion child nodes from section props", () => {
  const sectionId = "d0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 5,
      sectionId,
      sectionTypeKey: "faq_accordion",
      name: "FAQ",
      props: {
        eyebrow: "FAQ",
        headline: "Answers to common questions",
        intro: "Everything you need before booking.",
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 3);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
    assert.equal(node.children?.[2]?.id.endsWith(":paragraph:copy"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives pricing_grid child nodes from section props", () => {
  const sectionId = "e0e0e0e0-e0e0-4e0e-8e0e-e0e0e0e0e0e0";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 6,
      sectionId,
      sectionTypeKey: "pricing_grid",
      name: "Pricing",
      props: {
        eyebrow: "Plans",
        headline: "Choose your package",
        intro: "Simple pricing with clear coverage.",
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 3);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
    assert.equal(node.children?.[2]?.id.endsWith(":paragraph:copy"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives logo_cloud child nodes from section props", () => {
  const sectionId = "f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 7,
      sectionId,
      sectionTypeKey: "logo_cloud",
      name: "Logo cloud",
      props: {
        eyebrow: "Trusted by",
        headline: "Operators and brands",
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 2);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives team_grid child nodes from section props", () => {
  const sectionId = "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 8,
      sectionId,
      sectionTypeKey: "team_grid",
      name: "Team grid",
      props: {
        eyebrow: "Team",
        headline: "People behind the work",
        intro: "A small, focused team.",
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 3);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
    assert.equal(node.children?.[2]?.id.endsWith(":paragraph:copy"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives event_listing child nodes from section props", () => {
  const sectionId = "f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 9,
      sectionId,
      sectionTypeKey: "event_listing",
      name: "Event listing",
      props: {
        eyebrow: "Calendar",
        headline: "Upcoming events",
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 2);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives content_tabs child nodes from section props", () => {
  const sectionId = "f3f3f3f3-f3f3-4f3f-8f3f-f3f3f3f3f3f3";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 10,
      sectionId,
      sectionTypeKey: "content_tabs",
      name: "Content tabs",
      props: {
        eyebrow: "Highlights",
        headline: "What we cover",
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 2);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives process_steps child nodes from section props", () => {
  const sectionId = "f8f8f8f8-f8f8-4f8f-8f8f-f8f8f8f8f8f8";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 11,
      sectionId,
      sectionTypeKey: "process_steps",
      name: "Process steps",
      props: {
        eyebrow: "Process",
        headline: "How we work",
        copy: "A clear three-step flow.",
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 3);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
    assert.equal(node.children?.[2]?.id.endsWith(":paragraph:copy"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives destinations_mosaic child nodes from section props", () => {
  const sectionId = "f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f9";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 12,
      sectionId,
      sectionTypeKey: "destinations_mosaic",
      name: "Destinations",
      props: {
        eyebrow: "Destinations",
        headline: "From jungle to coast",
        copy: "Global destination coverage.",
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 3);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
    assert.equal(node.children?.[2]?.id.endsWith(":paragraph:copy"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives stats child nodes from section props", () => {
  const sectionId = "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 13,
      sectionId,
      sectionTypeKey: "stats",
      name: "Stats",
      props: {
        eyebrow: "Numbers",
        headline: "Impact in production",
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 2);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives timeline child nodes from section props", () => {
  const sectionId = "c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 14,
      sectionId,
      sectionTypeKey: "timeline",
      name: "Timeline",
      props: {
        eyebrow: "Roadmap",
        headline: "How each launch runs",
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 2);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives values_trio child nodes from section props", () => {
  const sectionId = "c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 15,
      sectionId,
      sectionTypeKey: "values_trio",
      name: "Values trio",
      props: {
        eyebrow: "Values",
        headline: "What guides our work",
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 2);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives comparison_table child nodes from section props", () => {
  const sectionId = "c4c4c4c4-c4c4-4c4c-8c4c-c4c4c4c4c4c4";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 16,
      sectionId,
      sectionTypeKey: "comparison_table",
      name: "Comparison table",
      props: {
        eyebrow: "Plans",
        headline: "Compare offers",
        intro: "Choose the right package.",
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 3);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
    assert.equal(node.children?.[2]?.id.endsWith(":paragraph:copy"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives hero_split child nodes from section props", () => {
  const sectionId = "d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 17,
      sectionId,
      sectionTypeKey: "hero_split",
      name: "Hero split",
      props: {
        eyebrow: "Featured",
        headline: "Book faster with curated talent",
        subheadline: "Structured booking support across your campaign timeline.",
        primaryCta: { label: "Start booking", href: "/book" },
        secondaryCta: { label: "Browse roster", href: "/directory" },
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 5);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
    assert.equal(node.children?.[2]?.id.endsWith(":paragraph:copy"), true);
    assert.equal(node.children?.[3]?.id.endsWith(":button:primaryCta"), true);
    assert.equal(node.children?.[4]?.id.endsWith(":button:secondaryCta"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives image_copy_alternating child nodes from section props", () => {
  const sectionId = "d2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 18,
      sectionId,
      sectionTypeKey: "image_copy_alternating",
      name: "Image copy alternating",
      props: {
        eyebrow: "Services",
        headline: "How we support each production",
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 2);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives split_screen child nodes from section props", () => {
  const sectionId = "d3d3d3d3-d3d3-4d3d-8d3d-d3d3d3d3d3d3";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 19,
      sectionId,
      sectionTypeKey: "split_screen",
      name: "Split screen",
      props: {
        eyebrow: "Narrative",
        headline: "Tell the brand story",
        body: "A flexible split layout with editorial copy.",
        primaryCta: { label: "Start", href: "/start" },
        secondaryCta: { label: "Learn", href: "/learn" },
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 5);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
    assert.equal(node.children?.[2]?.id.endsWith(":paragraph:copy"), true);
    assert.equal(node.children?.[3]?.id.endsWith(":button:primaryCta"), true);
    assert.equal(node.children?.[4]?.id.endsWith(":button:secondaryCta"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives before_after child nodes from section props", () => {
  const sectionId = "d7d7d7d7-d7d7-4d7d-8d7d-d7d7d7d7d7d7";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 20,
      sectionId,
      sectionTypeKey: "before_after",
      name: "Before/after",
      props: {
        eyebrow: "Transformation",
        headline: "Before and after",
        beforeUrl: "https://example.com/before.jpg",
        afterUrl: "https://example.com/after.jpg",
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 2);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives booking_widget child nodes from section props", () => {
  const sectionId = "d8d8d8d8-d8d8-4d8d-8d8d-d8d8d8d8d8d8";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 21,
      sectionId,
      sectionTypeKey: "booking_widget",
      name: "Booking widget",
      props: {
        eyebrow: "Booking",
        headline: "Book a call",
        intro: "Select a time that works for your team.",
        url: "https://calendly.com/demo/session",
        variant: "button",
        buttonLabel: "Book now",
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 4);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
    assert.equal(node.children?.[2]?.id.endsWith(":paragraph:copy"), true);
    assert.equal(node.children?.[3]?.id.endsWith(":button:primaryCta"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives lookbook child nodes from section props", () => {
  const sectionId = "d9d9d9d9-d9d9-4d9d-8d9d-d9d9d9d9d9d9";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 22,
      sectionId,
      sectionTypeKey: "lookbook",
      name: "Lookbook",
      props: {
        eyebrow: "Editorial",
        headline: "Campaign lookbook",
        pages: [
          { imageUrl: "https://example.com/1.jpg" },
          { imageUrl: "https://example.com/2.jpg" },
        ],
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 2);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives magazine_layout child nodes from section props", () => {
  const sectionId = "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 23,
      sectionId,
      sectionTypeKey: "magazine_layout",
      name: "Magazine layout",
      props: {
        eyebrow: "Editorial",
        headline: "Campaign stories",
        hero: { title: "Lead story" },
        secondary: [{ title: "Frame one" }, { title: "Frame two" }],
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 2);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives map_overlay child nodes from section props", () => {
  const sectionId = "e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 24,
      sectionId,
      sectionTypeKey: "map_overlay",
      name: "Map overlay",
      props: {
        eyebrow: "Visit",
        headline: "Find our studio",
        mapEmbedUrl: "https://www.google.com/maps/embed?pb=demo",
        card: {
          title: "Studio",
          body: "By appointment only.",
        },
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 3);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
    assert.equal(node.children?.[2]?.id.endsWith(":paragraph:copy"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives press_strip child nodes from section props", () => {
  const sectionId = "e3e3e3e3-e3e3-4e3e-8e3e-e3e3e3e3e3e3";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 25,
      sectionId,
      sectionTypeKey: "press_strip",
      name: "Press strip",
      props: {
        eyebrow: "As seen in",
        items: [{ name: "Vogue" }],
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 1);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives masonry child nodes from section props", () => {
  const sectionId = "e4e4e4e4-e4e4-4e4e-8e4e-e4e4e4e4e4e4";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 26,
      sectionId,
      sectionTypeKey: "masonry",
      name: "Masonry",
      props: {
        eyebrow: "Portfolio",
        headline: "Recent campaign frames",
        items: [
          { src: "https://example.com/1.jpg" },
          { src: "https://example.com/2.jpg" },
        ],
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 2);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives sticky_scroll child nodes from section props", () => {
  const sectionId = "e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 27,
      sectionId,
      sectionTypeKey: "sticky_scroll",
      name: "Sticky scroll",
      props: {
        eyebrow: "Process",
        headline: "How launches unfold",
        imageUrl: "https://example.com/photo.jpg",
        blocks: [{ title: "Brief", body: "Plan scope." }, { title: "Ship", body: "Go live." }],
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 2);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives scroll_carousel child nodes from section props", () => {
  const sectionId = "e6e6e6e6-e6e6-4e6e-8e6e-e6e6e6e6e6e6";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 28,
      sectionId,
      sectionTypeKey: "scroll_carousel",
      name: "Scroll carousel",
      props: {
        eyebrow: "Highlights",
        headline: "Stories in motion",
        slides: [{ title: "One" }, { title: "Two" }],
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 2);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives lottie child nodes from section props", () => {
  const sectionId = "e7e7e7e7-e7e7-4e7e-8e7e-e7e7e7e7e7e7";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 29,
      sectionId,
      sectionTypeKey: "lottie",
      name: "Lottie",
      props: {
        eyebrow: "Animation",
        headline: "Motion storytelling",
        caption: "A lightweight animated explainer.",
        src: "https://lottie.host/abc.json",
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 3);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
    assert.equal(node.children?.[2]?.id.endsWith(":paragraph:copy"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives video_reel child nodes from section props", () => {
  const sectionId = "e8e8e8e8-e8e8-4e8e-8e8e-e8e8e8e8e8e8";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 30,
      sectionId,
      sectionTypeKey: "video_reel",
      name: "Video reel",
      props: {
        eyebrow: "Highlights",
        headline: "Campaign reel",
        videoUrl: "https://example.com/reel.mp4",
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 2);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives image_orbit child nodes from section props", () => {
  const sectionId = "e9e9e9e9-e9e9-4e9e-8e9e-e9e9e9e9e9e9";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 31,
      sectionId,
      sectionTypeKey: "image_orbit",
      name: "Image orbit",
      props: {
        eyebrow: "Breakdown",
        headline: "Tagged composition",
        imageUrl: "https://example.com/orbit.jpg",
        tags: [{ x: 30, y: 40, label: "Wardrobe" }],
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 2);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives testimonials_trio child nodes from section props", () => {
  const sectionId = "66666666-6666-4666-8666-666666666666";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 3,
      sectionId,
      sectionTypeKey: "testimonials_trio",
      name: "Testimonials",
      props: {
        eyebrow: "Client voices",
        headline: "What clients say",
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 2);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives gallery_strip child nodes from section props", () => {
  const sectionId = "77777777-7777-4777-8777-777777777777";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 4,
      sectionId,
      sectionTypeKey: "gallery_strip",
      name: "Gallery",
      props: {
        eyebrow: "Portfolio",
        headline: "A year in frames",
        caption: "Handpicked highlights from recent campaigns.",
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 3);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
    assert.equal(node.children?.[2]?.id.endsWith(":paragraph:copy"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives trust_strip child nodes from section props", () => {
  const sectionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 5,
      sectionId,
      sectionTypeKey: "trust_strip",
      name: "Trust strip",
      props: {
        eyebrow: "Trusted by leaders",
        headline: "Trusted by global operators",
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 2);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives code_embed child nodes from section props", () => {
  const sectionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 6,
      sectionId,
      sectionTypeKey: "code_embed",
      name: "Code embed",
      props: {
        eyebrow: "Watch",
        headline: "Product walkthrough",
        caption: "Embedded from an allow-listed host.",
        url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
        ratio: "16/9",
        title: "Embedded content",
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 3);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
    assert.equal(node.children?.[2]?.id.endsWith(":paragraph:copy"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives blog_index child nodes from section props", () => {
  const sectionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 7,
      sectionId,
      sectionTypeKey: "blog_index",
      name: "Blog index",
      props: {
        eyebrow: "Journal",
        headline: "Latest stories",
        posts: [{ title: "Post 1", href: "/journal/post-1" }],
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 2);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives donation_form child nodes from section props", () => {
  const sectionId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 8,
      sectionId,
      sectionTypeKey: "donation_form",
      name: "Donation form",
      props: {
        eyebrow: "Support",
        headline: "Back this mission",
        intro: "Every contribution helps us deliver more.",
        amounts: [25, 50, 100],
        currency: "USD",
        defaultAmountIndex: 1,
        allowCustom: true,
        checkoutUrl: "https://example.org/donate",
        ctaLabel: "Donate",
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 4);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
    assert.equal(node.children?.[2]?.id.endsWith(":paragraph:copy"), true);
    assert.equal(node.children?.[3]?.id.endsWith(":button:primaryCta"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives code_snippet child nodes from section props", () => {
  const sectionId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 9,
      sectionId,
      sectionTypeKey: "code_snippet",
      name: "Code snippet",
      props: {
        eyebrow: "Dev notes",
        headline: "Implementation snippet",
        code: "export const x = 1;",
      },
    },
  ]);

  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 2);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives blog_detail child nodes from section props", () => {
  const sectionId = "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 10,
      sectionId,
      sectionTypeKey: "blog_detail",
      name: "Blog detail",
      props: {
        category: "Journal",
        title: "Behind the campaign",
        byline: "By Studio Team",
        body: "Body copy",
      },
    },
  ]);
  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 3);
    assert.equal(node.children?.[0]?.id.endsWith(":paragraph:subheadline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":heading:headline"), true);
    assert.equal(node.children?.[2]?.id.endsWith(":paragraph:copy"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives site_header child nodes from section props", () => {
  const sectionId = "f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "header",
      sortOrder: 0,
      sectionId,
      sectionTypeKey: "site_header",
      name: "Site header",
      props: {
        brand: { label: "Impronta", href: "/" },
        navItems: [{ label: "Home", href: "/" }],
        primaryCta: { label: "Book now", href: "/book" },
        sticky: true,
        tone: "surface",
        variant: "standard",
      },
    },
  ]);
  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 2);
    assert.equal(node.children?.[0]?.id.endsWith(":heading:headline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":button:primaryCta"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree derives site_footer child nodes from section props", () => {
  const sectionId = "f3f3f3f3-f3f3-4f3f-8f3f-f3f3f3f3f3f3";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "footer",
      sortOrder: 0,
      sectionId,
      sectionTypeKey: "site_footer",
      name: "Site footer",
      props: {
        brand: { label: "Impronta", tagline: "Built for global operators" },
        columns: [],
        social: [],
        legal: { links: [] },
        variant: "standard",
        tone: "follow",
      },
    },
  ]);
  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children?.length, 2);
    assert.equal(node.children?.[0]?.id.endsWith(":heading:headline"), true);
    assert.equal(node.children?.[1]?.id.endsWith(":paragraph:copy"), true);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree keeps anchor_nav section node-only", () => {
  const sectionId = "f4f4f4f4-f4f4-4f4f-8f4f-f4f4f4f4f4f4";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 11,
      sectionId,
      sectionTypeKey: "anchor_nav",
      name: "Anchor nav",
      props: {
        links: [
          { label: "About", href: "#about" },
          { label: "Services", href: "#services" },
        ],
      },
    },
  ]);
  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children, undefined);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("buildLegacySectionBuilderTree keeps marquee section node-only", () => {
  const sectionId = "f5f5f5f5-f5f5-4f5f-8f5f-f5f5f5f5f5f5";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 12,
      sectionId,
      sectionTypeKey: "marquee",
      name: "Marquee",
      props: {
        items: [{ text: "Now booking" }, { text: "Global coverage" }],
      },
    },
  ]);
  const node = tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.children, undefined);
  }
  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
});

test("resolveSnapshotBuilderTree prefers a valid snapshot tree", () => {
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 0,
      sectionId: "11111111-1111-4111-8111-111111111111",
      sectionTypeKey: "hero",
      name: "Hero",
    },
  ]);
  const result = resolveSnapshotBuilderTree({
    slots: [],
    builderTree: tree,
  });

  assert.equal(result.source, "snapshot_builder_tree");
  assert.equal(result.issues.length, 0);
  assert.equal(result.tree.length, 1);
  const node = result.tree[0];
  assert.equal(node?.kind, "section");
  if (node?.kind === "section") {
    assert.equal(node.id, tree[0]?.id);
    assert.equal(node.props.sectionTypeKey, "hero");
  }
});

test("resolveSnapshotBuilderTree merges authoritative slots when tree omits a newly inserted section root", () => {
  const heroId = "11111111-1111-4111-8111-111111111111";
  const ctaId = "22222222-2222-4222-8222-222222222222";
  const heroOnlyTree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 0,
      sectionId: heroId,
      sectionTypeKey: "hero",
      name: "Hero",
      props: { headline: "Only hero" },
    },
  ]);
  const slots = [
    {
      slotKey: "body",
      sortOrder: 0,
      sectionId: heroId,
      sectionTypeKey: "hero",
      name: "Hero",
      props: { headline: "Only hero" },
    },
    {
      slotKey: "body",
      sortOrder: 1,
      sectionId: ctaId,
      sectionTypeKey: "cta_banner",
      name: "CTA",
      props: {
        eyebrow: "e",
        headline: "h",
        copy: "c",
        primaryCta: { label: "Go", href: "/x" },
      },
    },
  ];
  const result = resolveSnapshotBuilderTree({
    slots,
    builderTree: heroOnlyTree,
  });
  assert.equal(result.source, "snapshot_builder_tree");
  assert.equal(result.issues.length, 0);
  assert.equal(result.tree.length, 2);
  const ctaNode = result.tree.find(
    (n) => n.kind === "section" && n.props.sectionId === ctaId,
  );
  assert.equal(ctaNode?.kind, "section");
  if (ctaNode?.kind === "section") {
    assert.equal(ctaNode.props.sortOrder, 1);
  }
});

test("resolveSnapshotBuilderTree hydrates legacy hero child nodes when valid tree is section-only", () => {
  const sectionId = "11111111-1111-4111-8111-111111111111";
  const baseTree = [
    {
      id: `legacy:hero:0:${sectionId}`,
      kind: "section" as const,
      props: {
        sectionId,
        sectionTypeKey: "hero",
        slotKey: "hero",
        sortOrder: 0,
      },
    },
  ];
  const result = resolveSnapshotBuilderTree({
    slots: [
      {
        slotKey: "hero",
        sortOrder: 0,
        sectionId,
        sectionTypeKey: "hero",
        name: "Hero",
        props: {
          headline: "Hydrated Headline",
          subheadline: "Hydrated Subheadline",
          primaryCta: { label: "Primary", href: "/primary" },
        },
      },
    ],
    builderTree: baseTree,
  });
  assert.equal(result.source, "snapshot_builder_tree");
  const sectionNode = result.tree[0];
  assert.equal(sectionNode?.kind, "section");
  if (sectionNode?.kind === "section") {
    assert.equal(sectionNode.children?.length, 3);
  }
});

test("resolveSnapshotBuilderTree hydrates cta_banner child nodes when valid tree is section-only", () => {
  const sectionId = "44444444-4444-4444-8444-444444444444";
  const baseTree = [
    {
      id: `legacy:body:1:${sectionId}`,
      kind: "section" as const,
      props: {
        sectionId,
        sectionTypeKey: "cta_banner",
        slotKey: "body",
        sortOrder: 1,
      },
    },
  ];
  const result = resolveSnapshotBuilderTree({
    slots: [
      {
        slotKey: "body",
        sortOrder: 1,
        sectionId,
        sectionTypeKey: "cta_banner",
        name: "CTA Banner",
        props: {
          eyebrow: "Ready to brief us?",
          headline: "Book now",
          copy: "Tell us what you need.",
          primaryCta: { label: "Start", href: "/inquiry/new" },
        },
      },
    ],
    builderTree: baseTree,
  });
  assert.equal(result.source, "snapshot_builder_tree");
  const sectionNode = result.tree[0];
  assert.equal(sectionNode?.kind, "section");
  if (sectionNode?.kind === "section") {
    assert.equal(sectionNode.children?.length, 4);
  }
});

test("resolveSnapshotBuilderTree hydrates featured_talent child nodes when valid tree is section-only", () => {
  const sectionId = "55555555-5555-4555-8555-555555555555";
  const baseTree = [
    {
      id: `legacy:body:2:${sectionId}`,
      kind: "section" as const,
      props: {
        sectionId,
        sectionTypeKey: "featured_talent",
        slotKey: "body",
        sortOrder: 2,
      },
    },
  ];
  const result = resolveSnapshotBuilderTree({
    slots: [
      {
        slotKey: "body",
        sortOrder: 2,
        sectionId,
        sectionTypeKey: "featured_talent",
        name: "Featured Talent",
        props: {
          eyebrow: "Featured now",
          headline: "This month",
          copy: "Five professionals on call.",
          footerCta: { label: "See all", href: "/directory" },
        },
      },
    ],
    builderTree: baseTree,
  });
  assert.equal(result.source, "snapshot_builder_tree");
  const sectionNode = result.tree[0];
  assert.equal(sectionNode?.kind, "section");
  if (sectionNode?.kind === "section") {
    assert.equal(sectionNode.children?.length, 4);
  }
});

test("resolveSnapshotBuilderTree hydrates category_grid child nodes when valid tree is section-only", () => {
  const sectionId = "77777777-7777-4777-8777-777777777777";
  const baseTree = [
    {
      id: `legacy:body:3:${sectionId}`,
      kind: "section" as const,
      props: {
        sectionId,
        sectionTypeKey: "category_grid",
        slotKey: "body",
        sortOrder: 3,
      },
    },
  ];
  const result = resolveSnapshotBuilderTree({
    slots: [
      {
        slotKey: "body",
        sortOrder: 3,
        sectionId,
        sectionTypeKey: "category_grid",
        name: "Category grid",
        props: {
          eyebrow: "Services",
          headline: "What we offer",
          copy: "A curated set of support categories.",
          footerCta: { label: "Browse all", href: "/services" },
        },
      },
    ],
    builderTree: baseTree,
  });
  assert.equal(result.source, "snapshot_builder_tree");
  const sectionNode = result.tree[0];
  assert.equal(sectionNode?.kind, "section");
  if (sectionNode?.kind === "section") {
    assert.equal(sectionNode.children?.length, 4);
  }
});

test("resolveSnapshotBuilderTree hydrates contact_form child nodes when valid tree is section-only", () => {
  const sectionId = "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1";
  const baseTree = [
    {
      id: `legacy:body:4:${sectionId}`,
      kind: "section" as const,
      props: {
        sectionId,
        sectionTypeKey: "contact_form",
        slotKey: "body",
        sortOrder: 4,
      },
    },
  ];
  const result = resolveSnapshotBuilderTree({
    slots: [
      {
        slotKey: "body",
        sortOrder: 4,
        sectionId,
        sectionTypeKey: "contact_form",
        name: "Contact form",
        props: {
          eyebrow: "Let's connect",
          headline: "Tell us what you need",
          intro: "Share your scope and timeline.",
          submitLabel: "Send request",
        },
      },
    ],
    builderTree: baseTree,
  });
  assert.equal(result.source, "snapshot_builder_tree");
  const sectionNode = result.tree[0];
  assert.equal(sectionNode?.kind, "section");
  if (sectionNode?.kind === "section") {
    assert.equal(sectionNode.children?.length, 4);
  }
});

test("resolveSnapshotBuilderTree hydrates faq_accordion child nodes when valid tree is section-only", () => {
  const sectionId = "d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1";
  const baseTree = [
    {
      id: `legacy:body:5:${sectionId}`,
      kind: "section" as const,
      props: {
        sectionId,
        sectionTypeKey: "faq_accordion",
        slotKey: "body",
        sortOrder: 5,
      },
    },
  ];
  const result = resolveSnapshotBuilderTree({
    slots: [
      {
        slotKey: "body",
        sortOrder: 5,
        sectionId,
        sectionTypeKey: "faq_accordion",
        name: "FAQ",
        props: {
          eyebrow: "FAQ",
          headline: "Answers to common questions",
          intro: "Everything you need before booking.",
        },
      },
    ],
    builderTree: baseTree,
  });
  assert.equal(result.source, "snapshot_builder_tree");
  const sectionNode = result.tree[0];
  assert.equal(sectionNode?.kind, "section");
  if (sectionNode?.kind === "section") {
    assert.equal(sectionNode.children?.length, 3);
  }
});

test("resolveSnapshotBuilderTree hydrates pricing_grid child nodes when valid tree is section-only", () => {
  const sectionId = "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1";
  const baseTree = [
    {
      id: `legacy:body:6:${sectionId}`,
      kind: "section" as const,
      props: {
        sectionId,
        sectionTypeKey: "pricing_grid",
        slotKey: "body",
        sortOrder: 6,
      },
    },
  ];
  const result = resolveSnapshotBuilderTree({
    slots: [
      {
        slotKey: "body",
        sortOrder: 6,
        sectionId,
        sectionTypeKey: "pricing_grid",
        name: "Pricing",
        props: {
          eyebrow: "Plans",
          headline: "Choose your package",
          intro: "Simple pricing with clear coverage.",
        },
      },
    ],
    builderTree: baseTree,
  });
  assert.equal(result.source, "snapshot_builder_tree");
  const sectionNode = result.tree[0];
  assert.equal(sectionNode?.kind, "section");
  if (sectionNode?.kind === "section") {
    assert.equal(sectionNode.children?.length, 3);
  }
});

test("resolveSnapshotBuilderTree hydrates logo_cloud child nodes when valid tree is section-only", () => {
  const sectionId = "f4f4f4f4-f4f4-4f4f-8f4f-f4f4f4f4f4f4";
  const baseTree = [
    {
      id: `legacy:body:7:${sectionId}`,
      kind: "section" as const,
      props: {
        sectionId,
        sectionTypeKey: "logo_cloud",
        slotKey: "body",
        sortOrder: 7,
      },
    },
  ];
  const result = resolveSnapshotBuilderTree({
    slots: [
      {
        slotKey: "body",
        sortOrder: 7,
        sectionId,
        sectionTypeKey: "logo_cloud",
        name: "Logo cloud",
        props: {
          eyebrow: "Trusted by",
          headline: "Operators and brands",
        },
      },
    ],
    builderTree: baseTree,
  });
  assert.equal(result.source, "snapshot_builder_tree");
  const sectionNode = result.tree[0];
  assert.equal(sectionNode?.kind, "section");
  if (sectionNode?.kind === "section") {
    assert.equal(sectionNode.children?.length, 2);
  }
});

test("resolveSnapshotBuilderTree hydrates team_grid child nodes when valid tree is section-only", () => {
  const sectionId = "f5f5f5f5-f5f5-4f5f-8f5f-f5f5f5f5f5f5";
  const baseTree = [
    {
      id: `legacy:body:8:${sectionId}`,
      kind: "section" as const,
      props: {
        sectionId,
        sectionTypeKey: "team_grid",
        slotKey: "body",
        sortOrder: 8,
      },
    },
  ];
  const result = resolveSnapshotBuilderTree({
    slots: [
      {
        slotKey: "body",
        sortOrder: 8,
        sectionId,
        sectionTypeKey: "team_grid",
        name: "Team grid",
        props: {
          eyebrow: "Team",
          headline: "People behind the work",
          intro: "A small, focused team.",
        },
      },
    ],
    builderTree: baseTree,
  });
  assert.equal(result.source, "snapshot_builder_tree");
  const sectionNode = result.tree[0];
  assert.equal(sectionNode?.kind, "section");
  if (sectionNode?.kind === "section") {
    assert.equal(sectionNode.children?.length, 3);
  }
});

test("resolveSnapshotBuilderTree hydrates event_listing child nodes when valid tree is section-only", () => {
  const sectionId = "f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6";
  const baseTree = [
    {
      id: `legacy:body:9:${sectionId}`,
      kind: "section" as const,
      props: {
        sectionId,
        sectionTypeKey: "event_listing",
        slotKey: "body",
        sortOrder: 9,
      },
    },
  ];
  const result = resolveSnapshotBuilderTree({
    slots: [
      {
        slotKey: "body",
        sortOrder: 9,
        sectionId,
        sectionTypeKey: "event_listing",
        name: "Event listing",
        props: {
          eyebrow: "Calendar",
          headline: "Upcoming events",
        },
      },
    ],
    builderTree: baseTree,
  });
  assert.equal(result.source, "snapshot_builder_tree");
  const sectionNode = result.tree[0];
  assert.equal(sectionNode?.kind, "section");
  if (sectionNode?.kind === "section") {
    assert.equal(sectionNode.children?.length, 2);
  }
});

test("resolveSnapshotBuilderTree hydrates content_tabs child nodes when valid tree is section-only", () => {
  const sectionId = "f7f7f7f7-f7f7-4f7f-8f7f-f7f7f7f7f7f7";
  const baseTree = [
    {
      id: `legacy:body:10:${sectionId}`,
      kind: "section" as const,
      props: {
        sectionId,
        sectionTypeKey: "content_tabs",
        slotKey: "body",
        sortOrder: 10,
      },
    },
  ];
  const result = resolveSnapshotBuilderTree({
    slots: [
      {
        slotKey: "body",
        sortOrder: 10,
        sectionId,
        sectionTypeKey: "content_tabs",
        name: "Content tabs",
        props: {
          eyebrow: "Highlights",
          headline: "What we cover",
        },
      },
    ],
    builderTree: baseTree,
  });
  assert.equal(result.source, "snapshot_builder_tree");
  const sectionNode = result.tree[0];
  assert.equal(sectionNode?.kind, "section");
  if (sectionNode?.kind === "section") {
    assert.equal(sectionNode.children?.length, 2);
  }
});

test("resolveSnapshotBuilderTree hydrates process_steps child nodes when valid tree is section-only", () => {
  const sectionId = "fafafafa-fafa-4afa-8afa-fafafafafafa";
  const baseTree = [
    {
      id: `legacy:body:11:${sectionId}`,
      kind: "section" as const,
      props: {
        sectionId,
        sectionTypeKey: "process_steps",
        slotKey: "body",
        sortOrder: 11,
      },
    },
  ];
  const result = resolveSnapshotBuilderTree({
    slots: [
      {
        slotKey: "body",
        sortOrder: 11,
        sectionId,
        sectionTypeKey: "process_steps",
        name: "Process steps",
        props: {
          eyebrow: "Process",
          headline: "How we work",
          copy: "A clear three-step flow.",
        },
      },
    ],
    builderTree: baseTree,
  });
  assert.equal(result.source, "snapshot_builder_tree");
  const sectionNode = result.tree[0];
  assert.equal(sectionNode?.kind, "section");
  if (sectionNode?.kind === "section") {
    assert.equal(sectionNode.children?.length, 3);
  }
});

test("resolveSnapshotBuilderTree hydrates destinations_mosaic child nodes when valid tree is section-only", () => {
  const sectionId = "fbfbfbfb-fbfb-4bfb-8bfb-fbfbfbfbfbfb";
  const baseTree = [
    {
      id: `legacy:body:12:${sectionId}`,
      kind: "section" as const,
      props: {
        sectionId,
        sectionTypeKey: "destinations_mosaic",
        slotKey: "body",
        sortOrder: 12,
      },
    },
  ];
  const result = resolveSnapshotBuilderTree({
    slots: [
      {
        slotKey: "body",
        sortOrder: 12,
        sectionId,
        sectionTypeKey: "destinations_mosaic",
        name: "Destinations",
        props: {
          eyebrow: "Destinations",
          headline: "From jungle to coast",
          copy: "Global destination coverage.",
        },
      },
    ],
    builderTree: baseTree,
  });
  assert.equal(result.source, "snapshot_builder_tree");
  const sectionNode = result.tree[0];
  assert.equal(sectionNode?.kind, "section");
  if (sectionNode?.kind === "section") {
    assert.equal(sectionNode.children?.length, 3);
  }
});

test("resolveSnapshotBuilderTree hydrates stats child nodes when valid tree is section-only", () => {
  const sectionId = "c5c5c5c5-c5c5-4c5c-8c5c-c5c5c5c5c5c5";
  const baseTree = [
    {
      id: `legacy:body:13:${sectionId}`,
      kind: "section" as const,
      props: {
        sectionId,
        sectionTypeKey: "stats",
        slotKey: "body",
        sortOrder: 13,
      },
    },
  ];
  const result = resolveSnapshotBuilderTree({
    slots: [
      {
        slotKey: "body",
        sortOrder: 13,
        sectionId,
        sectionTypeKey: "stats",
        name: "Stats",
        props: {
          eyebrow: "Numbers",
          headline: "Impact in production",
        },
      },
    ],
    builderTree: baseTree,
  });
  assert.equal(result.source, "snapshot_builder_tree");
  const sectionNode = result.tree[0];
  assert.equal(sectionNode?.kind, "section");
  if (sectionNode?.kind === "section") {
    assert.equal(sectionNode.children?.length, 2);
  }
});

test("resolveSnapshotBuilderTree hydrates timeline child nodes when valid tree is section-only", () => {
  const sectionId = "c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6";
  const baseTree = [
    {
      id: `legacy:body:14:${sectionId}`,
      kind: "section" as const,
      props: {
        sectionId,
        sectionTypeKey: "timeline",
        slotKey: "body",
        sortOrder: 14,
      },
    },
  ];
  const result = resolveSnapshotBuilderTree({
    slots: [
      {
        slotKey: "body",
        sortOrder: 14,
        sectionId,
        sectionTypeKey: "timeline",
        name: "Timeline",
        props: {
          eyebrow: "Roadmap",
          headline: "How each launch runs",
        },
      },
    ],
    builderTree: baseTree,
  });
  assert.equal(result.source, "snapshot_builder_tree");
  const sectionNode = result.tree[0];
  assert.equal(sectionNode?.kind, "section");
  if (sectionNode?.kind === "section") {
    assert.equal(sectionNode.children?.length, 2);
  }
});

test("resolveSnapshotBuilderTree hydrates values_trio child nodes when valid tree is section-only", () => {
  const sectionId = "c7c7c7c7-c7c7-4c7c-8c7c-c7c7c7c7c7c7";
  const baseTree = [
    {
      id: `legacy:body:15:${sectionId}`,
      kind: "section" as const,
      props: {
        sectionId,
        sectionTypeKey: "values_trio",
        slotKey: "body",
        sortOrder: 15,
      },
    },
  ];
  const result = resolveSnapshotBuilderTree({
    slots: [
      {
        slotKey: "body",
        sortOrder: 15,
        sectionId,
        sectionTypeKey: "values_trio",
        name: "Values trio",
        props: {
          eyebrow: "Values",
          headline: "What guides our work",
        },
      },
    ],
    builderTree: baseTree,
  });
  assert.equal(result.source, "snapshot_builder_tree");
  const sectionNode = result.tree[0];
  assert.equal(sectionNode?.kind, "section");
  if (sectionNode?.kind === "section") {
    assert.equal(sectionNode.children?.length, 2);
  }
});

test("resolveSnapshotBuilderTree hydrates comparison_table child nodes when valid tree is section-only", () => {
  const sectionId = "c8c8c8c8-c8c8-4c8c-8c8c-c8c8c8c8c8c8";
  const baseTree = [
    {
      id: `legacy:body:16:${sectionId}`,
      kind: "section" as const,
      props: {
        sectionId,
        sectionTypeKey: "comparison_table",
        slotKey: "body",
        sortOrder: 16,
      },
    },
  ];
  const result = resolveSnapshotBuilderTree({
    slots: [
      {
        slotKey: "body",
        sortOrder: 16,
        sectionId,
        sectionTypeKey: "comparison_table",
        name: "Comparison table",
        props: {
          eyebrow: "Plans",
          headline: "Compare offers",
          intro: "Choose the right package.",
        },
      },
    ],
    builderTree: baseTree,
  });
  assert.equal(result.source, "snapshot_builder_tree");
  const sectionNode = result.tree[0];
  assert.equal(sectionNode?.kind, "section");
  if (sectionNode?.kind === "section") {
    assert.equal(sectionNode.children?.length, 3);
  }
});

test("resolveSnapshotBuilderTree hydrates hero_split child nodes when valid tree is section-only", () => {
  const sectionId = "d4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4";
  const baseTree = [
    {
      id: `legacy:body:17:${sectionId}`,
      kind: "section" as const,
      props: {
        sectionId,
        sectionTypeKey: "hero_split",
        slotKey: "body",
        sortOrder: 17,
      },
    },
  ];
  const result = resolveSnapshotBuilderTree({
    slots: [
      {
        slotKey: "body",
        sortOrder: 17,
        sectionId,
        sectionTypeKey: "hero_split",
        name: "Hero split",
        props: {
          eyebrow: "Featured",
          headline: "Book faster with curated talent",
          subheadline: "Structured booking support across your campaign timeline.",
          primaryCta: { label: "Start booking", href: "/book" },
          secondaryCta: { label: "Browse roster", href: "/directory" },
        },
      },
    ],
    builderTree: baseTree,
  });
  assert.equal(result.source, "snapshot_builder_tree");
  const sectionNode = result.tree[0];
  assert.equal(sectionNode?.kind, "section");
  if (sectionNode?.kind === "section") {
    assert.equal(sectionNode.children?.length, 5);
  }
});

test("resolveSnapshotBuilderTree hydrates image_copy_alternating child nodes when valid tree is section-only", () => {
  const sectionId = "d5d5d5d5-d5d5-4d5d-8d5d-d5d5d5d5d5d5";
  const baseTree = [
    {
      id: `legacy:body:18:${sectionId}`,
      kind: "section" as const,
      props: {
        sectionId,
        sectionTypeKey: "image_copy_alternating",
        slotKey: "body",
        sortOrder: 18,
      },
    },
  ];
  const result = resolveSnapshotBuilderTree({
    slots: [
      {
        slotKey: "body",
        sortOrder: 18,
        sectionId,
        sectionTypeKey: "image_copy_alternating",
        name: "Image copy alternating",
        props: {
          eyebrow: "Services",
          headline: "How we support each production",
        },
      },
    ],
    builderTree: baseTree,
  });
  assert.equal(result.source, "snapshot_builder_tree");
  const sectionNode = result.tree[0];
  assert.equal(sectionNode?.kind, "section");
  if (sectionNode?.kind === "section") {
    assert.equal(sectionNode.children?.length, 2);
  }
});

test("resolveSnapshotBuilderTree hydrates split_screen child nodes when valid tree is section-only", () => {
  const sectionId = "d6d6d6d6-d6d6-4d6d-8d6d-d6d6d6d6d6d6";
  const baseTree = [
    {
      id: `legacy:body:19:${sectionId}`,
      kind: "section" as const,
      props: {
        sectionId,
        sectionTypeKey: "split_screen",
        slotKey: "body",
        sortOrder: 19,
      },
    },
  ];
  const result = resolveSnapshotBuilderTree({
    slots: [
      {
        slotKey: "body",
        sortOrder: 19,
        sectionId,
        sectionTypeKey: "split_screen",
        name: "Split screen",
        props: {
          eyebrow: "Narrative",
          headline: "Tell the brand story",
          body: "A flexible split layout with editorial copy.",
          primaryCta: { label: "Start", href: "/start" },
          secondaryCta: { label: "Learn", href: "/learn" },
        },
      },
    ],
    builderTree: baseTree,
  });
  assert.equal(result.source, "snapshot_builder_tree");
  const sectionNode = result.tree[0];
  assert.equal(sectionNode?.kind, "section");
  if (sectionNode?.kind === "section") {
    assert.equal(sectionNode.children?.length, 5);
  }
});

test("resolveSnapshotBuilderTree hydrates before_after child nodes when valid tree is section-only", () => {
  const sectionId = "dadadada-dada-4ada-8ada-dadadadadada";
  const baseTree = [
    {
      id: `legacy:body:20:${sectionId}`,
      kind: "section" as const,
      props: {
        sectionId,
        sectionTypeKey: "before_after",
        slotKey: "body",
        sortOrder: 20,
      },
    },
  ];
  const result = resolveSnapshotBuilderTree({
    slots: [
      {
        slotKey: "body",
        sortOrder: 20,
        sectionId,
        sectionTypeKey: "before_after",
        name: "Before/after",
        props: {
          eyebrow: "Transformation",
          headline: "Before and after",
          beforeUrl: "https://example.com/before.jpg",
          afterUrl: "https://example.com/after.jpg",
        },
      },
    ],
    builderTree: baseTree,
  });
  assert.equal(result.source, "snapshot_builder_tree");
  const sectionNode = result.tree[0];
  assert.equal(sectionNode?.kind, "section");
  if (sectionNode?.kind === "section") {
    assert.equal(sectionNode.children?.length, 2);
  }
});

test("resolveSnapshotBuilderTree hydrates booking_widget child nodes when valid tree is section-only", () => {
  const sectionId = "dbdbdbdb-dbdb-4bdb-8bdb-dbdbdbdbdbdb";
  const baseTree = [
    {
      id: `legacy:body:21:${sectionId}`,
      kind: "section" as const,
      props: {
        sectionId,
        sectionTypeKey: "booking_widget",
        slotKey: "body",
        sortOrder: 21,
      },
    },
  ];
  const result = resolveSnapshotBuilderTree({
    slots: [
      {
        slotKey: "body",
        sortOrder: 21,
        sectionId,
        sectionTypeKey: "booking_widget",
        name: "Booking widget",
        props: {
          eyebrow: "Booking",
          headline: "Book a call",
          intro: "Select a time that works for your team.",
          url: "https://calendly.com/demo/session",
          variant: "button",
          buttonLabel: "Book now",
        },
      },
    ],
    builderTree: baseTree,
  });
  assert.equal(result.source, "snapshot_builder_tree");
  const sectionNode = result.tree[0];
  assert.equal(sectionNode?.kind, "section");
  if (sectionNode?.kind === "section") {
    assert.equal(sectionNode.children?.length, 4);
  }
});

test("resolveSnapshotBuilderTree hydrates lookbook child nodes when valid tree is section-only", () => {
  const sectionId = "dcdcdcdc-dcdc-4cdc-8cdc-dcdcdcdcdcdc";
  const baseTree = [
    {
      id: `legacy:body:22:${sectionId}`,
      kind: "section" as const,
      props: {
        sectionId,
        sectionTypeKey: "lookbook",
        slotKey: "body",
        sortOrder: 22,
      },
    },
  ];
  const result = resolveSnapshotBuilderTree({
    slots: [
      {
        slotKey: "body",
        sortOrder: 22,
        sectionId,
        sectionTypeKey: "lookbook",
        name: "Lookbook",
        props: {
          eyebrow: "Editorial",
          headline: "Campaign lookbook",
          pages: [
            { imageUrl: "https://example.com/1.jpg" },
            { imageUrl: "https://example.com/2.jpg" },
          ],
        },
      },
    ],
    builderTree: baseTree,
  });
  assert.equal(result.source, "snapshot_builder_tree");
  const sectionNode = result.tree[0];
  assert.equal(sectionNode?.kind, "section");
  if (sectionNode?.kind === "section") {
    assert.equal(sectionNode.children?.length, 2);
  }
});

test("resolveSnapshotBuilderTree hydrates testimonials_trio child nodes when valid tree is section-only", () => {
  const sectionId = "88888888-8888-4888-8888-888888888888";
  const baseTree = [
    {
      id: `legacy:body:3:${sectionId}`,
      kind: "section" as const,
      props: {
        sectionId,
        sectionTypeKey: "testimonials_trio",
        slotKey: "body",
        sortOrder: 3,
      },
    },
  ];
  const result = resolveSnapshotBuilderTree({
    slots: [
      {
        slotKey: "body",
        sortOrder: 3,
        sectionId,
        sectionTypeKey: "testimonials_trio",
        name: "Testimonials",
        props: {
          headline: "Loved by founders and teams",
        },
      },
    ],
    builderTree: baseTree,
  });
  assert.equal(result.source, "snapshot_builder_tree");
  const sectionNode = result.tree[0];
  assert.equal(sectionNode?.kind, "section");
  if (sectionNode?.kind === "section") {
    assert.equal(sectionNode.children?.length, 1);
  }
});

test("resolveSnapshotBuilderTree hydrates gallery_strip child nodes when valid tree is section-only", () => {
  const sectionId = "99999999-9999-4999-8999-999999999999";
  const baseTree = [
    {
      id: `legacy:body:4:${sectionId}`,
      kind: "section" as const,
      props: {
        sectionId,
        sectionTypeKey: "gallery_strip",
        slotKey: "body",
        sortOrder: 4,
      },
    },
  ];
  const result = resolveSnapshotBuilderTree({
    slots: [
      {
        slotKey: "body",
        sortOrder: 4,
        sectionId,
        sectionTypeKey: "gallery_strip",
        name: "Gallery",
        props: {
          headline: "The gallery",
          caption: "Curated moments in motion.",
        },
      },
    ],
    builderTree: baseTree,
  });
  assert.equal(result.source, "snapshot_builder_tree");
  const sectionNode = result.tree[0];
  assert.equal(sectionNode?.kind, "section");
  if (sectionNode?.kind === "section") {
    assert.equal(sectionNode.children?.length, 2);
  }
});

test("resolveSnapshotBuilderTree hydrates trust_strip child nodes when valid tree is section-only", () => {
  const sectionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const baseTree = [
    {
      id: `legacy:body:5:${sectionId}`,
      kind: "section" as const,
      props: {
        sectionId,
        sectionTypeKey: "trust_strip",
        slotKey: "body",
        sortOrder: 5,
      },
    },
  ];
  const result = resolveSnapshotBuilderTree({
    slots: [
      {
        slotKey: "body",
        sortOrder: 5,
        sectionId,
        sectionTypeKey: "trust_strip",
        name: "Trust strip",
        props: {
          eyebrow: "Proven outcomes",
          headline: "Trusted worldwide",
        },
      },
    ],
    builderTree: baseTree,
  });
  assert.equal(result.source, "snapshot_builder_tree");
  const sectionNode = result.tree[0];
  assert.equal(sectionNode?.kind, "section");
  if (sectionNode?.kind === "section") {
    assert.equal(sectionNode.children?.length, 2);
  }
});

test("resolveSnapshotBuilderTree falls back to legacy slots when snapshot tree is invalid", () => {
  const result = resolveSnapshotBuilderTree({
    slots: [
      {
        slotKey: "body",
        sortOrder: 0,
        sectionId: "11111111-1111-4111-8111-111111111111",
        sectionTypeKey: "hero",
        name: "Hero",
      },
    ],
    builderTree: [{ id: "", kind: "unknown", props: {} }],
  });

  assert.equal(result.source, "legacy_slots");
  assert.equal(result.issues.length > 0, true);
  assert.equal(result.tree.length, 1);
});

test("resolveSnapshotBuilderTreeForPublish rejects invalid snapshot tree", () => {
  const result = resolveSnapshotBuilderTreeForPublish({
    slots: [
      {
        slotKey: "body",
        sortOrder: 0,
        sectionId: "11111111-1111-4111-8111-111111111111",
        sectionTypeKey: "hero",
        name: "Hero",
      },
    ],
    builderTree: [{ id: "", kind: "unknown", props: {} }],
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.issues.length > 0, true);
  }
});

test("resolveSnapshotBuilderTreeForPublish accepts valid snapshot tree", () => {
  const sectionId = "11111111-1111-4111-8111-111111111111";
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 0,
      sectionId,
      sectionTypeKey: "hero",
      name: "Hero",
    },
  ]);
  const result = resolveSnapshotBuilderTreeForPublish({
    slots: [
      {
        slotKey: "body",
        sortOrder: 0,
        sectionId,
        sectionTypeKey: "hero",
        name: "Hero",
      },
    ],
    builderTree: tree,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.source, "snapshot_builder_tree");
    assert.equal(result.tree.length, 1);
  }
});

test("resolveSnapshotBuilderTreeForPublish reconciles when tree omits a composition slot (stale client tree)", () => {
  const sectionId = "11111111-1111-4111-8111-111111111111";
  const result = resolveSnapshotBuilderTreeForPublish({
    slots: [
      {
        slotKey: "body",
        sortOrder: 0,
        sectionId,
        sectionTypeKey: "hero",
        name: "Hero",
        props: {},
      },
    ],
    builderTree: [
      {
        id: `legacy:body:1:${sectionId}`,
        kind: "section",
        props: {
          sectionId,
          sectionTypeKey: "hero",
          slotKey: "body",
          sortOrder: 1,
        },
      },
    ],
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.tree.length, 1);
    const node = result.tree[0];
    assert.equal(node?.kind, "section");
    if (node?.kind === "section") {
      assert.equal(node.props.slotKey, "body");
      assert.equal(node.props.sortOrder, 0);
    }
  }
});

test("resolveSnapshotBuilderTreeForPublish rejects ghost section nodes not in composition", () => {
  const result = resolveSnapshotBuilderTreeForPublish({
    slots: [],
    builderTree: [
      {
        id: "legacy:body:0:11111111-1111-4111-8111-111111111111",
        kind: "section",
        props: {
          sectionId: "11111111-1111-4111-8111-111111111111",
          sectionTypeKey: "hero",
          slotKey: "body",
          sortOrder: 0,
        },
      },
    ],
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(
      result.issues.some((issue) =>
        issue.message.includes("has no matching composition slot"),
      ),
      true,
    );
  }
});

test("summarizeBuilderTreeIssues limits output to first three issues", () => {
  const message = summarizeBuilderTreeIssues([
    { path: "root.0", message: "first" },
    { path: "root.1", message: "second" },
    { path: "root.2", message: "third" },
    { path: "root.3", message: "fourth" },
  ]);
  assert.equal(message, "root.0: first; root.1: second; root.2: third");
});

test("indexBuilderSectionNodeIds maps section address to stable node id", () => {
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "hero",
      sortOrder: 2,
      sectionId: "11111111-1111-4111-8111-111111111111",
      sectionTypeKey: "hero",
      name: "Homepage Hero",
    },
  ]);
  const index = indexBuilderSectionNodeIds(tree);
  const key = builderSectionNodeAddressKey({
    sectionId: "11111111-1111-4111-8111-111111111111",
    slotKey: "hero",
    sortOrder: 2,
  });

  assert.equal(index.get(key!), "legacy:hero:2:11111111-1111-4111-8111-111111111111");
});

test("indexBuilderSectionNodes maps section address to section node", () => {
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 1,
      sectionId: "22222222-2222-4222-8222-222222222222",
      sectionTypeKey: "cta_banner",
      name: "CTA",
    },
  ]);
  const index = indexBuilderSectionNodes(tree);
  const key = builderSectionNodeAddressKey({
    sectionId: "22222222-2222-4222-8222-222222222222",
    slotKey: "body",
    sortOrder: 1,
  });

  assert.equal(index.get(key!)?.props.sectionTypeKey, "cta_banner");
});

test("indexBuilderSectionChildNodeIds maps section node id to descendant node ids", () => {
  const sectionNodeId = "legacy:hero:0:11111111-1111-4111-8111-111111111111";
  const tree = [
    {
      id: sectionNodeId,
      kind: "section" as const,
      props: {
        sectionId: "11111111-1111-4111-8111-111111111111",
        sectionTypeKey: "hero",
        slotKey: "hero",
        sortOrder: 0,
      },
      children: [
        {
          id: `${sectionNodeId}:heading:headline`,
          kind: "heading" as const,
          props: { text: "Hero", level: 1 as const },
        },
      ],
    },
  ];
  const index = indexBuilderSectionChildNodeIds(tree);
  assert.deepEqual(index.get(sectionNodeId), [
    `${sectionNodeId}:heading:headline`,
  ]);
});

test("indexBuilderSectionChildNodes includes labels and nested depth", () => {
  const sectionNodeId = "legacy:body:0:11111111-1111-4111-8111-111111111111";
  const tree = [
    {
      id: sectionNodeId,
      kind: "section" as const,
      props: {
        sectionId: "11111111-1111-4111-8111-111111111111",
        sectionTypeKey: "hero",
        slotKey: "body",
        sortOrder: 0,
      },
      children: [
        {
          id: `${sectionNodeId}:heading:headline`,
          kind: "heading" as const,
          props: { text: "Hero headline", level: 1 as const },
        },
        {
          id: `${sectionNodeId}:container:split`,
          kind: "container" as const,
          props: { layout: "stack" as const },
          children: [
            {
              id: `${sectionNodeId}:container:split:button:primaryCta`,
              kind: "button" as const,
              props: { label: "Get started", href: "/start" },
            },
            {
              id: `${sectionNodeId}:container:split:accordion-item`,
              kind: "accordion_item" as const,
              props: { title: "FAQ" },
              children: [],
            },
          ],
        },
      ],
    },
  ];

  const index = indexBuilderSectionChildNodes(tree);
  const rows = index.get(sectionNodeId) ?? [];
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((row) => row.id), [
    `${sectionNodeId}:heading:headline`,
    `${sectionNodeId}:container:split`,
    `${sectionNodeId}:container:split:button:primaryCta`,
    `${sectionNodeId}:container:split:accordion-item`,
  ]);
  assert.deepEqual(rows.map((row) => row.depth), [1, 1, 2, 2]);
  assert.equal(rows[0]?.label, "Headline");
  assert.equal(rows[1]?.label, "Container");
  assert.equal(rows[2]?.label, "Primary CTA");
  assert.equal(rows[3]?.label, "Accordion item: FAQ");
});

test("reconcileBuilderTreeWithLegacySlots preserves non-section roots and stable section ids", () => {
  const sectionId = "11111111-1111-4111-8111-111111111111";
  const previousTree = [
    {
      id: "global-content",
      kind: "container" as const,
      props: { layout: "stack" as const },
      children: [
        {
          id: "global-title",
          kind: "heading" as const,
          props: { text: "Global heading", level: 2 as const },
        },
      ],
    },
    {
      id: `legacy:hero:0:${sectionId}`,
      kind: "section" as const,
      props: {
        sectionId,
        sectionTypeKey: "hero",
        label: "Old Hero",
        slotKey: "hero",
        sortOrder: 0,
      },
      children: [
        {
          id: `legacy:hero:0:${sectionId}:heading:headline`,
          kind: "heading" as const,
          props: { text: "Existing hero headline", level: 1 as const },
        },
      ],
    },
  ];

  const next = reconcileBuilderTreeWithLegacySlots(previousTree, [
    {
      slotKey: "body",
      sortOrder: 2,
      sectionId,
      sectionTypeKey: "hero",
      name: "Moved Hero",
    },
  ]);

  assert.equal(next.length, 2);
  assert.equal(next[0]?.id, "global-content");
  assert.equal(next[1]?.kind, "section");
  if (next[1]?.kind === "section") {
    assert.equal(next[1].id, `legacy:hero:0:${sectionId}`);
    assert.equal(next[1].props.slotKey, "body");
    assert.equal(next[1].props.sortOrder, 2);
    assert.equal(next[1].props.label, "Moved Hero");
    assert.equal(next[1].children?.[0]?.id, `legacy:hero:0:${sectionId}:heading:headline`);
  }
});

test("blank_section has composition-owned semantics (no legacy-derived children)", () => {
  assert.equal(isCompositionOwnedSectionType("blank_section"), true);
  assert.equal(
    deriveLegacySectionChildNodes("sec-node", {
      slotKey: "primary",
      sortOrder: 1,
      sectionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      sectionTypeKey: "blank_section",
      name: "Blank",
      props: {},
    }).length,
    0,
  );
});

test("card and cta_group child policies match §7A governance", () => {
  const cardPolicy = BUILDER_NODE_REGISTRY.card.children;
  const ctaPolicy = BUILDER_NODE_REGISTRY.cta_group.children;
  assert.equal(cardPolicy.type, "allow_list");
  assert.equal(ctaPolicy.type, "allow_list");
  if (cardPolicy.type === "allow_list") {
    assert.deepEqual(cardPolicy.kinds, ["heading", "paragraph", "button", "image"]);
  }
  if (ctaPolicy.type === "allow_list") {
    assert.deepEqual(ctaPolicy.kinds, ["button"]);
  }

  const nestedContainerUnderCard = validateBuilderNodeTree([
    {
      id: "sec-card-governance",
      kind: "section",
      props: { sectionTypeKey: "custom" },
      children: [
        {
          id: "card-x",
          kind: "card",
          props: {},
          children: [
            {
              id: "illegal-container",
              kind: "container",
              props: { layout: "stack" },
              children: [],
            },
          ],
        },
      ],
    },
  ]);
  assert.equal(nestedContainerUnderCard.ok, false);

  const headingInsideCtaGroup = validateBuilderNodeTree([
    {
      id: "sec-cta-governance",
      kind: "section",
      props: { sectionTypeKey: "custom" },
      children: [
        {
          id: "cta-x",
          kind: "cta_group",
          props: {},
          children: [
            {
              id: "illegal-heading",
              kind: "heading",
              props: { text: "No", level: 2 },
            },
          ],
        },
      ],
    },
  ]);
  assert.equal(headingInsideCtaGroup.ok, false);
});
