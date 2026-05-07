import assert from "node:assert/strict";
import { test } from "node:test";

import { heroSchemaV1 } from "./hero/schema";
import { categoryGridSchemaV1 } from "./category_grid/schema";
import { contactFormSchemaV1 } from "./contact_form/schema";
import { ctaBannerSchemaV1 } from "./cta_banner/schema";
import { contentTabsSchemaV1 } from "./content_tabs/schema";
import { faqAccordionSchemaV1 } from "./faq_accordion/schema";
import { featuredTalentSchemaV1 } from "./featured_talent/schema";
import { eventListingSchemaV1 } from "./event_listing/schema";
import { logoCloudSchemaV1 } from "./logo_cloud/schema";
import { pricingGridSchemaV1 } from "./pricing_grid/schema";
import { processStepsSchemaV1 } from "./process_steps/schema";
import { destinationsMosaicSchemaV1 } from "./destinations_mosaic/schema";
import { statsSchemaV1 } from "./stats/schema";
import { timelineSchemaV1 } from "./timeline/schema";
import { valuesTrioSchemaV1 } from "./values_trio/schema";
import { comparisonTableSchemaV1 } from "./comparison_table/schema";
import { heroSplitSchemaV1 } from "./hero_split/schema";
import { imageCopyAlternatingSchemaV1 } from "./image_copy_alternating/schema";
import { splitScreenSchemaV1 } from "./split_screen/schema";
import { beforeAfterSchemaV1 } from "./before_after/schema";
import { bookingWidgetSchemaV1 } from "./booking_widget/schema";
import { lookbookSchemaV1 } from "./lookbook/schema";
import { magazineLayoutSchemaV1 } from "./magazine_layout/schema";
import { mapOverlaySchemaV1 } from "./map_overlay/schema";
import { pressStripSchemaV1 } from "./press_strip/schema";
import { masonrySchemaV1 } from "./masonry/schema";
import { stickyScrollSchemaV1 } from "./sticky_scroll/schema";
import { scrollCarouselSchemaV1 } from "./scroll_carousel/schema";
import { lottieSchemaV1 } from "./lottie/schema";
import { videoReelSchemaV1 } from "./video_reel/schema";
import { imageOrbitSchemaV1 } from "./image_orbit/schema";
import { teamGridSchemaV1 } from "./team_grid/schema";
import { testimonialsTrioSchemaV1 } from "./testimonials_trio/schema";
import { gallerySchemaV1 } from "./gallery_strip/schema";
import { trustStripSchemaV1 } from "./trust_strip/schema";
import { codeEmbedSchemaV1 } from "./code_embed/schema";
import { blogIndexSchemaV1 } from "./blog_index/schema";
import { donationFormSchemaV1 } from "./donation_form/schema";
import { codeSnippetSchemaV1 } from "./code_snippet/schema";
import { blogDetailSchemaV1 } from "./blog_detail/schema";
import { siteHeaderSchemaV1 } from "./site_header/schema";
import { siteFooterSchemaV1 } from "./site_footer/schema";

test("hero schema accepts nodePresentation overrides for child nodes", () => {
  const result = heroSchemaV1.safeParse({
    headline: "Design-led weddings, delivered fast",
    subheadline: "A focused creative roster with global availability",
    nodePresentation: {
      headline: {
        align: "left",
        maxWidthPx: 720,
        marginTopPx: 16,
        marginBottomPx: 20,
        marginInlinePx: 18,
        marginLeftPx: 10,
        marginRightPx: 14,
        paddingTopPx: 8,
        paddingBottomPx: 10,
        paddingInlinePx: 16,
        paddingLeftPx: 6,
        paddingRightPx: 8,
        size: "xl",
        tone: "strong",
        visibility: "visible",
      },
      subheadline: {
        align: "left",
        maxWidthPx: 640,
        marginBottomPx: 12,
        marginInlinePx: 10,
        paddingInlinePx: 14,
        size: "lg",
        tone: "muted",
      },
      primaryCta: {
        align: "left",
        size: "lg",
        marginTopPx: 8,
        visibility: "visible",
      },
      secondaryCta: { align: "left", size: "md" },
    },
  });
  assert.equal(result.success, true);
});

