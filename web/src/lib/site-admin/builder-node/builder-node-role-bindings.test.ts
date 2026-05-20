import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { buildLegacySectionBuilderTree } from "./snapshot-slot-bridge";
import {
  buildBuilderNodeRoleBindings,
  resolveBuilderNodeRole,
  type BuilderNodeRole,
} from "./role-bindings";

test("resolveBuilderNodeRole maps known suffixes", () => {
  assert.equal(resolveBuilderNodeRole("x:heading:headline"), "headline");
  assert.equal(resolveBuilderNodeRole("x:paragraph:subheadline"), "subheadline");
  assert.equal(resolveBuilderNodeRole("x:paragraph:copy"), "copy");
  assert.equal(resolveBuilderNodeRole("x:button:primaryCta"), "primaryCta");
  assert.equal(resolveBuilderNodeRole("x:button:secondaryCta"), "secondaryCta");
  assert.equal(resolveBuilderNodeRole("x:button:footerCta"), "footerCta");
  assert.equal(resolveBuilderNodeRole("x:image:hero"), null);
});

interface BindingCase {
  sectionTypeKey: string;
  props: Record<string, unknown>;
  expectedRoles: ReadonlyArray<BuilderNodeRole>;
  componentPath: string;
}

function registeredSectionTypeKeys(): string[] {
  const sectionsDir = path.resolve(process.cwd(), "src/lib/site-admin/sections");
  return readdirSync(sectionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "shared")
    .map((entry) => entry.name)
    .filter((name) => {
      const metaPath = path.join(sectionsDir, name, "meta.ts");
      try {
        return Boolean(readFileSync(metaPath, "utf8"));
      } catch {
        return false;
      }
    })
    .map((name) => {
      const metaPath = path.join(sectionsDir, name, "meta.ts");
      const source = readFileSync(metaPath, "utf8");
      const match = source.match(/key:\s*"([^"]+)"/);
      return match?.[1] ?? null;
    })
    .filter((key): key is string => Boolean(key))
    .sort();
}

