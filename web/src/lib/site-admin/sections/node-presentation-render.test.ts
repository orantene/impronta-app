import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { HeroComponent } from "./hero/Component";
import { CategoryGridComponent } from "./category_grid/Component";
import { ContactFormComponent } from "./contact_form/Component";
import { CtaBannerComponent } from "./cta_banner/Component";
import { FaqAccordionComponent } from "./faq_accordion/Component";
import { LogoCloudComponent } from "./logo_cloud/Component";
import { TestimonialsTrioComponent } from "./testimonials_trio/Component";
import { GalleryStripComponent } from "./gallery_strip/Component";
import { PricingGridComponent } from "./pricing_grid/Component";
import { TeamGridComponent } from "./team_grid/Component";
import { EventListingComponent } from "./event_listing/Component";
import { ContentTabsComponent } from "./content_tabs/Component";
import { ProcessStepsComponent } from "./process_steps/Component";
import { DestinationsMosaicComponent } from "./destinations_mosaic/Component";
import { StatsComponent } from "./stats/Component";
import { TimelineComponent } from "./timeline/Component";
import { ValuesTrioComponent } from "./values_trio/Component";
import { ComparisonTableComponent } from "./comparison_table/Component";
import { HeroSplitComponent } from "./hero_split/Component";
import { ImageCopyAlternatingComponent } from "./image_copy_alternating/Component";
import { SplitScreenComponent } from "./split_screen/Component";
import { BeforeAfterComponent } from "./before_after/Component";
import { BookingWidgetComponent } from "./booking_widget/Component";
import { LookbookComponent } from "./lookbook/Component";
import { MagazineLayoutComponent } from "./magazine_layout/Component";
import { MapOverlayComponent } from "./map_overlay/Component";
import { PressStripComponent } from "./press_strip/Component";
import { MasonryComponent } from "./masonry/Component";
import { StickyScrollComponent } from "./sticky_scroll/Component";
import { ScrollCarouselComponent } from "./scroll_carousel/Component";
import { LottieComponent } from "./lottie/Component";
import { VideoReelComponent } from "./video_reel/Component";
import { ImageOrbitComponent } from "./image_orbit/Component";
import { TrustStripComponent } from "./trust_strip/Component";
import { CodeEmbedComponent } from "./code_embed/Component";
import { BlogIndexComponent } from "./blog_index/Component";
import { DonationFormComponent } from "./donation_form/Component";
import { CodeSnippetComponent } from "./code_snippet/Component";
import { BlogDetailComponent } from "./blog_detail/Component";
import { SiteHeaderComponent } from "./site_header/Component";
import { SiteFooterComponent } from "./site_footer/Component";
import type { HeroV1 } from "./hero/schema";
import type { CategoryGridV1 } from "./category_grid/schema";
import type { ContactFormV1 } from "./contact_form/schema";
import type { CtaBannerV1 } from "./cta_banner/schema";
import type { FaqAccordionV1 } from "./faq_accordion/schema";
import type { LogoCloudV1 } from "./logo_cloud/schema";
import type { TestimonialsTrioV1 } from "./testimonials_trio/schema";
import type { GalleryStripV1 } from "./gallery_strip/schema";
import type { PricingGridV1 } from "./pricing_grid/schema";
import type { TeamGridV1 } from "./team_grid/schema";
import type { EventListingV1 } from "./event_listing/schema";
import type { ContentTabsV1 } from "./content_tabs/schema";
import type { ProcessStepsV1 } from "./process_steps/schema";
import type { DestinationsMosaicV1 } from "./destinations_mosaic/schema";
import type { StatsV1 } from "./stats/schema";
import type { TimelineV1 } from "./timeline/schema";
import type { ValuesTrioV1 } from "./values_trio/schema";
import type { ComparisonTableV1 } from "./comparison_table/schema";
import type { HeroSplitV1 } from "./hero_split/schema";
import type { ImageCopyAlternatingV1 } from "./image_copy_alternating/schema";
import type { SplitScreenV1 } from "./split_screen/schema";
import type { BeforeAfterV1 } from "./before_after/schema";
import type { BookingWidgetV1 } from "./booking_widget/schema";
import type { LookbookV1 } from "./lookbook/schema";
import type { MagazineLayoutV1 } from "./magazine_layout/schema";
import type { MapOverlayV1 } from "./map_overlay/schema";
import type { PressStripV1 } from "./press_strip/schema";
import type { MasonryV1 } from "./masonry/schema";
import type { StickyScrollV1 } from "./sticky_scroll/schema";
import type { ScrollCarouselV1 } from "./scroll_carousel/schema";
import type { LottieV1 } from "./lottie/schema";
import type { VideoReelV1 } from "./video_reel/schema";
import type { ImageOrbitV1 } from "./image_orbit/schema";
import type { TrustStripV1 } from "./trust_strip/schema";
import type { CodeEmbedV1 } from "./code_embed/schema";
import type { BlogIndexV1 } from "./blog_index/schema";
import type { DonationFormV1 } from "./donation_form/schema";
import type { CodeSnippetV1 } from "./code_snippet/schema";
import type { BlogDetailV1 } from "./blog_detail/schema";
import type { SiteHeaderV1 } from "./site_header/schema";
import type { SiteFooterV1 } from "./site_footer/schema";

test("hero renderer applies nodePresentation styles to headline/subheadline/ctas", () => {
  const props: HeroV1 = {
    headline: "Editorial teams for destination weddings",
    subheadline: "Book fast with scoped availability and direct confirmation",
    primaryCta: { label: "Start booking", href: { kind: "tenant-page", value: "/book" } },
    secondaryCta: { label: "Explore roster", href: { kind: "tenant-page", value: "/directory" } },
    nodePresentation: {
      headline: {
        align: "left",
        maxWidthPx: 740,
        marginTopPx: 14,
        marginBottomPx: 18,
        marginLeftPx: 12,
        marginRightPx: 20,
        paddingTopPx: 6,
        paddingBottomPx: 8,
        paddingLeftPx: 10,
        paddingRightPx: 14,
        size: "xl",
        tone: "strong",
      },
      subheadline: {
        align: "left",
        maxWidthPx: 620,
        marginBottomPx: 10,
        size: "lg",
        tone: "muted",
      },
      primaryCta: {
        align: "left",
        size: "lg",
        marginTopPx: 6,
        marginLeftPx: 3,
        marginRightPx: 7,
        paddingLeftPx: 16,
        paddingRightPx: 20,
      },
      secondaryCta: {
        align: "left",
        size: "sm",
        marginBottomPx: 4,
        marginInlinePx: 9,
        paddingInlinePx: 14,
      },
    },
    presentation: {},
  };

  const html = renderToStaticMarkup(
    createElement(HeroComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
    }),
  );

  assert.match(html, /site-hero__headline[^>]*text-align:left/);
  assert.match(html, /site-hero__headline[^>]*max-width:740px/);
  assert.match(html, /site-hero__headline[^>]*margin-top:14px/);
  assert.match(html, /site-hero__headline[^>]*margin-bottom:18px/);
  assert.match(html, /site-hero__headline[^>]*margin-left:12px/);
  assert.match(html, /site-hero__headline[^>]*margin-right:20px/);
  assert.match(html, /site-hero__headline[^>]*padding-top:6px/);
  assert.match(html, /site-hero__headline[^>]*padding-bottom:8px/);
  assert.match(html, /site-hero__headline[^>]*padding-left:10px/);
  assert.match(html, /site-hero__headline[^>]*padding-right:14px/);
  assert.match(html, /site-hero__subheadline[^>]*max-width:620px/);
  assert.match(html, /site-hero__subheadline[^>]*margin-bottom:10px/);
  assert.match(html, /site-hero__ctas[^>]*justify-content:flex-start/);
  assert.match(html, /site-hero__cta site-hero__cta--primary[^>]*padding:0.95rem 1.8rem/);
  assert.match(html, /site-hero__cta site-hero__cta--primary[^>]*margin-top:6px/);
  assert.match(html, /site-hero__cta site-hero__cta--primary[^>]*margin-left:3px/);
  assert.match(html, /site-hero__cta site-hero__cta--primary[^>]*margin-right:7px/);
  assert.match(html, /site-hero__cta site-hero__cta--primary[^>]*padding-left:16px/);
  assert.match(html, /site-hero__cta site-hero__cta--primary[^>]*padding-right:20px/);
  assert.match(html, /site-hero__cta site-hero__cta--secondary[^>]*padding:0.66rem 1.2rem/);
  assert.match(html, /site-hero__cta site-hero__cta--secondary[^>]*margin-bottom:4px/);
  assert.match(html, /site-hero__cta site-hero__cta--secondary[^>]*margin-inline:9px/);
  assert.match(html, /site-hero__cta site-hero__cta--secondary[^>]*padding-inline:14px/);
});