test("hero schema accepts responsive nodePresentation breakpoint overrides", () => {
  const result = heroSchemaV1.safeParse({
    headline: "Design-led weddings, delivered fast",
    nodePresentation: {
      headline: {
        size: "xl",
        breakpoints: {
          tablet: { size: "lg", maxWidthPx: 640, marginBottomPx: 16 },
          mobile: {
            size: "sm",
            align: "left",
            marginTopPx: 8,
            marginInlinePx: 8,
            marginLeftPx: 4,
            marginRightPx: 6,
            paddingBottomPx: 6,
            paddingLeftPx: 4,
            paddingRightPx: 6,
            visibility: "hidden",
          },
        },
      },
    },
  });
  assert.equal(result.success, true);
});

test("hero schema rejects out-of-range nodePresentation maxWidthPx", () => {
  const result = heroSchemaV1.safeParse({
    headline: "Hello",
    nodePresentation: {
      headline: { maxWidthPx: 40 },
    },
  });
  assert.equal(result.success, false);
});

test("cta banner schema accepts nodePresentation for eyebrow/headline/copy/ctas", () => {
  const result = ctaBannerSchemaV1.safeParse({
    eyebrow: "Ready when you are",
    headline: "Ready to book your dream team?",
    copy: "Check availability and secure your date in one step.",
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "center", size: "xl" },
      copy: {
        maxWidthPx: 560,
        marginBottomPx: 10,
        marginInlinePx: 16,
        paddingTopPx: 6,
        tone: "muted",
        visibility: "visible",
      },
      primaryCta: { size: "lg", align: "center" },
      secondaryCta: { size: "md", align: "center" },
    },
  });
  assert.equal(result.success, true);
});

test("cta banner schema rejects invalid nodePresentation enum values", () => {
  const result = ctaBannerSchemaV1.safeParse({
    headline: "Hello",
    nodePresentation: {
      copy: {
        tone: "vivid",
      },
    },
  });
  assert.equal(result.success, false);
});

test("featured talent schema accepts nodePresentation for copy + footerCta", () => {
  const result = featuredTalentSchemaV1.safeParse({
    eyebrow: "Featured now",
    headline: "Featured professionals",
    sourceMode: "auto_featured_flag",
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg" },
      copy: {
        align: "left",
        tone: "muted",
        maxWidthPx: 520,
        marginTopPx: 14,
        marginInlinePx: 14,
        paddingInlinePx: 12,
      },
      footerCta: { align: "right", size: "sm", visibility: "hidden" },
    },
  });
  assert.equal(result.success, true);
});

test("featured talent schema rejects invalid nodePresentation maxWidthPx", () => {
  const result = featuredTalentSchemaV1.safeParse({
    sourceMode: "auto_featured_flag",
    nodePresentation: {
      copy: { maxWidthPx: 2200 },
    },
  });
  assert.equal(result.success, false);
});

test("category grid schema accepts eyebrow/headline/copy/footerCta nodePresentation", () => {
  const result = categoryGridSchemaV1.safeParse({
    items: [{ label: "Photography" }],
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 640 },
      copy: {
        align: "left",
        tone: "muted",
        maxWidthPx: 520,
        marginTopPx: 10,
        paddingInlinePx: 8,
      },
      footerCta: { align: "right", size: "sm", marginTopPx: 12 },
    },
  });
  assert.equal(result.success, true);
});

test("contact form schema accepts eyebrow/headline/copy/primaryCta nodePresentation", () => {
  const result = contactFormSchemaV1.safeParse({
    eyebrow: "Let's connect",
    headline: "Tell us about your project",
    intro: "Share your timeline and goals.",
    submitLabel: "Send request",
    action: "/api/cms/forms/submit",
    fields: [{ name: "name", label: "Name", type: "text", required: true }],
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 640 },
      copy: {
        align: "left",
        tone: "muted",
        maxWidthPx: 520,
        marginTopPx: 10,
      },
      primaryCta: { align: "right", size: "sm", marginTopPx: 12 },
    },
  });
  assert.equal(result.success, true);
});

test("faq accordion schema accepts eyebrow/headline/copy nodePresentation", () => {
  const result = faqAccordionSchemaV1.safeParse({
    eyebrow: "FAQ",
    headline: "Answers to common questions",
    intro: "Everything you need before booking.",
    items: [{ question: "How fast?", answer: "Usually within 24h." }],
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 640 },
      copy: { align: "left", tone: "muted", maxWidthPx: 520, marginTopPx: 10 },
    },
  });
  assert.equal(result.success, true);
});

