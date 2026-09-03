import type { BuilderNode } from "../types";
import { pageDesignPhoto } from "./photos";
import type { PageDesign } from "./types";
import { INTER, FRAUNCES } from "./tokens";

/**
 * Services landing page — the design a salon, barber, spa or clinic should get.
 *
 * WHY THIS EXISTS
 * ───────────────
 * `signup-design-pick.ts` has no keyword row for salon, barber, spa or clinic,
 * so all four fall through `AUDIENCE_DEFAULT.business` to `store` — the
 * fine-art print storefront, whose nav said Shop and Collections and whose
 * button said "Add to cart, $280" against a fabricated price. A barbershop was
 * handed a shop with a cart in it.
 *
 * EVERY HREF HERE RESOLVES, AND THAT IS THE DESIGN CONSTRAINT
 * ──────────────────────────────────────────────────────────
 * Two destinations only:
 *   `/book`          allow-listed for every workspace type in
 *                    AGENCY_STOREFRONT_PREFIXES, so it renders on day one.
 *   `?inquiry=open`  the chat cue. Path-relative, so `prefixPublicHref` leaves
 *                    it alone on apex and path-prefixed tenants alike, and it
 *                    needs no route and no seeded page.
 *
 * Deliberately NO in-page anchors. A builder node's id is emitted as
 * `data-builder-node-id`, never a DOM `id`, and nothing resolves a hash href —
 * so the two designs that use `#menu` have inert primary buttons. Until the
 * anchor prop exists (Page Builder Director's), a new design may not depend on
 * one, and a silently inert button is worse than a loudly broken one.
 *
 * The service list is a decorative repeater, not a live block. A salon's real
 * services arrive on `/book` once F8 teaches `load-book-page-offerings.ts` to
 * accept house-owned timed offerings on capacity pools; the seam is with the
 * Appointments Manager. Until then this page is honest about being a front
 * door: it shows what the shop does and sends people somewhere that works.
 */

const INK = "#171512";
const PAPER = "#faf7f2";
const PANEL = "#f0ebe3";
const MUTED = "rgba(23,21,18,0.62)";
const LINE = "rgba(23,21,18,0.12)";
const ACCENT = "#7d5a3c";

const PHOTO = {
  hero: pageDesignPhoto("serviceProsScene"),
  room: pageDesignPhoto("studioDesk"),
};

/**
 * Decorative starter list. An operator edits these; nothing reads them, and a
 * salon's REAL services arrive on /book once F8 lands. Emitted as static rows
 * rather than a data-bound repeater: `dataSources` only carries the renderer's
 * own named collections, and a starter list is meant to be edited in the
 * builder, not resolved at render time.
 */
const SERVICE_ROWS = [
  { id: "s1", name: "Cut and finish", detail: "45 minutes", price: "$40" },
  { id: "s2", name: "Skin fade", detail: "30 minutes", price: "$28" },
  { id: "s3", name: "Beard shape", detail: "20 minutes", price: "$18" },
  { id: "s4", name: "Cut and beard", detail: "60 minutes", price: "$52" },
];

function serviceRow(
  row: { id: string; name: string; detail: string; price: string },
  index: number,
): BuilderNode {
  return {
    id: `services-row-${row.id}`,
    kind: "container",
    props: {
      layout: "row",
      align: "center",
      style: {
        width: "100%",
        gap: "16px",
        paddingTop: "22px",
        paddingBottom: "22px",
        borderWidth: "0 0 1px 0",
        borderColor: LINE,
        justifyContent: "space-between",
      },
    },
    children: [
      {
        id: `services-row-copy-${row.id}`,
        kind: "container",
        props: { layout: "stack", style: { gap: "4px", minWidth: "0px" } },
        children: [
          {
            id: `services-row-name-${row.id}`,
            kind: "heading",
            props: {
              text: row.name,
              level: 3,
              layerLabel: `Service ${index + 1}`,
              style: { fontFamily: INTER, fontSize: "18px", fontWeight: 600, textColor: INK },
            },
          },
          {
            id: `services-row-detail-${row.id}`,
            kind: "paragraph",
            props: {
              text: row.detail,
              layerLabel: "Detail",
              style: { fontFamily: INTER, fontSize: "14px", textColor: MUTED },
            },
          },
        ],
      },
      {
        id: `services-row-price-${row.id}`,
        kind: "paragraph",
        props: {
          text: row.price,
          layerLabel: "Price",
          style: {
            fontFamily: INTER,
            fontSize: "17px",
            fontWeight: 600,
            textColor: INK,
            align: "right",
          },
        },
      },
    ],
  };
}

