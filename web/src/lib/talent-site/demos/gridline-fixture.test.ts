/**
 * TEMPLATE FACTORY: the Gridline (TH16) reference content fixture equals the
 * pinned mockup. The mockup (`design-references/gridline/index.html`) is the
 * source of truth: this test RUNS its own script (data + `renderSite`) in a vm
 * with a stub kit, then compares the data and the rendered markup with
 * `design-references/gridline/content.json`, field by field. A drift in either
 * file fails here, so the reference demo is exactly the mockup.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";

import { loadDemoContentFixture, validateDemoContentFixture, type FixtureBriefQuestion, type FixtureVariant } from "./content-fixture";

const REF_DIR = path.resolve(process.cwd(), "design-references/gridline");
const html = fs.readFileSync(path.join(REF_DIR, "index.html"), "utf8");
const fx = loadDemoContentFixture("gridline");

type MockBrief = { k: string; l: string; p?: string; im?: string; type?: string; opts?: string[]; h?: string; demo?: unknown };
type MockService = {
  id: string; cat: string; name: string; dur: string; price: string; priceLabel?: string; mode: string; cta: string; img: string;
  desc: string; includes: string[]; optLabel?: string; options?: string[][]; extras?: string[][]; slots?: string[]; slotNote?: string;
  policy?: string; payNote?: string; whoFields?: MockBrief[]; flowTitle?: string; flowIntro?: string; submit?: string; brief?: MockBrief[]; reply?: string;
};
type MockT = {
  domain: string; reply: string; suggestions: string[]; services: MockService[]; dock: Array<{ label: string; flow: string }>;
  talent: { name: string; first: string; role: string; avatar: string; tagline: string; bio: string };
  renderSite(K: unknown, S: unknown): string;
  onAction(name: string, S: unknown, x: unknown): void;
};
type GlState = { urg: boolean; task: string | null };

/** Values built inside the vm carry that realm's prototypes; deepStrictEqual needs host ones. */
const clone = <V,>(v: V): V => JSON.parse(JSON.stringify(v)) as V;

function loadMockup(): { T: MockT; GL: GlState; tasks: string[][] } {
  const m = html.match(/<script>\s*(\/\* Theme state[\s\S]*?KIT\(T\);)\s*<\/script>/);
  assert.ok(m, "mockup theme script not found");
  let captured: MockT | null = null;
  const ctx = vm.createContext({
    KIT: (t: MockT) => {
      captured = t;
    },
    document: { getElementById: () => null },
    console,
  });
  vm.runInContext(`${m[1]}\nglobalThis.__gl={GL,GL_TASKS};`, ctx);
  assert.ok(captured, "KIT(T) was not called");
  const g = (ctx as { __gl: { GL: GlState; GL_TASKS: string[][] } }).__gl;
  return { T: captured as MockT, GL: g.GL, tasks: clone(g.GL_TASKS) };
}

const { T, GL, tasks } = loadMockup();

function render(): string {
  const K = {
    esc: (s: unknown) => String(s ?? ""),
    D: { services: T.services, talent: T.talent },
    mine: false,
    status: () => "",
    demo: () => "",
    act: (s: MockService) => `[act ${s.id}]`,
    open: (s: MockService, _cls: string, label: string) => `[open ${s.id} ${label ?? ""}]`,
    img: (k: string) => `img:${k}`,
  };
  return T.renderSite(K, {});
}

const strip = (h: string) => h.replace(/<[^>]*>/g, "").trim();
const all = (h: string, re: RegExp) => [...h.matchAll(re)];
const SITE = render();

test("fixture validates and is the Gridline reference", () => {
  assert.deepEqual(validateDemoContentFixture(fx), []);
  assert.equal(fx.design, "gridline");
  assert.match(fx.profileCode, /^TAL-93\d{3}$/);
});

test("talent, suggestions and sample chat text match the mockup", () => {
  assert.equal(fx.talent.displayName, T.talent.name);
  assert.equal(fx.talent.tagline, T.talent.tagline);
  assert.equal(fx.talent.bio, T.talent.bio);
  assert.equal(fx.talent.trade, T.talent.role);
  assert.equal(fx.hero.imageKey, T.talent.avatar);
  assert.deepEqual(fx.suggestions, clone(T.suggestions));
  assert.equal((fx.mockupOnly.samples as { chatReply: string }).chatReply, T.reply);
  assert.equal((fx.mockupOnly as { domain: string }).domain, T.domain);
});

