import type { BuilderNode } from "../../src/lib/site-admin/builder-node/types";
import type { FidelityDesign } from "./html";

function svgDataUri(label: string, background: string, foreground: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800">
  <rect width="1200" height="800" fill="${background}"/>
  <circle cx="930" cy="190" r="220" fill="${foreground}" opacity="0.22"/>
  <path d="M120 620 C330 420 470 490 650 310 S950 130 1080 260" fill="none" stroke="${foreground}" stroke-width="34" stroke-linecap="round" opacity="0.68"/>
  <text x="90" y="170" font-family="Arial, Helvetica, sans-serif" font-size="62" font-weight="700" fill="${foreground}">${label}</text>
</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const trivialTree: BuilderNode[] = [
  {
    id: "trivial-shell",
    kind: "container",
    props: {
      layout: "stack",
      align: "center",
      style: {
        maxWidthFree: "720px",
        minHeight: "640px",
        paddingTop: "96px",
        paddingRight: "32px",
        paddingBottom: "96px",
        paddingLeft: "32px",
        backgroundColor: "#fbfaf7",
      },
    },
    children: [
      {
        id: "trivial-kicker",
        kind: "paragraph",
        props: {
          text: "Builder fidelity harness",
          style: {
            align: "center",
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            textColor: "#746657",
            marginBottomFree: "0px",
          },
        },
      },
      {
        id: "trivial-heading",
        kind: "heading",
        props: {
          text: "Deterministic baseline",
          level: 1,
          style: {
            align: "center",
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: "64px",
            lineHeight: "0.95",
            letterSpacing: "0",
            textColor: "#171411",
            marginTopFree: "0px",
            marginBottomFree: "0px",
            responsive: {
              mobile: {
                fontSize: "44px",
              },
            },
          },
        },
      },
      {
        id: "trivial-copy",
        kind: "paragraph",
        props: {
          text: "A small BuilderNode tree rendered directly to static HTML, then captured at desktop, tablet, and mobile widths.",
          style: {
            align: "center",
            maxWidthFree: "560px",
            fontSize: "18px",
            lineHeight: "1.55",
            textColor: "#5f564e",
          },
        },
      },
      {
        id: "trivial-image",
        kind: "image",
        props: {
          src: svgDataUri("P1", "#e8ded1", "#30251e"),
          alt: "Abstract deterministic placeholder",
          style: {
            width: "100%",
            maxWidthFree: "520px",
            aspectRatio: "16:9",
            objectFit: "cover",
            borderRadius: "18px",
            boxShadow: "0 22px 80px rgba(34,24,16,0.16)",
          },
        },
      },
    ],
  },
];

const editorialTree: BuilderNode[] = [
  {
    id: "editorial-page",
    kind: "container",
    props: {
      layout: "stack",
      style: {
        width: "100%",
        maxWidthFree: "100%",
        gap: "0px",
        backgroundColor: "#f2ede5",
      },
    },
    children: [
      {
        id: "editorial-hero",
        kind: "container",
        props: {
          layout: "stack",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            minHeight: "900px",
            paddingTop: "32px",
            paddingRight: "44px",
            paddingBottom: "96px",
            paddingLeft: "44px",
            backgroundColor: "#ebe2d5",
            position: "relative",
            overflow: "hidden",
            responsive: {
              mobile: {
                paddingRight: "22px",
                paddingLeft: "22px",
                paddingBottom: "64px",
              },
            },
          },
        },
        children: [
          {
            id: "editorial-nav",
            kind: "container",
            props: {
              layout: "row",
              align: "center",
              style: {
                width: "100%",
                maxWidthFree: "1280px",
                justifyContent: "space-between",
                gap: "18px",
                marginBottomFree: "90px",
                responsive: {
                  mobile: {
                    marginBottomFree: "54px",
                  },
                },
              },
            },
            children: [
              {
                id: "editorial-brand",
                kind: "paragraph",
                props: {
                  text: "Atelier North",
                  style: {
                    fontSize: "13px",
                    fontWeight: 700,
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                    textColor: "#2f261f",
                  },
                },
              },
              {
                id: "editorial-nav-copy",
                kind: "paragraph",
                props: {
                  text: "Portraits / Campaigns / Motion",
                  style: {
                    align: "right",
                    fontSize: "12px",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    textColor: "#6d6257",
                    responsive: {
                      mobile: {
                        visibility: "hidden",
                      },
                    },
                  },
                },
              },
            ],
          },
          {
            id: "editorial-hero-split",
            kind: "split",
            props: {
              ratio: "40-60",
              gap: "l",
              collapseOnMobile: true,
              style: {
                width: "100%",
                maxWidthFree: "1280px",
                alignItems: "center",
              },
            },
            children: [
              {
                id: "editorial-copy-stack",
                kind: "container",
                props: {
                  layout: "stack",
                  style: {
                    zIndex: 2,
                    gap: "22px",
                  },
                },
                children: [
                  {
                    id: "editorial-kicker",
                    kind: "paragraph",
                    props: {
                      text: "Luxury editorial portfolio",
                      style: {
                        fontSize: "12px",
                        fontWeight: 700,
                        letterSpacing: "0.28em",
                        textTransform: "uppercase",
                        textColor: "#8b3f31",
                      },
                    },
                  },
                  {
                    id: "editorial-headline",
                    kind: "heading",
                    props: {
                      text: "Light for people who know how to hold it",
                      level: 1,
                      style: {
                        fontFamily: "Georgia, 'Times New Roman', serif",
                        fontSize: "92px",
                        lineHeight: "0.88",
                        letterSpacing: "0",
                        textColor: "#1b1713",
                        marginBottomFree: "0px",
                        maxWidthFree: "700px",
                        responsive: {
                          tablet: {
                            fontSize: "72px",
                          },
                          mobile: {
                            fontSize: "48px",
                          },
                        },
                      },
                    },
                  },
                  {
                    id: "editorial-intro",
                    kind: "paragraph",
                    props: {
                      text: "A tactile campaign system with oversized type, full-bleed crops, quiet navigation, and slow reveal moments.",
                      style: {
                        maxWidthFree: "520px",
                        fontSize: "19px",
                        lineHeight: "1.6",
                        textColor: "#62584f",
                      },
                    },
                  },
                  {
                    id: "editorial-cta",
                    kind: "button",
                    props: {
                      label: "View series",
                      href: "/portfolio",
                      tone: "secondary",
                      style: {
                        borderColor: "#1b1713",
                        textColor: "#1b1713",
                      },
                    },
                  },
                ],
              },
              {
                id: "editorial-hero-media",
                kind: "container",
                props: {
                  layout: "stack",
                  style: {
                    minHeight: "650px",
                    position: "relative",
                    maxWidthFree: "760px",
                    overflow: "visible",
                    responsive: {
                      mobile: {
                        minHeight: "480px",
                      },
                    },
                  },
                },
                children: [
                  {
                    id: "editorial-hero-image",
                    kind: "image",
                    props: {
                      src: svgDataUri("FULL BLEED", "#9c8a79", "#f3ede5"),
                      alt: "Abstract warm editorial hero",
                      style: {
                        width: "100%",
                        aspectRatioFree: "0.78",
                        objectFit: "cover",
                        borderRadius: "0px",
                        boxShadow: "0 40px 110px rgba(27,23,19,0.22)",
                      },
                    },
                  },
                  {
                    id: "editorial-overlap-image",
                    kind: "image",
                    props: {
                      src: svgDataUri("DETAIL", "#2f2924", "#d7b596"),
                      alt: "Abstract overlapping crop",
                      style: {
                        position: "absolute",
                        right: "-58px",
                        bottom: "72px",
                        width: "42%",
                        aspectRatio: "3:4",
                        objectFit: "cover",
                        borderRadius: "0px",
                        boxShadow: "0 28px 70px rgba(27,23,19,0.28)",
                        responsive: {
                          mobile: {
                            right: "0px",
                            bottom: "18px",
                            width: "52%",
                          },
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "editorial-grid",
        kind: "container",
        props: {
          layout: "grid",
          columns: 3,
          responsive: {
            tablet: { columns: 2 },
            mobile: { columns: 1 },
          },
          style: {
            width: "100%",
            maxWidthFree: "1280px",
            gap: "24px",
            paddingTop: "96px",
            paddingRight: "44px",
            paddingBottom: "64px",
            paddingLeft: "44px",
          },
        },
        children: [
          {
            id: "editorial-grid-a",
            kind: "image",
            props: {
              src: svgDataUri("01", "#6d5848", "#ead8c3"),
              alt: "Editorial crop one",
              style: { aspectRatio: "3:4", objectFit: "cover", borderRadius: "0px" },
            },
          },
          {
            id: "editorial-grid-b",
            kind: "image",
            props: {
              src: svgDataUri("02", "#c9b39d", "#3a2a22"),
              alt: "Editorial crop two",
              style: {
                aspectRatio: "4:3",
                objectFit: "cover",
                borderRadius: "0px",
                marginTopFree: "80px",
                responsive: {
                  mobile: {
                    marginTopFree: "0px",
                  },
                },
              },
            },
          },
          {
            id: "editorial-grid-c",
            kind: "image",
            props: {
              src: svgDataUri("03", "#2a2421", "#b9826f"),
              alt: "Editorial crop three",
              style: { aspectRatio: "3:4", objectFit: "cover", borderRadius: "0px" },
            },
          },
        ],
      },
      {
        id: "editorial-reveal",
        kind: "container",
        props: {
          layout: "stack",
          align: "center",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            paddingTop: "132px",
            paddingRight: "32px",
            paddingBottom: "132px",
            paddingLeft: "32px",
            backgroundColor: "#191512",
            animationPreset: "rise",
            animationTrigger: "scroll",
            animationDuration: "1s",
          },
        },
        children: [
          {
            id: "editorial-reveal-kicker",
            kind: "paragraph",
            props: {
              text: "Scroll reveal study",
              style: {
                align: "center",
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.3em",
                textTransform: "uppercase",
                textColor: "#c3a487",
              },
            },
          },
          {
            id: "editorial-reveal-heading",
            kind: "heading",
            props: {
              text: "The system can suggest motion. It cannot choreograph it yet.",
              level: 2,
              style: {
                align: "center",
                maxWidthFree: "900px",
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontSize: "60px",
                lineHeight: "1",
                textColor: "#f5efe6",
                responsive: {
                  mobile: {
                    fontSize: "36px",
                  },
                },
              },
            },
          },
        ],
      },
      {
        id: "editorial-footer",
        kind: "container",
        props: {
          layout: "row",
          align: "center",
          responsive: {
            mobile: { layout: "stack", align: "start" },
          },
          style: {
            width: "100%",
            maxWidthFree: "1280px",
            justifyContent: "space-between",
            paddingTop: "46px",
            paddingRight: "44px",
            paddingBottom: "46px",
            paddingLeft: "44px",
            gap: "20px",
          },
        },
        children: [
          {
            id: "editorial-footer-brand",
            kind: "paragraph",
            props: {
              text: "Atelier North / 2027",
              style: {
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                textColor: "#3d332c",
              },
            },
          },
          {
            id: "editorial-footer-copy",
            kind: "paragraph",
            props: {
              text: "Commissioned portraits, campaign direction, and moving image.",
              style: {
                align: "right",
                fontSize: "14px",
                textColor: "#6a5f54",
                responsive: {
                  mobile: {
                    align: "left",
                  },
                },
              },
            },
          },
        ],
      },
    ],
  },
];

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
        backgroundColor: "#090b10",
        textColor: "#f8fbff",
      },
    },
    children: [
      {
        id: "saas-nav",
        kind: "container",
        props: {
          layout: "row",
          align: "center",
          responsive: {
            mobile: { layout: "stack", align: "stretch" },
          },
          style: {
            width: "100%",
            maxWidthFree: "1180px",
            justifyContent: "space-between",
            gap: "18px",
            paddingTop: "18px",
            paddingRight: "28px",
            paddingBottom: "18px",
            paddingLeft: "28px",
            position: "sticky",
            top: "0px",
            zIndex: 20,
            backgroundColor: "rgba(9,11,16,0.76)",
            backdropFilter: "blur(18px)",
            borderColor: "rgba(255,255,255,0.12)",
            borderWidth: "1px",
            borderStyle: "solid",
            borderRadius: "22px",
            marginTopFree: "18px",
          },
        },
        children: [
          {
            id: "saas-logo",
            kind: "paragraph",
            props: {
              text: "OrbitOS",
              style: {
                fontSize: "15px",
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                textColor: "#ffffff",
              },
            },
          },
          {
            id: "saas-nav-links",
            kind: "paragraph",
            props: {
              text: "Product   Changelog   Pricing   Docs",
              style: {
                align: "center",
                fontSize: "13px",
                textColor: "rgba(235,242,255,0.68)",
                responsive: {
                  mobile: {
                    visibility: "hidden",
                  },
                },
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
                backgroundColor: "#a7f3d0",
                textColor: "#07100d",
                borderColor: "rgba(167,243,208,0.8)",
              },
            },
          },
        ],
      },
      {
        id: "saas-hero",
        kind: "container",
        props: {
          layout: "stack",
          align: "center",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            minHeight: "820px",
            paddingTop: "120px",
            paddingRight: "28px",
            paddingBottom: "92px",
            paddingLeft: "28px",
            backgroundImage:
              "radial-gradient(circle at 50% 0%, rgba(45,212,191,0.32), transparent 34%), linear-gradient(180deg,#090b10 0%,#101522 68%,#0d1017 100%)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          },
        },
        children: [
          {
            id: "saas-kicker",
            kind: "paragraph",
            props: {
              text: "Revenue automation for tiny teams",
              style: {
                align: "center",
                fontSize: "12px",
                fontWeight: 800,
                letterSpacing: "0.24em",
                textTransform: "uppercase",
                textColor: "#7dd3fc",
              },
            },
          },
          {
            id: "saas-headline",
            kind: "heading",
            props: {
              text: "Close usage, billing, and activation loops in one calm console.",
              level: 1,
              style: {
                align: "center",
                maxWidthFree: "980px",
                fontSize: "76px",
                lineHeight: "0.98",
                fontWeight: 800,
                letterSpacing: "0",
                textColor: "#f9fbff",
                textWrap: "balance",
                responsive: {
                  tablet: {
                    fontSize: "58px",
                  },
                  mobile: {
                    fontSize: "38px",
                  },
                },
              },
            },
          },
          {
            id: "saas-subhead",
            kind: "paragraph",
            props: {
              text: "A dark-mode marketing page with glass cards, a sticky nav, precise gutters, feature tiles, and a dashboard-like code surface.",
              style: {
                align: "center",
                maxWidthFree: "720px",
                fontSize: "19px",
                lineHeight: "1.6",
                textColor: "rgba(235,242,255,0.72)",
              },
            },
          },
          {
            id: "saas-ctas",
            kind: "cta_group",
            props: {
              layout: "row",
              align: "center",
              style: {
                justifyContent: "center",
                gap: "12px",
              },
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
                    backgroundColor: "#a7f3d0",
                    textColor: "#06110d",
                    borderColor: "#a7f3d0",
                  },
                },
              },
              {
                id: "saas-cta-secondary",
                kind: "button",
                props: {
                  label: "Watch demo",
                  href: "/demo",
                  tone: "secondary",
                  style: {
                    textColor: "#f8fbff",
                    borderColor: "rgba(255,255,255,0.26)",
                  },
                },
              },
            ],
          },
          {
            id: "saas-dashboard",
            kind: "container",
            props: {
              layout: "grid",
              columns: 2,
              responsive: {
                mobile: { layout: "stack", columns: 1 },
              },
              style: {
                width: "100%",
                maxWidthFree: "1040px",
                gap: "18px",
                paddingTop: "22px",
                paddingRight: "22px",
                paddingBottom: "22px",
                paddingLeft: "22px",
                marginTopFree: "54px",
                backgroundColor: "rgba(255,255,255,0.08)",
                backdropFilter: "blur(22px)",
                borderColor: "rgba(255,255,255,0.16)",
                borderWidth: "1px",
                borderStyle: "solid",
                borderRadius: "28px",
                boxShadow: "0 40px 130px rgba(0,0,0,0.44)",
              },
            },
            children: [
              {
                id: "saas-chart-card",
                kind: "card",
                props: {
                  variant: "ghost",
                  style: {
                    backgroundColor: "rgba(12,17,28,0.86)",
                    borderColor: "rgba(255,255,255,0.12)",
                    borderWidth: "1px",
                    borderStyle: "solid",
                    borderRadius: "20px",
                    gap: "14px",
                  },
                },
                children: [
                  {
                    id: "saas-chart-title",
                    kind: "heading",
                    props: {
                      text: "Activation pulse",
                      level: 3,
                      style: {
                        fontSize: "22px",
                        textColor: "#ffffff",
                      },
                    },
                  },
                  {
                    id: "saas-chart-copy",
                    kind: "paragraph",
                    props: {
                      text: "Trial to paid +18.4% after usage gates aligned.",
                      style: {
                        fontSize: "15px",
                        textColor: "rgba(235,242,255,0.68)",
                      },
                    },
                  },
                  {
                    id: "saas-chart-image",
                    kind: "image",
                    props: {
                      src: svgDataUri("METRICS", "#101827", "#7dd3fc"),
                      alt: "Abstract metrics chart",
                      style: {
                        aspectRatio: "16:9",
                        objectFit: "cover",
                        borderRadius: "16px",
                      },
                    },
                  },
                ],
              },
              {
                id: "saas-code-card",
                kind: "card",
                props: {
                  variant: "ghost",
                  style: {
                    backgroundColor: "rgba(7,10,16,0.92)",
                    borderColor: "rgba(167,243,208,0.22)",
                    borderWidth: "1px",
                    borderStyle: "solid",
                    borderRadius: "20px",
                    gap: "18px",
                  },
                },
                children: [
                  {
                    id: "saas-code-title",
                    kind: "heading",
                    props: {
                      text: "Usage contract",
                      level: 3,
                      style: {
                        fontSize: "22px",
                        textColor: "#ffffff",
                      },
                    },
                  },
                  {
                    id: "saas-code-copy",
                    kind: "paragraph",
                    props: {
                      text: "event: invoice.closed\nsignal: account.health\nroute: success.playbook",
                      style: {
                        fontFamily: "Menlo, Consolas, monospace",
                        fontSize: "14px",
                        lineHeight: "1.7",
                        whiteSpace: "pre-line",
                        textColor: "#a7f3d0",
                        backgroundColor: "rgba(167,243,208,0.08)",
                        borderRadius: "14px",
                        paddingTop: "18px",
                        paddingRight: "18px",
                        paddingBottom: "18px",
                        paddingLeft: "18px",
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "saas-feature-grid",
        kind: "container",
        props: {
          layout: "grid",
          columns: 3,
          responsive: {
            tablet: { columns: 2 },
            mobile: { columns: 1 },
          },
          style: {
            width: "100%",
            maxWidthFree: "1180px",
            gap: "18px",
            paddingTop: "88px",
            paddingRight: "28px",
            paddingBottom: "110px",
            paddingLeft: "28px",
            backgroundColor: "#0d1017",
          },
        },
        children: [
          {
            id: "saas-feature-a",
            kind: "card",
            props: {
              variant: "ghost",
              style: {
                backgroundColor: "rgba(255,255,255,0.06)",
                borderColor: "rgba(255,255,255,0.12)",
                borderWidth: "1px",
                borderStyle: "solid",
                borderRadius: "18px",
              },
            },
            children: [
              {
                id: "saas-feature-a-title",
                kind: "heading",
                props: {
                  text: "01 Plan logic",
                  level: 3,
                  style: { fontSize: "20px", textColor: "#f8fbff" },
                },
              },
              {
                id: "saas-feature-a-copy",
                kind: "paragraph",
                props: {
                  text: "Map entitlements, limits, and upgrade nudges without spreading pricing copy through JSX.",
                  style: { fontSize: "15px", lineHeight: "1.55", textColor: "#b9c4d6" },
                },
              },
            ],
          },
          {
            id: "saas-feature-b",
            kind: "card",
            props: {
              variant: "ghost",
              style: {
                backgroundColor: "rgba(255,255,255,0.06)",
                borderColor: "rgba(255,255,255,0.12)",
                borderWidth: "1px",
                borderStyle: "solid",
                borderRadius: "18px",
              },
            },
            children: [
              {
                id: "saas-feature-b-title",
                kind: "heading",
                props: {
                  text: "02 Health loops",
                  level: 3,
                  style: { fontSize: "20px", textColor: "#f8fbff" },
                },
              },
              {
                id: "saas-feature-b-copy",
                kind: "paragraph",
                props: {
                  text: "Bring usage, billing, onboarding, and support events into one ranked operator queue.",
                  style: { fontSize: "15px", lineHeight: "1.55", textColor: "#b9c4d6" },
                },
              },
            ],
          },
          {
            id: "saas-feature-c",
            kind: "card",
            props: {
              variant: "ghost",
              style: {
                backgroundColor: "rgba(255,255,255,0.06)",
                borderColor: "rgba(255,255,255,0.12)",
                borderWidth: "1px",
                borderStyle: "solid",
                borderRadius: "18px",
              },
            },
            children: [
              {
                id: "saas-feature-c-title",
                kind: "heading",
                props: {
                  text: "03 Quiet reports",
                  level: 3,
                  style: { fontSize: "20px", textColor: "#f8fbff" },
                },
              },
              {
                id: "saas-feature-c-copy",
                kind: "paragraph",
                props: {
                  text: "Share executive summaries with precise spacing, dark surfaces, and stable responsive tiles.",
                  style: { fontSize: "15px", lineHeight: "1.55", textColor: "#b9c4d6" },
                },
              },
            ],
          },
        ],
      },
    ],
  },
];

export const fidelityDesigns: FidelityDesign[] = [
  {
    id: "trivial",
    title: "Trivial deterministic self-test",
    tree: trivialTree,
  },
  {
    id: "editorial",
    title: "Editorial photography portfolio",
    tree: editorialTree,
  },
  {
    id: "saas",
    title: "SaaS marketing landing",
    tree: saasTree,
  },
];
