/**
 * Impronta rebuild — 404 (`/p/404`, noindex, excluded from the sitemap).
 *
 * One on-brand band: oversized serif "404", an editorial line, and routes back
 * to the roster and the contact page.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  copy,
  ctaRow,
  eyebrow,
  goldButton,
  headingLine,
  lineButton,
  GOLD_BRIGHT,
  INK,
  RISE,
  SERIF,
  TEXT,
  type ImprontaRebuildPage,
} from "../shared";

const notFoundBand: BuilderNode = {
  id: "rb-404-band",
  kind: "container",
  props: {
    layout: "stack",
    align: "center",
    layerLabel: "Not found",
    style: {
      width: "100%",
      maxWidthFree: "100%",
      minHeight: "78vh",
      paddingTop: "120px",
      paddingRight: "32px",
      paddingBottom: "120px",
      paddingLeft: "32px",
      gap: "0px",
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: INK,
      backgroundImage:
        "radial-gradient(120% 80% at 50% 0%, rgba(201,162,39,0.10), rgba(201,162,39,0) 60%)",
      textColor: TEXT,
      responsive: {
        mobile: {
          paddingTop: "88px",
          paddingBottom: "88px",
          paddingRight: "20px",
          paddingLeft: "20px",
        },
      },
    },
  },
  children: [
    {
      id: "rb-404-inner",
      kind: "container",
      props: {
        layout: "stack",
        align: "center",
        layerLabel: "Content",
        style: {
          width: "100%",
          maxWidthFree: "720px",
          gap: "0px",
          align: "center",
          ...RISE,
        },
      },
      children: [
        eyebrow("rb-404-eyebrow", "Page not found"),
        {
          id: "rb-404-numeral",
          kind: "heading",
          props: {
            text: "404",
            level: 1,
            layerLabel: "404 numeral",
            style: {
              fontFamily: SERIF,
              fontStyle: "italic",
              fontWeight: 300,
              fontSize: "clamp(6rem, 18vw, 13rem)",
              lineHeight: "0.9",
              letterSpacing: "-0.02em",
              textColor: GOLD_BRIGHT,
              opacity: 0.9,
              align: "center",
              marginBottomFree: "0px",
            },
          },
        },
        headingLine("rb-404-line", "This face is not on the roster.", {
          size: "section",
          level: 2,
          align: "center",
          layerLabel: "Statement",
        }),
        copy(
          "rb-404-sub",
          "The page you were looking for moved, retired or never made the cut. The talent, happily, are all still here.",
          { align: "center", maxWidth: "520px", size: "lead", marginTop: "18px" },
        ),
        ctaRow("rb-404-actions", [
          goldButton("rb-404-directory", "Browse the roster", "/directory"),
          lineButton("rb-404-contact", "Contact the agency", "/p/contact"),
        ]),
      ],
    },
  ],
};

const tree: BuilderNode[] = [notFoundBand];

export const notFoundPage: ImprontaRebuildPage = {
  slug: "404",
  title: "Page Not Found",
  seo: {
    meta_title: "Page Not Found | Impronta",
    meta_description: "This page is not on the roster. Browse Impronta's represented talent or contact the agency.",
    og_title: "Page not found",
    og_description: "This face is not on the roster.",
    canonical_url: "/p/404",
    noindex: true,
    include_in_sitemap: false,
  },
  tree,
};