test("pricing grid schema accepts eyebrow/headline/copy nodePresentation", () => {
  const result = pricingGridSchemaV1.safeParse({
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
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 640 },
      copy: { align: "left", tone: "muted", maxWidthPx: 520, marginTopPx: 10 },
    },
  });
  assert.equal(result.success, true);
});

test("logo cloud schema accepts eyebrow/headline nodePresentation", () => {
  const result = logoCloudSchemaV1.safeParse({
    eyebrow: "Trusted by",
    headline: "Operators and brands",
    logos: [
      { imageUrl: "https://example.com/a.png", alt: "A" },
      { imageUrl: "https://example.com/b.png", alt: "B" },
    ],
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 640 },
    },
  });
  assert.equal(result.success, true);
});

test("team grid schema accepts eyebrow/headline/copy nodePresentation", () => {
  const result = teamGridSchemaV1.safeParse({
    eyebrow: "Team",
    headline: "People behind the work",
    intro: "A small, focused team.",
    members: [{ name: "Ari" }],
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 640 },
      copy: { align: "left", tone: "muted", maxWidthPx: 520 },
    },
  });
  assert.equal(result.success, true);
});

test("event listing schema accepts eyebrow/headline nodePresentation", () => {
  const result = eventListingSchemaV1.safeParse({
    eyebrow: "Calendar",
    headline: "Upcoming events",
    events: [{ date: "May 20", title: "Launch" }],
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 640 },
    },
  });
  assert.equal(result.success, true);
});

test("content tabs schema accepts eyebrow/headline nodePresentation", () => {
  const result = contentTabsSchemaV1.safeParse({
    eyebrow: "Highlights",
    headline: "What we cover",
    tabs: [
      { label: "Planning", body: "Planning details." },
      { label: "Delivery", body: "Delivery details." },
    ],
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 640 },
    },
  });
  assert.equal(result.success, true);
});

test("process steps schema accepts eyebrow/headline/copy nodePresentation", () => {
  const result = processStepsSchemaV1.safeParse({
    eyebrow: "Process",
    headline: "How we work",
    copy: "A clear three-step flow.",
    steps: [{ label: "Brief" }, { label: "Deliver" }],
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 640 },
      copy: { align: "left", tone: "muted", maxWidthPx: 520 },
    },
  });
  assert.equal(result.success, true);
});

test("destinations mosaic schema accepts eyebrow/headline/copy nodePresentation", () => {
  const result = destinationsMosaicSchemaV1.safeParse({
    eyebrow: "Destinations",
    headline: "From jungle to coast",
    copy: "Global destination coverage.",
    items: [{ label: "Tulum" }, { label: "Milan" }],
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 640 },
      copy: { align: "left", tone: "muted", maxWidthPx: 520 },
    },
  });
  assert.equal(result.success, true);
});

test("stats schema accepts eyebrow/headline nodePresentation", () => {
  const result = statsSchemaV1.safeParse({
    eyebrow: "Numbers",
    headline: "Impact in production",
    items: [
      { value: "48h", label: "Turnaround" },
      { value: "120+", label: "Campaign days" },
    ],
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 640 },
    },
  });
  assert.equal(result.success, true);
});

test("timeline schema accepts eyebrow/headline nodePresentation", () => {
  const result = timelineSchemaV1.safeParse({
    eyebrow: "Roadmap",
    headline: "How each launch runs",
    items: [{ date: "Week 1", title: "Planning" }],
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 640 },
    },
  });
  assert.equal(result.success, true);
});

test("values trio schema accepts eyebrow/headline nodePresentation", () => {
  const result = valuesTrioSchemaV1.safeParse({
    eyebrow: "Values",
    headline: "What guides our work",
    items: [{ title: "Clarity" }, { title: "Craft" }],
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 640 },
    },
  });
  assert.equal(result.success, true);
});

test("comparison table schema accepts eyebrow/headline/copy nodePresentation", () => {
  const result = comparisonTableSchemaV1.safeParse({
    eyebrow: "Plans",
    headline: "Compare offers",
    intro: "Choose the right package.",
    columns: [{ label: "Core" }, { label: "Pro" }],
    rows: [{ feature: "Support", values: ["yes", "yes"] }],
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 640 },
      copy: { align: "left", tone: "muted", maxWidthPx: 520 },
    },
  });
  assert.equal(result.success, true);
});

