/**
 * Ticket #209: portfolio, reviews, alert band, task picker, spec table, visit,
 * masthead, statement footer, comp card and utility bar can hold a
 * per-language version of their text.
 *
 * Per kind: (1) no `contentLocale` or no overlay renders the SAME markup as
 * before, (2) a Spanish overlay replaces the English copy, (3) an English
 * overlay on a Spanish-base node does the reverse.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { blankOffering } from "@/lib/talent/offerings-types";
import { LIVE_STATUS_OFF, type LiveStatusRenderContext } from "@/lib/talent/live-status-render";

import { localizeBlockNode } from "./block-i18n";
import { createBuilderNode } from "./create";
import {
  renderBuilderNodes,
  type BuilderNodeContentLocaleOptions,
  type BuilderNodeRenderDataSources,
} from "./render";
import type { TalentCompFieldRow } from "./comp-card-types";
import type { TalentSiteReview } from "./reviews-types";
import type { BuilderNode, BuilderNodeKind } from "./types";

const ES: BuilderNodeContentLocaleOptions = { locale: "es", defaultLocale: "en", chain: ["en"] };
const EN: BuilderNodeContentLocaleOptions = { locale: "en", defaultLocale: "es", chain: ["es"] };
const LIVE_ON: LiveStatusRenderContext = { ...LIVE_STATUS_OFF, emergenciesToday: true, emergenciesUntil: "2099-01-01T00:00:00.000Z" };

function render(
  nodes: BuilderNode[],
  dataSources: BuilderNodeRenderDataSources,
  contentLocale?: BuilderNodeContentLocaleOptions,
): string {
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      dataSources,
      ...(contentLocale ? { contentLocale } : {}),
    }) as Parameters<typeof renderToStaticMarkup>[0],
  );
}

type Overlay = Record<string, Record<string, string>>;

function node(kind: BuilderNodeKind, id: string, props: Record<string, unknown>, i18n?: Overlay): BuilderNode {
  const base = createBuilderNode(kind);
  const merged = { ...base.props, ...props, ...(i18n ? { i18n } : {}) };
  return { ...base, id, props: merged, ...(i18n ? { i18n } : {}) } as BuilderNode;
}

const REVIEW: TalentSiteReview = {
  id: "r1",
  body: "She made my nails look effortless.",
  clientName: "Ana",
  rating: 5,
  createdAt: "2026-09-01T12:00:00.000Z",
};

function compRow(fieldKey: string, label: string, value: string): TalentCompFieldRow {
  return { fieldKey, label, value, group: "Physical", unit: null };
}

const COMP_ROWS: TalentCompFieldRow[] = [
  compRow("physical.height_cm", "Height (cm)", "172 cm"),
  compRow("physical.bust_cm", "Bust", "84 cm"),
  compRow("physical.waist_cm", "Waist", "62 cm"),
  compRow("physical.hips_cm", "Hips", "90 cm"),
];

interface Case {
  kind: BuilderNodeKind;
  props: Record<string, unknown>;
  dataSources: BuilderNodeRenderDataSources;
  /** The block already switches its OWN chrome language on `contentLocale` (comp card measure labels). */
  chromeFollowsLocale?: boolean;
  /** English base copy that must be visible without an overlay. */
  english: string[];
  overlayEs: Record<string, string>;
  /** Spanish copy that must be visible with the overlay and `es`. */
  spanish: string[];
}

