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

export const fidelityDesigns: FidelityDesign[] = [
  {
    id: "trivial",
    title: "Trivial deterministic self-test",
    tree: trivialTree,
  },
];