const num = (p: string): number | null => {
  const d = p.replace(/[^\d]/g, "");
  return d ? Number(d) : null;
};
function delta(text: string): { priceDelta: number; deltaPct?: number } {
  if (text.includes("%")) return { priceDelta: 0, deltaPct: Number(text.match(/-?\d+/)![0]) };
  if (!text) return { priceDelta: 0 };
  return { priceDelta: (text.startsWith("-") ? -1 : 1) * Number(text.replace(/[^\d]/g, "")) };
}
function brief(b: MockBrief): FixtureBriefQuestion {
  return {
    key: b.k,
    label: b.l,
    ...(b.p ? { placeholder: b.p } : {}),
    ...(b.im ? { inputMode: b.im } : {}),
    ...(b.type ? { type: b.type } : {}),
    ...(b.opts ? { options: b.opts } : {}),
    ...(b.h ? { help: b.h } : {}),
  };
}

test("every service equals the mockup service (data layer)", () => {
  const MOCK_SERVICES = clone(T.services);
  assert.equal(fx.services.length, MOCK_SERVICES.length);
  MOCK_SERVICES.forEach((m, i) => {
    const s = fx.services[i];
    const at = `service ${m.id}`;
    assert.equal(s.id, m.id, at);
    assert.equal(s.category, m.cat, `${at} category`);
    assert.equal(s.name, m.name, `${at} name`);
    assert.equal(s.durationLabel, m.dur, `${at} duration`);
    assert.equal(s.priceLabel, m.priceLabel || m.price, `${at} price label`);
    assert.equal(s.priceAmount, num(m.price), `${at} price amount`);
    assert.equal(s.mode, m.mode, `${at} mode`);
    assert.equal(s.ctaLabel, m.cta, `${at} cta`);
    assert.equal(s.imageKey, m.img, `${at} image`);
    assert.equal(s.description, m.desc, `${at} description`);
    assert.deepEqual(s.includes, m.includes, `${at} includes`);
    assert.equal(s.optionsLabel, m.optLabel, `${at} options label`);
    assert.equal(s.slotNote, m.slotNote, `${at} slot note`);
    assert.deepEqual(s.slots, m.slots, `${at} slots`);
    assert.equal(s.policy, m.policy, `${at} policy`);
    assert.equal(s.payNote, m.payNote, `${at} pay note`);
    assert.equal(s.flow?.title, m.flowTitle, `${at} flow title`);
    assert.equal(s.flow?.intro, m.flowIntro, `${at} flow intro`);
    assert.equal(s.flow?.submit, m.submit, `${at} flow submit`);
    assert.deepEqual(s.flow?.brief, m.brief?.map(brief), `${at} brief`);
    assert.deepEqual(s.whoFields, m.whoFields?.map(brief), `${at} who fields`);
    const variants: FixtureVariant[] | undefined = m.options?.map(([id, label, note, d]) => ({ id, label, note, minutesDelta: 0, deltaLabel: d, ...delta(d) }));
    assert.deepEqual(s.variants, variants, `${at} variants`);
    const extras = m.extras?.map(([id, label, d, note]) => ({ id, label, minutesDelta: 0, deltaLabel: d, note, ...delta(d) }));
    assert.deepEqual(s.extras, extras, `${at} extras`);
    const replies = (fx.mockupOnly.samples as { serviceReplies: Record<string, string> }).serviceReplies;
    assert.equal(replies[m.id], m.reply, `${at} sample reply`);
    const answers = (fx.mockupOnly.samples as { briefAnswers: Record<string, Record<string, unknown>> }).briefAnswers;
    const demo = Object.fromEntries((m.brief ?? []).filter((b) => b.demo !== undefined).map((b) => [b.k, b.demo]));
    assert.deepEqual(answers[m.id] ?? {}, demo, `${at} sample brief answers`);
  });
});

