import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  localiseSeededDesignLabel,
  localiseSeededDesignLabels,
  resolveSiteCtaMode,
  type SiteCtaMode,
} from "./design-label-locale";
import { buildFolioPayload, buildMaisonV2Payload } from "./theme-catalog/collection/designs";
import { buildMaisonDesignPayload } from "./theme-catalog/maison/design-payload";

const MODES: SiteCtaMode[] = ["instant", "request", "inquiry"];

const PAYLOADS = {
  folio: buildFolioPayload,
  maison: buildMaisonDesignPayload,
  "maison-v2": buildMaisonV2Payload,
} as const;

/** Fixed English action copy that must never reach a Spanish visitor. */
const ENGLISH_CTAS = [
  "Book",
  "Booking",
  "Book a session",
  "Inquire for bookings",
  "Buy now",
  "Ask",
  "Ask a question",
  "Ask about a service",
  "Add to inquiry",
];

/** Booking promises an inquiry-mode site must never make, in any locale. */
const BOOKING_PROMISES = ["Book", "Booking", "Book a session", "Inquire for bookings", "Book online", "Reserva en línea", "Reserva"];

const COPY_KEYS = new Set(["text", "label", "eyebrow", "title", "contactLine"]);

function copyStrings(tree: readonly BuilderNode[]): string[] {
  const out: string[] = [];
  const walk = (v: unknown, key: string | null): void => {
    if (typeof v === "string") {
      if (key && COPY_KEYS.has(key)) out.push(v.trim());
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) walk(x, key === "links" ? null : key);
      return;
    }
    if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        // `i18n` holds per-locale ALTERNATES (an English overlay beside the base copy), not what this
        // locale renders; the base copy was already localised by `localiseSeededDesignLabels`.
        if (k === "layerLabel" || k === "i18n") continue;
        walk(x, k);
      }
    }
  };
  walk(tree, null);
  return out;
}

function rendered(build: () => { shellTree: BuilderNode[]; homeTree: BuilderNode[] }, locale: string, mode: SiteCtaMode) {
  const p = build();
  return copyStrings([
    ...localiseSeededDesignLabels(p.shellTree, locale, mode),
    ...localiseSeededDesignLabels(p.homeTree, locale, mode),
  ]);
}

for (const [name, build] of Object.entries(PAYLOADS)) {
  for (const mode of MODES) {
    test(`${name} es/${mode}: no fixed English CTA copy`, () => {
      const strings = rendered(build, "es-MX", mode);
      for (const cta of ENGLISH_CTAS) assert.ok(!strings.includes(cta), `${name} es ${mode}: "${cta}"`);
    });
  }
  test(`${name} inquiry mode never promises booking`, () => {
    for (const locale of ["en", "es"]) {
      const strings = rendered(build, locale, "inquiry");
      for (const s of BOOKING_PROMISES) assert.ok(!strings.includes(s), `${name} ${locale}: "${s}"`);
    }
  });
}

test("folio: chapter nav + shared booking CTA (#book)", () => {
  const p = buildFolioPayload();
  const nav = JSON.stringify(p.shellTree);
  assert.ok(nav.includes('"label":"Selected work","href":"#chapter-1"'));
  assert.ok(nav.includes('"label":"More work","href":"#chapter-2"'));
  assert.ok(nav.includes('"label":"Rates","href":"#services"'));
  assert.ok(nav.includes('"label":"Book an appointment"'));
  assert.ok(nav.includes("#book"));
  assert.ok(!nav.includes('"label":"Book","href":"#gallery"'));
  // Legacy applied Folio trees still carry "Book" -> #gallery.
  const legacy = [
    { id: "n", kind: "nav", props: { links: [{ id: "l", label: "Book", href: "#gallery" }] } },
  ] as unknown as BuilderNode[];
  assert.ok(JSON.stringify(localiseSeededDesignLabels(legacy, "es", "instant")).includes('"label":"Trabajos"'));
  assert.ok(JSON.stringify(localiseSeededDesignLabels(legacy, "en", "inquiry")).includes('"label":"Work"'));
});

test("folio footer line per mode per locale", () => {
  // Mode-copy table still remaps the legacy seed string (Maison / older Folio).
  const cases: Array<[SiteCtaMode, string, string]> = [
    ["instant", "Book online", "Reserva en línea"],
    ["request", "Request an appointment", "Solicita una cita"],
    ["inquiry", "Write to me for a quote", "Escríbeme para cotizar"],
  ];
  for (const [mode, en, es] of cases) {
    assert.equal(localiseSeededDesignLabel("Inquire for bookings", "en", mode), en);
    assert.equal(localiseSeededDesignLabel("Inquire for bookings", "es", mode), es);
  }
  const tip = rendered(buildFolioPayload, "es", "inquiry");
  assert.ok(
    !tip.some((s) => /editorials|editoriales|campaigns|campañas|runway|pasarela/i.test(s)),
    "tip Folio carries no editorial claim",
  );
  assert.ok(!tip.includes("Reserva en línea"));
  // Inquiry mode rewrites the shared booking seed to Escríbeme (not Consultar chat).
  assert.ok(tip.includes("Escríbeme"));
});

test("talent-edited copy is never rewritten", () => {
  assert.equal(localiseSeededDesignLabel("Escríbeme cuando quieras", "es", "inquiry"), "Escríbeme cuando quieras");
});

test("resolveSiteCtaMode: posture with the plan ceiling", () => {
  assert.equal(resolveSiteCtaMode({ sellingDefaults: { bookingPosture: "instant" }, confirmsByHand: false }), "instant");
  assert.equal(resolveSiteCtaMode({ sellingDefaults: { bookingPosture: "instant" }, confirmsByHand: true }), "request");
  assert.equal(resolveSiteCtaMode({ sellingDefaults: { bookingPosture: "inquiry" }, confirmsByHand: false }), "inquiry");
  assert.equal(resolveSiteCtaMode({ sellingDefaults: { bookingPosture: "request" }, confirmsByHand: true }), "request");
  assert.equal(resolveSiteCtaMode({ sellingDefaults: null, confirmsByHand: false }), "instant");
});

test("resolveSiteCtaMode: bookings paused forces inquiry (no booking promise)", () => {
  assert.equal(
    resolveSiteCtaMode({
      sellingDefaults: { bookingPosture: "instant" },
      confirmsByHand: false,
      acceptingBookings: false,
    }),
    "inquiry",
  );
  assert.equal(
    localiseSeededDesignLabel("You can book a time on this page.", "es", "inquiry"),
    "Consulta un horario en esta página.",
  );
  assert.equal(
    localiseSeededDesignLabel("Book an appointment", "es", "inquiry"),
    "Escríbeme",
  );
});
