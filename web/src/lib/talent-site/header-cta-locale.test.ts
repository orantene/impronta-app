import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  localiseTalentHeaderDefaults,
  stripHiddenAskHeaderCta,
  talentHeaderBookCtaLabel,
  talentHeaderCtaLabel,
} from "./header-cta-locale";

const seeded = {
  primaryCta: { label: "Inquire", href: "/contact" },
  regions: {
    left: [{ type: "wordmark" }],
    right: [
      { type: "inquiry", showCount: true },
      { type: "cta", label: "Inquire", href: "/contact" },
    ],
  },
};

test("AUD-027: seeded Inquire CTA reads Spanish on an ES site", () => {
  const out = localiseTalentHeaderDefaults(seeded, "es-MX") as typeof seeded;
  assert.equal(out.primaryCta.label, "Escríbeme");
  assert.equal((out.regions.right[1] as { label: string }).label, "Escríbeme");
  assert.deepEqual(out.regions.left, seeded.regions.left);
  assert.equal(seeded.primaryCta.label, "Inquire");
});

test("AUD-027: English and custom labels are left alone", () => {
  assert.equal(localiseTalentHeaderDefaults(seeded, "en"), seeded);
  const custom = { primaryCta: { label: "Reserva ya", href: "/contact" } };
  const out = localiseTalentHeaderDefaults(custom, "es") as typeof custom;
  assert.equal(out.primaryCta.label, "Reserva ya");
  assert.equal(talentHeaderCtaLabel("fr"), "Inquire");
});

test("AUD-027: render-max-site localises the header landmark props", () => {
  const src = readFileSync(
    path.join(__dirname, "server", "render-max-site.tsx"),
    "utf8",
  );
  assert.match(src, /localiseTalentHeaderDefaults/);
  assert.match(src, /stripHiddenAskHeaderCta/);
  assert.match(src, /ctaMode/);
});

test("hidden ask: strip #talent-ask primary CTA before render", () => {
  const props = {
    primaryCta: { label: "Escríbeme", href: "#talent-ask" },
    regions: {
      right: [
        { type: "cta", label: "Escríbeme", href: "#talent-ask" },
        { type: "cta", label: "Book", href: "#services" },
      ],
    },
  };
  const kept = stripHiddenAskHeaderCta(props, true) as typeof props;
  assert.equal(kept.primaryCta.label, "Escríbeme");
  const stripped = stripHiddenAskHeaderCta(props, false) as {
    primaryCta?: unknown;
    regions: { right: { type: string; href: string }[] };
  };
  assert.equal(stripped.primaryCta, undefined);
  assert.deepEqual(
    stripped.regions.right.map((r) => r.href),
    ["#services"],
  );
});

test("DS-62: bookable ES site rewrites Inquire to Reservar + #services", () => {
  const out = localiseTalentHeaderDefaults(seeded, "es-MX", "instant") as {
    primaryCta: { label: string; href: string };
    regions: { right: { type: string; label?: string; href?: string }[] };
  };
  assert.equal(out.primaryCta.label, "Reservar");
  assert.equal(out.primaryCta.href, "#services");
  assert.equal(out.regions.right[1]?.label, "Reservar");
  assert.equal(out.regions.right[1]?.href, "#services");
  assert.equal(talentHeaderBookCtaLabel("es", "request"), "Solicitar cita");
});

test("DS-62: bookable EN site rewrites Inquire to Book now + #services", () => {
  const out = localiseTalentHeaderDefaults(seeded, "en", "instant") as {
    primaryCta: { label: string; href: string };
  };
  assert.equal(out.primaryCta.label, "Book now");
  assert.equal(out.primaryCta.href, "#services");
});

test("DS-62: inquiry mode keeps Escríbeme and does not force #services", () => {
  const out = localiseTalentHeaderDefaults(seeded, "es", "inquiry") as {
    primaryCta: { label: string; href: string };
  };
  assert.equal(out.primaryCta.label, "Escríbeme");
  assert.equal(out.primaryCta.href, "/contact");
});

test("DS-62: custom talent CTA is never rewritten for booking mode", () => {
  const custom = { primaryCta: { label: "WhatsApp", href: "https://wa.me/1" } };
  const out = localiseTalentHeaderDefaults(custom, "es", "instant") as typeof custom;
  assert.equal(out.primaryCta.label, "WhatsApp");
  assert.equal(out.primaryCta.href, "https://wa.me/1");
});

test("DS-62: Spanish site buttons drop forced uppercase", () => {
  const css = readFileSync(
    path.join(__dirname, "../../app/token-presets.css"),
    "utf8",
  );
  assert.match(css, /html\[lang\^="es"\]\s*\.site-btn/);
  assert.match(css, /text-transform:\s*none/);
});
