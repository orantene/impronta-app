import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { buildTalentLocaleSwaps } from "./talent-locale-swaps";
import {
  applyTalentTickerServices,
  buildTickerServiceWords,
  tickerSourceOf,
  treeHasServicesTicker,
} from "./ticker-services";

const ticker = (props: Record<string, unknown>, id = "t1"): BuilderNode =>
  ({ id, kind: "marquee", props }) as unknown as BuilderNode;
const itemsOf = (n: BuilderNode) => (n.props as { items: Array<{ text: string }> }).items.map((i) => i.text);

const rows = [
  { title: "Gel manicure", title_i18n: { en: "Gel manicure", es: "Manicura de gel" } },
  { title: "Nail art", title_i18n: { en: "Nail art", es: "Arte en uñas" } },
  { title: "Pedicure", title_i18n: null },
];

test("words come from offeringText in the visitor's language, falling back down the chain", () => {
  assert.deepEqual(buildTickerServiceWords(rows, "es"), ["Manicura de gel", "Arte en uñas", "Pedicure"]);
  assert.deepEqual(buildTickerServiceWords(rows, "en"), ["Gel manicure", "Nail art", "Pedicure"]);
  // French visitor, Spanish-primary talent: the primary reads before English.
  assert.deepEqual(buildTickerServiceWords(rows, "fr", ["fr", "es"]).slice(0, 2), ["Manicura de gel", "Arte en uñas"]);
});

test("English-only Semi-permanent gel becomes Gel semipermanente on an ES ticker (TUL-189)", () => {
  const onlyEn = [{ title: "Semi-permanent gel", title_i18n: { en: "Semi-permanent gel" } }];
  assert.deepEqual(buildTickerServiceWords(onlyEn, "es"), ["Gel semipermanente"]);
  assert.deepEqual(buildTickerServiceWords(onlyEn, "en"), ["Semi-permanent gel"]);
});

test("blank titles drop, repeats collapse in any casing, and the list is capped", () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ title: `Service ${i}`, title_i18n: null }));
  assert.equal(buildTickerServiceWords(many, "en").length, 12);
  assert.deepEqual(
    buildTickerServiceWords(
      [{ title: "  ", title_i18n: null }, { title: "Lashes", title_i18n: null }, { title: "LASHES", title_i18n: null }],
      "en",
    ),
    ["Lashes"],
  );
});

test("a services ticker and a legacy unset one fill from offerings; only explicit custom is left alone (TUL-189)", () => {
  const services = ticker({ source: "services", items: [{ text: "Old" }, { text: "Words" }] }, "a");
  const custom = ticker({ source: "custom", items: [{ text: "Mine" }, { text: "Own" }] }, "b");
  const legacy = ticker({ items: [{ text: "Semi-permanent gel" }, { text: "Soft gel extensions" }] }, "c");
  const out = applyTalentTickerServices([services, custom, legacy], ["Manicura", "Pedicura"]);
  assert.deepEqual(itemsOf(out[0]!), ["Manicura", "Pedicura"]);
  assert.equal(out[1], custom, "custom ticker is returned untouched");
  assert.deepEqual(itemsOf(out[2]!), ["Manicura", "Pedicura"], "absent source follows services");
  assert.equal(treeHasServicesTicker([legacy]), true);
  assert.equal(tickerSourceOf(legacy), "services");
});

test("no published services keeps the literal items as the fallback (identity preserved)", () => {
  const tree = [ticker({ source: "services", items: [{ text: "Gel" }, { text: "Art" }] })];
  assert.equal(applyTalentTickerServices(tree, []), tree);
});

