import type { BuilderNode } from "../types";
import type { PageDesign } from "./types";
import { CINZEL, INTER } from "./tokens";
import { CLAY, HAIR, INK, MUTE, PAPER, PHOTO } from "./store.parts";

/**
 * Simpler store / retail page whose catalogue section uses a live `menu_board`
 * node for workspace-owned orderable items.
 */

const storeOrderableTree: BuilderNode[] = [
  {
    id: "store-orderable-page",
    kind: "container",
    props: {
      layout: "stack",
      style: {
        width: "100%",
        maxWidthFree: "100%",
        gap: "0px",
        backgroundColor: "#f4f1ea",
        textColor: INK,
      },
    },
    children: [
      {
        id: "store-orderable-nav",
        kind: "nav",
        props: {
          brand: "ATELIER LUMA",
          brandHref: "/",
          collapseAt: "mobile",
          menuLabel: "Menu",
          ariaLabel: "Primary",
          links: [
            { id: "n1", label: "Shop", href: "#menu" },
            { id: "n2", label: "About", href: "?inquiry=open" },
            { id: "n3", label: "Contact", href: "?inquiry=open" },
          ],
          style: {
            width: "100%",
            maxWidthFree: "1200px",
            fontFamily: CINZEL,
            fontSize: "13px",
            letterSpacing: "0.14em",
            textColor: INK,
            paddingTop: "22px",
            paddingRight: "40px",
            paddingBottom: "22px",
            paddingLeft: "40px",
            responsive: { mobile: { paddingRight: "20px", paddingLeft: "20px" } },
          },
        },
      },
      // ── Intro ───────────────────────────────────────────────────────────────
      {
        id: "store-orderable-intro",
        kind: "container",
        props: {
          layout: "stack",
          align: "center",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            gap: "16px",
            paddingTop: "72px",
            paddingRight: "40px",
            paddingBottom: "48px",
            paddingLeft: "40px",
            responsive: { mobile: { paddingRight: "20px", paddingLeft: "20px", paddingTop: "48px" } },
          },
        },
        children: [
          {
            id: "store-orderable-eyebrow",
            kind: "paragraph",
            props: {
              text: "Shop the catalogue",
              style: {
                align: "center",
                fontFamily: CINZEL,
                fontSize: "12px",
                fontWeight: 600,
                letterSpacing: "0.2em",
                textColor: CLAY,
              },
            },
          },
          {
            id: "store-orderable-title",
            kind: "heading",
            props: {
              text: "Order from the shop",
              level: 1,
              style: {
                align: "center",
                fontFamily: CINZEL,
                fontSize: "52px",
                lineHeight: "1.02",
                fontWeight: 600,
                letterSpacing: "0.01em",
                textColor: INK,
                marginBottomFree: "0px",
                responsive: { tablet: { fontSize: "42px" }, mobile: { fontSize: "34px" } },
              },
            },
          },
          {
            id: "store-orderable-sub",
            kind: "paragraph",
            props: {
              text: "Published workspace items with quantities and a simple order form.",
              style: {
                align: "center",
                fontFamily: INTER,
                fontSize: "16px",
                lineHeight: "1.6",
                textColor: MUTE,
                maxWidthFree: "480px",
              },
            },
          },
          {
            id: "store-orderable-hero-image",
            kind: "image",
            props: {
              src: PHOTO.print,
              alt: "Featured product",
              style: {
                width: "100%",
                maxWidthFree: "720px",
                aspectRatioFree: "1.4",
                objectFit: "cover",
                objectPosition: "center",
                borderRadius: "3px",
                marginTopFree: "28px",
                boxShadow: "0 34px 90px rgba(29,26,22,0.18)",
              },
            },
          },
        ],
      },
      // ── Orderable catalogue (menu_board) ────────────────────────────────────
      {
        id: "store-orderable-menu",
        kind: "container",
        props: {
          layout: "stack",
          align: "center",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            gap: "12px",
            paddingTop: "64px",
            paddingRight: "40px",
            paddingBottom: "84px",
            paddingLeft: "40px",
            backgroundColor: PAPER,
            borderColor: HAIR,
            borderWidth: "1px",
            borderStyle: "solid",
            animationPreset: "rise",
            animationTrigger: "scroll",
            animationRepeat: "once",
            animationDuration: "0.9s",
            responsive: { mobile: { paddingRight: "20px", paddingLeft: "20px" } },
          },
        },
        children: [
          {
            id: "store-orderable-menu-inner",
            kind: "container",
            props: {
              layout: "stack",
              style: { width: "100%", maxWidthFree: "720px", gap: "20px" },
            },
            children: [
              {
                id: "store-orderable-menu-board",
                kind: "menu_board",
                props: {
                  title: "Catalogue",
                  subtitle: "Choose what you want and send the order.",
                  emptyMessage: "Menu items are not published yet.",
                  style: {
                    width: "100%",
                    maxWidthFree: "100%",
                    fontFamily: INTER,
                    textColor: INK,
                  },
                },
              },
            ],
          },
        ],
      },
      // ── Footer ──────────────────────────────────────────────────────────────
      {
        id: "store-orderable-footer",
        kind: "container",
        props: {
          layout: "row",
          align: "center",
          responsive: { mobile: { layout: "stack", align: "start" } },
          style: {
            width: "100%",
            maxWidthFree: "1200px",
            justifyContent: "space-between",
            paddingTop: "44px",
            paddingRight: "40px",
            paddingBottom: "44px",
            paddingLeft: "40px",
            gap: "14px",
            borderColor: HAIR,
            borderWidth: "1px",
            borderStyle: "solid",
          },
        },
        children: [
          {
            id: "store-orderable-footer-brand",
            kind: "paragraph",
            props: {
              text: "ATELIER LUMA",
              style: {
                fontFamily: CINZEL,
                fontSize: "15px",
                letterSpacing: "0.16em",
                textColor: INK,
              },
            },
          },
          {
            id: "store-orderable-footer-copy",
            kind: "paragraph",
            props: {
              text: "Orderable catalogue · Mexico City",
              style: {
                align: "right",
                fontFamily: INTER,
                fontSize: "14px",
                textColor: MUTE,
                responsive: { mobile: { align: "left" } },
              },
            },
          },
        ],
      },
    ],
  },
];

export const storeOrderableDesign: PageDesign = {
  id: "store-orderable",
  title: "Store & menu (orderable)",
  label: "Store & menu (orderable)",
  description:
    "A simple retail page with a Cinzel wordmark, product intro, and a live menu_board for workspace orderable items.",
  archetype: "store",
  tree: storeOrderableTree,
};