test("cta banner renderer applies nodePresentation styles to copy and CTAs", () => {
  const props: CtaBannerV1 = {
    eyebrow: "Ready when you are",
    headline: "Ready to lock your date?",
    copy: "Share your scope and get a curated lineup within minutes.",
    primaryCta: { label: "Request availability", href: { kind: "tenant-page", value: "/inquiry" } },
    secondaryCta: { label: "See pricing", href: { kind: "tenant-page", value: "/pricing" } },
    nodePresentation: {
      subheadline: {
        align: "left",
        maxWidthPx: 420,
        marginBottomPx: 6,
        size: "lg",
      },
      headline: { align: "center", size: "lg" },
      copy: { maxWidthPx: 580, tone: "muted", size: "lg" },
      primaryCta: {
        align: "center",
        size: "xl",
        marginInlinePx: 11,
        paddingInlinePx: 24,
      },
      secondaryCta: { align: "center", size: "sm", marginLeftPx: 5 },
    },
    presentation: {},
    variant: "centered-overlay",
    imageSide: "right",
    bandTone: "ivory",
    insetCard: true,
  };

  const html = renderToStaticMarkup(
    createElement(CtaBannerComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:cta",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:cta:paragraph:subheadline",
          headline: "legacy:body:0:cta:heading:headline",
          copy: "legacy:body:0:cta:paragraph:copy",
          primaryCta: "legacy:body:0:cta:button:primaryCta",
          secondaryCta: "legacy:body:0:cta:button:secondaryCta",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:cta:paragraph:subheadline"/,
  );
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*max-width:420px/);
  assert.match(html, /site-cta-banner__inner[^>]*text-align:left/);
  assert.match(html, /site-cta-banner__copy[^>]*max-width:580px/);
  assert.match(html, /site-cta-banner__ctas[^>]*justify-content:center/);
  assert.match(html, /site-prim-cta site-prim-cta--primary[^>]*padding:1.06rem 2rem/);
  assert.match(html, /site-prim-cta site-prim-cta--primary[^>]*margin-inline:11px/);
  assert.match(html, /site-prim-cta site-prim-cta--primary[^>]*padding-inline:24px/);
  assert.match(html, /site-prim-cta site-prim-cta--secondary[^>]*padding:0.64rem 1.14rem/);
  assert.match(html, /site-prim-cta site-prim-cta--secondary[^>]*margin-left:5px/);
});

test("category grid renderer applies header/footer nodePresentation and child node ids", () => {
  const props: CategoryGridV1 = {
    eyebrow: "Services",
    headline: "What we offer",
    copy: "Structured support for every production stage.",
    items: [{ label: "Photography" }],
    variant: "portrait-masonry",
    columnsDesktop: 4,
    footerCta: { label: "Browse services", href: "/services" },
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 440, size: "lg" },
      headline: { align: "left", maxWidthPx: 620, size: "lg" },
      copy: { align: "left", maxWidthPx: 520, tone: "muted" },
      footerCta: { align: "right", size: "sm", marginTopPx: 8 },
    },
  };

  const html = renderToStaticMarkup(
    createElement(CategoryGridComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:cat",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:cat:paragraph:subheadline",
          headline: "legacy:body:0:cat:heading:headline",
          copy: "legacy:body:0:cat:paragraph:copy",
          footerCta: "legacy:body:0:cat:button:footerCta",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:cat:paragraph:subheadline"/,
  );
  assert.match(
    html,
    /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:cat:heading:headline"/,
  );
  assert.match(
    html,
    /site-prim-head__intro[^>]*data-builder-node-id="legacy:body:0:cat:paragraph:copy"/,
  );
  assert.match(
    html,
    /data-builder-node-id="legacy:body:0:cat:button:footerCta"[^>]*site-prim-cta--secondary/,
  );
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*max-width:440px/);
  assert.match(html, /site-prim-head__headline[^>]*><span style="[^"]*max-width:620px/);
  assert.match(html, /site-prim-head__intro[^>]*><span style="[^"]*max-width:520px/);
  assert.match(html, /site-category-grid__head-cta[^>]*justify-content:flex-end/);
  assert.match(
    html,
    /data-builder-node-id="legacy:body:0:cat:button:footerCta"[^>]*margin-top:8px/,
  );
});

test("contact form renderer applies header/submit nodePresentation and child node ids", () => {
  const props: ContactFormV1 = {
    eyebrow: "Let's connect",
    headline: "Tell us what you need",
    intro: "Share your timeline and scope.",
    fields: [{ name: "name", label: "Name", type: "text", required: true }],
    submitLabel: "Send request",
    action: "/api/cms/forms/submit",
    method: "POST",
    honeypot: "website",
    successMessage: "Thanks!",
    variant: "card",
    captcha: "none",
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 430, size: "lg" },
      headline: { align: "left", maxWidthPx: 610, size: "lg" },
      copy: { align: "left", maxWidthPx: 520, tone: "muted" },
      primaryCta: { align: "right", size: "sm", marginTopPx: 8 },
    },
  };

  const html = renderToStaticMarkup(
    createElement(ContactFormComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:form",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:form:paragraph:subheadline",
          headline: "legacy:body:0:form:heading:headline",
          copy: "legacy:body:0:form:paragraph:copy",
          primaryCta: "legacy:body:0:form:button:primaryCta",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:form:paragraph:subheadline"/,
  );
  assert.match(
    html,
    /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:form:heading:headline"/,
  );
  assert.match(
    html,
    /site-prim-head__intro[^>]*data-builder-node-id="legacy:body:0:form:paragraph:copy"/,
  );
  assert.match(
    html,
    /site-form__submit[^>]*data-builder-node-id="legacy:body:0:form:button:primaryCta"/,
  );
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*max-width:430px/);
  assert.match(html, /site-prim-head__headline[^>]*><span style="[^"]*max-width:610px/);
  assert.match(html, /site-prim-head__intro[^>]*><span style="[^"]*max-width:520px/);
  assert.match(html, /site-form__actions[^>]*justify-content:flex-end/);
  assert.match(html, /site-form__submit[^>]*padding:0.5rem 0.85rem/);
  assert.match(html, /site-form__submit[^>]*margin-top:8px/);
});

test("faq renderer applies header nodePresentation and child node ids", () => {
  const props: FaqAccordionV1 = {
    eyebrow: "FAQ",
    headline: "Answers to common questions",
    intro: "Everything you need before booking.",
    items: [{ question: "How fast?", answer: "Usually within 24h." }],
    variant: "bordered",
    defaultOpen: -1,
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 420, size: "lg" },
      headline: { align: "left", maxWidthPx: 600, size: "lg" },
      copy: { align: "left", maxWidthPx: 500, tone: "muted" },
    },
  };

  const html = renderToStaticMarkup(
    createElement(FaqAccordionComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:faq",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:faq:paragraph:subheadline",
          headline: "legacy:body:0:faq:heading:headline",
          copy: "legacy:body:0:faq:paragraph:copy",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:faq:paragraph:subheadline"/,
  );
  assert.match(
    html,
    /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:faq:heading:headline"/,
  );
  assert.match(
    html,
    /site-prim-head__intro[^>]*data-builder-node-id="legacy:body:0:faq:paragraph:copy"/,
  );
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*max-width:420px/);
  assert.match(html, /site-prim-head__headline[^>]*><span style="[^"]*max-width:600px/);
  assert.match(html, /site-prim-head__intro[^>]*><span style="[^"]*max-width:500px/);
});

