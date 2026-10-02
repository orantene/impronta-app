import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  localiseTalentHeaderDefaults,
  stripHiddenAskHeaderCta,
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
