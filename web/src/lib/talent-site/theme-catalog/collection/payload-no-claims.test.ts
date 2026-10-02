/**
 * A design payload ships design-owned EDITABLE DEFAULTS only: no talent-specific claim
 * (credits, exits, runway, cities, currencies, show names, figures with units). Demo wording
 * belongs to the demo fixtures (site-copy mechanism), never the payload. Scans the trees of
 * Folio, Maison v2 and Gridline for every string value.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { applyDemoSiteCopy } from "../../demos/site-copy";
import { FOLIO_DEMO_SITE_COPY } from "../../demos/folio-site-copy";
import { buildFolioPayload, buildMaisonV2Payload } from "./designs";
import { buildGridlinePayload } from "./gridline";

const CLAIMS: ReadonlyArray<[string, RegExp]> = [
  ["city", /\b(CDMX|Mexico City|Ciudad de M[eé]xico|Guadalajara|Monterrey|Madrid|Bogot[aá]|Medell[ií]n|Buenos Aires|Miami|New York|Los Angeles)\b/i],
  ["demo", /\bdemo\b/i],
  ["exits", /\bexits?\b|\bsalidas?\b/i],
  ["runway", /\brunway\b|\bpasarela\b/i],
  ["currency", /\b(MXN|USD|EUR|COP|ARS|CLP|PEN)\b/],
  ["figure with unit", /\b\d[\d.,]*\s?(h|hr|hrs|hours?|min|mins|minutes?|km|cm|kg|years?|months?|days?|exits?)\b/i],
];

function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) for (const x of v) strings(x, out);
  else if (v && typeof v === "object") for (const x of Object.values(v)) strings(x, out);
  return out;
}

const PAYLOADS = {
  folio: buildFolioPayload,
  "maison-v2": buildMaisonV2Payload,
  gridline: buildGridlinePayload,
} as const;

for (const [slug, build] of Object.entries(PAYLOADS)) {
  test(`${slug} payload carries no talent or demo claims`, () => {
    const p = build();
    const all = strings({ shell: p.shellTree, home: p.homeTree, optional: p.optionalBlocks ?? [] });
    for (const text of all) {
      for (const [name, re] of CLAIMS) assert.doesNotMatch(text, re, `${slug} ${name} claim: "${text}"`);
    }
  });
}

test("folio: the demo wording lives in the demo site-copy, and applying it restores what the demos showed", () => {
  const p = buildFolioPayload();
  const out = applyDemoSiteCopy(p.shellTree as never, p.homeTree as never, { folio: FOLIO_DEMO_SITE_COPY }, () => null, () => "x");
  const text = JSON.stringify(out);
  for (const s of [
    "Demo studio credit · CDMX",
    "Demo show credit · 3 exits",
    "Studio, hard light",
    "Exits and details",
    "Editorial, runway and campaigns.",
    "Base rates in MXN. Ad use and travel are quoted separately.",
    "For editorials, runway and campaigns. I reply the same day.",
    "Shoe MX",
    '"label":"Runway","href":"#chapter-2"',
    '"label":"Runway","anchor":"chapter-2"',
  ]) {
    assert.ok(text.includes(s), `demo copy restores ${s}`);
  }
  assert.ok(!JSON.stringify({ s: p.shellTree, h: p.homeTree }).includes("Runway"));
});
