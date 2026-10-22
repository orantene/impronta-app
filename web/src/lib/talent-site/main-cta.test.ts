/**
 * TUL-639: each theme keeps its own seed CTA wording; the booking label
 * (Reservar cita / Book an appointment) shows ONLY when booking is instant.
 * Booking-worded seeds (Maison) still follow the mode at render.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { buildDefaultShellTree } from "./default-max-site-trees";
import { localiseTalentHeaderDefaults } from "./header-cta-locale";
import { mainCtaLabel, mainCtaModeFromPosture, mainCtaModeFromServiceMode, themeSeedCtaLabel } from "./main-cta";

test("the rule, ES and EN", () => {
  assert.equal(mainCtaLabel("instant", "es"), "Reservar cita");
  assert.equal(mainCtaLabel("instant", "en"), "Book an appointment");
  // Request mode matches Maison: Solicitar cita / Request an appointment.
  assert.equal(mainCtaLabel("request", "es"), "Solicitar cita");
  assert.equal(mainCtaLabel("request", "en"), "Request an appointment");
  assert.equal(mainCtaLabel("message", "es"), "Escríbeme");
  assert.equal(mainCtaLabel("message", "en"), "Message me");
  // The 4th mode: talents selling goods or packages. Never booking wording.
  assert.equal(mainCtaLabel("buy", "es"), "Comprar");
  assert.equal(mainCtaLabel("buy", "en"), "Buy");
});

test("locale tags and unknown locales resolve to ES or EN, EN by default", () => {
  assert.equal(mainCtaLabel("instant", "es-MX"), "Reservar cita");
  assert.equal(mainCtaLabel("instant", "fr"), "Book an appointment");
  assert.equal(mainCtaLabel("message", null), "Message me");
});

test("selling postures and service modes map onto the three CTAs", () => {
  assert.equal(mainCtaModeFromPosture("instant"), "instant");
  assert.equal(mainCtaModeFromPosture("request"), "request");
  assert.equal(mainCtaModeFromPosture("inquiry"), "message");
  assert.equal(mainCtaModeFromServiceMode("instant"), "instant");
  assert.equal(mainCtaModeFromServiceMode("request"), "request");
  assert.equal(mainCtaModeFromServiceMode("quote"), "request");
});

function headerCtaLabel(tree: ReturnType<typeof buildDefaultShellTree>): string {
  const header = tree[0] as unknown as { props: { sectionProps: { primaryCta: { label: string } } } };
  return header.props.sectionProps.primaryCta.label;
}

test("a new site's shell seed shows the booking label ONLY for instant booking; otherwise the seed's own wording", () => {
  assert.equal(headerCtaLabel(buildDefaultShellTree({ displayName: "A", mainCtaMode: "instant" })), "Book an appointment");
  for (const mode of ["request", "message", "buy"] as const) {
    assert.equal(headerCtaLabel(buildDefaultShellTree({ displayName: "A", mainCtaMode: mode })), "Inquire", mode);
  }
});

test("themeSeedCtaLabel keeps each theme's seed unless booking is instant", () => {
  for (const seed of ["Consultar", "Solicitar cita", "Escríbeme", "Comprar"]) {
    assert.equal(themeSeedCtaLabel(seed, "request", "es"), seed);
    assert.equal(themeSeedCtaLabel(seed, "message", "es"), seed);
    assert.equal(themeSeedCtaLabel(seed, "buy", "es"), seed);
    assert.equal(themeSeedCtaLabel(seed, null, "es"), seed);
    assert.equal(themeSeedCtaLabel(seed, undefined, "es"), seed);
    assert.equal(themeSeedCtaLabel(seed, "instant", "es"), "Reservar cita");
  }
  assert.equal(themeSeedCtaLabel("Inquire", "instant", "en"), "Book an appointment");
});

test("with no selling mode the legacy seed is unchanged, so existing sites keep their saved text", () => {
  assert.equal(headerCtaLabel(buildDefaultShellTree({ displayName: "A" })), "Inquire");
});

test("only SEEDED default labels localise; a label the talent typed by hand is never rewritten", () => {
  const props = (label: string) => ({ primaryCta: { label, href: "/contact" } });
  const out = (label: string) => (localiseTalentHeaderDefaults(props(label), "es") as { primaryCta: { label: string } }).primaryCta.label;
  assert.equal(out("Book an appointment"), "Reservar cita");
  assert.equal(out("Inquire"), "Escríbeme");
  // Mode wordings are OUTPUTS, not seeds: a talent can type any of them.
  for (const typed of ["Request", "Request an appointment", "Message me", "Buy", "Comprar", "Mi propio texto"]) {
    assert.equal(out(typed), typed, typed);
  }
});

test("the new tests are enrolled in a lane so CI runs them", () => {
  const lanes = readFileSync(join(process.cwd(), "scripts/lanes/storefront.txt"), "utf8").split("\n");
  assert.ok(lanes.includes("src/lib/talent-site/main-cta.test.ts"));
  assert.ok(lanes.includes("src/lib/talent-site/main-cta-real-mode.test.ts"));
});

test("the Folio demo footer keeps Folio's own seed wording (no mode rewrite)", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/talent-site/demos/folio-demo-fixtures.ts"), "utf8");
  assert.match(src, /cta: lang === "es" \? "Consultar" : "Inquire"/);
  assert.doesNotMatch(src, /mainCtaLabel\(/);
});

test("the shell seed's CTA target follows the mode: instant keeps the retargetable seed, others point where they act", () => {
  const hrefOf = (mode?: Parameters<typeof buildDefaultShellTree>[0]["mainCtaMode"]) => {
    const header = buildDefaultShellTree({ displayName: "A", mainCtaMode: mode })[0] as unknown as {
      props: { sectionProps: { primaryCta: { href: string }; regions: { right: Array<{ type: string; href?: string }> } } };
    };
    return [header.props.sectionProps.primaryCta.href, header.props.sectionProps.regions.right.find((i) => i.type === "cta")?.href];
  };
  assert.deepEqual(hrefOf("instant"), ["#services", "#services"], "seed key: render retargets to #book while the mode is instant");
  assert.deepEqual(hrefOf("request"), ["#book", "#book"]);
  assert.deepEqual(hrefOf("buy"), ["#services", "#services"]);
  assert.deepEqual(hrefOf("message"), ["/contact", "/contact"]);
  assert.deepEqual(hrefOf(undefined), ["/contact", "/contact"]);
});

test("provisioning seeds the talent's REAL selling mode, and the safe message mode when it is unknown", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/talent-site/server/provision-max-site.ts"), "utf8");
  assert.match(src, /loadTalentSiteCtaMode\(/);
  assert.match(src, /mainCtaModeFromSiteMode\(/);
  assert.match(src, /catch\s*\{[^}]*"message"/);
  assert.doesNotMatch(src, /mainCtaMode: "instant"/);
});