test("pricing grid renderer applies header nodePresentation and child node ids", () => {
  const props: PricingGridV1 = {
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
        highlighted: false,
      },
    ],
    variant: "cards",
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 420, size: "lg" },
      headline: { align: "left", maxWidthPx: 610, size: "lg" },
      copy: { align: "left", maxWidthPx: 520, tone: "muted" },
    },
  };

  const html = renderToStaticMarkup(
    createElement(PricingGridComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:pricing",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:pricing:paragraph:subheadline",
          headline: "legacy:body:0:pricing:heading:headline",
          copy: "legacy:body:0:pricing:paragraph:copy",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:pricing:paragraph:subheadline"/,
  );
  assert.match(
    html,
    /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:pricing:heading:headline"/,
  );
  assert.match(
    html,
    /site-prim-head__intro[^>]*data-builder-node-id="legacy:body:0:pricing:paragraph:copy"/,
  );
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*max-width:420px/);
  assert.match(html, /site-prim-head__headline[^>]*><span style="[^"]*max-width:610px/);
  assert.match(html, /site-prim-head__intro[^>]*><span style="[^"]*max-width:520px/);
});

test("logo cloud renderer applies header nodePresentation and child node ids", () => {
  const props: LogoCloudV1 = {
    eyebrow: "Trusted by",
    headline: "Operators and brands",
    logos: [
      { imageUrl: "https://example.com/a.png", alt: "A" },
      { imageUrl: "https://example.com/b.png", alt: "B" },
    ],
    columnsDesktop: 6,
    variant: "muted",
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 420, size: "lg" },
      headline: { align: "left", maxWidthPx: 610, size: "lg" },
    },
  };

  const html = renderToStaticMarkup(
    createElement(LogoCloudComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:logos",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:logos:paragraph:subheadline",
          headline: "legacy:body:0:logos:heading:headline",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:logos:paragraph:subheadline"/,
  );
  assert.match(
    html,
    /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:logos:heading:headline"/,
  );
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*max-width:420px/);
  assert.match(html, /site-prim-head__headline[^>]*><span style="[^"]*max-width:610px/);
});

test("team grid renderer applies header nodePresentation and child node ids", () => {
  const props: TeamGridV1 = {
    eyebrow: "Team",
    headline: "People behind the work",
    intro: "A small, focused team.",
    members: [{ name: "Ari" }],
    variant: "portrait",
    columnsDesktop: 3,
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 420, size: "lg" },
      headline: { align: "left", maxWidthPx: 610, size: "lg" },
      copy: { align: "left", maxWidthPx: 520, tone: "muted" },
    },
  };

  const html = renderToStaticMarkup(
    createElement(TeamGridComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:team",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:team:paragraph:subheadline",
          headline: "legacy:body:0:team:heading:headline",
          copy: "legacy:body:0:team:paragraph:copy",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:team:paragraph:subheadline"/,
  );
  assert.match(
    html,
    /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:team:heading:headline"/,
  );
  assert.match(
    html,
    /site-prim-head__intro[^>]*data-builder-node-id="legacy:body:0:team:paragraph:copy"/,
  );
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*max-width:420px/);
  assert.match(html, /site-prim-head__headline[^>]*><span style="[^"]*max-width:610px/);
  assert.match(html, /site-prim-head__intro[^>]*><span style="[^"]*max-width:520px/);
});

test("event listing renderer applies header nodePresentation and child node ids", () => {
  const props: EventListingV1 = {
    eyebrow: "Calendar",
    headline: "Upcoming events",
    events: [{ date: "May 20", title: "Launch event" }],
    variant: "list",
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 420, size: "lg" },
      headline: { align: "left", maxWidthPx: 610, size: "lg" },
    },
  };

  const html = renderToStaticMarkup(
    createElement(EventListingComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:events",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:events:paragraph:subheadline",
          headline: "legacy:body:0:events:heading:headline",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:events:paragraph:subheadline"/,
  );
  assert.match(
    html,
    /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:events:heading:headline"/,
  );
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*max-width:420px/);
  assert.match(html, /site-prim-head__headline[^>]*><span style="[^"]*max-width:610px/);
});

test("content tabs renderer applies header nodePresentation and child node ids", () => {
  const props: ContentTabsV1 = {
    eyebrow: "Highlights",
    headline: "What we cover",
    tabs: [
      { label: "Planning", body: "Planning details." },
      { label: "Delivery", body: "Delivery details." },
    ],
    variant: "underline",
    defaultTab: 0,
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 420, size: "lg" },
      headline: { align: "left", maxWidthPx: 610, size: "lg" },
    },
  };

  const html = renderToStaticMarkup(
    createElement(ContentTabsComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:tabs",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:tabs:paragraph:subheadline",
          headline: "legacy:body:0:tabs:heading:headline",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:tabs:paragraph:subheadline"/,
  );
  assert.match(
    html,
    /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:tabs:heading:headline"/,
  );
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*max-width:420px/);
  assert.match(html, /site-prim-head__headline[^>]*><span style="[^"]*max-width:610px/);
});

test("process steps renderer applies header nodePresentation and child node ids", () => {
  const props: ProcessStepsV1 = {
    eyebrow: "Process",
    headline: "How we work",
    copy: "A clear three-step flow.",
    steps: [{ label: "Brief" }, { label: "Deliver" }],
    variant: "numbered-column",
    numberStyle: "serif-italic",
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 420, size: "lg" },
      headline: { align: "left", maxWidthPx: 610, size: "lg" },
      copy: { align: "left", maxWidthPx: 520, tone: "muted" },
    },
  };

  const html = renderToStaticMarkup(
    createElement(ProcessStepsComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:process",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:process:paragraph:subheadline",
          headline: "legacy:body:0:process:heading:headline",
          copy: "legacy:body:0:process:paragraph:copy",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:process:paragraph:subheadline"/,
  );
  assert.match(
    html,
    /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:process:heading:headline"/,
  );
  assert.match(
    html,
    /site-prim-head__intro[^>]*data-builder-node-id="legacy:body:0:process:paragraph:copy"/,
  );
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*max-width:420px/);
  assert.match(html, /site-prim-head__headline[^>]*><span style="[^"]*max-width:610px/);
  assert.match(html, /site-prim-head__intro[^>]*><span style="[^"]*max-width:520px/);
});

test("destinations mosaic renderer applies header nodePresentation and child node ids", () => {
  const props: DestinationsMosaicV1 = {
    eyebrow: "Destinations",
    headline: "From jungle to coast",
    copy: "Global destination coverage.",
    items: [{ label: "Tulum" }, { label: "Milan" }],
    variant: "portrait-mosaic",
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 420, size: "lg" },
      headline: { align: "left", maxWidthPx: 610, size: "lg" },
      copy: { align: "left", maxWidthPx: 520, tone: "muted" },
    },
  };

  const html = renderToStaticMarkup(
    createElement(DestinationsMosaicComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:dest",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:dest:paragraph:subheadline",
          headline: "legacy:body:0:dest:heading:headline",
          copy: "legacy:body:0:dest:paragraph:copy",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:dest:paragraph:subheadline"/,
  );
  assert.match(
    html,
    /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:dest:heading:headline"/,
  );
  assert.match(
    html,
    /site-prim-head__intro[^>]*data-builder-node-id="legacy:body:0:dest:paragraph:copy"/,
  );
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*max-width:420px/);
  assert.match(html, /site-prim-head__headline[^>]*><span style="[^"]*max-width:610px/);
  assert.match(html, /site-prim-head__intro[^>]*><span style="[^"]*max-width:520px/);
});

