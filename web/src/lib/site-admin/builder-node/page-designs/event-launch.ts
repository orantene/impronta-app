import type { BuilderNode } from "../types";
import { pageDesignPhoto } from "./photos";
import type { BuilderNodeRenderDataSources } from "../render";
import type { PageDesign } from "./types";
import { CINZEL, RALEWAY } from "./tokens";

/**
 * ARCHETYPE 5b — Event launch, night edition (a launch party / club night).
 *
 * Born from the Impronta LUMINA launch (2026-09-16), where the engine's
 * `/events/<slug>` page was "one paragraph and a form". A launch party is
 * sold on a phone, from an Instagram link, in one scroll: a full-bleed hero
 * with the night's name and date and one CTA; the programme as a vertical
 * timeline with hour badges; "what awaits you" as an image card grid; two
 * show bands; a promo band for the late entry; the tickets; a VIP table
 * card with its rule; the venue; a FAQ; a footer. Gold on black, Cinzel
 * display over Raleway body, so it lands in the same register as the
 * Impronta noir designs and reads as an invitation, not a form.
 *
 * MOBILE FIRST. Every section collapses to one column at 390 with 16px
 * gutters; the hero's CTA row stacks; the timeline's hour column stays.
 *
 * Tickets: a `pricing_table` placeholder, NOT a `ticket_picker`. A shipped
 * design may not render "not set up yet" (`no-unconfigured-native-block`);
 * the tenant swaps the placeholder for a real `ticket_picker` (Buy tickets
 * card, `layout: "cards"`) once they pick the event, and the picker carries
 * the same tier-card look: every tier inline with its price, a stepper on
 * the card, an order bar, and the checkout in a sheet.
 *
 * DEEP LINKS. Every call to action that means ONE ticket (the late-entry
 * promo, the VIP card, the placeholder table's own buttons) links to
 * `?tier=<pool key>#entradas`, not a bare `#entradas`. The picker reads
 * `?tier=` (a variant UUID or the tier's pool key), preselects one unit,
 * scrolls to the section and opens the checkout. The keys are what
 * `poolKeyFor(label)` mints for these labels; a tenant who relabels a tier
 * keeps its key, so the links survive the rename.
 *
 * Copy is neutral Mexican Spanish on purpose: this design's first tenant
 * sells in Mexico, and every string is editable in the builder.
 */

/** `?tier=<pool key>#entradas` for the three placeholder tiers (see DEEP LINKS). */
const TIER_LINK = {
  general: "?tier=entrada_general#entradas",
  late: "?tier=despues_de_las_23_h#entradas",
  mesa: "?tier=mesa_para_10#entradas",
} as const;

const PHOTO = {
  hero: pageDesignPhoto("eventNightBeams"),
  runway: pageDesignPhoto("eventNightRunway"),
  fire: pageDesignPhoto("eventNightFire"),
  silks: pageDesignPhoto("eventNightSilks"),
};

const dataSources: BuilderNodeRenderDataSources = {};

const BG = "#0a0a0a";
const RAISED = "#151310";
const INK = "#f4eee2";
const MUTE = "rgba(244,238,226,0.62)";
const GOLD = "#c9a227";
const GOLD_ON = "#1a1407";
const LINE = "rgba(201,162,39,0.22)";

const GUTTER = { paddingRight: "40px", paddingLeft: "40px", responsive: { mobile: { paddingRight: "16px", paddingLeft: "16px" } } } as const;

function eyebrow(id: string, text: string, align: "left" | "center" = "left"): BuilderNode {
  return {
    id,
    kind: "paragraph",
    props: {
      text,
      style: { align, fontFamily: CINZEL, fontSize: "12px", fontWeight: 600, letterSpacing: "0.28em", textTransform: "uppercase", textColor: GOLD, marginBottomFree: "8px" },
    },
  };
}

function sectionTitle(id: string, text: string, align: "left" | "center" = "left"): BuilderNode {
  return {
    id,
    kind: "heading",
    props: {
      text,
      level: 2,
      style: { align, fontFamily: CINZEL, fontSize: "44px", fontWeight: 400, letterSpacing: "0.03em", lineHeight: "1.1", textColor: INK, marginBottomFree: "28px", responsive: { mobile: { fontSize: "30px", marginBottomFree: "20px" } } },
    },
  };
}