test("rendered utility bar, urgency band and hero match", () => {
  assert.equal(strip(SITE.match(/<div class="nm"><b>[^<]*<\/b><small>([^<]*)<\/small>/)![1]), fx.topBar!.subtitle);
  assert.equal(SITE.match(/class="gl-tel"[^>]*aria-label="([^"]*)"/)![1], fx.topBar!.phoneAriaLabel);
  assert.equal(GL.urg, fx.urgency!.defaultOn);
  assert.equal(strip(SITE.match(/class="gl-urg"[^>]*><i><\/i><span>([^<]*)<\/span>/)![1]), fx.urgency!.statusOn);
  const emg = fx.services.find((s) => s.id === fx.urgency!.serviceId)!;
  const band = SITE.match(/<section class="gl-emg"[\s\S]*?<h2>([^<]*)<\/h2><p>([^<]*)<\/p>[\s\S]*?<b>([^<]*)<\/b>\s*([^<]*)<\/span>/)!;
  assert.equal(band[1], fx.urgency!.band.title);
  assert.equal(band[2], emg.description);
  assert.equal(band[3], fx.urgency!.band.safetyLead);
  assert.equal(band[4], fx.urgency!.band.safety);
  assert.deepEqual(clone(T.dock), [{ label: fx.urgency!.dock.on.label, flow: fx.urgency!.dock.on.serviceId }]);

  assert.equal(strip(SITE.match(/<div class="gl-kick"><i><\/i>([^<]*)<\/div>/)![1]), fx.hero.eyebrow);
  const h1 = SITE.match(/<h1 class="gl-h1">([\s\S]*?)<\/h1>/)![1].replace("<em>", "{i}").replace("</em>", "{/i}");
  assert.equal(h1, fx.hero.headline);
  const facts = all(SITE.match(/<div class="gl-spec gl-mono">([\s\S]*?)<\/div>\s*<div class="gl-acts">/)![1], /<small>([^<]*)<\/small><b>([^<]*)<\/b>/g).map((m) => ({ label: m[1], value: m[2] }));
  assert.deepEqual(facts, fx.hero.facts);
  const rev = fx.services.find((s) => s.id === "rev")!;
  assert.equal(facts[3].value, rev.priceLabel);
  assert.deepEqual([rev.ctaLabel, SITE.match(/data-k-act="go:gl-pick">([^<]*)<\/button>/)![1]], fx.hero.ctas);
  const who = SITE.match(/<div class="gl-who">[\s\S]*?<b>([^<]*)<\/b><p>([^<]*)<\/p><div class="gl-badges gl-mono">([\s\S]*?)<\/div>/)!;
  assert.equal(who[1], fx.talent.displayName);
  assert.equal(who[2], fx.talent.bio);
  assert.deepEqual(all(who[3], /<span>([^<]*)<\/span>/g).map((m) => m[1]), [...fx.hero.badges!, ...(fx.mockupOnly.heroBadgesExtra as string[])]);
});

test("urgency off: status text and dock swap match", () => {
  const before = JSON.stringify(clone(T.dock));
  T.onAction("urg-setting", {}, { render: () => undefined });
  assert.equal(GL.urg, false);
  assert.deepEqual(clone(T.dock), [{ label: fx.urgency!.dock.off.label, flow: fx.urgency!.dock.off.serviceId }]);
  const off = render();
  assert.equal(strip(off.match(/class="gl-urg"[^>]*><i><\/i><span>([^<]*)<\/span>/)![1]), fx.urgency!.statusOff);
  assert.ok(!off.includes('class="gl-emg"'), "alert band must disappear when the setting is off");
  T.onAction("urg-setting", {}, { render: () => undefined });
  assert.equal(JSON.stringify(clone(T.dock)), before);
});