const CASES: ReadonlyArray<BindingCase> = [
  {
    sectionTypeKey: "hero",
    props: {
      headline: "Hero headline",
      subheadline: "Hero subheadline",
      primaryCta: { label: "Book", href: "/book" },
      secondaryCta: { label: "See", href: "/directory" },
    },
    expectedRoles: ["headline", "subheadline", "primaryCta", "secondaryCta"],
    componentPath: "src/lib/site-admin/sections/hero/Component.tsx",
  },
  {
    sectionTypeKey: "cta_banner",
    props: {
      eyebrow: "Ready when you are",
      headline: "Banner headline",
      copy: "Banner copy",
      primaryCta: { label: "Start", href: "/start" },
      secondaryCta: { label: "Learn", href: "/learn" },
    },
    expectedRoles: ["subheadline", "headline", "copy", "primaryCta", "secondaryCta"],
    componentPath: "src/lib/site-admin/sections/cta_banner/Component.tsx",
  },
  {
    sectionTypeKey: "featured_talent",
    props: {
      eyebrow: "Featured now",
      headline: "Featured",
      copy: "Top picks",
      footerCta: { label: "View all", href: "/directory" },
    },
    expectedRoles: ["subheadline", "headline", "copy", "footerCta"],
    componentPath: "src/lib/site-admin/sections/featured_talent/Component.tsx",
  },
  {
    sectionTypeKey: "talent_type_grid",
    props: {
      eyebrow: "The roster",
      headline: "Talent, by discipline",
      subheadline: "Browse the talent categories available for your brief.",
    },
    expectedRoles: ["subheadline", "headline", "copy"],
    componentPath: "src/lib/site-admin/sections/talent_type_grid/Component.tsx",
  },
  {
    sectionTypeKey: "directory",
    props: {
      eyebrow: "Roster",
      headline: "Available talent",
      copy: "Search the directory by role, location, or fit.",
    },
    expectedRoles: ["subheadline", "headline", "copy"],
    componentPath: "src/lib/site-admin/sections/directory/Component.tsx",
  },
  {
    sectionTypeKey: "editorial_split_hero",
    props: {
      eyebrow: "Discover",
      headline: "Premium talent across destination cities",
      body: "Lead with campaign imagery, then route visitors into inquiry.",
      primaryCta: { label: "Explore talent", href: "/directory" },
      secondaryCta: { label: "Start a brief", href: "/inquiry" },
    },
    expectedRoles: ["subheadline", "headline", "copy", "primaryCta", "secondaryCta"],
    componentPath: "src/lib/site-admin/sections/editorial_split_hero/Component.tsx",
  },
  {
    sectionTypeKey: "hero_search",
    props: {
      eyebrow: "Find talent",
      headline: "Search by role, city, or brief",
      subheadline: "Agency-managed discovery with no direct contact.",
      primaryCta: { label: "Browse talent", href: "/directory" },
      secondaryCta: { label: "Send a brief", href: "/inquiry" },
    },
    expectedRoles: ["subheadline", "headline", "copy", "primaryCta", "secondaryCta"],
    componentPath: "src/lib/site-admin/sections/hero_search/Component.tsx",
  },
  {
    sectionTypeKey: "location_discovery",
    props: {
      eyebrow: "Markets",
      headline: "Local faces, international reach",
      subheadline: "Source talent by destination and production city.",
    },
    expectedRoles: ["subheadline", "headline", "copy"],
    componentPath: "src/lib/site-admin/sections/location_discovery/Component.tsx",
  },
  {
    sectionTypeKey: "category_grid",
    props: {
      eyebrow: "Services",
      headline: "What we offer",
      copy: "Pick the right support model for your event.",
      footerCta: { label: "Browse all", href: "/services" },
    },
    expectedRoles: ["subheadline", "headline", "copy", "footerCta"],
    componentPath: "src/lib/site-admin/sections/category_grid/Component.tsx",
  },
  {
    sectionTypeKey: "contact_form",
    props: {
      eyebrow: "Let's connect",
      headline: "Tell us what you need",
      intro: "Share your scope and timeline. We'll reply quickly.",
      submitLabel: "Send request",
      action: "/api/cms/forms/submit",
      fields: [{ name: "name", label: "Name", type: "text", required: true }],
    },
    expectedRoles: ["subheadline", "headline", "copy", "primaryCta"],
    componentPath: "src/lib/site-admin/sections/contact_form/Component.tsx",
  },
  {
    sectionTypeKey: "faq_accordion",
    props: {
      eyebrow: "FAQ",
      headline: "Answers to common questions",
      intro: "Everything you need before booking.",
      items: [{ question: "How fast can you start?", answer: "Usually within 24h." }],
    },
    expectedRoles: ["subheadline", "headline", "copy"],
    componentPath: "src/lib/site-admin/sections/faq_accordion/Component.tsx",
  },
  {
    sectionTypeKey: "pricing_grid",
    props: {
      eyebrow: "Plans",
      headline: "Choose your package",
      intro: "Simple pricing with clear coverage.",
      plans: [
        {
          name: "Core",
          price: "$199",
          features: ["Coverage"],
          ctaLabel: "Start",
          ctaHref: "/book",
        },
      ],
    },
    expectedRoles: ["subheadline", "headline", "copy"],
    componentPath: "src/lib/site-admin/sections/pricing_grid/Component.tsx",
  },
  {
    sectionTypeKey: "logo_cloud",
    props: {
      eyebrow: "Trusted by",
      headline: "Operators and brands",
      logos: [
        { imageUrl: "https://example.com/a.png", alt: "A" },
        { imageUrl: "https://example.com/b.png", alt: "B" },
      ],
    },
    expectedRoles: ["subheadline", "headline"],
    componentPath: "src/lib/site-admin/sections/logo_cloud/Component.tsx",
  },
  {
    sectionTypeKey: "team_grid",
    props: {
      eyebrow: "Team",
      headline: "People behind the work",
      intro: "A small, focused production team.",
      members: [{ name: "Ari" }],
    },
    expectedRoles: ["subheadline", "headline", "copy"],
    componentPath: "src/lib/site-admin/sections/team_grid/Component.tsx",
  },
  {
    sectionTypeKey: "event_listing",
    props: {
      eyebrow: "Calendar",
      headline: "Upcoming events",
      events: [{ date: "May 20", title: "Launch event" }],
    },
    expectedRoles: ["subheadline", "headline"],
    componentPath: "src/lib/site-admin/sections/event_listing/Component.tsx",
  },
  {
    sectionTypeKey: "content_tabs",
    props: {
      eyebrow: "Highlights",
      headline: "What we cover",
      tabs: [
        { label: "Planning", body: "Planning details" },
        { label: "Delivery", body: "Delivery details" },
      ],
    },
    expectedRoles: ["subheadline", "headline"],
    componentPath: "src/lib/site-admin/sections/content_tabs/Component.tsx",
  },
  {
    sectionTypeKey: "process_steps",
    props: {
      eyebrow: "Process",
      headline: "How we work",
      copy: "A clear three-step flow.",
      steps: [{ label: "Brief" }, { label: "Deliver" }],
    },
    expectedRoles: ["subheadline", "headline", "copy"],
    componentPath: "src/lib/site-admin/sections/process_steps/Component.tsx",
  },
  {
    sectionTypeKey: "destinations_mosaic",
    props: {
      eyebrow: "Destinations",
      headline: "From jungle to coast",
      copy: "Global destination coverage.",
      items: [{ label: "Tulum" }, { label: "Milan" }],
    },
    expectedRoles: ["subheadline", "headline", "copy"],
    componentPath: "src/lib/site-admin/sections/destinations_mosaic/Component.tsx",
  },
  {
    sectionTypeKey: "stats",
    props: {
      eyebrow: "Numbers",
      headline: "Impact in production",
      items: [
        { value: "48h", label: "Turnaround" },
        { value: "120+", label: "Campaign days" },
      ],
    },
    expectedRoles: ["subheadline", "headline"],
    componentPath: "src/lib/site-admin/sections/stats/Component.tsx",
  },
  {
    sectionTypeKey: "timeline",
    props: {
      eyebrow: "Roadmap",
      headline: "How each launch runs",
      items: [{ date: "Week 1", title: "Planning" }],
    },
    expectedRoles: ["subheadline", "headline"],
    componentPath: "src/lib/site-admin/sections/timeline/Component.tsx",
  },
  {
    sectionTypeKey: "values_trio",
    props: {
      eyebrow: "Values",
      headline: "What guides our work",
      items: [{ title: "Clarity" }, { title: "Craft" }],
    },
    expectedRoles: ["subheadline", "headline"],
    componentPath: "src/lib/site-admin/sections/values_trio/Component.tsx",
  },
  {
    sectionTypeKey: "comparison_table",
    props: {
      eyebrow: "Plans",
      headline: "Compare offers",
      intro: "Choose the right package.",
      columns: [{ label: "Core" }, { label: "Pro" }],
      rows: [{ feature: "Support", values: ["yes", "yes"] }],
    },
    expectedRoles: ["subheadline", "headline", "copy"],
    componentPath: "src/lib/site-admin/sections/comparison_table/Component.tsx",
  },
  {
    sectionTypeKey: "hero_split",
    props: {
      eyebrow: "Featured",
      headline: "Book faster with curated talent",
      subheadline: "Structured booking support across your campaign timeline.",
      primaryCta: { label: "Start booking", href: "/book" },
      secondaryCta: { label: "Browse roster", href: "/directory" },
      imageUrl: "https://example.com/hero.jpg",
      variant: "asymmetric",
      side: "media-right",
    },
    expectedRoles: ["subheadline", "headline", "copy", "primaryCta", "secondaryCta"],
    componentPath: "src/lib/site-admin/sections/hero_split/Component.tsx",
  },
  {
    sectionTypeKey: "image_copy_alternating",
    props: {
      eyebrow: "Services",
      headline: "How we support each production",
      items: [{ title: "Planning" }],
    },
    expectedRoles: ["subheadline", "headline"],
    componentPath: "src/lib/site-admin/sections/image_copy_alternating/Component.tsx",
  },
  {
    sectionTypeKey: "split_screen",
    props: {
      eyebrow: "Narrative",
      headline: "Tell the brand story",
      body: "A flexible split layout with editorial copy.",
      primaryCta: { label: "Start", href: "/start" },
      secondaryCta: { label: "Learn", href: "/learn" },
      imageUrl: "https://example.com/split.jpg",
      side: "image-left",
      variant: "50-50",
      verticalAlign: "center",
      stickyMedia: false,
    },
    expectedRoles: ["subheadline", "headline", "copy", "primaryCta", "secondaryCta"],
    componentPath: "src/lib/site-admin/sections/split_screen/Component.tsx",
  },
  {
    sectionTypeKey: "before_after",
    props: {
      eyebrow: "Transformation",
      headline: "Before and after",
      beforeUrl: "https://example.com/before.jpg",
      afterUrl: "https://example.com/after.jpg",
    },
    expectedRoles: ["subheadline", "headline"],
    componentPath: "src/lib/site-admin/sections/before_after/Component.tsx",
  },
  {
    sectionTypeKey: "blank_section",
    props: {},
    expectedRoles: [],
    componentPath: "src/lib/site-admin/sections/blank_section/Component.tsx",
  },
  {
    sectionTypeKey: "booking_widget",
    props: {
      eyebrow: "Booking",
      headline: "Book a call",
      intro: "Select a time that works for your team.",
      url: "https://calendly.com/demo/session",
      variant: "button",
      buttonLabel: "Book now",
    },
    expectedRoles: ["subheadline", "headline", "copy", "primaryCta"],
    componentPath: "src/lib/site-admin/sections/booking_widget/Component.tsx",
  },
  {
    sectionTypeKey: "lookbook",
    props: {
      eyebrow: "Editorial",
      headline: "Campaign lookbook",
      pages: [
        { imageUrl: "https://example.com/1.jpg" },
        { imageUrl: "https://example.com/2.jpg" },
      ],
    },
    expectedRoles: ["subheadline", "headline"],
    componentPath: "src/lib/site-admin/sections/lookbook/Component.tsx",
  },
  {
    sectionTypeKey: "magazine_layout",
    props: {
      eyebrow: "Editorial",
      headline: "Campaign stories",
      hero: { title: "Lead story" },
      secondary: [{ title: "Frame one" }, { title: "Frame two" }],
    },
    expectedRoles: ["subheadline", "headline"],
    componentPath: "src/lib/site-admin/sections/magazine_layout/Component.tsx",
  },
  {
    sectionTypeKey: "map_overlay",
    props: {
      eyebrow: "Visit",
      headline: "Find us",
      mapEmbedUrl: "https://www.google.com/maps/embed?pb=demo",
      card: {
        title: "Studio",
        body: "By appointment only.",
      },
      side: "card-left",
      ratio: "16/9",
    },
    expectedRoles: ["subheadline", "headline", "copy"],
    componentPath: "src/lib/site-admin/sections/map_overlay/Component.tsx",
  },
  {
    sectionTypeKey: "press_strip",
    props: {
      eyebrow: "As seen in",
      items: [{ name: "Vogue" }],
      variant: "text-italic-serif",
    },
    expectedRoles: ["subheadline"],
    componentPath: "src/lib/site-admin/sections/press_strip/Component.tsx",
  },
  {
    sectionTypeKey: "masonry",
    props: {
      eyebrow: "Portfolio",
      headline: "Recent campaign frames",
      items: [
        { src: "https://example.com/1.jpg" },
        { src: "https://example.com/2.jpg" },
      ],
      columnsDesktop: 3,
      gap: "standard",
    },
    expectedRoles: ["subheadline", "headline"],
    componentPath: "src/lib/site-admin/sections/masonry/Component.tsx",
  },
  {
    sectionTypeKey: "sticky_scroll",
    props: {
      eyebrow: "Process",
      headline: "How launches unfold",
      imageUrl: "https://example.com/photo.jpg",
      blocks: [{ title: "Brief", body: "Plan scope." }, { title: "Ship", body: "Go live." }],
      side: "media-left",
      variant: "minimal",
    },
    expectedRoles: ["subheadline", "headline"],
    componentPath: "src/lib/site-admin/sections/sticky_scroll/Component.tsx",
  },
  {
    sectionTypeKey: "scroll_carousel",
    props: {
      eyebrow: "Highlights",
      headline: "Stories in motion",
      slides: [{ title: "One" }, { title: "Two" }],
      cardWidthVw: 28,
      showProgress: true,
    },
    expectedRoles: ["subheadline", "headline"],
    componentPath: "src/lib/site-admin/sections/scroll_carousel/Component.tsx",
  },
  {
    sectionTypeKey: "lottie",
    props: {
      eyebrow: "Animation",
      headline: "Motion storytelling",
      caption: "A lightweight animated explainer.",
      src: "https://lottie.host/abc.json",
      trigger: "autoplay",
      loop: true,
      speed: 1,
      ratio: "1/1",
      maxWidth: 480,
    },
    expectedRoles: ["subheadline", "headline", "copy"],
    componentPath: "src/lib/site-admin/sections/lottie/Component.tsx",
  },
  {
    sectionTypeKey: "video_reel",
    props: {
      eyebrow: "Highlights",
      headline: "Campaign reel",
      videoUrl: "https://example.com/reel.mp4",
      ratio: "16/9",
      controls: true,
      loop: false,
      muted: false,
      autoplay: false,
    },
    expectedRoles: ["subheadline", "headline"],
    componentPath: "src/lib/site-admin/sections/video_reel/Component.tsx",
  },
  {
    sectionTypeKey: "image_orbit",
    props: {
      eyebrow: "Breakdown",
      headline: "Tagged composition",
      imageUrl: "https://example.com/orbit.jpg",
      tags: [{ x: 30, y: 40, label: "Wardrobe" }],
      ratio: "4/3",
    },
    expectedRoles: ["subheadline", "headline"],
    componentPath: "src/lib/site-admin/sections/image_orbit/Component.tsx",
  },
  {
    sectionTypeKey: "testimonials_trio",
    props: {
      eyebrow: "Client voices",
      headline: "Loved by clients",
    },
    expectedRoles: ["subheadline", "headline"],
    componentPath: "src/lib/site-admin/sections/testimonials_trio/Component.tsx",
  },
  {
    sectionTypeKey: "gallery_strip",
    props: {
      eyebrow: "Portfolio",
      headline: "Gallery",
      caption: "Caption copy",
    },
    expectedRoles: ["subheadline", "headline", "copy"],
    componentPath: "src/lib/site-admin/sections/gallery_strip/Component.tsx",
  },
  {
    sectionTypeKey: "trust_strip",
    props: {
      eyebrow: "Proof points",
      headline: "Trusted by global teams",
    },
    expectedRoles: ["subheadline", "headline"],
    componentPath: "src/lib/site-admin/sections/trust_strip/Component.tsx",
  },
  {
    sectionTypeKey: "code_embed",
    props: {
      eyebrow: "Watch",
      headline: "Product walkthrough",
      caption: "Embedded from an allow-listed host.",
      url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      ratio: "16/9",
      title: "Embedded content",
    },
    expectedRoles: ["subheadline", "headline", "copy"],
    componentPath: "src/lib/site-admin/sections/code_embed/Component.tsx",
  },
  {
    sectionTypeKey: "blog_index",
    props: {
      eyebrow: "Journal",
      headline: "Latest stories",
      posts: [{ title: "Post 1", href: "/journal/post-1" }],
      variant: "cards",
      columnsDesktop: 3,
    },
    expectedRoles: ["subheadline", "headline"],
    componentPath: "src/lib/site-admin/sections/blog_index/Component.tsx",
  },
  {
    sectionTypeKey: "donation_form",
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
    expectedRoles: ["subheadline", "headline", "copy", "primaryCta"],
    componentPath: "src/lib/site-admin/sections/donation_form/Component.tsx",
  },
  {
    sectionTypeKey: "code_snippet",
    props: {
      eyebrow: "Dev notes",
      headline: "Implementation snippet",
      filename: "snippet.ts",
      language: "ts",
      code: "export const x = 1;",
      showLineNumbers: true,
      showCopyButton: true,
      variant: "dark",
    },
    expectedRoles: ["subheadline", "headline"],
    componentPath: "src/lib/site-admin/sections/code_snippet/Component.tsx",
  },
  {
    sectionTypeKey: "blog_detail",
    props: {
      category: "Journal",
      date: "May 2026",
      title: "Behind the campaign",
      byline: "By Studio Team",
      body: "Body copy",
    },
    expectedRoles: ["subheadline", "headline", "copy"],
    componentPath: "src/lib/site-admin/sections/blog_detail/Component.tsx",
  },
  {
    sectionTypeKey: "site_header",
    props: {
      brand: { label: "Impronta", href: "/" },
      navItems: [{ label: "Home", href: "/" }],
      primaryCta: { label: "Book now", href: "/book" },
      sticky: true,
      tone: "surface",
      variant: "standard",
      authArea: { showAccountMenu: true, showLanguageToggle: true, showDiscoveryTools: true },
    },
    expectedRoles: ["headline", "primaryCta"],
    componentPath: "src/lib/site-admin/sections/site_header/Component.tsx",
  },
  {
    sectionTypeKey: "site_footer",
    props: {
      brand: { label: "Impronta", tagline: "Built for global operators" },
      columns: [],
      social: [],
      legal: { links: [] },
      variant: "standard",
      tone: "follow",
    },
    expectedRoles: ["headline", "copy"],
    componentPath: "src/lib/site-admin/sections/site_footer/Component.tsx",
  },
  {
    sectionTypeKey: "anchor_nav",
    props: {
      links: [
        { label: "About", href: "#about" },
        { label: "Services", href: "#services" },
      ],
      variant: "pills",
      sticky: false,
      align: "center",
    },
    expectedRoles: [],
    componentPath: "src/lib/site-admin/sections/anchor_nav/Component.tsx",
  },
  {
    sectionTypeKey: "marquee",
    props: {
      items: [{ text: "Now booking" }, { text: "Global coverage" }],
      speed: "medium",
      direction: "left",
      separator: "dot",
      variant: "text",
    },
    expectedRoles: [],
    componentPath: "src/lib/site-admin/sections/marquee/Component.tsx",
  },
];