const CASES: Case[] = [
  {
    kind: "portfolio",
    props: { eyebrow: "Latest", title: "Recent work", emptyMessage: "No photos in your portfolio yet." },
    dataSources: {},
    english: ["Latest", "Recent work", "No photos in your portfolio yet."],
    overlayEs: { eyebrow: "Lo ultimo", title: "Trabajo reciente", emptyMessage: "Aun no hay fotos en el portafolio." },
    spanish: ["Lo ultimo", "Trabajo reciente", "Aun no hay fotos en el portafolio."],
  },
  {
    kind: "reviews",
    props: { eyebrow: "Client praise", title: "What they say" },
    dataSources: { talentReviews: [REVIEW] },
    english: ["Client praise", "What they say", "She made my nails look effortless."],
    overlayEs: { eyebrow: "Elogios", title: "Lo que dicen" },
    spanish: ["Elogios", "Lo que dicen", "She made my nails look effortless."],
  },
  {
    kind: "alert_band",
    props: {
      title: "Same-day emergency",
      body: "We come today.",
      safetyLabel: "Meanwhile:",
      safetyNote: "Turn off the main switch.",
      ctaLabel: "Request now",
      ctaHref: "/contact",
    },
    dataSources: { liveStatus: LIVE_ON },
    english: ["Same-day emergency", "We come today.", "Meanwhile:", "Turn off the main switch.", "Request now"],
    overlayEs: {
      title: "Emergencia el mismo dia",
      body: "Vamos hoy.",
      safetyLabel: "Mientras tanto:",
      safetyNote: "Apaga el interruptor principal.",
      ctaLabel: "Pedir ahora",
    },
    spanish: ["Emergencia el mismo dia", "Vamos hoy.", "Mientras tanto:", "Apaga el interruptor principal.", "Pedir ahora"],
  },
  {
    kind: "task_picker",
    chromeFollowsLocale: true,
    props: {
      eyebrow: "Start here",
      title: "What do you need?",
      tasks: [{ id: "t1", label: "Power is out", icon: "sparkle", offeringId: "rev" }],
      defaultOfferingId: "rev",
    },
    dataSources: {
      talentOfferings: [
        {
          ...blankOffering("tp-1", "MXN", 0),
          id: "rev",
          title: "Revision",
          status: "published",
          visibility: "public",
          moderationState: "approved",
          bookingMode: "instant",
          amountCents: 50000,
          durationMinutes: 45,
        },
      ],
    },
    english: ["Start here", "What do you need?"],
    overlayEs: { eyebrow: "Empieza aqui", title: "Que necesitas?" },
    spanish: ["Empieza aqui", "Que necesitas?"],
  },
  {
    kind: "spec_table",
    props: {
      eyebrow: "Facts",
      title: "How it works",
      rows: [
        { label: "Response", value: "Within the hour" },
        { label: "Warranty", value: "One year" },
      ],
    },
    dataSources: {},
    english: ["Facts", "How it works", "Response", "Within the hour", "Warranty", "One year"],
    overlayEs: {
      eyebrow: "Datos",
      title: "Como funciona",
      "rows.0.label": "Respuesta",
      "rows.0.value": "En menos de una hora",
      "rows.1.label": "Garantia",
    },
    spanish: ["Datos", "Como funciona", "Respuesta", "En menos de una hora", "Garantia", "One year"],
  },
  {
    kind: "visit",
    props: {
      layout: "facts",
      eyebrow: "Your visit",
      title: "Where I work",
      titleAccent: "",
    },
    dataSources: { talentVisitFacts: [{ label: "Where", value: "Monterrey", icon: "place" }] },
    english: ["Your visit", "Where I work"],
    overlayEs: { eyebrow: "Tu visita", title: "Donde trabajo" },
    spanish: ["Tu visita", "Donde trabajo"],
  },
  {
    kind: "masthead",
    chromeFollowsLocale: true,
    props: {
      lines: ["Studio"],
      splitWords: false,
      showCover: true,
      coverSrc: "https://cdn.example/head.jpg",
      edition: "magazine",
      subline: "Editorial model",
      coverLine: "Model",
      coverStatement: "Editorial, runway and campaigns.",
      mastRight: "Mexico City",
      bio: "Based in the city.",
      ctaLabel: "Ask about this",
      ctaHref: "#talent-ask",
      bookLabel: "See the book",
      bookHref: "#chapter-1",
      contentsTitle: "In this issue",
      contents: [
        { label: "Selected work", anchor: "chapter-1", credit: "" },
        { label: "Rates", anchor: "services", credit: "Rates and dates" },
      ],
    },
    dataSources: {},
    english: [
      "Editorial, runway and campaigns.",
      "Based in the city.",
      "Ask about this",
      "See the book",
      "In this issue",
      "Selected work",
      "Rates and dates",
    ],
    overlayEs: {
      coverStatement: "Editorial, runway y campanas.",
      bio: "Vivo en la ciudad.",
      ctaLabel: "Consultar",
      bookLabel: "Ver el libro",
      contentsTitle: "En este numero",
      "contents.0.label": "Trabajos elegidos",
      "contents.1.credit": "Tarifas y fechas",
    },
    spanish: [
      "Editorial, runway y campanas.",
      "Vivo en la ciudad.",
      "Consultar",
      "Ver el libro",
      "En este numero",
      "Trabajos elegidos",
      "Tarifas y fechas",
    ],
  },
  {
    kind: "statement_footer",
    props: {
      statement: "Next issue.",
      creditLine: "Studio credit",
      contactLine: "Write to us",
      edition: "magazine",
      ctaLabel: "Ask about this",
      ctaHref: "#talent-ask",
    },
    dataSources: {},
    english: ["Next issue.", "Studio credit", "Write to us", "Ask about this"],
    overlayEs: {
      statement: "Siguiente numero.",
      creditLine: "Credito del estudio",
      contactLine: "Escribenos",
      ctaLabel: "Consultar",
    },
    spanish: ["Siguiente numero.", "Credito del estudio", "Escribenos", "Consultar"],
  },
  {
    kind: "comp_card",
    chromeFollowsLocale: true,
    props: { eyebrow: "Details", title: "Measures", minMeasures: 4 },
    dataSources: { talentCompCard: { rows: COMP_ROWS } },
    english: ["Details", "Measures"],
    overlayEs: { eyebrow: "Detalles", title: "Medidas" },
    spanish: ["Detalles", "Medidas"],
  },
  {
    kind: "utility_bar",
    props: {
      name: "Alex",
      subtitle: "Electrician",
      showStatus: true,
      statusOnLabel: "Emergencies today",
      statusOffLabel: "No emergencies today",
      ctaLabel: "Book a visit",
      ctaHref: "#services",
    },
    dataSources: { liveStatus: LIVE_ON },
    english: ["Electrician", "Emergencies today", "Book a visit"],
    overlayEs: { subtitle: "Electricista", statusOnLabel: "Emergencias hoy", ctaLabel: "Agendar visita" },
    spanish: ["Electricista", "Emergencias hoy", "Agendar visita"],
  },
];