function goldButton(id: string, label: string, href: string, tone: "primary" | "secondary" = "primary"): BuilderNode {
  return {
    id,
    kind: "button",
    props: {
      label,
      href,
      tone,
      style: {
        fontFamily: RALEWAY,
        fontSize: "13px",
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        borderRadius: "2px",
        paddingTop: "15px",
        paddingBottom: "15px",
        paddingLeft: "26px",
        paddingRight: "26px",
        ...(tone === "primary"
          ? { backgroundColor: GOLD, textColor: GOLD_ON, borderColor: GOLD }
          : { backgroundColor: "rgba(0,0,0,0)", textColor: INK, borderColor: "rgba(244,238,226,0.32)" }),
        responsive: { mobile: { width: "100%" } },
      },
    },
  };
}

/** One programme row: hour badge + what happens. */
function slot(id: string, hour: string, title: string, note?: string, big = false): BuilderNode {
  return {
    id,
    kind: "container",
    props: {
      layout: "row",
      align: "start",
      style: {
        gap: "20px",
        paddingTop: "14px",
        paddingBottom: "14px",
      },
    },
    children: [
      {
        id: `${id}-hour`,
        kind: "heading",
        props: {
          text: hour,
          level: 3,
          style: { fontFamily: CINZEL, fontSize: "15px", fontWeight: 600, letterSpacing: "0.06em", textColor: GOLD, maxWidthFree: "64px", marginBottomFree: "0px", paddingTop: "4px" },
        },
      },
      {
        id: `${id}-copy`,
        kind: "container",
        props: {
          layout: "stack",
          style: big
            ? { gap: "4px", paddingTop: "16px", paddingBottom: "16px", paddingLeft: "18px", paddingRight: "18px", backgroundColor: RAISED, borderRadius: "14px", borderWidth: "1px", borderColor: LINE, width: "100%" }
            : { gap: "2px", width: "100%" },
        },
        children: [
          {
            id: `${id}-title`,
            kind: "heading",
            props: {
              text: title,
              level: 3,
              style: big
                ? { fontFamily: CINZEL, fontSize: "20px", fontWeight: 400, letterSpacing: "0.03em", textColor: INK, marginBottomFree: "0px" }
                : { fontFamily: RALEWAY, fontSize: "16px", fontWeight: 600, textColor: INK, marginBottomFree: "0px" },
            },
          },
          ...(note
            ? [
                {
                  id: `${id}-note`,
                  kind: "paragraph" as const,
                  props: { text: note, style: { fontFamily: RALEWAY, fontSize: "14px", textColor: MUTE } },
                },
              ]
            : []),
        ],
      },
    ],
  };
}

function imageCard(id: string, src: string, alt: string, title: string, note: string): BuilderNode {
  return {
    id,
    kind: "card",
    props: { variant: "outline", style: { backgroundColor: RAISED, borderColor: LINE, borderRadius: "20px", paddingTop: "0px", paddingRight: "0px", paddingBottom: "14px", paddingLeft: "0px", gap: "10px" } },
    children: [
      { id: `${id}-img`, kind: "image", props: { src, alt, style: { width: "100%", aspectRatio: "4:3", objectFit: "cover", borderRadius: "20px 20px 0 0" } } },
      { id: `${id}-t`, kind: "heading", props: { text: title, level: 3, style: { fontFamily: RALEWAY, fontSize: "16px", fontWeight: 600, textColor: INK, marginBottomFree: "0px", paddingLeft: "14px", paddingRight: "14px" } } },
      { id: `${id}-n`, kind: "paragraph", props: { text: note, style: { fontFamily: RALEWAY, fontSize: "13px", textColor: MUTE, paddingLeft: "14px", paddingRight: "14px" } } },
    ],
  };
}

