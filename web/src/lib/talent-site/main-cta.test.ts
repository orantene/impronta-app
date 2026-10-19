/**
 * TUL-639: the main CTA follows how the talent sells, from ONE helper. Never
 * hardcoded per theme. Instant booking = Reservar cita / Book an appointment;
 * request or quote only = Solicitar / Request; message-first = Escríbeme / Message me.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { buildDefaultShellTree } from "./default-max-site-trees";
import { localiseTalentHeaderDefaults } from "./header-cta-locale";
import { mainCtaLabel, mainCtaModeFromPosture, mainCtaModeFromServiceMode } from "./main-cta";

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

test("a new site's shell seed takes its header CTA from the selling mode", () => {
  assert.equal(headerCtaLabel(buildDefaultShellTree({ displayName: "A", mainCtaMode: "instant" })), "Book an appointment");
  assert.equal(headerCtaLabel(buildDefaultShellTree({ displayName: "A", mainCtaMode: "request" })), "Request an appointment");
  assert.equal(headerCtaLabel(buildDefaultShellTree({ displayName: "A", mainCtaMode: "message" })), "Message me");
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

test("no theme hardcodes the old inquiry CTA wording: the Folio demo footer uses the helper", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/talent-site/demos/folio-demo-fixtures.ts"), "utf8");
  assert.doesNotMatch(src, /cta: lang === "es" \? "Consultar" : "Inquire"/);
  assert.match(src, /mainCtaLabel\(/);
});

test("a seeded main CTA points at the booking anchor source (#services), which render retargets to #book", () => {
  const header = buildDefaultShellTree({ displayName: "A", mainCtaMode: "instant" })[0] as unknown as {
    props: { sectionProps: { primaryCta: { href: string }; regions: { right: Array<{ type: string; href?: string }> } } };
  };
  assert.equal(header.props.sectionProps.primaryCta.href, "#services");
  assert.equal(header.props.sectionProps.regions.right.find((i) => i.type === "cta")?.href, "#services");
  const legacy = buildDefaultShellTree({ displayName: "A" })[0] as unknown as typeof header;
  assert.equal(legacy.props.sectionProps.primaryCta.href, "/contact");
});

test("provisioning seeds the mode-following main CTA so the label tracks the talent's live selling mode", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/talent-site/server/provision-max-site.ts"), "utf8");
  assert.match(src, /buildDefaultShellTree\(\{ displayName, mainCtaMode: "instant" \}\)/);
});
