/**
 * Gridline demos (G15): the registry covers all eight, the seven trade fixtures
 * are valid and complete, the writers plan an identical rerun as nothing, and
 * the site-copy fills what the design ships empty.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { BUILDER_ICON_NAMES } from "@/lib/site-admin/builder-node/icon-registry";
import { buildGridlinePayload } from "@/lib/talent-site/theme-catalog/collection/gridline";
import { getGalleryDesign } from "@/lib/talent-site/theme-catalog/gallery-meta";
import { DEMO_BATCH } from "@/lib/talent-site/theme-catalog/demo-account";
import { loadDemoContentFixture, validateDemoContentFixture, type DemoContentFixture } from "./content-fixture";
import { emptySnapshot, planContentRestore } from "./content-restore";
import {
  intakeOf,
  matchOfferings,
  planAreaOps,
  planCaptionOps,
  planFaqOps,
  planOfferingOps,
  planProfilePatch,
  type ExistingOffering,
} from "./fixture-plan";
import { gridlineCopyFromFixture, taskIconFor } from "./gridline-site-copy";
import { decideDemoTarget } from "./guard.server";
import { demosFor, findDemo } from "./registry";
import { applyDemoSiteCopy } from "./site-copy";

const CODES = ["TAL-93030", "TAL-93206", "TAL-93207", "TAL-93208", "TAL-93209", "TAL-93210", "TAL-93211", "TAL-93212"];
const TRADE_CODES = CODES.slice(1);
const fx = (code: string) => loadDemoContentFixture(findDemo(code)!.contentFixture!);

test("registry: Gridline owns eight demos, Alex is the one reference, palettes exist in the gallery", () => {
  const all = demosFor("gridline");
  assert.deepEqual(all.map((d) => d.profileCode).sort(), [...CODES].sort());
  assert.deepEqual(all.filter((d) => d.reference).map((d) => d.profileCode), ["TAL-93030"]);
  const palettes = new Set(getGalleryDesign("gridline")!.palettes.map((p) => p.key));
  for (const d of all) assert.ok(palettes.has(d.palette), `${d.profileCode} palette ${d.palette}`);
  // Eight demos, five palettes: every Look is on a live demo.
  assert.deepEqual([...new Set(all.map((d) => d.palette))].sort(), [...palettes].sort());
  for (const d of all) assert.ok(d.contentFixture, `${d.profileCode} has a content fixture`);
});

test("guard: the eight codes are accepted, Jor, QA users and real talents are refused", () => {
  for (const code of CODES) {
    const d = decideDemoTarget({ profileCode: code, inRegistry: !!findDemo(code), isDemoFlag: true, email: `demo-x@demo.tulala.digital`, demoBatch: DEMO_BATCH });
    assert.equal(d.ok, true, code);
  }
  for (const code of ["TAL-93938", "TAL-93900", "TAL-93901", "TAL-93939", "TAL-93020X", "TAL-12345"]) {
    assert.equal(findDemo(code), undefined, code);
    assert.equal(decideDemoTarget({ profileCode: code, inRegistry: false, isDemoFlag: true, email: "demo-x@impronta.test", demoBatch: DEMO_BATCH }).ok, false);
  }
});

test("fixtures: each is valid, has four services with matrix cells and intake, and no em dashes", () => {
  for (const code of TRADE_CODES) {
    const f = fx(code);
    assert.deepEqual(validateDemoContentFixture(f), [], code);
    assert.equal(f.design, "gridline");
    assert.equal(f.services.length, 4, code);
    assert.equal(f.faq.items.length, 4, code);
    assert.equal(f.portfolio.items.length, 6, code);
    assert.equal(f.specTable!.rows.length, 5, code);
    assert.equal(f.hero.facts!.length, 4, code);
    assert.ok(f.tasks!.items.length >= 4 && f.tasks!.items.length <= 6, code);
    assert.ok((f.location!.areas ?? []).length >= 4, code);
    for (const s of f.services) {
      assert.ok(s.matrix && s.matrix.materials && s.matrix.warranty && s.matrix.response, `${code} ${s.id} matrix`);
      const intake = intakeOf(s);
      assert.ok(intake.length >= 2, `${code} ${s.id} intake`);
      assert.ok(!intake.some((x) => x.type === "upload"), `${code} ${s.id} no upload fields`);
      assert.ok(intake.every((x) => (x.type === "chips" || x.type === "select" ? (x.options?.length ?? 0) > 0 : true)));
    }
    assert.ok(!/—|–/.test(JSON.stringify(f)), `${code} has an em or en dash`);
  }
});

test("fixtures: modes, currency and language follow demos.json", () => {
  const modes = (f: DemoContentFixture) => f.services.map((s) => s.mode);
  for (const code of TRADE_CODES) assert.equal(modes(fx(code)).filter((m) => m === "quote").length, 1, `${code} has one quote service`);
  for (const code of ["TAL-93206", "TAL-93207", "TAL-93210", "TAL-93211"]) {
    assert.equal(fx(code).locale, "en");
    assert.ok(fx(code).services.every((s) => s.currency === "USD"));
  }
  for (const code of ["TAL-93208", "TAL-93209", "TAL-93212"]) {
    assert.equal(fx(code).locale, "es");
    assert.ok(fx(code).services.every((s) => s.currency === "MXN"));
  }
  // Only the urgent trades carry the emergencies setting.
  for (const code of TRADE_CODES) assert.equal(!!fx(code).urgency, ["TAL-93206", "TAL-93207", "TAL-93209", "TAL-93212"].includes(code), code);
  // 93212 is bilingual: the second language is written for every service, FAQ item, task and page chrome.
  const ramon = fx("TAL-93212");
  const en = ramon.translations?.en;
  assert.ok(en?.tagline && en.bio);
  for (const s of ramon.services) assert.ok(en!.services![s.id]?.name && en!.services![s.id]?.matrix, s.id);
  assert.equal(en!.faq!.length, ramon.faq.items.length);
  for (const t of ramon.tasks!.items) assert.ok(en!.tasks![t.id]?.label, t.id);
  assert.ok(en!.topBar?.subtitle && en!.hero?.headline && en!.specTable?.rows?.length === 5 && en!.menu?.subtitle);
});

test("offerings: the plan writes matrix cells and intake, and an identical rerun plans nothing", () => {
  for (const code of CODES) {
    const f = fx(code);
    const ops = planOfferingOps(f, []);
    assert.equal(ops.length, 4, code);
    const existing: ExistingOffering[] = ops.map((op, i) => {
      if (op.op !== "insert") throw new Error("insert");
      const attrs = op.row.attributes as Record<string, unknown>;
      assert.ok(attrs.matrix && attrs.intake, `${code} ${i} attributes`);
      return {
        ...op.row,
        id: `o${i}`,
        title: op.row.title as string,
        status: "published",
        sort_order: i,
        variants: op.variants.map((v, j) => ({ ...v, id: `v${i}-${j}` })),
        addons: op.addons.map((a, j) => ({ ...a, id: `a${i}-${j}` })),
      };
    });
    assert.deepEqual(planOfferingOps(f, existing), [], `${code} second run`);
  }
});

test("offerings: existing demo rows keep their ids and other attributes, quote keeps its from price", () => {
  const f = fx("TAL-93206");
  const have: ExistingOffering[] = [
    { id: "a", title: "Inspection visit", status: "published", sort_order: 0, attributes: { where: ["client"], demo_batch: "demo-2026-09-28" }, variants: [], addons: [] },
    { id: "b", title: "Light fixture or ceiling fan install", status: "published", sort_order: 1, attributes: { where: ["client"] }, variants: [], addons: [] },
    { id: "c", title: "Electrical panel replacement", status: "published", sort_order: 2, attributes: {}, variants: [], addons: [] },
    { id: "d", title: "Rewiring or remodel", status: "published", sort_order: 3, attributes: {}, variants: [], addons: [] },
  ];
  const ops = planOfferingOps(f, have);
  assert.deepEqual(ops.map((o) => (o.op === "update" ? o.id : o.op)), ["a", "b", "c", "d"]);
  const a = ops[0]!;
  assert.equal(a.op, "update");
  if (a.op !== "update") return;
  assert.deepEqual((a.patch.attributes as Record<string, unknown>).where, ["client"]);
  assert.equal((a.patch.attributes as Record<string, unknown>).demo_batch, "demo-2026-09-28");
  assert.equal(a.patch.cancellation_hours, 4);
  // GRK-065: offerings that were missing where still get client delivery on rebuild.
  const c = ops[2]!;
  assert.equal(c.op, "update");
  if (c.op === "update") {
    assert.deepEqual((c.patch.attributes as Record<string, unknown>).where, ["client"]);
  }
  const d = ops[3]!;
  if (d.op !== "update") throw new Error("update");
  assert.equal(d.patch.booking_mode, "inquiry");
  assert.equal(d.patch.price_display, "from");
  assert.equal(d.patch.amount_cents, 450000);
  assert.deepEqual((d.patch.attributes as Record<string, unknown>).where, ["client"]);
  assert.equal(matchOfferings(f, have).get(2)?.id, "c");
});

test("GRK-065: fresh Gridline inserts stamp attributes.where = client", () => {
  const f = fx("TAL-93206");
  const ops = planOfferingOps(f, []);
  assert.ok(ops.length >= 1);
  for (const op of ops) {
    if (op.op !== "insert") continue;
    assert.deepEqual((op.row.attributes as Record<string, unknown>).where, ["client"]);
  }
});

test("offerings: the emergency flag follows the urgency service, and a bilingual demo carries both languages", () => {
  const ops = planOfferingOps(fx("TAL-93206"), []);
  const flags = ops.map((o) => (o.op === "insert" ? ((o.row.attributes as { matrix: { emergency?: boolean } }).matrix.emergency === true) : false));
  assert.deepEqual(flags, [true, false, false, false]);
  const r = planOfferingOps(fx("TAL-93212"), [])[0]!;
  if (r.op !== "insert") throw new Error("insert");
  const matrix = (r.row.attributes as { matrix: { materials: Record<string, string> } }).matrix;
  assert.ok(matrix.materials.es && matrix.materials.en);
  const titles = r.row.title_i18n as Record<string, string>;
  assert.equal(titles.en, "Visit for your repair list");
  assert.equal(titles.es, "Visita para lista de arreglos");
});

test("variants carry the delta label text and the profile keeps both bios", () => {
  const f = fx("TAL-93206");
  const op = planOfferingOps(f, [])[0]!;
  if (op.op !== "insert") throw new Error("insert");
  assert.equal(op.variants.length, 3);
  assert.equal((op.variants[1]!.presentation as { deltaLabel?: string }).deltaLabel, "-$10");
  assert.equal(op.variants[1]!.amount_cents, 8500);
  // The English fixture writes the English bio and leaves the Spanish one alone.
  const patch = planProfilePatch(f, { short_bio: f.talent.tagline, home_city_text: f.talent.city, bio_i18n: { en: f.talent.bio, es: "Hago trabajos" } });
  assert.deepEqual(patch, {});
  const changed = planProfilePatch(f, { short_bio: "x", home_city_text: f.talent.city, bio_i18n: { es: "Hago trabajos" } });
  assert.deepEqual(Object.keys(changed).sort(), ["bio_i18n", "short_bio"]);
  assert.equal((changed.bio_i18n as Record<string, string>).es, "Hago trabajos");
});

test("faq, areas and captions: planned from the fixture, idempotent, home base untouched", () => {
  const f = fx("TAL-93212");
  const second = { locale: f.locale, lang: "en", items: f.translations!.en!.faq! };
  const ops = planFaqOps(f.faq.items, [], second);
  assert.equal(ops.length, 4);
  const row = (ops[0] as { row: Record<string, unknown> }).row;
  assert.deepEqual(Object.keys(row.question_i18n as object).sort(), ["en", "es"]);
  const have = ops.map((o, i) => ({ ...(o as { row: Record<string, unknown> }).row, id: `f${i}`, sort_order: i }));
  assert.deepEqual(planFaqOps(f.faq.items, have, second), []);

  const existing = [{ id: "home", service_kind: "home_base", city: "Mazatlán", display_order: 0 }, { id: "old", service_kind: "travel_to", city: "Culiacán", display_order: 1 }];
  const plan = planAreaOps(f.location!.areas, existing);
  assert.equal(plan.insert.length, f.location!.areas!.length);
  assert.deepEqual(plan.delete, ["old"]);
  assert.ok(!plan.delete.includes("home"));
  const applied = [existing[0]!, ...f.location!.areas!.map((city, i) => ({ id: `t${i}`, service_kind: "travel_to", city, display_order: i + 1 }))];
  assert.deepEqual(planAreaOps(f.location!.areas, applied), { insert: [], update: [], delete: [] });

  const gallery = Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, metadata: { source: "ai" } }));
  const caps = planCaptionOps(f, gallery);
  assert.equal(caps.length, 6);
  assert.equal((caps[0]!.metadata as { caption: string }).caption, `${f.portfolio.items[0]!.title}\n${f.portfolio.items[0]!.caption}`);
  assert.equal((caps[0]!.metadata as { source: string }).source, "ai");
  const done = gallery.map((g, i) => (i < 6 ? { ...g, metadata: caps[i]!.metadata } : g));
  assert.deepEqual(planCaptionOps(f, done), []);
  // A fixture whose job items have no title (Maison, Folio) writes no captions.
  assert.deepEqual(planCaptionOps(loadDemoContentFixture("maison-v2"), gallery), []);
});

test("restore: a backup without the newer tables leaves service areas and photos alone", () => {
  const before = emptySnapshot();
  const current = emptySnapshot();
  current.talent_service_areas = [{ id: "home", service_kind: "home_base" }];
  current.media_assets = [{ id: "m1", metadata: {} }];
  const old = { ...before } as Partial<typeof before>;
  delete old.talent_service_areas;
  delete old.media_assets;
  assert.deepEqual(planContentRestore(old as typeof before, current), []);
  // With the tables present, rows added since the backup go; photos are never deleted by the executor.
  const withTables = planContentRestore(before, current);
  assert.deepEqual(withTables.map((o) => o.table).sort(), ["media_assets", "talent_service_areas"]);
});

test("site copy: spec cells, tasks, spec rows, top bar and badges fill the Gridline design; rerun is stable", () => {
  for (const code of CODES) {
    const f = fx(code);
    const ids = new Map(f.services.map((s, i) => [s.id, `off-${i}`]));
    const copy = gridlineCopyFromFixture(f, (id) => ids.get(id));
    const payload = buildGridlinePayload();
    let n = 0;
    const once = applyDemoSiteCopy(payload.shellTree as never, payload.homeTree as never, { gridline: copy }, () => null, () => `c-${++n}`);
    const text = JSON.stringify(once);
    for (const cell of f.hero.facts!) assert.ok(text.includes(cell.value), `${code} spec cell ${cell.label}`);
    for (const r of f.specTable!.rows) assert.ok(text.includes(JSON.stringify(r.value).slice(1, -1)), `${code} spec row`);
    for (const b of f.hero.badges!) assert.ok(text.includes(b), `${code} badge`);
    assert.ok(text.includes(f.topBar!.subtitle), `${code} top bar`);
    for (const t of f.tasks!.items) assert.ok(text.includes(JSON.stringify(t.label).slice(1, -1)) || text.includes(t.label), `${code} task ${t.id}`);
    const picker = findKind(once.home, "task_picker")!;
    const tasks = (picker.props as { tasks: Array<{ offeringId: string; icon: string }> }).tasks;
    assert.equal(tasks.length, f.tasks!.items.length);
    for (const t of tasks) {
      assert.match(t.offeringId, /^off-\d$/);
      assert.ok((BUILDER_ICON_NAMES as readonly string[]).includes(t.icon), `${code} icon ${t.icon}`);
    }
    assert.equal((picker.props as { defaultOfferingId: string }).defaultOfferingId, ids.get(f.tasks!.fallback.serviceId));
    // Same input, same ids: an identical rerun writes the same trees.
    let m = 0;
    const again = applyDemoSiteCopy(payload.shellTree as never, payload.homeTree as never, { gridline: copy }, () => null, () => `c-${++m}`);
    assert.deepEqual(again, once);
    // Applying onto its own output adds no second badge row.
    let k = 100;
    const twice = applyDemoSiteCopy(once.shell, once.home, { gridline: copy }, () => null, () => `c-${++k}`);
    assert.equal(JSON.stringify(twice).split('"Badges"').length, JSON.stringify(once).split('"Badges"').length);
  }
});

test("site copy: the urgent trades fill the alert band and the status labels", () => {
  const f = fx("TAL-93207");
  const copy = gridlineCopyFromFixture(f, () => "x");
  const payload = buildGridlinePayload();
  const out = applyDemoSiteCopy(payload.shellTree as never, payload.homeTree as never, { gridline: copy }, () => null, () => "z");
  const band = findKind(out.home, "alert_band")!;
  assert.equal((band.props as { title: string }).title, f.urgency!.band.title);
  const bar = findKind(out.shell, "utility_bar")!;
  assert.equal((bar.props as { statusOnLabel: string }).statusOnLabel, "Emergencies today");
  assert.equal((bar.props as { subtitle: string }).subtitle, "Plumber · Tampa");
});

test("task icons: the mockup glyphs map into the icon registry and unknown keys fall back", () => {
  for (const k of ["dark", "lamp", "trip", "panel", "plug", "spark", "zap", "droplet"]) {
    assert.ok((BUILDER_ICON_NAMES as readonly string[]).includes(taskIconFor(k)), k);
  }
  assert.equal(taskIconFor("not-an-icon"), "check");
});

test("Alex: the reference fixture is the mockup, with Gridline-only blocks and no upload fields", () => {
  const f = fx("TAL-93030");
  assert.equal(f.locale, "es");
  for (const s of f.services) assert.ok(!intakeOf(s).some((x) => x.type === "upload"));
  const emerg = planOfferingOps(f, []).map((o) => (o.op === "insert" ? ((o.row.attributes as { matrix: { emergency?: boolean } }).matrix.emergency === true) : false));
  assert.deepEqual(emerg, [false, false, false, true]);
});

type N = { kind: string; props?: Record<string, unknown>; children?: N[] };
function findKind(nodes: N[], kind: string): N | undefined {
  for (const n of nodes) {
    if (n.kind === kind) return n;
    const hit = n.children ? findKind(n.children, kind) : undefined;
    if (hit) return hit;
  }
  return undefined;
}