test("hero split schema accepts eyebrow/headline/copy/cta nodePresentation", () => {
  const result = heroSplitSchemaV1.safeParse({
    eyebrow: "Featured",
    headline: "Book faster with curated talent",
    subheadline: "Structured booking support across your campaign timeline.",
    primaryCta: { label: "Start booking", href: "/book" },
    secondaryCta: { label: "Browse roster", href: "/directory" },
    imageUrl: "https://example.com/hero.jpg",
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 640 },
      copy: { align: "left", tone: "muted", maxWidthPx: 520 },
      primaryCta: { align: "left", size: "lg" },
      secondaryCta: { align: "left", size: "sm" },
    },
  });
  assert.equal(result.success, true);
});

test("image copy alternating schema accepts eyebrow/headline nodePresentation", () => {
  const result = imageCopyAlternatingSchemaV1.safeParse({
    eyebrow: "Services",
    headline: "How we support each production",
    items: [{ title: "Planning" }],
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 640 },
    },
  });
  assert.equal(result.success, true);
});

test("split screen schema accepts eyebrow/headline/copy/cta nodePresentation", () => {
  const result = splitScreenSchemaV1.safeParse({
    eyebrow: "Narrative",
    headline: "Tell the brand story",
    body: "A flexible split layout with editorial copy.",
    primaryCta: { label: "Start", href: "/start" },
    secondaryCta: { label: "Learn", href: "/learn" },
    imageUrl: "https://example.com/split.jpg",
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 640 },
      copy: { align: "left", tone: "muted", maxWidthPx: 520 },
      primaryCta: { align: "left", size: "lg" },
      secondaryCta: { align: "left", size: "sm" },
    },
  });
  assert.equal(result.success, true);
});

test("before after schema accepts eyebrow/headline nodePresentation", () => {
  const result = beforeAfterSchemaV1.safeParse({
    eyebrow: "Transformation",
    headline: "Before and after",
    beforeUrl: "https://example.com/before.jpg",
    afterUrl: "https://example.com/after.jpg",
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 640 },
    },
  });
  assert.equal(result.success, true);
});

test("booking widget schema accepts eyebrow/headline/copy/cta nodePresentation", () => {
  const result = bookingWidgetSchemaV1.safeParse({
    eyebrow: "Booking",
    headline: "Book a call",
    intro: "Select a time that works for your team.",
    url: "https://calendly.com/demo/session",
    variant: "button",
    buttonLabel: "Book now",
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 640 },
      copy: { align: "left", tone: "muted", maxWidthPx: 520 },
      primaryCta: { align: "left", size: "lg" },
    },
  });
  assert.equal(result.success, true);
});

test("lookbook schema accepts eyebrow/headline nodePresentation", () => {
  const result = lookbookSchemaV1.safeParse({
    eyebrow: "Editorial",
    headline: "Campaign lookbook",
    pages: [
      { imageUrl: "https://example.com/1.jpg" },
      { imageUrl: "https://example.com/2.jpg" },
    ],
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 640 },
    },
  });
  assert.equal(result.success, true);
});

test("magazine layout schema accepts eyebrow/headline nodePresentation", () => {
  const result = magazineLayoutSchemaV1.safeParse({
    eyebrow: "Editorial",
    headline: "Campaign stories",
    hero: { title: "Lead story" },
    secondary: [{ title: "Frame one" }, { title: "Frame two" }],
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 640 },
    },
  });
  assert.equal(result.success, true);
});

test("map overlay schema accepts eyebrow/headline/copy nodePresentation", () => {
  const result = mapOverlaySchemaV1.safeParse({
    eyebrow: "Visit",
    headline: "Find our studio",
    mapEmbedUrl: "https://www.google.com/maps/embed?pb=demo",
    card: {
      title: "Studio",
      body: "By appointment only.",
    },
    side: "card-left",
    ratio: "16/9",
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 640 },
      copy: { align: "left", tone: "muted", maxWidthPx: 520 },
    },
  });
  assert.equal(result.success, true);
});

