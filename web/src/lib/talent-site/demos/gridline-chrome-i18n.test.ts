/**
 * TUL-302: a Spanish-primary bilingual Gridline demo writes English overlays
 * onto every chrome node the site-copy fills (utility bar, alert, hero, tasks
 * title, spec table, services catalog), so `/en` never falls back to Spanish.
 * Spec cells stay on the older factsI18n path. A demo without a second language
 * is unchanged.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { buildGridlinePayload } from "@/lib/talent-site/theme-catalog/collection/gridline";
import { loadDemoContentFixture } from "./content-fixture";
import { gridlineCopyFromFixture } from "./gridline-site-copy";
import { findDemo } from "./registry";
import { applyDemoSiteCopy } from "./site-copy";

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

function applyAlex() {
  const f = loadDemoContentFixture(findDemo("TAL-93030")!.contentFixture!);
  const ids = new Map(f.services.map((s, i) => [s.id, `off-${i}`]));
  const copy = gridlineCopyFromFixture(f, (id) => ids.get(id));
  const payload = buildGridlinePayload();
  let n = 0;
  const out = applyDemoSiteCopy(
    payload.shellTree as never,
    payload.homeTree as never,
    { gridline: copy },
    () => null,
    () => `a-${++n}`,
  );
  return { f, copy, out };
}

function applyRamon() {
  const f = loadDemoContentFixture(findDemo("TAL-93212")!.contentFixture!);
  const ids = new Map(f.services.map((s, i) => [s.id, `off-${i}`]));
  const copy = gridlineCopyFromFixture(f, (id) => ids.get(id));
  const payload = buildGridlinePayload();
  let n = 0;
  const out = applyDemoSiteCopy(
    payload.shellTree as never,
    payload.homeTree as never,
    { gridline: copy },
    () => null,
    () => `c-${++n}`,
  );
  return { f, copy, out };
}

test("gridlineCopyFromFixture: Alex reference carries overlays.en once translations.en exists", () => {
  const f = loadDemoContentFixture(findDemo("TAL-93030")!.contentFixture!);
  const copy = gridlineCopyFromFixture(f, () => "x");
  const en = copy.overlays?.en;
  assert.ok(en, "overlays.en");
  assert.equal(en!.topBar?.subtitle, "Electrician · Monterrey");
  assert.equal(en!.hero?.ctas?.[0], "See times");
  assert.equal(en!.tasks?.title, "What is going on?");
  assert.equal(en!.services?.subtitle, "Prices in MXN");
  assert.ok(copy.hero?.factsI18n?.en?.length);
  assert.ok(f.translations?.en?.services?.rev?.name);
});

test("site-copy writes props.i18n.en on Alex reference chrome (Gridline)", () => {
  const { out } = applyAlex();
  const bar = findKind(out.shell as Node[], "utility_bar")!;
  assert.match((bar.props as { subtitle: string }).subtitle, /Electricista/);
  assert.equal(enBag(bar).subtitle, "Electrician · Monterrey");
  assert.equal(enBag(bar).statusOnLabel, "Emergencies today");

  const picker = findKind(out.home as Node[], "task_picker")!;
  assert.equal(enBag(picker).title, "What is going on?");

  const stats = findKind(out.home as Node[], "stats")!;
  assert.equal(enBag(stats)["items.0.label"], "Response");
});

test("gridlineCopyFromFixture: bilingual Ramon carries overlays.en for every chrome field", () => {
  const f = loadDemoContentFixture(findDemo("TAL-93212")!.contentFixture!);
  const copy = gridlineCopyFromFixture(f, () => "x");
  const en = copy.overlays?.en;
  assert.ok(en, "overlays.en");
  assert.equal(en!.topBar?.subtitle, "Home repairs · Mazatlan");
  assert.equal(en!.topBar?.callLabel, "Call");
  assert.equal(en!.topBar?.statusOn, "Emergencies today");
  assert.equal(en!.alert?.title, "Something cannot wait");
  assert.equal(en!.hero?.ctas?.[0], "See times");
  assert.equal(en!.hero?.badges?.length, 2);
  assert.equal(en!.tasks?.title, "What do you need?");
  assert.equal(en!.specTable?.rows?.length, 5);
  assert.equal(en!.services?.subtitle, "Prices in MXN");
  assert.ok(copy.hero?.factsI18n?.en?.length);
});

test("site-copy writes props.i18n.en on utility bar, alert, hero, tasks, spec table and catalog", () => {
  const { out } = applyRamon();
  const bar = findKind(out.shell as Node[], "utility_bar")!;
  assert.equal((bar.props as { subtitle: string }).subtitle, "Arreglos en casa · Mazatlán");
  assert.equal(enBag(bar).subtitle, "Home repairs · Mazatlan");
  assert.equal(enBag(bar).callLabel, "Call");
  assert.equal(enBag(bar).statusOnLabel, "Emergencies today");

  const alert = findKind(out.home as Node[], "alert_band")!;
  assert.equal(enBag(alert).title, "Something cannot wait");
  assert.equal(enBag(alert).safetyLabel, "Meanwhile:");
  assert.equal(enBag(alert).ctaLabel, "Ask now");

  const heading = findKind(out.home as Node[], "heading")!;
  assert.match((heading.props as { text: string }).text, /pendientes/);
  assert.match(enBag(heading).text, /to-dos/);

  const picker = findKind(out.home as Node[], "task_picker")!;
  assert.equal(enBag(picker).title, "What do you need?");

  const spec = findKind(out.home as Node[], "spec_table")!;
  assert.equal(enBag(spec).title, "Specifications");
  assert.equal(enBag(spec)["rows.0.label"], "Jobs");
  assert.match(enBag(spec)["rows.0.value"], /Hang/);

  const catalog = findKind(out.home as Node[], "services_catalog")!;
  assert.equal(enBag(catalog).subtitle, "Prices in MXN");

  const stats = findKind(out.home as Node[], "stats")!;
  assert.equal(enBag(stats)["items.0.label"], "Response");

  // Hero CTA buttons and badge paragraphs carry the demos English overlay.
  const ctaLabels = new Set<string>();
  let badgeEn = 0;
  walk(out.home as Node[], (n) => {
    const label = enBag(n).label;
    if (n.kind === "button" && (label === "See times" || label === "What do you need?")) ctaLabels.add(label);
    if (n.kind === "paragraph" && enBag(n).text && /Homes and apartments|Tools included/.test(enBag(n).text)) {
      badgeEn += 1;
    }
  });
  assert.deepEqual([...ctaLabels].sort(), ["See times", "What do you need?"]);
  assert.equal(badgeEn, 2);
});

test("a Spanish-only Gridline demo still writes no overlays (as before)", () => {
  const f = loadDemoContentFixture(findDemo("TAL-93208")!.contentFixture!);
  const copy = gridlineCopyFromFixture(f, () => "x");
  assert.equal(copy.overlays, undefined);
  const payload = buildGridlinePayload();
  const out = applyDemoSiteCopy(
    payload.shellTree as never,
    payload.homeTree as never,
    { gridline: copy },
    () => null,
    () => "z",
  );
  const bar = findKind(out.shell as Node[], "utility_bar")!;
  // Seed may already carry es/en for "Book a visit"; demo-filled Spanish fields stay without an en overlay.
  assert.equal(enBag(bar).subtitle, undefined);
  assert.equal(enBag(bar).callLabel, undefined);
});

test("no em dash in Ramon English chrome", () => {
  const f = loadDemoContentFixture(findDemo("TAL-93212")!.contentFixture!);
  const en = f.translations!.en!;
  assert.ok(!/—|–/.test(JSON.stringify(en)));
});
