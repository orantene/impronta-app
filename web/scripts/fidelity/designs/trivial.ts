import type { BuilderNode } from "../../../src/lib/site-admin/builder-node/types";
import { fidelityPhotoSrc } from "../fixtures";
import type { FidelityDesign } from "../html";
import { FRAUNCES, INTER } from "./tokens";

/**
 * Trivial deterministic self-test.
 *
 * The smallest meaningful tree: one stacked container with an eyebrow, a serif
 * headline, a line of copy, and a single REAL photo. It is the determinism
 * baseline (the desktop static frame must re-render with 0 byte-diff) and the
 * simplest exercise of the font bridge (Fraunces + Inter) and the served-photo
 * pipeline (a root-relative src the renderer accepts — a `data:` SVG would
 * render nothing).
 */
const trivialTree: BuilderNode[] = [
  {
    id: "trivial-shell",
    kind: "container",
    props: {
      layout: "stack",
      align: "center",
      style: {
        maxWidthFree: "760px",
        minHeight: "640px",
        paddingTop: "96px",
        paddingRight: "32px",
        paddingBottom: "96px",
        paddingLeft: "32px",
        backgroundColor: "#fbfaf7",
        gap: "20px",
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
            fontFamily: INTER,
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            textColor: "#8a7a66",
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
            fontFamily: FRAUNCES,
            fontSize: "64px",
            lineHeight: "0.95",
            letterSpacing: "-0.01em",
            textColor: "#171411",
            marginTopFree: "0px",
            marginBottomFree: "0px",
            responsive: { mobile: { fontSize: "44px" } },
          },
        },
      },
      {
        id: "trivial-copy",
        kind: "paragraph",
        props: {
          text: "A small BuilderNode tree rendered to static HTML, then captured at desktop, tablet, and mobile widths with real fonts and a real photograph.",
          style: {
            align: "center",
            fontFamily: INTER,
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
          src: fidelityPhotoSrc("studioScene"),
          alt: "Creative professionals at work in a loft studio",
          style: {
            width: "100%",
            maxWidthFree: "560px",
            aspectRatio: "16:9",
            objectFit: "cover",
            borderRadius: "18px",
            boxShadow: "0 22px 80px rgba(34,24,16,0.18)",
          },
        },
      },
    ],
  },
];

export const trivialDesign: FidelityDesign = {
  id: "trivial",
  title: "Trivial deterministic self-test",
  tree: trivialTree,
};
