/**
 * TUL-494: a Spanish-primary Folio demo writes English overlays onto every
 * chrome node the site-copy fills (masthead cover, chapters, rates, footer),
 * so `/en` never falls back to Spanish and the Spanish page never keeps an
 * English-only rewrite (no bare "Mexico City" on ES).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { buildFolioPayload } from "@/lib/talent-site/theme-catalog/collection/designs";
import { loadDemoContentFixture } from "./content-fixture";
import { planOfferingOps } from "./fixture-plan";
import { folioSiteCopyFor } from "./folio-site-copy";
import { applyDemoSiteCopy } from "./site-copy";

/** English-only strings that must not appear on Mateo's Spanish-primary fixture base. */
const MATEO_ES_LEAKS = [
  "Runway show booking",
  "Editorial shoot, half day",
  "Lookbook / e-commerce day",
  "Medidas · Comp card",
] as const;

type Node = { id?: string; kind: string; props?: Record<string, unknown>; children?: Node[] };

function walk(nodes: Node[] | undefined, visit: (n: Node) => void): void {
  for (const n of nodes ?? []) {
    visit(n);
    walk(n.children, visit);
  }
}

function findKind(nodes: Node[], kind: string): Node | undefined {
  let hit: Node | undefined;
  walk(nodes, (n) => {
    if (!hit && n.kind === kind) hit = n;
  });
  return hit;
}

function enBag(n: Node | undefined): Record<string, string> {
  const i18n = n?.props?.i18n as Record<string, Record<string, string>> | undefined;
  return i18n?.en ?? {};
}

function applyMateo() {
  const copy = folioSiteCopyFor("TAL-93011");
  const payload = buildFolioPayload();
  const out = applyDemoSiteCopy(
    payload.shellTree as never,
    payload.homeTree as never,
    { folio: copy },
    () => null,
    () => "unused",
  );
  return { copy, out };
}

test("folioSiteCopyFor: Mateo Spanish primary carries overlays.en for every chrome field", () => {
  const copy = folioSiteCopyFor("TAL-93011");
  assert.match(copy.coverStatement, /campañas/);
  assert.doesNotMatch(copy.coverStatement, /Mexico City/);
  assert.equal(copy.chapters?.[1]?.heading, "Pasarela");
  const en = copy.overlays?.en;
  assert.ok(en, "overlays.en");
  assert.equal(en!.coverStatement, "Editorial, runway and campaigns.");
  assert.match(en!.ratesSubtitle ?? "", /Base rates/);
  assert.equal(en!.chapters?.length, 2);
  assert.equal(en!.chapters?.[1]?.heading, "Runway");
  assert.match(en!.footerContact ?? "", /reply the same day/);
});

test("Mateo content fixture: Spanish base has no known English service or comp-card leaks", () => {
  const mateo = loadDemoContentFixture("folio");
  const base = JSON.stringify({
    services: mateo.services.map((s) => ({ name: s.name, category: s.category })),
    portfolio: mateo.portfolio?.items?.map((p) => p.group),
    statsTitle: mateo.statsTitle,
  });
  for (const leak of MATEO_ES_LEAKS) assert.ok(!base.includes(leak), leak);
  assert.ok(mateo.portfolio?.items?.every((p) => p.group !== "Runway"));
});

test("Mateo fixture offerings plan bilingual titles for runway and editorial services", () => {
  const mateo = loadDemoContentFixture("folio");
  const rows = planOfferingOps(mateo, []).map((o) => (o.op === "insert" ? o.row : null)).filter(Boolean);
  const run = rows.find((r) => r!.title === "Reserva de show de pasarela");
  const ed = rows.find((r) => r!.title === "Sesión editorial, medio día");
  // Row values are unknown; cast like gridline-demos.test.ts so tsc accepts .es/.en.
  const runTitles = run?.title_i18n as Record<string, string> | undefined;
  const edTitles = ed?.title_i18n as Record<string, string> | undefined;
  assert.ok(runTitles?.es && runTitles.en === "Runway show booking");
  assert.ok(edTitles?.es && edTitles.en === "Editorial shoot, half day");
});

test("site-copy writes props.i18n.en on Folio masthead, chapters, catalog and footer", () => {
  const { copy, out } = applyMateo();
  const mast = findKind(out.home as Node[], "masthead")!;
  assert.equal((mast.props as { coverStatement: string }).coverStatement, copy.coverStatement);
  assert.equal(enBag(mast).coverStatement, "Editorial, runway and campaigns.");
  assert.equal(enBag(mast)["contents.0.credit"], "Studio, hard light");

  const catalog = findKind(out.home as Node[], "services_catalog")!;
  assert.match((catalog.props as { subtitle: string }).subtitle, /Tarifas base/);
  assert.match(enBag(catalog).subtitle, /Base rates/);

  const footer = findKind(out.home as Node[], "statement_footer")!;
  assert.match((footer.props as { contactLine: string }).contactLine, /Respondo/);
  assert.match(enBag(footer).contactLine, /reply the same day/);

  let chapterEn = 0;
  walk(out.home as Node[], (n) => {
    if (n.kind === "portfolio" && enBag(n).title === "Editorial") chapterEn += 1;
  });
  assert.ok(chapterEn >= 1, "chapter portfolio carries EN title overlay");
});

test("Lucía ES cover uses Ciudad de México, EN overlay uses Mexico City", () => {
  const copy = folioSiteCopyFor("TAL-93004");
  assert.match(copy.coverStatement, /Ciudad de México/);
  assert.doesNotMatch(copy.coverStatement, /Mexico City/);
  assert.match(copy.overlays?.en?.coverStatement ?? "", /Mexico City/);
});

test("no em dash in Mateo Folio EN chrome", () => {
  const en = folioSiteCopyFor("TAL-93011").overlays?.en;
  assert.ok(en);
  assert.ok(!/—|–/.test(JSON.stringify(en)));
});