test("stats renderer applies eyebrow/headline nodePresentation and child node ids", () => {
  const props: StatsV1 = {
    eyebrow: "Numbers",
    headline: "Impact in production",
    items: [
      { value: "48h", label: "Turnaround" },
      { value: "120+", label: "Campaign days" },
    ],
    variant: "grid",
    align: "center",
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 420, size: "lg" },
      headline: { align: "left", maxWidthPx: 610, size: "lg" },
    },
  };

  const html = renderToStaticMarkup(
    createElement(StatsComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:stats",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:stats:paragraph:subheadline",
          headline: "legacy:body:0:stats:heading:headline",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:stats:paragraph:subheadline"/,
  );
  assert.match(
    html,
    /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:stats:heading:headline"/,
  );
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*max-width:420px/);
  assert.match(html, /site-prim-head__headline[^>]*><span style="[^"]*max-width:610px/);
});

test("timeline renderer applies eyebrow/headline nodePresentation and child node ids", () => {
  const props: TimelineV1 = {
    eyebrow: "Roadmap",
    headline: "How each launch runs",
    items: [{ date: "Week 1", title: "Planning" }],
    variant: "left-rail",
    numberStyle: "dot",
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 420, size: "lg" },
      headline: { align: "left", maxWidthPx: 610, size: "lg" },
    },
  };

  const html = renderToStaticMarkup(
    createElement(TimelineComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:timeline",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:timeline:paragraph:subheadline",
          headline: "legacy:body:0:timeline:heading:headline",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:timeline:paragraph:subheadline"/,
  );
  assert.match(
    html,
    /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:timeline:heading:headline"/,
  );
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*max-width:420px/);
  assert.match(html, /site-prim-head__headline[^>]*><span style="[^"]*max-width:610px/);
});

test("values trio renderer applies eyebrow/headline nodePresentation and child node ids", () => {
  const props: ValuesTrioV1 = {
    eyebrow: "Values",
    headline: "What guides our work",
    items: [{ title: "Clarity" }, { title: "Craft" }],
    variant: "numbered-cards",
    numberStyle: "serif-italic",
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 420, size: "lg" },
      headline: { align: "left", maxWidthPx: 610, size: "lg" },
    },
  };

  const html = renderToStaticMarkup(
    createElement(ValuesTrioComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:values",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:values:paragraph:subheadline",
          headline: "legacy:body:0:values:heading:headline",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:values:paragraph:subheadline"/,
  );
  assert.match(
    html,
    /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:values:heading:headline"/,
  );
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*max-width:420px/);
  assert.match(html, /site-prim-head__headline[^>]*><span style="[^"]*max-width:610px/);
});

test("comparison table renderer applies header nodePresentation and child node ids", () => {
  const props: ComparisonTableV1 = {
    eyebrow: "Plans",
    headline: "Compare offers",
    intro: "Choose the right package.",
    columns: [{ label: "Core", highlighted: false }, { label: "Pro", highlighted: true }],
    rows: [{ feature: "Support", values: ["yes", "yes"] }],
    variant: "striped",
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 420, size: "lg" },
      headline: { align: "left", maxWidthPx: 610, size: "lg" },
      copy: { align: "left", maxWidthPx: 520, tone: "muted" },
    },
  };

  const html = renderToStaticMarkup(
    createElement(ComparisonTableComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:compare",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:compare:paragraph:subheadline",
          headline: "legacy:body:0:compare:heading:headline",
          copy: "legacy:body:0:compare:paragraph:copy",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:compare:paragraph:subheadline"/,
  );
  assert.match(
    html,
    /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:compare:heading:headline"/,
  );
  assert.match(
    html,
    /site-prim-head__intro[^>]*data-builder-node-id="legacy:body:0:compare:paragraph:copy"/,
  );
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*max-width:420px/);
  assert.match(html, /site-prim-head__headline[^>]*><span style="[^"]*max-width:610px/);
  assert.match(html, /site-prim-head__intro[^>]*><span style="[^"]*max-width:520px/);
});

test("hero split renderer applies nodePresentation styles to copy and CTAs", () => {
  const props: HeroSplitV1 = {
    eyebrow: "Featured",
    headline: "Book faster with curated talent",
    subheadline: "Structured booking support across your campaign timeline.",
    primaryCta: { label: "Start booking", href: "/book" },
    secondaryCta: { label: "Browse roster", href: "/directory" },
    imageUrl: "https://example.com/hero.jpg",
    side: "media-right",
    variant: "asymmetric",
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 420, size: "lg" },
      headline: { align: "left", maxWidthPx: 640, size: "lg" },
      copy: { align: "left", maxWidthPx: 520, tone: "muted" },
      primaryCta: { align: "left", size: "lg", marginTopPx: 8 },
      secondaryCta: { align: "left", size: "sm", marginLeftPx: 6 },
    },
  };

  const html = renderToStaticMarkup(
    createElement(HeroSplitComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:hero-split",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:hero-split:paragraph:subheadline",
          headline: "legacy:body:0:hero-split:heading:headline",
          copy: "legacy:body:0:hero-split:paragraph:copy",
          primaryCta: "legacy:body:0:hero-split:button:primaryCta",
          secondaryCta: "legacy:body:0:hero-split:button:secondaryCta",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:hero-split:paragraph:subheadline"/,
  );
  assert.match(
    html,
    /site-hero-split__headline[^>]*data-builder-node-id="legacy:body:0:hero-split:heading:headline"/,
  );
  assert.match(
    html,
    /site-hero-split__sub[^>]*data-builder-node-id="legacy:body:0:hero-split:paragraph:copy"/,
  );
  assert.match(
    html,
    /site-btn site-btn--primary[^>]*data-builder-node-id="legacy:body:0:hero-split:button:primaryCta"/,
  );
  assert.match(
    html,
    /site-btn site-btn--ghost[^>]*data-builder-node-id="legacy:body:0:hero-split:button:secondaryCta"/,
  );
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*max-width:420px/);
  assert.match(html, /site-hero-split__headline[^>]*><span style="[^"]*max-width:640px/);
  assert.match(html, /site-hero-split__sub[^>]*><span style="[^"]*max-width:520px/);
  assert.match(html, /site-btn site-btn--primary[^>]*padding:0.95rem 1.8rem/);
  assert.match(html, /site-btn site-btn--primary[^>]*margin-top:8px/);
  assert.match(html, /site-btn site-btn--ghost[^>]*padding:0.64rem 1.14rem/);
  assert.match(html, /site-btn site-btn--ghost[^>]*margin-left:6px/);
});

test("image copy alternating renderer applies header nodePresentation and child node ids", () => {
  const props: ImageCopyAlternatingV1 = {
    eyebrow: "Services",
    headline: "How we support each production",
    items: [{ title: "Planning", side: "auto" }],
    variant: "editorial-alternating",
    gap: "airy",
    imageRatio: "5/6",
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 420, size: "lg" },
      headline: { align: "left", maxWidthPx: 610, size: "lg" },
    },
  };

  const html = renderToStaticMarkup(
    createElement(ImageCopyAlternatingComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:image-copy",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:image-copy:paragraph:subheadline",
          headline: "legacy:body:0:image-copy:heading:headline",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:image-copy:paragraph:subheadline"/,
  );
  assert.match(
    html,
    /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:image-copy:heading:headline"/,
  );
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*max-width:420px/);
  assert.match(html, /site-prim-head__headline[^>]*><span style="[^"]*max-width:610px/);
});