const servicesTree: BuilderNode[] = [
  {
    id: "services-page",
    kind: "container",
    props: {
      layout: "stack",
      style: { width: "100%", maxWidthFree: "100%", gap: "0px", backgroundColor: PAPER },
    },
    children: [
      // ── Hero ────────────────────────────────────────────────────────────
      {
        id: "services-hero",
        kind: "container",
        props: {
          layout: "stack",
          align: "center",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            minHeight: "620px",
            position: "relative",
            overflow: "hidden",
            paddingTop: "0px",
            paddingRight: "0px",
            paddingBottom: "0px",
            paddingLeft: "0px",
          },
        },
        children: [
          {
            id: "services-hero-bg",
            kind: "image",
            props: {
              src: PHOTO.hero,
              alt: "The shop floor",
              layerLabel: "Hero image",
              style: {
                position: "absolute",
                width: "100%",
                height: "100%",
                objectFit: "cover",
                opacity: 0.28,
              },
            },
          },
          {
            id: "services-hero-inner",
            kind: "container",
            props: {
              layout: "stack",
              align: "center",
              style: {
                width: "100%",
                maxWidthFree: "760px",
                gap: "20px",
                paddingTop: "140px",
                paddingRight: "24px",
                paddingBottom: "140px",
                paddingLeft: "24px",
                position: "relative",
              },
            },
            children: [
              {
                id: "services-eyebrow",
                kind: "paragraph",
                props: {
                  text: "Open Tuesday to Saturday",
                  layerLabel: "Eyebrow",
                  style: {
                    align: "center",
                    fontFamily: INTER,
                    fontSize: "12px",
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    textColor: ACCENT,
                  },
                },
                i18n: { es: { text: "Abierto de martes a sábado" } },
              },
              {
                id: "services-headline",
                kind: "heading",
                props: {
                  text: "Sit down. We will take it from here.",
                  level: 1,
                  layerLabel: "Headline",
                  style: {
                    align: "center",
                    fontFamily: FRAUNCES,
                    fontSize: "62px",
                    fontWeight: 600,
                    lineHeight: "1.02",
                    letterSpacing: "-0.02em",
                    textColor: INK,
                    responsive: { mobile: { fontSize: "38px" } },
                  },
                },
                i18n: { es: { text: "Siéntate. Nosotros nos encargamos." } },
              },
              {
                id: "services-sub",
                kind: "paragraph",
                props: {
                  text: "Pick a service and a time that suits you. Walk-ins welcome when a chair is free.",
                  layerLabel: "Subheading",
                  style: {
                    align: "center",
                    fontFamily: INTER,
                    fontSize: "18px",
                    lineHeight: "1.6",
                    textColor: MUTED,
                    maxWidthFree: "520px",
                  },
                },
                i18n: {
                  es: {
                    text: "Elige un servicio y una hora que te acomode. Aceptamos visitas sin cita cuando hay silla libre.",
                  },
                },
              },
              {
                id: "services-hero-ctas",
                kind: "container",
                props: {
                  layout: "row",
                  align: "center",
                  style: { gap: "12px", paddingTop: "12px", flexWrap: "wrap" },
                },
                children: [
                  {
                    id: "services-hero-cta",
                    kind: "button",
                    props: {
                      // `/book` is allow-listed for every workspace type, so it
                      // renders on day one rather than 404ing like the store
                      // design's `/shop` did.
                      label: "Book a time",
                      href: "/book",
                      tone: "primary",
                      layerLabel: "Book a time",
                    },
                    i18n: { es: { label: "Agendar" } },
                  },
                  {
                    id: "services-hero-ask",
                    kind: "button",
                    props: {
                      // The chat cue. Needs no route and no seeded page.
                      label: "Ask us",
                      href: "?inquiry=open",
                      tone: "secondary",
                      layerLabel: "Ask us",
                    },
                    i18n: { es: { label: "Escríbenos" } },
                  },
                ],
              },
            ],
          },
        ],
      },

      // ── Service list ────────────────────────────────────────────────────
      {
        id: "services-list-section",
        kind: "container",
        props: {
          layout: "stack",
          align: "center",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            paddingTop: "104px",
            paddingRight: "24px",
            paddingBottom: "104px",
            paddingLeft: "24px",
            gap: "40px",
            backgroundColor: PAPER,
          },
        },
        children: [
          {
            id: "services-list-heading",
            kind: "heading",
            props: {
              text: "What we do",
              level: 2,
              layerLabel: "Section heading",
              style: {
                align: "center",
                fontFamily: FRAUNCES,
                fontSize: "38px",
                fontWeight: 600,
                textColor: INK,
              },
            },
            i18n: { es: { text: "Lo que hacemos" } },
          },
          {
            id: "services-list",
            kind: "container",
            props: {
              layout: "stack",
              style: {
                width: "100%",
                maxWidthFree: "720px",
                gap: "0px",
                borderWidth: "1px 0 0 0",
                borderColor: LINE,
              },
            },
            children: SERVICE_ROWS.map((row, index) => serviceRow(row, index)),
          },
          {
            id: "services-list-cta",
            kind: "button",
            props: {
              label: "See times and book",
              href: "/book",
              tone: "primary",
              layerLabel: "See times and book",
            },
            i18n: { es: { label: "Ver horarios y agendar" } },
          },
        ],
      },

      // ── The room ────────────────────────────────────────────────────────
      {
        id: "services-room",
        kind: "container",
        props: {
          layout: "row",
          align: "center",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            gap: "0px",
            backgroundColor: PANEL,
            flexWrap: "wrap",
          },
        },
        children: [
          {
            id: "services-room-image",
            kind: "image",
            props: {
              src: PHOTO.room,
              alt: "Inside the shop",
              layerLabel: "Room image",
              style: {
                width: "50%",
                minHeight: "460px",
                objectFit: "cover",
                responsive: { mobile: { width: "100%", minHeight: "280px" } },
              },
            },
          },
          {
            id: "services-room-copy",
            kind: "container",
            props: {
              layout: "stack",
              style: {
                width: "50%",
                gap: "16px",
                paddingTop: "72px",
                paddingRight: "56px",
                paddingBottom: "72px",
                paddingLeft: "56px",
                minWidth: "0px",
                responsive: {
                  mobile: { width: "100%", paddingRight: "24px", paddingLeft: "24px" },
                },
              },
            },
            children: [
              {
                id: "services-room-heading",
                kind: "heading",
                props: {
                  text: "Four chairs, no rush",
                  level: 2,
                  layerLabel: "Heading",
                  style: {
                    fontFamily: FRAUNCES,
                    fontSize: "34px",
                    fontWeight: 600,
                    textColor: INK,
                  },
                },
                i18n: { es: { text: "Cuatro sillas, sin prisa" } },
              },
              {
                id: "services-room-body",
                kind: "paragraph",
                props: {
                  text: "We keep the day deliberately unhurried. Book the chair you like, or tell us who you usually see and we will put you with them.",
                  layerLabel: "Body",
                  style: {
                    fontFamily: INTER,
                    fontSize: "17px",
                    lineHeight: "1.7",
                    textColor: MUTED,
                  },
                },
                i18n: {
                  es: {
                    text: "Cuidamos que el día no vaya con prisa. Reserva la silla que prefieras, o dinos con quién te atiendes normalmente y te acomodamos con esa persona.",
                  },
                },
              },
              {
                id: "services-room-cta",
                kind: "button",
                props: {
                  label: "Ask us anything",
                  href: "?inquiry=open",
                  tone: "secondary",
                  layerLabel: "Ask us anything",
                },
                i18n: { es: { label: "Pregúntanos lo que sea" } },
              },
            ],
          },
        ],
      },

      // ── Footer ──────────────────────────────────────────────────────────
      {
        id: "services-footer",
        kind: "container",
        props: {
          layout: "row",
          align: "center",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            gap: "16px",
            paddingTop: "40px",
            paddingRight: "40px",
            paddingBottom: "40px",
            paddingLeft: "40px",
            borderWidth: "1px 0 0 0",
            borderColor: LINE,
            justifyContent: "space-between",
            flexWrap: "wrap",
            backgroundColor: PAPER,
          },
        },
        children: [
          {
            id: "services-footer-brand",
            kind: "paragraph",
            props: {
              text: "The Shop",
              layerLabel: "Footer brand",
              style: {
                fontFamily: FRAUNCES,
                fontSize: "17px",
                fontWeight: 600,
                textColor: INK,
              },
            },
          },
          {
            id: "services-footer-hours",
            kind: "paragraph",
            props: {
              text: "Tue to Sat, 9 to 7",
              layerLabel: "Footer hours",
              style: {
                fontFamily: INTER,
                fontSize: "14px",
                textColor: MUTED,
                align: "right",
                responsive: { mobile: { align: "left" } },
              },
            },
            i18n: { es: { text: "Martes a sábado, 9 a 19" } },
          },
        ],
      },
    ],
  },
];

export const servicesDesign: PageDesign = {
  id: "services",
  title: "Services & booking landing page",
  label: "Services & booking",
  description:
    "A salon, barber, spa or clinic front door: a Fraunces hero, a priced service list, the room, and every call to action pointing at /book or the chat.",
  archetype: "services",
  tree: servicesTree,
};