test("a nested services ticker is found and filled, and the other branches keep their identity", () => {
  const inner = ticker({ source: "services", items: [{ text: "x" }, { text: "y" }] }, "in");
  const sibling = { id: "p", kind: "paragraph", props: { text: "hi" } } as unknown as BuilderNode;
  const wrap = { id: "w", kind: "container", props: {}, children: [sibling, inner] } as unknown as BuilderNode;
  assert.equal(treeHasServicesTicker([wrap]), true);
  const out = applyTalentTickerServices([wrap], ["A", "B"]);
  const kids = (out[0] as unknown as { children: BuilderNode[] }).children;
  assert.equal(kids[0], sibling);
  assert.deepEqual(itemsOf(kids[1]!), ["A", "B"]);
  // Explicit custom is the only way to opt out; an unset source follows services.
  assert.equal(treeHasServicesTicker([ticker({ source: "custom", items: [] })]), false);
  assert.equal(treeHasServicesTicker([ticker({ items: [] })]), true);
});

test("an unknown source fails closed to custom with a dev-only warning", () => {
  const warns: string[] = [];
  const original = console.warn;
  console.warn = (m: unknown) => void warns.push(String(m));
  try {
    const bad = ticker({ source: "rss", items: [{ text: "Keep" }, { text: "Me" }] }, "bad");
    assert.equal(tickerSourceOf(bad), "custom");
    assert.equal(applyTalentTickerServices([bad], ["Nope"])[0], bad);
  } finally {
    console.warn = original;
  }
  assert.ok(warns.some((w) => w.includes("bad") && w.includes("rss")));
});

test("an edited or re-cased service name still follows the profile (the literal swap cannot)", () => {
  // Baked as "Gel Manicure"; she later renamed the service "gel manicure!" with an es title.
  const baked = ticker({ source: "services", items: [{ text: "Gel Manicure" }, { text: "Nail art" }] });
  const live = [{ title: "gel manicure!", title_i18n: { en: "gel manicure!", es: "manicura de gel" } }];
  const swaps = buildTalentLocaleSwaps(
    { bioI18n: null, typeNames: [], homeCity: null, offerings: [{ title: live[0]!.title, titleI18n: live[0]!.title_i18n }] },
    "es",
  );
  assert.equal(swaps["Gel Manicure"], undefined, "exact-string swap misses the edited word");
  const out = applyTalentTickerServices([baked], buildTickerServiceWords(live, "es"));
  assert.deepEqual(itemsOf(out[0]!), ["manicura de gel"]);
});

test("existing literal tickers keep swapping by exact string as before", () => {
  const swaps = buildTalentLocaleSwaps(
    {
      bioI18n: null,
      typeNames: [],
      homeCity: null,
      offerings: [{ title: "Nail art", titleI18n: { en: "Nail art", es: "Arte en uñas" } }],
    },
    "es",
  );
  assert.equal(swaps["Nail art"], "Arte en uñas");
});

test("static wiring: schema, core seed, Maison v2 seed and demo copy all carry the source", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");
  assert.match(read("lib/site-admin/builder-node/registry.ts"), /source: z\.enum\(\["services", "custom"\]\)\.optional\(\)/);
  assert.match(read("lib/site-admin/builder-node/create.ts"), /source: "services"/);
  assert.match(read("lib/talent-site/theme-catalog/collection/maison-v2.ts"), /source: "services"/);
  assert.match(read("lib/talent-site/demos/site-copy.ts"), /source: "custom"/);
  assert.match(read("lib/talent-site/server/talent-site-render-fixups.server.ts"), /applyTalentTickerServices/);
});

test("filling a services ticker drops index-keyed item translations but keeps other overlay keys", () => {
  const overlay = { en: { "items.0.text": "Old word", "items.1.text": "Other" }, es: { "items.0.text": "Palabra" } };
  const node = {
    id: "m1", kind: "marquee", i18n: overlay,
    props: { source: "services", items: [{ text: "a" }, { text: "b" }], i18n: { ...overlay, fr: { speed: "x" } } },
  } as unknown as BuilderNode;
  const [out] = applyTalentTickerServices([node], ["Lash lift", "Brow tint"]);
  const props = out.props as { items: Array<{ text: string }>; i18n?: Record<string, Record<string, string>> };
  assert.deepEqual(props.items.map((i) => i.text), ["Lash lift", "Brow tint"]);
  assert.deepEqual(props.i18n, { fr: { speed: "x" } });
  assert.deepEqual(out.i18n, {});
});