test("split screen renderer applies nodePresentation styles to copy and CTAs", () => {
  const props: SplitScreenV1 = {
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
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 420, size: "lg" },
      headline: { align: "left", maxWidthPx: 640, size: "lg" },
      copy: { align: "left", maxWidthPx: 520, tone: "muted" },
      primaryCta: { align: "left", size: "lg", marginTopPx: 8 },
      secondaryCta: { align: "left", size: "sm", marginLeftPx: 6 },
    },
  };

  const html = renderToStaticMarkup(
    createElement(SplitScreenComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:split",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:split:paragraph:subheadline",
          headline: "legacy:body:0:split:heading:headline",
          copy: "legacy:body:0:split:paragraph:copy",
          primaryCta: "legacy:body:0:split:button:primaryCta",
          secondaryCta: "legacy:body:0:split:button:secondaryCta",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:split:paragraph:subheadline"/,
  );
  assert.match(
    html,
    /site-split__headline[^>]*data-builder-node-id="legacy:body:0:split:heading:headline"/,
  );
  assert.match(
    html,
    /site-split__body[^>]*data-builder-node-id="legacy:body:0:split:paragraph:copy"/,
  );
  assert.match(
    html,
    /data-builder-node-id="legacy:body:0:split:button:primaryCta"[^>]*site-prim-cta--primary/,
  );
  assert.match(
    html,
    /data-builder-node-id="legacy:body:0:split:button:secondaryCta"[^>]*site-prim-cta--ghost/,
  );
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*max-width:420px/);
  assert.match(html, /site-split__headline[^>]*><span style="[^"]*max-width:640px/);
  assert.match(html, /site-split__body[^>]*max-width:520px/);
  assert.match(
    html,
    /data-builder-node-id="legacy:body:0:split:button:primaryCta"[^>]*padding:0.95rem 1.8rem/,
  );
  assert.match(
    html,
    /data-builder-node-id="legacy:body:0:split:button:secondaryCta"[^>]*margin-left:6px/,
  );
});

test("before after renderer applies header nodePresentation and child node ids", () => {
  const props: BeforeAfterV1 = {
    eyebrow: "Transformation",
    headline: "Before and after",
    beforeUrl: "https://example.com/before.jpg",
    afterUrl: "https://example.com/after.jpg",
    beforeLabel: "Before",
    afterLabel: "After",
    initialPosition: 50,
    ratio: "16/9",
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 420, size: "lg" },
      headline: { align: "left", maxWidthPx: 610, size: "lg" },
    },
  };

  const html = renderToStaticMarkup(
    createElement(BeforeAfterComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:before-after",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:before-after:paragraph:subheadline",
          headline: "legacy:body:0:before-after:heading:headline",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:before-after:paragraph:subheadline"/,
  );
  assert.match(
    html,
    /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:before-after:heading:headline"/,
  );
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*max-width:420px/);
  assert.match(html, /site-prim-head__headline[^>]*><span style="[^"]*max-width:610px/);
});

test("booking widget renderer applies nodePresentation styles and CTA node id", () => {
  const props: BookingWidgetV1 = {
    eyebrow: "Booking",
    headline: "Book a call",
    intro: "Select a time that works for your team.",
    url: "https://calendly.com/demo/session",
    variant: "button",
    buttonLabel: "Book now",
    ratio: "4/3",
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 420, size: "lg" },
      headline: { align: "left", maxWidthPx: 610, size: "lg" },
      copy: { align: "left", maxWidthPx: 520, tone: "muted" },
      primaryCta: { align: "left", size: "lg", marginTopPx: 8 },
    },
  };

  const html = renderToStaticMarkup(
    createElement(BookingWidgetComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:booking",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:booking:paragraph:subheadline",
          headline: "legacy:body:0:booking:heading:headline",
          copy: "legacy:body:0:booking:paragraph:copy",
          primaryCta: "legacy:body:0:booking:button:primaryCta",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:booking:paragraph:subheadline"/,
  );
  assert.match(
    html,
    /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:booking:heading:headline"/,
  );
  assert.match(
    html,
    /site-prim-head__intro[^>]*data-builder-node-id="legacy:body:0:booking:paragraph:copy"/,
  );
  assert.match(
    html,
    /site-btn site-btn--primary site-booking__btn[^>]*data-builder-node-id="legacy:body:0:booking:button:primaryCta"/,
  );
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*max-width:420px/);
  assert.match(html, /site-prim-head__headline[^>]*><span style="[^"]*max-width:610px/);
  assert.match(html, /site-prim-head__intro[^>]*><span style="[^"]*max-width:520px/);
  assert.match(html, /site-btn site-btn--primary site-booking__btn[^>]*padding:0.95rem 1.8rem/);
  assert.match(html, /site-btn site-btn--primary site-booking__btn[^>]*margin-top:8px/);
});

test("lookbook renderer applies header nodePresentation and child node ids", () => {
  const props: LookbookV1 = {
    eyebrow: "Editorial",
    headline: "Campaign lookbook",
    pages: [
      { imageUrl: "https://example.com/1.jpg" },
      { imageUrl: "https://example.com/2.jpg" },
    ],
    variant: "spread",
    ratio: "3/4",
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 420, size: "lg" },
      headline: { align: "left", maxWidthPx: 610, size: "lg" },
    },
  };

  const html = renderToStaticMarkup(
    createElement(LookbookComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:lookbook",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:lookbook:paragraph:subheadline",
          headline: "legacy:body:0:lookbook:heading:headline",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:lookbook:paragraph:subheadline"/,
  );
  assert.match(
    html,
    /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:lookbook:heading:headline"/,
  );
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*max-width:420px/);
  assert.match(html, /site-prim-head__headline[^>]*><span style="[^"]*max-width:610px/);
});

test("magazine layout renderer applies header nodePresentation and child node ids", () => {
  const props: MagazineLayoutV1 = {
    eyebrow: "Editorial",
    headline: "Campaign stories",
    hero: { title: "Lead story" },
    secondary: [{ title: "Frame one" }, { title: "Frame two" }],
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 420, size: "lg" },
      headline: { align: "left", maxWidthPx: 610, size: "lg" },
    },
  };

  const html = renderToStaticMarkup(
    createElement(MagazineLayoutComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:mag",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:mag:paragraph:subheadline",
          headline: "legacy:body:0:mag:heading:headline",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:mag:paragraph:subheadline"/,
  );
  assert.match(
    html,
    /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:mag:heading:headline"/,
  );
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*max-width:420px/);
  assert.match(html, /site-prim-head__headline[^>]*><span style="[^"]*max-width:610px/);
});

test("map overlay renderer applies header/body nodePresentation and child node ids", () => {
  const props: MapOverlayV1 = {
    eyebrow: "Visit",
    headline: "Find our studio",
    mapEmbedUrl: "https://www.google.com/maps/embed?pb=demo",
    card: {
      title: "Studio",
      body: "By appointment only.",
    },
    side: "card-left",
    ratio: "16/9",
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 420, size: "lg" },
      headline: { align: "left", maxWidthPx: 610, size: "lg" },
      copy: { align: "left", maxWidthPx: 520, tone: "muted" },
    },
  };

  const html = renderToStaticMarkup(
    createElement(MapOverlayComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:map",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:map:paragraph:subheadline",
          headline: "legacy:body:0:map:heading:headline",
          copy: "legacy:body:0:map:paragraph:copy",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:map:paragraph:subheadline"/,
  );
  assert.match(
    html,
    /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:map:heading:headline"/,
  );
  assert.match(
    html,
    /site-map__body[^>]*data-builder-node-id="legacy:body:0:map:paragraph:copy"/,
  );
  assert.match(html, /site-map__body[^>]*max-width:520px/);
  assert.match(html, /site-map__body[^>]*text-align:left/);
});

