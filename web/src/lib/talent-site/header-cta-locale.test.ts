import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  localiseTalentHeaderDefaults,
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
  assert.match(src, /localiseTalentHeaderDefaults\(/);
});