test("press strip schema accepts eyebrow nodePresentation", () => {
  const result = pressStripSchemaV1.safeParse({
    eyebrow: "As seen in",
    items: [{ name: "Vogue" }],
    variant: "text-italic-serif",
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
    },
  });
  assert.equal(result.success, true);
});

test("masonry schema accepts eyebrow/headline nodePresentation", () => {
  const result = masonrySchemaV1.safeParse({
    eyebrow: "Portfolio",
    headline: "Recent campaign frames",
    items: [
      { src: "https://example.com/1.jpg" },
      { src: "https://example.com/2.jpg" },
    ],
    columnsDesktop: 3,
    gap: "standard",
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 640 },
    },
  });
  assert.equal(result.success, true);
});

test("sticky scroll schema accepts eyebrow/headline nodePresentation", () => {
  const result = stickyScrollSchemaV1.safeParse({
    eyebrow: "Process",
    headline: "How launches unfold",
    imageUrl: "https://example.com/photo.jpg",
    blocks: [{ title: "Brief", body: "Plan scope." }, { title: "Ship", body: "Go live." }],
    side: "media-left",
    variant: "minimal",
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 640 },
    },
  });
  assert.equal(result.success, true);
});

test("scroll carousel schema accepts eyebrow/headline nodePresentation", () => {
  const result = scrollCarouselSchemaV1.safeParse({
    eyebrow: "Highlights",
    headline: "Stories in motion",
    slides: [{ title: "One" }, { title: "Two" }],
    cardWidthVw: 28,
    showProgress: true,
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 640 },
    },
  });
  assert.equal(result.success, true);
});

test("lottie schema accepts eyebrow/headline/copy nodePresentation", () => {
  const result = lottieSchemaV1.safeParse({
    eyebrow: "Animation",
    headline: "Motion storytelling",
    caption: "A lightweight animated explainer.",
    src: "https://lottie.host/abc.json",
    trigger: "autoplay",
    loop: true,
    speed: 1,
    ratio: "1/1",
    maxWidth: 480,
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 640 },
      copy: { align: "left", tone: "muted", maxWidthPx: 520 },
    },
  });
  assert.equal(result.success, true);
});

test("video reel schema accepts eyebrow/headline nodePresentation", () => {
  const result = videoReelSchemaV1.safeParse({
    eyebrow: "Highlights",
    headline: "Campaign reel",
    videoUrl: "https://example.com/reel.mp4",
    ratio: "16/9",
    controls: true,
    loop: false,
    muted: false,
    autoplay: false,
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 640 },
    },
  });
  assert.equal(result.success, true);
});

test("image orbit schema accepts eyebrow/headline nodePresentation", () => {
  const result = imageOrbitSchemaV1.safeParse({
    eyebrow: "Breakdown",
    headline: "Tagged composition",
    imageUrl: "https://example.com/orbit.jpg",
    tags: [{ x: 30, y: 40, label: "Wardrobe" }],
    ratio: "4/3",
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 640 },
    },
  });
  assert.equal(result.success, true);
});

test("testimonials schema accepts eyebrow/headline nodePresentation", () => {
  const result = testimonialsTrioSchemaV1.safeParse({
    items: [{ quote: "Exactly what we needed." }],
    nodePresentation: {
      subheadline: {
        align: "left",
        size: "lg",
        maxWidthPx: 460,
        marginBottomPx: 6,
      },
      headline: {
        align: "left",
        size: "lg",
        maxWidthPx: 600,
        marginBottomPx: 8,
        marginInlinePx: 12,
        paddingBottomPx: 6,
      },
    },
  });
  assert.equal(result.success, true);
});

test("gallery schema accepts eyebrow/headline/copy nodePresentation", () => {
  const result = gallerySchemaV1.safeParse({
    items: [
      { src: "https://example.com/one.jpg" },
      { src: "https://example.com/two.jpg" },
      { src: "https://example.com/three.jpg" },
    ],
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 430 },
      headline: { align: "center", size: "xl" },
      copy: {
        maxWidthPx: 540,
        marginTopPx: 12,
        marginInlinePx: 14,
        paddingInlinePx: 10,
        tone: "muted",
      },
    },
  });
  assert.equal(result.success, true);
});

