import type { BuilderNode } from "../types";
import { pageDesignPhoto } from "./photos";
import type { BuilderNodeRenderDataSources } from "../render";
import type { PageDesign } from "./types";
import { GEIST, GEIST_MONO, INTER } from "./tokens";

/**
 * ARCHETYPE 2 — Dark SaaS product landing.
 *
 * Reference intent: a developer-facing billing/usage console marketing page in
 * the Linear/Vercel idiom — near-black canvas, a sticky frosted-glass nav, a
 * radial-glow hero, a glassmorphic "product in context" panel pairing a real
 * studio photograph with a monospace usage-contract surface, a feature triad,
 * and a three-tier pricing table with a highlighted plan.
 *
 * Exercises the P1–P3 stack: Geist + Inter + Geist Mono registry faces, a REAL
 * photograph inside the glass panel, a P3 REPEATER for the feature triad (bound
 * to `saas_capabilities`), a P2 pricing_table, backdrop-filter glass over a
 * sticky nav (proven OVER scrolled content by the `scrolled` motion frame), a
 * hover/transition on the nav CTA (proven by the `hover` motion frame), and a
 * dark responsive grid that collapses to a single column on mobile.
 */

const dataSources: BuilderNodeRenderDataSources = {
  collections: {
    saas_capabilities: [
      { id: "c1", index: "01", title: "Metered usage", body: "Capture every billable event once, then meter, aggregate, and gate on it without scattering pricing logic through your app.", imageUrl: pageDesignPhoto("studioScene") },
      { id: "c2", index: "02", title: "Billing that reconciles", body: "Invoices, credits, and proration reconcile against usage automatically — close the month without a spreadsheet.", imageUrl: pageDesignPhoto("serviceProsScene") },
      { id: "c3", index: "03", title: "Account health, ranked", body: "Usage, billing, and support signals fold into one ranked queue so the team works the accounts that need it.", imageUrl: pageDesignPhoto("directorPortrait") },
    ],
  },
};

const glassCardStyle = {
  backgroundColor: "rgba(255,255,255,0.05)",
  borderColor: "rgba(255,255,255,0.12)",
  borderWidth: "1px",
  borderStyle: "solid" as const,
  borderRadius: "18px",
};

/**
 * A realistic 12-cycle metered-usage series (believable upward trend with noise)
 * for the in-context console chart. Heights are px; the latest cycle is the
 * solid-mint focal bar, the prior two are brighter, the rest a translucent mint —
 * so the chart reads as a real product surface (current period highlighted), not
 * a boxy wireframe. Rendered as real builder nodes (the builder's own primitives
 * drawing a product console), which is the most honest "product-UI asset" for an
 * Asset-axis lift: no fabricated screenshot, no placeholder image.
 */
const USAGE_BARS = [40, 33, 48, 54, 45, 62, 57, 74, 67, 86, 98, 116] as const;
const USAGE_BAR_MAX = 124;

function usageBarNodes(): BuilderNode[] {
  return USAGE_BARS.map((height, index) => {
    const isLatest = index === USAGE_BARS.length - 1;
    const isRecent = index >= USAGE_BARS.length - 3;
    const fill = isLatest
      ? "#7df2c4"
      : isRecent
        ? "rgba(125,242,196,0.62)"
        : "rgba(125,242,196,0.28)";
    return {
      id: `saas-usage-bar-${index}`,
      kind: "container",
      props: {
        layout: "stack",
        style: {
          width: "100%",
          minWidth: "0",
          height: `${height}px`,
          backgroundColor: fill,
          borderRadius: "3px 3px 1px 1px",
        },
      },
      children: [],
    };
  });
}