function textCard(id: string, glyph: string, title: string, note: string): BuilderNode {
  return {
    id,
    kind: "card",
    props: { variant: "outline", style: { backgroundColor: RAISED, borderColor: LINE, borderRadius: "20px", paddingTop: "22px", paddingRight: "16px", paddingBottom: "18px", paddingLeft: "16px", gap: "8px" } },
    children: [
      { id: `${id}-g`, kind: "heading", props: { text: glyph, level: 3, style: { fontFamily: CINZEL, fontSize: "30px", fontWeight: 400, textColor: GOLD, marginBottomFree: "4px" } } },
      { id: `${id}-t`, kind: "heading", props: { text: title, level: 3, style: { fontFamily: RALEWAY, fontSize: "16px", fontWeight: 600, textColor: INK, marginBottomFree: "0px" } } },
      { id: `${id}-n`, kind: "paragraph", props: { text: note, style: { fontFamily: RALEWAY, fontSize: "13px", textColor: MUTE } } },
    ],
  };
}

/**
 * A show band: the photo edge to edge under a vertical fade, copy at the foot.
 *
 * The pale vertical strips the owner saw at both edges (390 and 1440) were
 * not this stack: `event-night-fire.jpg` and `event-night-silks.jpg` shipped
 * with a 22-32px white frame baked into the file, and `cover` on a wide band
 * put the frame's left and right columns inside the visible area, where the
 * 55% dark side gradient turned them grey. The assets are now cropped to
 * their content box (edges measured at ~1,4,5 RGB), so every consumer of the
 * two photos (these bands, the image cards, the VIP split) reads dark to the
 * edge. The side gradient stays as a vignette.
 */
function showBand(id: string, src: string, alt: string, title: string, note: string): BuilderNode {
  return {
    id,
    kind: "container",
    props: {
      layout: "stack",
      align: "start",
      style: {
        minHeight: "360px",
        borderRadius: "20px",
        paddingTop: "140px",
        paddingRight: "24px",
        paddingBottom: "24px",
        paddingLeft: "24px",
        backgroundColor: BG,
        backgroundImage:
          "linear-gradient(180deg, rgba(10,10,10,0.05) 0%, rgba(10,10,10,0.35) 40%, rgba(10,10,10,0.94) 100%), linear-gradient(90deg, rgba(10,10,10,0.55) 0%, rgba(10,10,10,0) 18%, rgba(10,10,10,0) 82%, rgba(10,10,10,0.55) 100%), url('" +
          src +
          "')",
        backgroundSize: "cover, cover, cover",
        backgroundPosition: "center, center, center",
        overflow: "hidden",
        gap: "6px",
        responsive: { mobile: { minHeight: "280px", paddingTop: "120px" } },
      },
    },
    children: [
      { id: `${id}-sr`, kind: "paragraph", props: { text: alt, style: { fontSize: "1px", textColor: "rgba(0,0,0,0)", marginBottomFree: "0px" } } },
      { id: `${id}-t`, kind: "heading", props: { text: title, level: 3, style: { fontFamily: CINZEL, fontSize: "28px", fontWeight: 400, letterSpacing: "0.03em", textColor: INK, marginBottomFree: "0px" } } },
      { id: `${id}-n`, kind: "paragraph", props: { text: note, style: { fontFamily: RALEWAY, fontSize: "14px", textColor: MUTE } } },
    ],
  };
}

function faq(id: string, q: string, a: string): BuilderNode {
  return {
    id,
    kind: "accordion_item",
    props: { title: q, style: { fontFamily: RALEWAY, textColor: INK, borderColor: LINE } },
    children: [{ id: `${id}-a`, kind: "paragraph", props: { text: a, style: { fontFamily: RALEWAY, fontSize: "15px", textColor: MUTE, maxWidthFree: "64ch" } } }],
  };
}