test("derived child roles stay in sync with renderer bindings", () => {
  for (const c of CASES) {
    const tree = buildLegacySectionBuilderTree([
      {
        slotKey: "body",
        sortOrder: 0,
        sectionId: "11111111-1111-4111-8111-111111111111",
        sectionTypeKey: c.sectionTypeKey,
        name: c.sectionTypeKey,
        props: c.props,
      },
    ]);
    const sectionNode = tree[0];
    assert.equal(sectionNode?.kind, "section");
    if (sectionNode?.kind !== "section") continue;
    const childIds = (sectionNode.children ?? []).map((node) => node.id);
    const result = buildBuilderNodeRoleBindings(childIds);
    assert.equal(
      result.unknownNodeIds.length,
      0,
      `${c.sectionTypeKey}: unknown child node ids ${result.unknownNodeIds.join(", ")}`,
    );
    const actualRoles = Object.keys(result.nodeIdsByRole).sort();
    const expectedRoles = [...c.expectedRoles].sort();
    assert.deepEqual(
      actualRoles,
      expectedRoles,
      `${c.sectionTypeKey}: derived roles mismatch`,
    );

    const source = readFileSync(path.resolve(process.cwd(), c.componentPath), "utf8");
    for (const role of c.expectedRoles) {
      assert.ok(
        source.includes(`nodeIdsByRole?.${role}`),
        `${c.sectionTypeKey}: renderer missing nodeIdsByRole binding for "${role}"`,
      );
    }
  }
});