test("task picker, matrix, spec table, jobs, area and FAQ match the render", () => {
  // task picker
  const t = fx.tasks!;
  assert.deepEqual(
    t.items.map((i) => [i.id, i.label, i.icon, i.serviceId, i.hint]),
    tasks,
  );
  const labels = all(SITE, /data-k-act="task:(t\d)"[^>]*>[\s\S]*?<span>([^<]*)<\/span><\/button>/g).map((m) => [m[1], m[2]]);
  assert.deepEqual(labels, t.items.map((i) => [i.id, i.label]));
  const fb = SITE.match(/<div class="gl-rec gl-rec0"><div class="h"><span>([^<]*)<\/span><span>([^<]*)<\/span><\/div><div class="b"><h3>[^<]*<\/h3><p>([^<]*)<\/p>/)!;
  assert.deepEqual([fb[1], fb[2], fb[3]], [t.fallback.kicker, t.fallback.badge, t.fallback.body]);
  GL.task = "t3";
  const rec = render().match(/<div class="gl-rec"><div class="h"><span>([^<]*)<\/span>[\s\S]*?\[open \w+ ([^\]]*)\]/)!;
  GL.task = null;
  assert.equal(rec[1], t.recommendKicker);
  assert.equal(rec[2], t.detailsLabel);

  // section headers in page order: tasks, services, specs, zone, faq
  const hds = all(SITE, /<div class="gl-hd"><h2>([^<]*)<\/h2><small>([^<]*)<\/small><\/div>/g).map((m) => [m[1], m[2]]);
  assert.deepEqual(hds, [
    [t.title, t.hint],
    [fx.menu.title, fx.menu.subtitle],
    [fx.specTable!.title, fx.specTable!.subtitle],
    [fx.location!.title, fx.location!.sub],
    [fx.faq.title, String(fx.faq.items.length)],
  ]);

  // comparison matrix (desktop table): every cell
  const table = SITE.match(/<div class="gl-mx"><table[\s\S]*?<\/table>/)![0];
  const head = all(table, /<th class="[^"]*" data-k-open="(\w+)">([^<]*)<\/th>/g).map((m) => [m[1], m[2]]);
  assert.deepEqual(head, fx.services.map((s) => [s.id, s.name]));
  const rows = all(table.split("<tbody>")[1], /<tr><th>([^<]+)<\/th>([\s\S]*?)<\/tr>/g);
  assert.deepEqual(rows.map((r) => r[1]), fx.matrix!.rows.map((r) => r.label));
  const want = (key: string, s: (typeof fx.services)[number]): string =>
    ({ price: s.priceLabel, dur: s.durationLabel ?? "", mode: s.modeNote ?? "", mat: s.matrix!.materials, war: s.matrix!.warranty, resp: s.matrix!.response })[key]!;
  rows.forEach((r, i) => {
    const cells = all(r[2], /<td[^>]*>([\s\S]*?)<\/td>/g).map((m) => strip(m[1]));
    assert.deepEqual(cells, fx.services.map((s) => want(fx.matrix!.rows[i].key, s)), `matrix row ${r[1]}`);
  });

  // spec table
  const st = SITE.match(/<table class="gl-st">([\s\S]*?)<\/table>/)![1];
  assert.deepEqual(all(st, /<tr><th>([^<]*)<\/th><td>([^<]*)<\/td><\/tr>/g).map((m) => ({ label: m[1], value: m[2] })), fx.specTable!.rows);

  // job cards
  const jobs = all(SITE, /<figure class="gl-job"><img src="img:([^"]*)"[^>]*><figcaption><b>([^<]*)<\/b>([^<]*)<\/figcaption>/g).map((m) => ({ imageKey: m[1], title: m[2], caption: m[3] }));
  assert.deepEqual(jobs, fx.portfolio.items.map((p) => ({ imageKey: p.imageKey, title: p.title, caption: p.caption })));

  // area card
  const area = SITE.match(/<div class="gl-area">[\s\S]*?<ul>([\s\S]*?)<\/ul><p>([^<]*)<\/p>/)!;
  assert.deepEqual(all(area[1], /<li>([^<]*)<\/li>/g).map((m) => m[1]), fx.location!.areas);
  assert.equal(area[2], fx.location!.arrivalNote);

  // FAQ
  const faq = all(SITE, /<details><summary>([^<]*)<\/summary><p>([^<]*)<\/p><\/details>/g).map((m) => ({ q: m[1], a: m[2] }));
  assert.deepEqual(faq, fx.faq.items);

  // footer fine print is mockup-only
  assert.match(SITE, new RegExp(`<span>${T.domain.replace(/\./g, "\\.")}</span><span>${(fx.mockupOnly as { footerFine: string }).footerFine}</span>`));
});

test("every image key exists in the pinned mockup images", () => {
  const keys = new Set<string>([fx.hero.imageKey!, ...fx.services.map((s) => s.imageKey), ...fx.portfolio.items.map((p) => p.imageKey)]);
  for (const k of keys) assert.ok(fs.existsSync(path.join(REF_DIR, "img", `${k}.jpg`)), `img/${k}.jpg missing`);
});

test("mockupOnly holds the fictional data, never the main body", () => {
  const body = JSON.stringify({ ...fx, mockupOnly: undefined });
  for (const token of ["ficticio", "tulala.digital", "Hecho con Tulala", "MTY"]) assert.ok(!body.includes(token), token);
});

test("every service mode is one the product can sell (quote is the product's inquiry)", () => {
  const product = new Set(["request", "instant", "inquiry"]);
  for (const s of fx.services) assert.ok(product.has(s.mode === "quote" ? "inquiry" : s.mode), `${s.id}: ${s.mode}`);
});

test("parity map: every unit is a data-w of the mockup, order and sections agree", () => {
  const map = JSON.parse(fs.readFileSync(path.join(REF_DIR, "parity-map.json"), "utf8")) as {
    referenceDemo: { profileCode: string };
    order: string[];
    sections: Array<{ key: string; unit: string | null; mockup: string[]; product: string[]; productOnly?: boolean; expects: unknown[] }>;
    units: Record<string, string>;
  };
  assert.equal(map.referenceDemo.profileCode, fx.profileCode);
  const wUnits = new Set(all(html, /data-w="([^"]+)"/g).map((m) => m[1]));
  for (const [unit, key] of Object.entries(map.units)) {
    assert.ok(wUnits.has(unit), `unit not in mockup: ${unit}`);
    assert.equal(map.sections.find((s) => s.key === key)?.unit, unit, `${key} unit mismatch`);
  }
  assert.deepEqual([...wUnits].sort(), Object.keys(map.units).sort(), "a mockup unit has no map entry, or the map names a unit the mockup lacks");
  assert.deepEqual(map.order, map.sections.map((s) => s.key));
  for (const s of map.sections) {
    assert.ok(s.expects.length > 0, `${s.key}: no expects`);
    assert.ok(s.productOnly || s.mockup.length > 0, `${s.key}: no mockup selector`);
    assert.ok(s.product.length > 0, `${s.key}: no product selector`);
  }
});