for (const c of CASES) {
  const plain = node(c.kind, "n1", c.props);
  const withEs = node(c.kind, "n1", c.props, { es: c.overlayEs });

  test(`${c.kind}: no contentLocale or no overlay is byte-identical to the plain markup`, () => {
    const base = render([plain], c.dataSources);
    for (const needle of c.english) assert.ok(base.includes(needle), `${c.kind}: base markup lost "${needle}"`);
    // An overlay that is never asked for changes nothing.
    assert.equal(render([withEs], c.dataSources), base);
    // A locale with nothing to overlay changes nothing.
    if (!c.chromeFollowsLocale) assert.equal(render([plain], c.dataSources, ES), base);
    // The helper hands back the very same node.
    assert.equal(localizeBlockNode(plain, undefined), plain);
    assert.equal(localizeBlockNode(plain, ES), plain);
    assert.equal(localizeBlockNode(withEs, undefined), withEs);
  });

  test(`${c.kind}: a Spanish overlay replaces the English copy`, () => {
    const html = render([withEs], c.dataSources, ES);
    for (const needle of c.spanish) assert.ok(html.includes(needle), `${c.kind}: missing Spanish "${needle}"`);
    const replaced = c.english.filter((e) => !c.spanish.includes(e));
    for (const gone of replaced) assert.ok(!html.includes(gone), `${c.kind}: English "${gone}" still rendered`);
  });

  test(`${c.kind}: the default-locale visitor still reads the base copy`, () => {
    const base = render([plain], c.dataSources);
    const defaultLocale: BuilderNodeContentLocaleOptions = { locale: "en", defaultLocale: "en", chain: [] };
    assert.equal(render([withEs], c.dataSources, defaultLocale), base);
  });
}

test("an English overlay on a Spanish-base node reads in English", () => {
  const es = node("statement_footer", "n2", { statement: "Siguiente numero.", creditLine: "", contactLine: "" }, {
    en: { statement: "Next issue." },
  });
  const html = render([es], {}, EN);
  assert.match(html, /Next issue\./);
  assert.doesNotMatch(html, /Siguiente numero\./);
});

test("a stale list key is skipped, never created", () => {
  const stale = node("spec_table", "n3", { rows: [{ label: "Response", value: "Fast" }] }, {
    es: { "rows.7.label": "Fantasma", "rows.0.label": "Respuesta" },
  });
  const html = render([stale], {}, ES);
  assert.match(html, /Respuesta/);
  assert.doesNotMatch(html, /Fantasma/);
});

test("props.i18n alone (no node.i18n mirror) is honoured", () => {
  const base = createBuilderNode("statement_footer");
  const only = { ...base, id: "n4", props: { ...base.props, statement: "Next issue.", i18n: { es: { statement: "Siguiente numero." } } } } as BuilderNode;
  assert.match(render([only], {}, ES), /Siguiente numero\./);
});
