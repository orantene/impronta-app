/**
 * Header ask-CTA strip (TUL-369). Inquire→Escríbeme guess lives in
 * header-cta-locale.ts as a FALLBACK only; render-max-site strips ask CTAs
 * via header-i18n and does not import the fallback directly.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
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

test("render-max-site strips hidden ask CTAs; header-cta-locale is FALLBACK only (TUL-369 split)", () => {
  const src = readFileSync(path.join(__dirname, "server", "render-max-site.tsx"), "utf8");
  assert.match(src, /stripHiddenAskHeaderCta/);
  assert.doesNotMatch(src, /localiseTalentHeaderDefaults/);
  assert.doesNotMatch(src, /header-cta-locale/);
  assert.equal(existsSync(path.join(__dirname, "header-cta-locale.ts")), true);
});