test("press strip renderer applies eyebrow nodePresentation and child node id", () => {
  const props: PressStripV1 = {
    eyebrow: "As seen in",
    items: [{ name: "Vogue" }],
    variant: "text-italic-serif",
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 420, size: "lg" },
    },
  };

  const html = renderToStaticMarkup(
    createElement(PressStripComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:press",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:press:paragraph:subheadline",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-press-strip__eyebrow[^>]*data-builder-node-id="legacy:body:0:press:paragraph:subheadline"/,
  );
  assert.match(html, /site-press-strip__eyebrow[^>]*max-width:420px/);
  assert.match(html, /site-press-strip__eyebrow[^>]*text-align:left/);
});

test("masonry renderer applies header nodePresentation and child node ids", () => {
  const props: MasonryV1 = {
    eyebrow: "Portfolio",
    headline: "Recent campaign frames",
    items: [
      { src: "https://example.com/1.jpg" },
      { src: "https://example.com/2.jpg" },
    ],
    columnsDesktop: 3,
    gap: "standard",
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 420, size: "lg" },
      headline: { align: "left", maxWidthPx: 610, size: "lg" },
    },
  };

  const html = renderToStaticMarkup(
    createElement(MasonryComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:masonry",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:masonry:paragraph:subheadline",
          headline: "legacy:body:0:masonry:heading:headline",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:masonry:paragraph:subheadline"/,
  );
  assert.match(
    html,
    /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:masonry:heading:headline"/,
  );
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*max-width:420px/);
  assert.match(html, /site-prim-head__headline[^>]*><span style="[^"]*max-width:610px/);
});

test("sticky scroll renderer applies header nodePresentation and child node ids", () => {
  const props: StickyScrollV1 = {
    eyebrow: "Process",
    headline: "How launches unfold",
    imageUrl: "https://example.com/photo.jpg",
    blocks: [{ title: "Brief", body: "Plan scope." }, { title: "Ship", body: "Go live." }],
    side: "media-left",
    variant: "minimal",
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 420, size: "lg" },
      headline: { align: "left", maxWidthPx: 610, size: "lg" },
    },
  };

  const html = renderToStaticMarkup(
    createElement(StickyScrollComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:sticky",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:sticky:paragraph:subheadline",
          headline: "legacy:body:0:sticky:heading:headline",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:sticky:paragraph:subheadline"/,
  );
  assert.match(
    html,
    /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:sticky:heading:headline"/,
  );
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*max-width:420px/);
  assert.match(html, /site-prim-head__headline[^>]*><span style="[^"]*max-width:610px/);
});

test("scroll carousel renderer applies header nodePresentation and child node ids", () => {
  const props: ScrollCarouselV1 = {
    eyebrow: "Highlights",
    headline: "Stories in motion",
    slides: [{ title: "One" }, { title: "Two" }],
    cardWidthVw: 28,
    showProgress: true,
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 420, size: "lg" },
      headline: { align: "left", maxWidthPx: 610, size: "lg" },
    },
  };

  const html = renderToStaticMarkup(
    createElement(ScrollCarouselComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:carousel",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:carousel:paragraph:subheadline",
          headline: "legacy:body:0:carousel:heading:headline",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:carousel:paragraph:subheadline"/,
  );
  assert.match(
    html,
    /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:carousel:heading:headline"/,
  );
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*max-width:420px/);
  assert.match(html, /site-prim-head__headline[^>]*><span style="[^"]*max-width:610px/);
});

test("lottie renderer applies header/caption nodePresentation and child node ids", () => {
  const props: LottieV1 = {
    eyebrow: "Animation",
    headline: "Motion storytelling",
    caption: "A lightweight animated explainer.",
    src: "https://lottie.host/abc.json",
    trigger: "autoplay",
    loop: true,
    speed: 1,
    ratio: "1/1",
    maxWidth: 480,
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 420, size: "lg" },
      headline: { align: "left", maxWidthPx: 610, size: "lg" },
      copy: { align: "left", maxWidthPx: 520, tone: "muted" },
    },
  };

  const html = renderToStaticMarkup(
    createElement(LottieComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:lottie",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:lottie:paragraph:subheadline",
          headline: "legacy:body:0:lottie:heading:headline",
          copy: "legacy:body:0:lottie:paragraph:copy",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:lottie:paragraph:subheadline"/,
  );
  assert.match(
    html,
    /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:lottie:heading:headline"/,
  );
  assert.match(
    html,
    /site-lottie__caption[^>]*data-builder-node-id="legacy:body:0:lottie:paragraph:copy"/,
  );
  assert.match(html, /site-lottie__caption[^>]*max-width:520px/);
  assert.match(html, /site-lottie__caption[^>]*text-align:left/);
});

test("video reel renderer applies header nodePresentation and child node ids", () => {
  const props: VideoReelV1 = {
    eyebrow: "Highlights",
    headline: "Campaign reel",
    videoUrl: "https://example.com/reel.mp4",
    chapters: [],
    ratio: "16/9",
    controls: true,
    loop: false,
    muted: false,
    autoplay: false,
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 420, size: "lg" },
      headline: { align: "left", maxWidthPx: 610, size: "lg" },
    },
  };

  const html = renderToStaticMarkup(
    createElement(VideoReelComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:reel",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:reel:paragraph:subheadline",
          headline: "legacy:body:0:reel:heading:headline",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:reel:paragraph:subheadline"/,
  );
  assert.match(
    html,
    /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:reel:heading:headline"/,
  );
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*max-width:420px/);
  assert.match(html, /site-prim-head__headline[^>]*><span style="[^"]*max-width:610px/);
});

test("image orbit renderer applies header nodePresentation and child node ids", () => {
  const props: ImageOrbitV1 = {
    eyebrow: "Breakdown",
    headline: "Tagged composition",
    imageUrl: "https://example.com/orbit.jpg",
    tags: [{ x: 30, y: 40, label: "Wardrobe" }],
    ratio: "4/3",
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 420, size: "lg" },
      headline: { align: "left", maxWidthPx: 610, size: "lg" },
    },
  };

  const html = renderToStaticMarkup(
    createElement(ImageOrbitComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:orbit",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:orbit:paragraph:subheadline",
          headline: "legacy:body:0:orbit:heading:headline",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:orbit:paragraph:subheadline"/,
  );
  assert.match(
    html,
    /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:orbit:heading:headline"/,
  );
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*max-width:420px/);
  assert.match(html, /site-prim-head__headline[^>]*><span style="[^"]*max-width:610px/);
});

test("testimonials renderer applies eyebrow/headline nodePresentation and child node ids", () => {
  const props: TestimonialsTrioV1 = {
    eyebrow: "Client voices",
    headline: "Trusted by operators",
    items: [{ quote: "Fast turnaround and excellent communication." }],
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 430, size: "lg" },
      headline: { align: "left", maxWidthPx: 610, size: "lg" },
    },
    variant: "trio-card",
    defaultAccent: "auto",
  };

  const html = renderToStaticMarkup(
    createElement(TestimonialsTrioComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:abc",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:abc:paragraph:subheadline",
          headline: "legacy:body:0:abc:heading:headline",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:abc:paragraph:subheadline"/,
  );
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*text-align:left/);
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*max-width:430px/);
  assert.match(html, /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:abc:heading:headline"/);
  assert.match(html, /site-prim-head__headline[^>]*><span style="[^"]*text-align:left/);
  assert.match(html, /site-prim-head__headline[^>]*><span style="[^"]*max-width:610px/);
});