test("trust strip schema accepts eyebrow/headline nodePresentation", () => {
  const result = trustStripSchemaV1.safeParse({
    eyebrow: "Proof in practice",
    headline: "Trusted by destination operators",
    items: [{ label: "12+ years", detail: "International events" }],
    nodePresentation: {
      subheadline: {
        align: "left",
        maxWidthPx: 420,
        marginBottomPx: 8,
        size: "lg",
        tone: "muted",
      },
      headline: {
        align: "left",
        maxWidthPx: 620,
        marginTopPx: 12,
        marginInlinePx: 10,
        paddingInlinePx: 8,
        size: "lg",
        tone: "strong",
      },
    },
  });
  assert.equal(result.success, true);
});

test("code embed schema accepts eyebrow/headline/copy nodePresentation", () => {
  const result = codeEmbedSchemaV1.safeParse({
    eyebrow: "Watch",
    headline: "Product walkthrough",
    caption: "Embedded from an allow-listed host.",
    url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    ratio: "16/9",
    title: "Embedded content",
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 640 },
      copy: { align: "left", tone: "muted", maxWidthPx: 520 },
    },
  });
  assert.equal(result.success, true);
});

test("blog index schema accepts eyebrow/headline nodePresentation", () => {
  const result = blogIndexSchemaV1.safeParse({
    eyebrow: "Journal",
    headline: "Latest stories",
    posts: [{ title: "Post 1", href: "/journal/post-1" }],
    variant: "cards",
    columnsDesktop: 3,
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 640 },
    },
  });
  assert.equal(result.success, true);
});

test("donation form schema accepts eyebrow/headline/copy/primaryCta nodePresentation", () => {
  const result = donationFormSchemaV1.safeParse({
    eyebrow: "Support",
    headline: "Back this mission",
    intro: "Every contribution helps us deliver more.",
    amounts: [25, 50, 100],
    currency: "USD",
    defaultAmountIndex: 1,
    allowCustom: true,
    checkoutUrl: "https://example.org/donate",
    ctaLabel: "Donate",
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 640 },
      copy: { align: "left", tone: "muted", maxWidthPx: 520 },
      primaryCta: { align: "right", size: "sm", marginTopPx: 12 },
    },
  });
  assert.equal(result.success, true);
});

test("code snippet schema accepts eyebrow/headline nodePresentation", () => {
  const result = codeSnippetSchemaV1.safeParse({
    eyebrow: "Dev notes",
    headline: "Implementation snippet",
    language: "ts",
    code: "export const x = 1;",
    showLineNumbers: true,
    showCopyButton: true,
    variant: "dark",
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 640 },
    },
  });
  assert.equal(result.success, true);
});

test("blog detail schema accepts category/title/byline nodePresentation", () => {
  const result = blogDetailSchemaV1.safeParse({
    category: "Journal",
    date: "May 2026",
    title: "Behind the campaign",
    byline: "By Studio Team",
    body: "Body copy",
    nodePresentation: {
      subheadline: { align: "left", size: "lg", maxWidthPx: 420 },
      headline: { align: "left", size: "lg", maxWidthPx: 700 },
      copy: { align: "left", tone: "muted", maxWidthPx: 520 },
    },
  });
  assert.equal(result.success, true);
});

test("site header schema accepts brand/cta nodePresentation", () => {
  const result = siteHeaderSchemaV1.safeParse({
    brand: { label: "Impronta", href: "/" },
    navItems: [{ label: "Home", href: "/" }],
    primaryCta: { label: "Book now", href: "/book" },
    sticky: true,
    tone: "surface",
    variant: "standard",
    authArea: {
      showAccountMenu: true,
      showLanguageToggle: true,
      showDiscoveryTools: true,
    },
    nodePresentation: {
      headline: { align: "left", size: "lg", maxWidthPx: 320 },
      primaryCta: { size: "sm", marginLeftPx: 8 },
    },
  });
  assert.equal(result.success, true);
});

test("site footer schema accepts brand label/tagline nodePresentation", () => {
  const result = siteFooterSchemaV1.safeParse({
    brand: { label: "Impronta", tagline: "Built for global operators" },
    columns: [],
    social: [],
    legal: { links: [] },
    variant: "standard",
    tone: "follow",
    nodePresentation: {
      headline: { align: "left", size: "lg", maxWidthPx: 320 },
      copy: { align: "left", tone: "muted", maxWidthPx: 480 },
    },
  });
  assert.equal(result.success, true);
});