const saasTree: BuilderNode[] = [
  {
    id: "saas-page",
    kind: "container",
    props: {
      layout: "stack",
      style: {
        width: "100%",
        maxWidthFree: "100%",
        gap: "0px",
        backgroundColor: "#08090d",
        textColor: "#f7fafe",
      },
    },
    children: [
      // ── Sticky frosted-glass nav ──────────────────────────────────────────
      {
        id: "saas-nav",
        kind: "container",
        props: {
          layout: "row",
          align: "center",
          responsive: { mobile: { layout: "row", align: "center" } },
          style: {
            width: "100%",
            maxWidthFree: "1180px",
            justifyContent: "space-between",
            gap: "18px",
            paddingTop: "16px",
            paddingRight: "24px",
            paddingBottom: "16px",
            paddingLeft: "24px",
            marginTopFree: "18px",
            position: "sticky",
            top: "0px",
            zIndex: 20,
            backgroundColor: "rgba(10,12,18,0.7)",
            backdropFilter: "blur(18px)",
            borderColor: "rgba(255,255,255,0.12)",
            borderWidth: "1px",
            borderStyle: "solid",
            borderRadius: "20px",
          },
        },
        children: [
          {
            id: "saas-logo",
            kind: "paragraph",
            props: {
              text: "Meterly",
              style: {
                fontFamily: GEIST,
                fontSize: "18px",
                fontWeight: 700,
                letterSpacing: "-0.01em",
                textColor: "#ffffff",
              },
            },
          },
          {
            id: "saas-nav-links",
            kind: "paragraph",
            props: {
              text: "Product    Pricing    Docs    Changelog",
              style: {
                align: "center",
                fontFamily: INTER,
                fontSize: "13px",
                letterSpacing: "0.01em",
                textColor: "rgba(233,240,252,0.66)",
                whiteSpace: "pre",
                responsive: { mobile: { visibility: "hidden" } },
              },
            },
          },
          {
            id: "saas-nav-cta",
            kind: "button",
            props: {
              label: "Start free",
              href: "/signup",
              tone: "primary",
              style: {
                fontFamily: INTER,
                fontSize: "13px",
                backgroundColor: "#7df2c4",
                textColor: "#04130d",
                borderColor: "#7df2c4",
                borderWidth: "1px",
                borderStyle: "solid",
                transitionProperty: "background-color, transform, box-shadow",
                transitionDuration: "200ms",
                transitionTimingFunction: "ease",
                hover: {
                  backgroundColor: "#a7f7d6",
                  scale: "1.05",
                  boxShadow: "0 14px 34px rgba(125,242,196,0.4)",
                },
              },
            },
          },
        ],
      },
      // ── Hero ──────────────────────────────────────────────────────────────
      {
        id: "saas-hero",
        kind: "container",
        props: {
          layout: "stack",
          align: "center",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            minHeight: "840px",
            paddingTop: "112px",
            paddingRight: "28px",
            paddingBottom: "96px",
            paddingLeft: "28px",
            gap: "20px",
            backgroundImage:
              "radial-gradient(circle at 50% -8%, rgba(45,212,191,0.34), transparent 42%), linear-gradient(180deg,#08090d 0%,#0e1320 64%,#0b0e15 100%)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          },
        },
        children: [
          {
            id: "saas-kicker",
            kind: "paragraph",
            props: {
              text: "Usage-based billing infrastructure",
              style: {
                align: "center",
                fontFamily: INTER,
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                textColor: "#7dd3fc",
              },
            },
          },
          {
            id: "saas-headline",
            kind: "heading",
            props: {
              text: "Close every usage, billing, and activation loop in one calm console.",
              level: 1,
              style: {
                align: "center",
                fontFamily: GEIST,
                fontSize: "72px",
                lineHeight: "1.0",
                fontWeight: 700,
                letterSpacing: "-0.03em",
                textColor: "#f9fbff",
                maxWidthFree: "980px",
                textWrap: "balance",
                responsive: { tablet: { fontSize: "54px" }, mobile: { fontSize: "36px" } },
              },
            },
          },
          {
            id: "saas-subhead",
            kind: "paragraph",
            props: {
              text: "Meterly turns raw events into metered usage, self-reconciling invoices, and ranked account health — without spreading pricing logic through your product.",
              style: {
                align: "center",
                fontFamily: INTER,
                fontSize: "19px",
                lineHeight: "1.6",
                textColor: "rgba(233,240,252,0.72)",
                maxWidthFree: "680px",
              },
            },
          },
          {
            id: "saas-ctas",
            kind: "cta_group",
            props: {
              layout: "row",
              align: "center",
              style: { justifyContent: "center", gap: "12px", marginTopFree: "8px" },
            },
            children: [
              {
                id: "saas-cta-primary",
                kind: "button",
                props: {
                  label: "Create workspace",
                  href: "/signup",
                  tone: "primary",
                  style: {
                    fontFamily: INTER,
                    backgroundColor: "#7df2c4",
                    textColor: "#04130d",
                    borderColor: "#7df2c4",
                    borderWidth: "1px",
                    borderStyle: "solid",
                    transitionProperty: "transform, box-shadow",
                    transitionDuration: "200ms",
                    transitionTimingFunction: "ease",
                    hover: { scale: "1.04", boxShadow: "0 16px 38px rgba(125,242,196,0.36)" },
                  },
                },
              },
              {
                id: "saas-cta-secondary",
                kind: "button",
                props: {
                  label: "Watch the demo",
                  href: "/demo",
                  tone: "secondary",
                  style: {
                    fontFamily: INTER,
                    backgroundColor: "transparent",
                    textColor: "#f7fafe",
                    borderColor: "rgba(255,255,255,0.24)",
                    borderWidth: "1px",
                    borderStyle: "solid",
                    transitionProperty: "background-color, border-color",
                    transitionDuration: "200ms",
                    transitionTimingFunction: "ease",
                    hover: { backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.5)" },
                  },
                },
              },
            ],
          },
          {
            id: "saas-panel",
            kind: "container",
            props: {
              layout: "grid",
              columns: 2,
              responsive: { mobile: { layout: "stack", columns: 1 } },
              style: {
                width: "100%",
                maxWidthFree: "1040px",
                gap: "16px",
                paddingTop: "20px",
                paddingRight: "20px",
                paddingBottom: "20px",
                paddingLeft: "20px",
                marginTopFree: "52px",
                backgroundColor: "rgba(255,255,255,0.06)",
                backdropFilter: "blur(22px)",
                borderColor: "rgba(255,255,255,0.16)",
                borderWidth: "1px",
                borderStyle: "solid",
                borderRadius: "26px",
                boxShadow: "0 40px 130px rgba(0,0,0,0.5)",
              },
            },
            children: [
              {
                id: "saas-panel-photo-card",
                kind: "card",
                props: {
                  style: {
                    backgroundColor: "rgba(10,14,22,0.86)",
                    borderColor: "rgba(255,255,255,0.1)",
                    borderWidth: "1px",
                    borderStyle: "solid",
                    borderRadius: "18px",
                    gap: "14px",
                  },
                },
                children: [
                  {
                    id: "saas-panel-photo-title",
                    kind: "heading",
                    props: {
                      text: "Built with your team in the room",
                      level: 3,
                      style: { fontFamily: GEIST, fontSize: "20px", letterSpacing: "-0.01em", textColor: "#ffffff" },
                    },
                  },
                  {
                    id: "saas-panel-photo",
                    kind: "image",
                    props: {
                      src: pageDesignPhoto("studioDesk"),
                      alt: "A product team reviewing usage analytics at a studio desk",
                      style: {
                        width: "100%",
                        aspectRatio: "16:9",
                        objectFit: "cover",
                        objectPosition: "center",
                        borderRadius: "12px",
                      },
                    },
                  },
                  {
                    id: "saas-panel-photo-copy",
                    kind: "paragraph",
                    props: {
                      text: "Trial-to-paid +18.4% after usage gates aligned with the pricing model.",
                      style: { fontFamily: INTER, fontSize: "14px", lineHeight: "1.5", textColor: "rgba(233,240,252,0.66)" },
                    },
                  },
                ],
              },
              {
                // Polished in-context product console: a metered-usage readout
                // (status pill + three KPI figures + a 12-cycle bar chart +
                // axis + a mono usage-contract footer). Drawn entirely from the
                // builder's own primitives — the most honest "product-UI asset"
                // for the Asset axis (no fabricated screenshot). Proven in
                // saas-1440.png.
                // A container (not a `card`): the console holds layout
                // containers (header row, meter rows, footer), which the
                // builder's child policy intentionally disallows under `card`.
                // The `1.25rem` padding replicates the card class default so the
                // surface stays pixel-identical while remaining insert-valid.
                id: "saas-panel-code-card",
                kind: "container",
                props: {
                  layout: "stack",
                  style: {
                    backgroundColor: "rgba(5,8,13,0.92)",
                    borderColor: "rgba(125,242,196,0.22)",
                    borderWidth: "1px",
                    borderStyle: "solid",
                    borderRadius: "18px",
                    gap: "18px",
                    paddingTop: "1.25rem",
                    paddingRight: "1.25rem",
                    paddingBottom: "1.25rem",
                    paddingLeft: "1.25rem",
                  },
                },
                children: [
                  // Header: title + live status pill.
                  {
                    id: "saas-console-head",
                    kind: "container",
                    props: {
                      layout: "row",
                      align: "center",
                      style: { width: "100%", maxWidthFree: "100%", justifyContent: "space-between", gap: "10px" },
                    },
                    children: [
                      {
                        id: "saas-console-title",
                        kind: "heading",
                        props: {
                          text: "Usage this cycle",
                          level: 3,
                          style: { fontFamily: GEIST, fontSize: "20px", letterSpacing: "-0.01em", textColor: "#ffffff", marginBottomFree: "0px" },
                        },
                      },
                      {
                        id: "saas-console-pill",
                        kind: "paragraph",
                        props: {
                          text: "● Live · billing in 4d",
                          style: {
                            fontFamily: GEIST_MONO,
                            fontSize: "11.5px",
                            letterSpacing: "0.02em",
                            textColor: "#9ff5cf",
                            backgroundColor: "rgba(125,242,196,0.12)",
                            borderColor: "rgba(125,242,196,0.28)",
                            borderWidth: "1px",
                            borderStyle: "solid",
                            borderRadius: "999px",
                            paddingTop: "5px",
                            paddingBottom: "5px",
                            paddingLeft: "11px",
                            paddingRight: "11px",
                          },
                        },
                      },
                    ],
                  },
                  // KPI figures.
                  {
                    id: "saas-console-kpis",
                    kind: "container",
                    props: {
                      layout: "row",
                      align: "start",
                      style: { width: "100%", maxWidthFree: "100%", justifyContent: "space-between", gap: "12px" },
                    },
                    children: [
                      {
                        id: "saas-kpi-1",
                        kind: "container",
                        props: { layout: "stack", style: { gap: "3px", minWidth: "0" } },
                        children: [
                          { id: "saas-kpi-1-v", kind: "heading", props: { text: "4.82M", level: 4, style: { fontFamily: GEIST, fontSize: "27px", fontWeight: 700, letterSpacing: "-0.02em", textColor: "#ffffff", marginBottomFree: "0px" } } },
                          { id: "saas-kpi-1-l", kind: "paragraph", props: { text: "Metered events", style: { fontFamily: INTER, fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", textColor: "rgba(233,240,252,0.5)" } } },
                        ],
                      },
                      {
                        id: "saas-kpi-2",
                        kind: "container",
                        props: { layout: "stack", style: { gap: "3px", minWidth: "0" } },
                        children: [
                          { id: "saas-kpi-2-v", kind: "heading", props: { text: "$128.4k", level: 4, style: { fontFamily: GEIST, fontSize: "27px", fontWeight: 700, letterSpacing: "-0.02em", textColor: "#ffffff", marginBottomFree: "0px" } } },
                          { id: "saas-kpi-2-l", kind: "paragraph", props: { text: "Billed MTD", style: { fontFamily: INTER, fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", textColor: "rgba(233,240,252,0.5)" } } },
                        ],
                      },
                      {
                        id: "saas-kpi-3",
                        kind: "container",
                        props: { layout: "stack", style: { gap: "3px", minWidth: "0" } },
                        children: [
                          { id: "saas-kpi-3-v", kind: "heading", props: { text: "+18.4%", level: 4, style: { fontFamily: GEIST, fontSize: "27px", fontWeight: 700, letterSpacing: "-0.02em", textColor: "#7df2c4", marginBottomFree: "0px" } } },
                          { id: "saas-kpi-3-l", kind: "paragraph", props: { text: "vs last cycle", style: { fontFamily: INTER, fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", textColor: "rgba(233,240,252,0.5)" } } },
                        ],
                      },
                    ],
                  },
                  // Chart caption.
                  {
                    id: "saas-console-chart-label",
                    kind: "paragraph",
                    props: {
                      text: "Metered events · last 12 cycles",
                      style: { fontFamily: INTER, fontSize: "10.5px", letterSpacing: "0.16em", textTransform: "uppercase", textColor: "rgba(233,240,252,0.42)" },
                    },
                  },
                  // Bar chart (real builder nodes, bottom-aligned).
                  {
                    id: "saas-console-chart",
                    kind: "container",
                    props: {
                      layout: "grid",
                      align: "end",
                      style: {
                        width: "100%",
                        maxWidthFree: "100%",
                        // 12 even columns via a style override (the `columns` prop
                        // caps at 5); inline grid-template-columns wins over the
                        // class's repeat(--bn-columns). Bars bottom-align via align:end.
                        gridTemplateColumns: "repeat(12,minmax(0,1fr))",
                        gap: "6px",
                        height: `${USAGE_BAR_MAX}px`,
                        paddingTop: "4px",
                        borderColor: "rgba(255,255,255,0.08)",
                        borderWidth: "0px 0px 1px 0px",
                        borderStyle: "solid",
                      },
                    },
                    children: usageBarNodes(),
                  },
                  // Axis ends.
                  {
                    id: "saas-console-axis",
                    kind: "container",
                    props: {
                      layout: "row",
                      align: "center",
                      style: { width: "100%", maxWidthFree: "100%", justifyContent: "space-between", gap: "8px" },
                    },
                    children: [
                      { id: "saas-axis-start", kind: "paragraph", props: { text: "12 cycles ago", style: { fontFamily: GEIST_MONO, fontSize: "10.5px", textColor: "rgba(233,240,252,0.38)" } } },
                      { id: "saas-axis-end", kind: "paragraph", props: { text: "this cycle", style: { fontFamily: GEIST_MONO, fontSize: "10.5px", textColor: "#7df2c4" } } },
                    ],
                  },
                  // Mono usage-contract footer (kept from the original surface, compact).
                  {
                    id: "saas-panel-code",
                    kind: "paragraph",
                    props: {
                      text: "meter  api.request   → $0.0004 / unit\nclose  invoice.cycle  → billing.run",
                      style: {
                        fontFamily: GEIST_MONO,
                        fontSize: "12.5px",
                        lineHeight: "1.7",
                        whiteSpace: "pre",
                        textColor: "#9ff5cf",
                        backgroundColor: "rgba(125,242,196,0.07)",
                        borderRadius: "10px",
                        paddingTop: "12px",
                        paddingRight: "14px",
                        paddingBottom: "12px",
                        paddingLeft: "14px",
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      // ── Feature triad (P3 repeater) ───────────────────────────────────────
      {
        id: "saas-features",
        kind: "container",
        props: {
          layout: "grid",
          columns: 3,
          gap: "m",
          dataBinding: { sourceKey: "saas_capabilities", mode: "bound", repeat: true, maxItems: 3 },
          style: {
            width: "100%",
            maxWidthFree: "1180px",
            gap: "16px",
            paddingTop: "92px",
            paddingRight: "28px",
            paddingBottom: "96px",
            paddingLeft: "28px",
            backgroundColor: "#0b0e15",
            // 2-col at the 768 tablet width (was a cramped 3-up). gridTemplateColumns
            // is a STYLE-responsive override (renderer emits it !important inside the
            // tablet @media), NOT a `props.responsive.columns` value — the latter is
            // inert here without a paired `tablet.layout:"grid"`. Mobile auto-collapses
            // to one column (a container with no mobile.layout flexes to a stack).
            // Proven in saas-768.png / saas-390.png.
            responsive: { tablet: { gridTemplateColumns: "repeat(2,minmax(0,1fr))" } },
          },
        },
        children: [
          {
            id: "saas-feature-card",
            kind: "card",
            props: {
              style: {
                ...glassCardStyle,
                gap: "12px",
                transitionProperty: "transform, border-color, background-color",
                transitionDuration: "220ms",
                transitionTimingFunction: "ease",
                hover: {
                  translate: "0 -6px",
                  borderColor: "rgba(125,242,196,0.5)",
                  backgroundColor: "rgba(255,255,255,0.08)",
                },
              },
            },
            children: [
              {
                // Real supporting photography on every feature card (was type-only)
                // — bound per-item so the three cards show three distinct, stable
                // 16:9 crops. Closes half the saas Asset gap; proven in saas-1440.png.
                id: "saas-feature-image",
                kind: "image",
                props: {
                  src: pageDesignPhoto("studioScene"),
                  alt: "Feature illustration",
                  fieldBindings: { src: "imageUrl", alt: "title" },
                  style: {
                    width: "100%",
                    aspectRatio: "16:9",
                    objectFit: "cover",
                    objectPosition: "center",
                    borderRadius: "12px",
                    marginBottomFree: "4px",
                  },
                },
              },
              {
                id: "saas-feature-index",
                kind: "paragraph",
                props: {
                  text: "{{index}}",
                  fieldBindings: { text: "index" },
                  style: { fontFamily: GEIST_MONO, fontSize: "13px", letterSpacing: "0.1em", textColor: "#7df2c4" },
                },
              },
              {
                id: "saas-feature-title",
                kind: "heading",
                props: {
                  text: "{{title}}",
                  level: 3,
                  fieldBindings: { text: "title" },
                  style: { fontFamily: GEIST, fontSize: "21px", letterSpacing: "-0.01em", textColor: "#f7fafe", marginBottomFree: "0px" },
                },
              },
              {
                id: "saas-feature-body",
                kind: "paragraph",
                props: {
                  text: "{{body}}",
                  fieldBindings: { text: "body" },
                  style: { fontFamily: INTER, fontSize: "15px", lineHeight: "1.55", textColor: "#aebbcf" },
                },
              },
            ],
          },
        ],
      },
      // ── Pricing (P2 pricing_table) ────────────────────────────────────────
      {
        id: "saas-pricing-section",
        kind: "container",
        props: {
          layout: "stack",
          align: "center",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            gap: "12px",
            paddingTop: "8px",
            paddingRight: "28px",
            paddingBottom: "104px",
            paddingLeft: "28px",
            backgroundColor: "#0b0e15",
          },
        },
        children: [
          {
            id: "saas-pricing-heading",
            kind: "heading",
            props: {
              text: "Pricing that scales with usage, not seats",
              level: 2,
              style: {
                align: "center",
                fontFamily: GEIST,
                fontSize: "40px",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                textColor: "#f7fafe",
                maxWidthFree: "640px",
                textWrap: "balance",
                marginBottomFree: "18px",
                responsive: { mobile: { fontSize: "28px" } },
              },
            },
          },
          {
            id: "saas-pricing",
            kind: "pricing_table",
            props: {
              style: {
                fontFamily: INTER,
                maxWidthFree: "1100px",
                // 2-col at the 768 tablet width (was a cramped 3-up). The renderer's
                // tablet container query applies this !important grid-template over
                // the default --bn-pricing-columns:3; collapses to 1 on mobile via
                // the built-in pricing-table mobile rule. Proven in saas-768.png.
                responsive: { tablet: { gridTemplateColumns: "repeat(2,minmax(0,1fr))" } },
              },
              tiers: [
                {
                  id: "starter",
                  name: "Starter",
                  description: "For a first integration",
                  price: "$0",
                  period: "/mo",
                  ctaLabel: "Start free",
                  ctaHref: "/signup",
                  features: [
                    { label: "Up to 3 seats", included: true },
                    { label: "10k metered events / mo", included: true },
                    { label: "Community support", included: true },
                    { label: "Usage-based billing", included: false },
                  ],
                },
                {
                  id: "scale",
                  name: "Scale",
                  description: "For products with revenue",
                  price: "$49",
                  period: "/mo",
                  ctaLabel: "Start trial",
                  ctaHref: "/signup?plan=scale",
                  highlighted: true,
                  features: [
                    { label: "Unlimited seats", included: true },
                    { label: "1M metered events / mo", included: true },
                    { label: "Usage-based billing", included: true },
                    { label: "Priority support", included: true },
                  ],
                },
                {
                  id: "enterprise",
                  name: "Enterprise",
                  description: "For scale + compliance",
                  price: "Custom",
                  ctaLabel: "Contact sales",
                  ctaHref: "/contact",
                  features: [
                    { label: "SSO + audit log", included: true },
                    { label: "SLA + DPA", included: true },
                    { label: "Dedicated solutions engineer", included: true },
                    { label: "On-prem metering", included: true },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  },
];

export const saasDesign: PageDesign = {
  id: "saas",
  title: "SaaS product landing",
  label: "SaaS product",
  description:
    "A product landing page: a geometric-sans benefit hero, a three-up feature grid, a live console card, and a pricing table.",
  archetype: "saas",
  tree: saasTree,
  dataSources,
};