test("gallery renderer applies eyebrow/caption nodePresentation and child node ids", () => {
  const props: GalleryStripV1 = {
    eyebrow: "Portfolio",
    headline: "Yearbook",
    caption: "Selected frames from live events.",
    items: [
      { src: "https://example.com/one.jpg", aspect: "auto" },
      { src: "https://example.com/two.jpg", aspect: "auto" },
      { src: "https://example.com/three.jpg", aspect: "auto" },
    ],
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 410, size: "lg" },
      headline: { align: "left", size: "lg" },
      copy: { align: "left", maxWidthPx: 520, tone: "muted" },
    },
    variant: "mosaic",
  };

  const html = renderToStaticMarkup(
    createElement(GalleryStripComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:def",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:def:paragraph:subheadline",
          headline: "legacy:body:0:def:heading:headline",
          copy: "legacy:body:0:def:paragraph:copy",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:def:paragraph:subheadline"/,
  );
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*max-width:410px/);
  assert.match(html, /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:def:heading:headline"/);
  assert.match(html, /site-gallery__caption[^>]*data-builder-node-id="legacy:body:0:def:paragraph:copy"/);
  assert.match(html, /site-gallery__caption[^>]*max-width:520px/);
  assert.match(html, /site-gallery__caption[^>]*text-align:left/);
});

test("trust strip renderer applies eyebrow/headline nodePresentation and child node ids", () => {
  const props: TrustStripV1 = {
    eyebrow: "Proof points",
    headline: "Trusted by international teams",
    items: [{ label: "98%", detail: "Repeat clients" }],
    variant: "metrics-row",
    background: "neutral",
    presentation: {},
    nodePresentation: {
      subheadline: {
        align: "left",
        maxWidthPx: 460,
        marginBottomPx: 6,
        marginInlinePx: 4,
        size: "lg",
        tone: "muted",
      },
      headline: {
        align: "left",
        maxWidthPx: 610,
        marginTopPx: 10,
        marginBottomPx: 16,
        marginInlinePx: 12,
        paddingInlinePx: 8,
        size: "lg",
        tone: "strong",
      },
    },
  };

  const html = renderToStaticMarkup(
    createElement(TrustStripComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:trust",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:trust:paragraph:subheadline",
          headline: "legacy:body:0:trust:heading:headline",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:trust:paragraph:subheadline"/,
  );
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*text-align:left/);
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*max-width:460px/);
  assert.match(
    html,
    /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:trust:heading:headline"/,
  );
  assert.match(html, /site-prim-head__headline[^>]*><span style="[^"]*text-align:left/);
  assert.match(html, /site-prim-head__headline[^>]*><span style="[^"]*max-width:610px/);
  assert.match(html, /site-prim-head__headline[^>]*><span style="[^"]*margin-top:10px/);
  assert.match(html, /site-prim-head__headline[^>]*><span style="[^"]*padding-inline:8px/);
});

test("hero renderer emits responsive css for nodePresentation breakpoints", () => {
  const props: HeroV1 = {
    headline: "Responsive headline",
    nodePresentation: {
      headline: {
        size: "xl",
        breakpoints: {
          tablet: { align: "left", size: "lg", marginBottomPx: 16 },
          mobile: {
            align: "left",
            size: "sm",
            maxWidthPx: 320,
            marginTopPx: 8,
            marginLeftPx: 4,
            marginRightPx: 9,
            paddingLeftPx: 6,
            paddingRightPx: 11,
          },
        },
      },
      primaryCta: {
        breakpoints: {
          tablet: {
            marginInlinePx: 5,
            paddingInlinePx: 18,
          },
          mobile: {
            marginLeftPx: 4,
            paddingRightPx: 12,
          },
        },
      },
    },
    presentation: {},
  };

  const html = renderToStaticMarkup(
    createElement(HeroComponent, {
      props,
      sectionId: "11111111-1111-4111-8111-111111111111",
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
    }),
  );

  assert.match(
    html,
    /@media \(max-width: 1023px\)\{[^}]*\.site-hero__headline\{text-align:left !important;margin-bottom:16px !important;font-size:clamp\(2.25rem, 5.6vw, 4.35rem\) !important;\}/,
  );
  assert.match(
    html,
    /@media \(max-width: 640px\)\{[^}]*max-width:320px !important;margin-top:8px !important;margin-left:4px !important;margin-right:9px !important;padding-left:6px !important;padding-right:11px !important[^}]*\}/,
  );
  assert.match(
    html,
    /\.site-hero__cta--primary\{margin-inline:5px !important;padding-inline:18px !important;\}/,
  );
  assert.match(
    html,
    /\.site-hero__cta--primary\{margin-left:4px !important;padding-right:12px !important;\}/,
  );
});

test("cta banner renderer emits responsive css for CTA spacing overrides", () => {
  const props: CtaBannerV1 = {
    headline: "CTA spacing responsive",
    primaryCta: { label: "Book now", href: { kind: "tenant-page", value: "/book" } },
    nodePresentation: {
      primaryCta: {
        breakpoints: {
          tablet: { marginInlinePx: 6, paddingInlinePx: 22 },
          mobile: { marginLeftPx: 3, paddingRightPx: 15 },
        },
      },
    },
    presentation: {},
    variant: "centered-overlay",
    imageSide: "right",
    bandTone: "ivory",
    insetCard: true,
  };

  const html = renderToStaticMarkup(
    createElement(CtaBannerComponent, {
      props,
      sectionId: "33333333-3333-4333-8333-333333333333",
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
    }),
  );

  assert.match(
    html,
    /@media \(max-width: 1023px\)\{[^}]*site-prim-cta--primary\{margin-inline:6px !important;padding-inline:22px !important;\}/,
  );
  assert.match(
    html,
    /@media \(max-width: 640px\)\{[^}]*site-prim-cta--primary\{margin-left:3px !important;padding-right:15px !important;\}/,
  );
});

test("hero renderer supports node visibility with responsive overrides", () => {
  const props: HeroV1 = {
    headline: "Visibility test",
    subheadline: "Desktop hidden, mobile visible.",
    nodePresentation: {
      headline: {
        visibility: "hidden",
        breakpoints: {
          mobile: { visibility: "visible" },
        },
      },
      subheadline: {
        visibility: "hidden",
      },
    },
    presentation: {},
  };

  const html = renderToStaticMarkup(
    createElement(HeroComponent, {
      props,
      sectionId: "22222222-2222-4222-8222-222222222222",
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
    }),
  );

  assert.match(html, /site-hero__headline[^>]*display:none/);
  assert.match(html, /site-hero__subheadline[^>]*display:none/);
  assert.match(
    html,
    /@media \(max-width: 640px\)\{[^}]*site-hero__headline\{display:revert !important[^}]*\}/,
  );
});

test("code embed renderer applies header/caption nodePresentation and child node ids", () => {
  const props: CodeEmbedV1 = {
    eyebrow: "Watch",
    headline: "Product walkthrough",
    caption: "Embedded from an allow-listed host.",
    url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    ratio: "16/9",
    title: "Embedded content",
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 420, size: "lg" },
      headline: { align: "left", maxWidthPx: 610, size: "lg" },
      copy: { align: "left", maxWidthPx: 520, tone: "muted" },
    },
  };

  const html = renderToStaticMarkup(
    createElement(CodeEmbedComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:embed",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:embed:paragraph:subheadline",
          headline: "legacy:body:0:embed:heading:headline",
          copy: "legacy:body:0:embed:paragraph:copy",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:embed:paragraph:subheadline"/,
  );
  assert.match(
    html,
    /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:embed:heading:headline"/,
  );
  assert.match(
    html,
    /site-embed__caption[^>]*data-builder-node-id="legacy:body:0:embed:paragraph:copy"/,
  );
  assert.match(html, /site-embed__caption[^>]*max-width:520px/);
  assert.match(html, /site-embed__caption[^>]*text-align:left/);
});

