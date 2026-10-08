import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  localiseSeededDesignLabel,
  localiseSeededDesignLabels,
  resolveSiteCtaMode,
  type SiteCtaMode,
} from "./design-cta-mode";
import { COLLECTION_DESIGNS, buildFolioPayload } from "./theme-catalog/collection/designs";
import { buildMaisonDesignPayload } from "./theme-catalog/maison/design-payload";
import { seedI18nPayload } from "./theme-catalog/seed-i18n";

const MODES: SiteCtaMode[] = ["instant", "request", "inquiry"];

/** Seeded (overlay-carrying) payloads — TUL-369: no render-time EN↔ES guess map. */
const PAYLOADS = {
  folio: () => COLLECTION_DESIGNS.find((d) => d.slug === "folio")!.buildPayload(),
  maison: buildMaisonDesignPayload,
  "maison-v2": () => COLLECTION_DESIGNS.find((d) => d.slug === "maison-v2")!.buildPayload(),
} as const;

/** Booking promises an inquiry-mode site must never make, in any locale. */
const BOOKING_PROMISES = [
  "Book",
  "Booking",
  "Book a session",
  "Inquire for bookings",
  "Book online",
  "Reserva en línea",
  "Reserva",
];

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
        // `i18n` holds per-locale ALTERNATES, not what this locale renders after overlay apply.
        if (k === "layerLabel" || k === "i18n") continue;
        walk(x, k);
      }
    }
  };
  walk(tree, null);
  return out;
}

function rendered(
  build: () => { shellTree: BuilderNode[]; homeTree: BuilderNode[] },
  locale: string,
  mode: SiteCtaMode,
) {
  const p = build();
  return copyStrings([
    ...localiseSeededDesignLabels(p.shellTree, locale, mode),
    ...localiseSeededDesignLabels(p.homeTree, locale, mode),
  ]);
}

for (const [name, build] of Object.entries(PAYLOADS)) {
  test(`${name} inquiry mode never promises booking`, () => {
    for (const locale of ["en", "es"]) {
      const strings = rendered(build, locale, "inquiry");
      for (const s of BOOKING_PROMISES) assert.ok(!strings.includes(s), `${name} ${locale}: "${s}"`);
    }
  });
}

test("folio: chapter nav + Ask about this CTA (English base, ES overlay Consultar)", () => {
  const shipped = COLLECTION_DESIGNS.find((d) => d.slug === "folio")!.buildPayload();
  const nav = JSON.stringify(shipped.shellTree);
  assert.ok(nav.includes('"label":"Selected work"'));
  assert.ok(nav.includes("Ask about this"), "English base CTA");
  assert.ok(nav.includes("Consultar"), "Spanish overlay on seeded payload");
  assert.ok(!/"label":"Consultar"/.test(nav), "base label must not be Spanish");
  assert.ok(!nav.includes('"label":"Book","href":"#gallery"'));
  // Legacy applied Folio trees still carry "Book" -> #gallery (mode map, not EN↔ES guess).
  const legacy = [
    { id: "n", kind: "nav", props: { links: [{ id: "l", label: "Book", href: "#gallery" }] } },
  ] as unknown as BuilderNode[];
  assert.ok(JSON.stringify(localiseSeededDesignLabels(legacy, "es", "instant")).includes('"label":"Trabajos"'));
  assert.ok(JSON.stringify(localiseSeededDesignLabels(legacy, "en", "inquiry")).includes('"label":"Work"'));
  // Raw (pre-seed) Folio has English bases only — seedI18nPayload attaches Consultar.
  const raw = JSON.stringify(buildFolioPayload());
  assert.ok(raw.includes("Ask about this"));
  assert.ok(!raw.includes("Consultar"));
  assert.ok(JSON.stringify(seedI18nPayload(buildFolioPayload())).includes("Consultar"));
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
  const tip = rendered(PAYLOADS.folio, "es", "inquiry");
  assert.ok(
    !tip.some((s) => /editorials|editoriales|campaigns|campañas|runway|pasarela/i.test(s)),
    "tip Folio carries no editorial claim",
  );
  assert.ok(!tip.includes("Reserva en línea"));
  const payload = JSON.stringify(PAYLOADS.folio());
  assert.ok(payload.includes("Ask about this"));
  assert.ok(payload.includes("Consultar"));
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

test("TUL-369: no EN↔ES guess — plain seeded English stays English without an overlay apply", () => {
  assert.equal(localiseSeededDesignLabel("Recent work", "es"), "Recent work");
  assert.equal(localiseSeededDesignLabel("Ask about this", "es"), "Ask about this");
  assert.equal(localiseSeededDesignLabel("Trabajo reciente", "en"), "Trabajo reciente");
});