const eventLaunchTree: BuilderNode[] = [
  {
    id: "event-launch-page",
    kind: "container",
    props: {
      layout: "stack",
      // `fullBleed` on the root, the strip and the hero: "width 100%" is only
      // 100% of the PARENT, and every page root the builder wraps a design in
      // carries the 1120px container cap - the LUMINA page shipped with black
      // gutters either side of everything. The flag breaks out to the viewport
      // whatever wraps it; the 1120px inner columns below stay centred.
      style: { width: "100%", maxWidthFree: "100%", fullBleed: true, gap: "0px", backgroundColor: BG, textColor: INK, fontFamily: RALEWAY },
    },
    children: [
      // ── Announcement strip ───────────────────────────────────────────────
      {
        id: "el-bar",
        kind: "container",
        props: { layout: "row", align: "center", style: { width: "100%", maxWidthFree: "100%", fullBleed: true, backgroundColor: GOLD, paddingTop: "9px", paddingBottom: "9px", ...GUTTER } },
        children: [
          {
            id: "el-bar-text",
            kind: "paragraph",
            props: { text: "Sáb 3 oct · Cancún · Entradas disponibles", style: { align: "center", width: "100%", fontFamily: RALEWAY, fontSize: "11px", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", textColor: GOLD_ON, marginBottomFree: "0px" } },
          },
        ],
      },
      // ── Full-bleed hero ──────────────────────────────────────────────────
      {
        id: "el-hero",
        kind: "container",
        props: {
          layout: "stack",
          align: "start",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            fullBleed: true,
            minHeight: "92svh",
            paddingTop: "40px",
            paddingBottom: "64px",
            ...GUTTER,
            gap: "0px",
            backgroundColor: BG,
            backgroundImage: "linear-gradient(180deg, rgba(10,10,10,0.15) 0%, rgba(10,10,10,0.55) 55%, rgba(10,10,10,1) 100%), url('" + PHOTO.hero + "')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            textColor: INK,
            responsive: { mobile: { minHeight: "88svh", paddingTop: "24px", paddingBottom: "96px", paddingRight: "16px", paddingLeft: "16px" } },
          },
        },
        children: [
          {
            id: "el-hero-inner",
            kind: "container",
            props: { layout: "stack", align: "start", style: { width: "100%", maxWidthFree: "1120px", gap: "0px", marginTopFree: "38svh", responsive: { mobile: { marginTopFree: "30svh" } } } },
            children: [
              eyebrow("el-hero-eyebrow", "Impronta Models presenta"),
              {
                id: "el-hero-title",
                kind: "heading",
                props: {
                  text: "LUMINA",
                  level: 1,
                  style: { fontFamily: CINZEL, fontSize: "120px", lineHeight: "0.95", fontWeight: 400, letterSpacing: "0.12em", textColor: INK, marginTopFree: "6px", marginBottomFree: "10px", responsive: { tablet: { fontSize: "88px" }, mobile: { fontSize: "56px" } } },
                },
              },
              {
                id: "el-hero-sub",
                kind: "heading",
                props: { text: "Fiesta de lanzamiento", level: 2, style: { fontFamily: CINZEL, fontSize: "20px", fontWeight: 400, letterSpacing: "0.14em", textColor: INK, marginBottomFree: "18px", responsive: { mobile: { fontSize: "17px" } } } },
              },
              {
                id: "el-hero-date",
                kind: "paragraph",
                props: { text: "Sábado 3 de octubre · 18:00 h → 3:00 am · Cancún, Quintana Roo", style: { fontFamily: RALEWAY, fontSize: "13px", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", textColor: MUTE, marginBottomFree: "26px" } },
              },
              {
                id: "el-hero-ctas",
                kind: "cta_group",
                props: { layout: "row", gap: "s", align: "start", style: { responsive: { mobile: { width: "100%" } } } },
                children: [goldButton("el-hero-cta-1", "Comprar entradas", "#entradas"), goldButton("el-hero-cta-2", "Ver el programa", "#programa", "secondary")],
              },
            ],
          },
        ],
      },
      // ── Marquee ──────────────────────────────────────────────────────────
      {
        id: "el-marquee",
        kind: "marquee",
        props: {
          items: [{ text: "7 DJs" }, { text: "Desfile de moda" }, { text: "Show de fuego" }, { text: "Parrilla gourmet" }, { text: "Telas y aros" }, { text: "Feria artesanal" }, { text: "Apertura 23:00" }],
          speed: "slow",
          separator: "diamond",
          variant: "text",
          pauseOnHover: true,
          style: { fontFamily: CINZEL, fontSize: "12px", letterSpacing: "0.3em", textTransform: "uppercase", textColor: MUTE, paddingTop: "12px", paddingBottom: "12px" },
        },
      },
      // ── Programme timeline ───────────────────────────────────────────────
      {
        id: "el-programa",
        kind: "container",
        anchorId: "programa",
        props: { layout: "stack", align: "start", style: { width: "100%", maxWidthFree: "1120px", paddingTop: "72px", paddingBottom: "56px", ...GUTTER, gap: "0px" } },
        children: [
          eyebrow("el-programa-eyebrow", "La noche"),
          sectionTitle("el-programa-title", "El programa"),
          {
            id: "el-programa-list",
            kind: "container",
            props: { layout: "grid", columns: 2, gap: "l", responsive: { mobile: { columns: 1 } }, style: { width: "100%" } },
            children: [
              slot("el-s1", "18:00", "Arranca LUMINA", "Abren las puertas. Puesto de hidratación y feria artesanal desde el inicio."),
              slot("el-s2", "18–20", "Juegos de kermés", "Dos horas de juegos, premios y parrilla encendida."),
              slot("el-s3", "20:00", "Show de magia + malabares"),
              slot("el-s4", "21:00", "Desfile de moda", "La pasarela Impronta: nuestro roster en vivo.", true),
              slot("el-s5", "22:30", "Show premium “Mi corazón se apaga”", undefined, true),
              slot("el-s6", "23:00", "Apertura LUMINA", "Entrada después de las 23 h: $500 con un trago.", true),
              slot("el-s7", "1:30", "Show de fuego 🔥"),
              slot("el-s8", "3:00", "Show de telas + aros", "Cierre aéreo."),
            ],
          },
        ],
      },
      // ── What awaits you ──────────────────────────────────────────────────
      {
        id: "el-espera",
        kind: "container",
        props: { layout: "stack", align: "start", style: { width: "100%", maxWidthFree: "1120px", paddingBottom: "56px", ...GUTTER, gap: "0px" } },
        children: [
          eyebrow("el-espera-eyebrow", "Lo que te espera"),
          sectionTitle("el-espera-title", "Nos acompañan"),
          {
            id: "el-espera-grid",
            kind: "container",
            props: { layout: "grid", columns: 3, gap: "m", responsive: { tablet: { columns: 2 }, mobile: { columns: 2 } }, style: { width: "100%" } },
            children: [
              imageCard("el-c1", PHOTO.runway, "Silueta de una modelo caminando la pasarela bajo luz dorada", "7 DJs estratégicamente seleccionados", "Toda la noche, cabina a cabina."),
              textCard("el-c2", "🔥", "Parrilla gourmet", "Brasas desde las 18 h"),
              textCard("el-c3", "🍕", "Pizza gourmet", "Horno a la vista"),
              textCard("el-c4", "🍨", "Puesto de helados", "Toda la noche"),
              textCard("el-c5", "✦", "Mini feria artesanal", "Diseño local"),
              textCard("el-c6", "💧", "Puesto de hidratación", "Agua libre toda la noche"),
            ],
          },
        ],
      },
      // ── Shows ────────────────────────────────────────────────────────────
      {
        id: "el-shows",
        kind: "container",
        props: { layout: "stack", align: "start", style: { width: "100%", maxWidthFree: "1120px", paddingBottom: "56px", ...GUTTER, gap: "0px" } },
        children: [
          eyebrow("el-shows-eyebrow", "Desfile & shows"),
          {
            id: "el-shows-grid",
            kind: "container",
            props: { layout: "grid", columns: 2, gap: "m", responsive: { mobile: { columns: 1 } }, style: { width: "100%" } },
            children: [
              showBand("el-show-1", PHOTO.fire, "Artista de fuego girando poi encendidos contra el cielo nocturno", "Show de fuego · 1:30 am", "Cuando la pista está llena, el fuego sale al patio."),
              showBand("el-show-2", PHOTO.silks, "Acróbata en telas aéreas doradas suspendida sobre el escenario", "Telas + aros · 3:00 am", "El cierre, en el aire."),
            ],
          },
        ],
      },
      // ── Late-entry promo band ────────────────────────────────────────────
      {
        id: "el-promo",
        kind: "container",
        props: { layout: "stack", align: "start", style: { width: "100%", maxWidthFree: "1120px", paddingBottom: "56px", ...GUTTER, gap: "0px" } },
        children: [
          {
            id: "el-promo-band",
            kind: "container",
            props: { layout: "stack", align: "start", style: { width: "100%", borderRadius: "20px", borderWidth: "1px", borderColor: GOLD, backgroundColor: RAISED, paddingTop: "28px", paddingRight: "24px", paddingBottom: "28px", paddingLeft: "24px", gap: "8px" } },
            children: [
              eyebrow("el-promo-eyebrow", "Después de las 23 h"),
              { id: "el-promo-t", kind: "heading", props: { text: "Entrada $500 · incluye 1 trago", level: 3, style: { fontFamily: CINZEL, fontSize: "26px", fontWeight: 400, letterSpacing: "0.03em", textColor: INK, marginBottomFree: "0px" } } },
              { id: "el-promo-n", kind: "paragraph", props: { text: "Llegas para la apertura LUMINA. Compra ahora y entra directo.", style: { fontFamily: RALEWAY, fontSize: "15px", textColor: MUTE, marginBottomFree: "10px" } } },
              goldButton("el-promo-cta", "Elegir esta entrada", TIER_LINK.late, "secondary"),
            ],
          },
        ],
      },
      // ── Tickets (placeholder; the tenant swaps in Buy tickets) ───────────
      {
        id: "el-entradas",
        kind: "container",
        anchorId: "entradas",
        props: { layout: "stack", align: "start", style: { width: "100%", maxWidthFree: "1120px", paddingBottom: "72px", ...GUTTER, gap: "0px" } },
        children: [
          eyebrow("el-entradas-eyebrow", "Entradas"),
          sectionTitle("el-entradas-title", "Elige tu entrada"),
          {
            id: "el-entradas-table",
            kind: "pricing_table",
            props: {
              style: { fontFamily: RALEWAY, textColor: INK },
              tiers: [
                { id: "general", name: "Entrada general", description: "Acceso desde las 18:00", price: "$1,000", period: "MXN", ctaLabel: "Comprar", ctaHref: TIER_LINK.general, highlighted: false, features: [{ label: "Incluye copa de vino" }] },
                { id: "late", name: "Después de las 23 h", description: "Acceso desde la apertura", price: "$500", period: "MXN", ctaLabel: "Comprar", ctaHref: TIER_LINK.late, highlighted: false, features: [{ label: "Incluye 1 trago" }] },
                { id: "mesa", name: "Mesa para 10", description: "Toda la noche", price: "$15,000", period: "MXN", ctaLabel: "Reservar mesa", ctaHref: TIER_LINK.mesa, highlighted: true, features: [{ label: "Hasta 10 personas" }, { label: "$10,000 en consumo" }, { label: "Ubicación preferente" }] },
              ],
            },
          },
          // No "Cortesía: solo por invitación" note here. A link-only tier is
          // the picker's own business: it shows a "Solo con enlace" mark on
          // the card only when `?tier=` names that tier, and says nothing to
          // everybody else. A standing paragraph told every guest about a
          // ticket they could not buy.
        ],
      },
      // ── VIP table ────────────────────────────────────────────────────────
      {
        id: "el-vip",
        kind: "container",
        props: { layout: "stack", align: "start", style: { width: "100%", maxWidthFree: "1120px", paddingBottom: "72px", ...GUTTER, gap: "0px" } },
        children: [
          {
            id: "el-vip-split",
            kind: "split",
            props: { ratio: "50-50", gap: "s", collapseOnMobile: true, style: { width: "100%", borderRadius: "20px", borderWidth: "1px", borderColor: GOLD, backgroundColor: RAISED } },
            children: [
              // At 390 the column stacks: the image goes FIRST with an explicit
              // 4:5 area (the photo's own ratio) and `height:auto`, so the
              // desktop `height:100%` (which only means something beside a
              // sibling column) can never leave a tall empty box above the copy.
              { id: "el-vip-img", kind: "image", props: { src: PHOTO.silks, alt: "Mesa VIP bajo luz cálida y dorada", style: { width: "100%", height: "100%", objectFit: "cover", borderRadius: "20px 0 0 20px", responsive: { mobile: { aspectRatioFree: "4 / 5", height: "auto", order: -1, borderRadius: "20px 20px 0 0" } } } } },
              {
                id: "el-vip-copy",
                kind: "container",
                props: { layout: "stack", align: "start", style: { paddingTop: "40px", paddingRight: "36px", paddingBottom: "40px", paddingLeft: "36px", gap: "10px", responsive: { mobile: { paddingTop: "22px", paddingRight: "20px", paddingBottom: "24px", paddingLeft: "20px" } } } },
                children: [
                  eyebrow("el-vip-eyebrow", "Mesa VIP"),
                  { id: "el-vip-t", kind: "heading", props: { text: "Tu mesa, toda la noche", level: 3, style: { fontFamily: CINZEL, fontSize: "30px", fontWeight: 400, letterSpacing: "0.03em", textColor: INK, marginBottomFree: "6px" } } },
                  { id: "el-vip-r1", kind: "paragraph", props: { text: "◆  Hasta 10 personas por mesa", style: { fontFamily: RALEWAY, fontSize: "15px", textColor: INK, marginBottomFree: "0px" } } },
                  { id: "el-vip-r2", kind: "paragraph", props: { text: "◆  $10,000 MXN en consumo incluidos", style: { fontFamily: RALEWAY, fontSize: "15px", textColor: INK, marginBottomFree: "0px" } } },
                  { id: "el-vip-r3", kind: "paragraph", props: { text: "◆  Ubicación preferente frente a la pasarela", style: { fontFamily: RALEWAY, fontSize: "15px", textColor: INK, marginBottomFree: "0px" } } },
                  { id: "el-vip-r4", kind: "paragraph", props: { text: "◆  Solo 20 mesas", style: { fontFamily: RALEWAY, fontSize: "15px", textColor: INK, marginBottomFree: "14px" } } },
                  goldButton("el-vip-cta", "Reservar mesa · $15,000", TIER_LINK.mesa),
                ],
              },
            ],
          },
        ],
      },
      // ── Venue ────────────────────────────────────────────────────────────
      {
        id: "el-lugar",
        kind: "container",
        props: { layout: "stack", align: "start", style: { width: "100%", maxWidthFree: "1120px", paddingBottom: "72px", ...GUTTER, gap: "0px" } },
        children: [
          eyebrow("el-lugar-eyebrow", "Dónde"),
          sectionTitle("el-lugar-title", "El lugar"),
          {
            id: "el-lugar-map",
            kind: "location_map",
            props: {
              eyebrow: "",
              headline: "Impronta Studio · Cancún",
              subheadline: "Puertas 18:00 h · Apertura LUMINA 23:00 h · Cierre 3:00 am. Estacionamiento y zona de taxis en la entrada.",
              source: "manual",
              items: [{ label: "Impronta Studio", region: "Cancún, Quintana Roo", href: "?inquiry=open", featured: true, status: "active" }],
              showMap: true,
              mapStyle: "editorial",
              style: { fontFamily: RALEWAY, textColor: INK },
            },
          },
        ],
      },
      // ── FAQ ──────────────────────────────────────────────────────────────
      {
        id: "el-faq",
        kind: "container",
        props: { layout: "stack", align: "start", style: { width: "100%", maxWidthFree: "1120px", paddingBottom: "96px", ...GUTTER, gap: "0px" } },
        children: [
          eyebrow("el-faq-eyebrow", "Preguntas"),
          sectionTitle("el-faq-title", "FAQ"),
          {
            id: "el-faq-acc",
            kind: "accordion",
            props: { allowMultiple: false, style: { width: "100%", fontFamily: RALEWAY, textColor: INK } },
            children: [
              faq("el-q1", "¿Qué incluye cada entrada?", "General: copa de vino. Después de las 23 h: un trago. Mesa para 10: la mesa toda la noche y $10,000 MXN en consumo."),
              faq("el-q2", "Dress code", "Elegante nocturno. Dorado y negro son bienvenidos."),
              faq("el-q3", "Edad mínima", "Mayores de 18 años con identificación."),
              faq("el-q4", "Reembolsos y transferencias", "Puedes transferir tu entrada a otra persona desde el enlace de tu ticket. No hay reembolsos después del 1 de octubre."),
              faq("el-q5", "¿Cómo entro?", "Recibes un e-mail con tu QR. Lo muestras en la puerta desde el teléfono; no hace falta imprimir."),
            ],
          },
        ],
      },
    ],
  },
];

export const eventLaunchDesign: PageDesign = {
  id: "event-launch",
  title: "Event launch, night edition",
  label: "Launch party",
  description:
    "A one-scroll launch-party page sold from a phone: full-bleed hero, programme timeline with hour badges, image card grid, show bands, a late-entry promo, tickets, a VIP table card, the venue and a FAQ. Gold on black.",
  archetype: "festival",
  tree: eventLaunchTree,
  dataSources,
};