test("blog index renderer applies header nodePresentation and child node ids", () => {
  const props: BlogIndexV1 = {
    eyebrow: "Journal",
    headline: "Latest stories",
    posts: [{ title: "Post 1", href: "/journal/post-1" }],
    variant: "cards",
    columnsDesktop: 3,
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 420, size: "lg" },
      headline: { align: "left", maxWidthPx: 620, size: "lg" },
    },
  };

  const html = renderToStaticMarkup(
    createElement(BlogIndexComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:blog",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:blog:paragraph:subheadline",
          headline: "legacy:body:0:blog:heading:headline",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:blog:paragraph:subheadline"/,
  );
  assert.match(
    html,
    /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:blog:heading:headline"/,
  );
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*max-width:420px/);
  assert.match(html, /site-prim-head__headline[^>]*><span style="[^"]*max-width:620px/);
});

test("donation form renderer applies header/submit nodePresentation and child node ids", () => {
  const props: DonationFormV1 = {
    eyebrow: "Support",
    headline: "Back this mission",
    intro: "Every contribution helps us deliver more.",
    amounts: [25, 50, 100],
    currency: "USD",
    defaultAmountIndex: 1,
    allowCustom: true,
    checkoutUrl: "https://example.org/donate",
    ctaLabel: "Donate",
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 420, size: "lg" },
      headline: { align: "left", maxWidthPx: 620, size: "lg" },
      copy: { align: "left", maxWidthPx: 520, tone: "muted" },
      primaryCta: { align: "right", size: "sm", marginTopPx: 10 },
    },
  };

  const html = renderToStaticMarkup(
    createElement(DonationFormComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:donate",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:donate:paragraph:subheadline",
          headline: "legacy:body:0:donate:heading:headline",
          copy: "legacy:body:0:donate:paragraph:copy",
          primaryCta: "legacy:body:0:donate:button:primaryCta",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:donate:paragraph:subheadline"/,
  );
  assert.match(
    html,
    /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:donate:heading:headline"/,
  );
  assert.match(
    html,
    /site-prim-head__intro[^>]*data-builder-node-id="legacy:body:0:donate:paragraph:copy"/,
  );
  assert.match(
    html,
    /site-donate__submit[^>]*data-builder-node-id="legacy:body:0:donate:button:primaryCta"/,
  );
  assert.match(html, /site-donate__submit[^>]*align-self:flex-end/);
  assert.match(html, /site-donate__submit[^>]*padding:0.64rem 1.14rem/);
  assert.match(html, /site-donate__submit[^>]*margin-top:10px/);
});

test("code snippet renderer applies header nodePresentation and child node ids", () => {
  const props: CodeSnippetV1 = {
    eyebrow: "Dev notes",
    headline: "Implementation snippet",
    filename: "snippet.ts",
    language: "ts",
    code: "export const x = 1;",
    showLineNumbers: true,
    showCopyButton: true,
    variant: "dark",
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 420, size: "lg" },
      headline: { align: "left", maxWidthPx: 620, size: "lg" },
    },
  };

  const html = renderToStaticMarkup(
    createElement(CodeSnippetComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:snippet",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:snippet:paragraph:subheadline",
          headline: "legacy:body:0:snippet:heading:headline",
        },
      },
    }),
  );

  assert.match(
    html,
    /site-eyebrow[^>]*data-builder-node-id="legacy:body:0:snippet:paragraph:subheadline"/,
  );
  assert.match(
    html,
    /site-prim-head__headline[^>]*data-builder-node-id="legacy:body:0:snippet:heading:headline"/,
  );
  assert.match(html, /site-eyebrow[^>]*><span style="[^"]*max-width:420px/);
  assert.match(html, /site-prim-head__headline[^>]*><span style="[^"]*max-width:620px/);
});

test("blog detail renderer applies category/title/byline nodePresentation and child node ids", () => {
  const props: BlogDetailV1 = {
    category: "Journal",
    date: "May 2026",
    title: "Behind the campaign",
    byline: "By Studio Team",
    body: "Body copy",
    presentation: {},
    nodePresentation: {
      subheadline: { align: "left", maxWidthPx: 420, size: "lg" },
      headline: { align: "left", maxWidthPx: 700, size: "lg" },
      copy: { align: "left", maxWidthPx: 520, tone: "muted" },
    },
  };

  const html = renderToStaticMarkup(
    createElement(BlogDetailComponent, {
      props,
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:body:0:post",
        nodeIdsByRole: {
          subheadline: "legacy:body:0:post:paragraph:subheadline",
          headline: "legacy:body:0:post:heading:headline",
          copy: "legacy:body:0:post:paragraph:copy",
        },
      },
    }),
  );

  assert.match(html, /site-post__meta[^>]*data-builder-node-id="legacy:body:0:post:paragraph:subheadline"/);
  assert.match(html, /site-post__title[^>]*data-builder-node-id="legacy:body:0:post:heading:headline"/);
  assert.match(html, /site-post__byline[^>]*data-builder-node-id="legacy:body:0:post:paragraph:copy"/);
  assert.match(html, /site-post__title[^>]*><span style="[^"]*max-width:700px/);
});

test("site header renderer applies brand/cta nodePresentation and child node ids", async () => {
  const props: SiteHeaderV1 = {
    brand: { label: "Impronta", href: { kind: "tenant-page", value: "/" } },
    brandDisplay: "image-and-text",
    navItems: [{ label: "Home", href: { kind: "tenant-page", value: "/" } }],
    primaryCta: {
      label: "Book now",
      href: { kind: "tenant-page", value: "/book" },
    },
    sticky: true,
    tone: "surface",
    variant: "standard",
    authArea: {
      showAccountMenu: false,
      showLanguageToggle: false,
      showDiscoveryTools: false,
    },
    socialLinks: [],
    contactLinks: [],
    presentation: {},
    nodePresentation: {
      headline: { align: "left", maxWidthPx: 320, size: "lg" },
      primaryCta: { size: "sm", marginLeftPx: 8 },
    },
  };

  const html = renderToStaticMarkup(
    await SiteHeaderComponent({
      props,
      tenantId: "",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:header:0:shell",
        nodeIdsByRole: {
          headline: "legacy:header:0:shell:heading:headline",
          primaryCta: "legacy:header:0:shell:button:primaryCta",
        },
      },
    }),
  );

  assert.match(html, /site-header__brand-label[^>]*data-builder-node-id="legacy:header:0:shell:heading:headline"/);
  assert.match(html, /site-header__cta[^>]*data-builder-node-id="legacy:header:0:shell:button:primaryCta"/);
  assert.match(html, /site-header__brand-label[^>]*max-width:320px/);
  assert.match(html, /site-header__cta[^>]*padding:0.5rem 0.85rem/);
});

test("site footer renderer applies brand/tagline nodePresentation and child node ids", async () => {
  const props: SiteFooterV1 = {
    brand: { label: "Impronta", tagline: "Built for global operators" },
    brandDisplay: "image-and-text",
    columns: [],
    social: [],
    legal: { links: [] },
    variant: "standard",
    tone: "follow",
    presentation: {},
    nodePresentation: {
      headline: { align: "left", maxWidthPx: 320, size: "lg" },
      copy: { align: "left", maxWidthPx: 480, tone: "muted" },
    },
  };

  const html = renderToStaticMarkup(
    await SiteFooterComponent({
      props,
      tenantId: "",
      locale: "en",
      preview: false,
      builderNodeBindings: {
        sectionNodeId: "legacy:footer:0:shell",
        nodeIdsByRole: {
          headline: "legacy:footer:0:shell:heading:headline",
          copy: "legacy:footer:0:shell:paragraph:copy",
        },
      },
    }),
  );

  assert.match(html, /site-footer__brand-label[^>]*data-builder-node-id="legacy:footer:0:shell:heading:headline"/);
  assert.match(html, /site-footer__tagline[^>]*data-builder-node-id="legacy:footer:0:shell:paragraph:copy"/);
  assert.match(html, /site-footer__brand-label[^>]*max-width:320px/);
  assert.match(html, /site-footer__tagline[^>]*max-width:480px/);
});