test("binding CASES cover every registered section type key", () => {
  const registered = registeredSectionTypeKeys();
  const covered = [...new Set(CASES.map((c) => c.sectionTypeKey))].sort();
  assert.deepEqual(
    covered,
    registered,
    `Binding cases drifted.\nMissing in CASES: ${registered.filter((key) => !covered.includes(key)).join(", ")}\nUnexpected in CASES: ${covered.filter((key) => !registered.includes(key)).join(", ")}`,
  );
});

test("style-panel role map covers every registered section type key", () => {
  const stylePanelPath = path.resolve(
    process.cwd(),
    "src/components/edit-chrome/inspectors/style-panel.tsx",
  );
  const source = readFileSync(stylePanelPath, "utf8");
  const styleKeys = [...source.matchAll(/^\s{2}([a-z0-9_]+): \[/gm)].map(
    (match) => match[1] as string,
  );
  const registered = registeredSectionTypeKeys();
  const missing = registered.filter((key) => !styleKeys.includes(key));
  assert.deepEqual(
    missing,
    [],
    `Style panel missing section keys: ${missing.join(", ")}`,
  );
});

test("legacy child-node derivation handles every registered section type key", () => {
  const legacyPath = path.resolve(
    process.cwd(),
    "src/lib/site-admin/builder-node/snapshot-slot-bridge.ts",
  );
  const source = readFileSync(legacyPath, "utf8");
  const handledKeys = [...source.matchAll(/slot\.sectionTypeKey === "([a-z0-9_]+)"/g)].map(
    (match) => match[1] as string,
  );
  const registered = registeredSectionTypeKeys();
  const missing = registered.filter((key) => !handledKeys.includes(key));
  assert.deepEqual(
    missing,
    [],
    `Legacy section child-node derivation missing keys: ${missing.join(", ")}`,
  );
});
