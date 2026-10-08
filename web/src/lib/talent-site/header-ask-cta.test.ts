/**
 * Header ask-CTA strip (moved from deleted header-cta-locale.ts, TUL-369).
 * Inquire→Escríbeme guess map is gone; Spanish comes from seed overlays.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { stripHiddenAskHeaderCta } from "./header-i18n";

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

test("render-max-site strips hidden ask CTAs (no Inquire guess map)", () => {
  const src = readFileSync(path.join(__dirname, "server", "render-max-site.tsx"), "utf8");
  assert.match(src, /stripHiddenAskHeaderCta/);
  assert.doesNotMatch(src, /localiseTalentHeaderDefaults/);
  assert.doesNotMatch(src, /header-cta-locale/);
});
