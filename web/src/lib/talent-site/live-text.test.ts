/**
 * Live text (Maison v2 2.7): the headline rules, the values built from profile
 * facts in both locales, and the render-time transform (explicit bindings,
 * hidden-when-empty, footer columns, the pre-2.7 eyebrow and proof line).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import { accentHeadline, resolveHeadline, seedHeadlineFor } from "./hero-headline";
import { applyTalentLiveText, treeHasLiveCandidates, type TalentLiveText } from "./live-text";
import { buildTalentLiveText, instagramHandle } from "./live-text-values";
import { stampDesignOrigin } from "./theme-releases/origin";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(HERE, rel), "utf8");

const p = (id: string, text: string, extra: Record<string, unknown> = {}): BuilderNode =>
  ({ id, kind: "paragraph", props: { text, ...extra } }) as unknown as BuilderNode;
const h = (id: string, text: string, extra: Record<string, unknown> = {}): BuilderNode =>
  ({ id, kind: "heading", props: { text, level: 1, ...extra } }) as unknown as BuilderNode;
const box = (id: string, children: BuilderNode[], extra: Record<string, unknown> = {}): BuilderNode =>
  ({ id, kind: "container", props: { layout: "stack", ...extra }, children }) as unknown as BuilderNode;
const textOf = (n: BuilderNode) => (n.props as { text?: string }).text;

// ── Headline ────────────────────────────────────────────────────────────────

test("headline: the middle word takes the accent, punctuation stays outside, her own markup is kept", () => {
  assert.equal(accentHeadline("Manos que hablan por ti."), "Manos que {i}hablan{/i} por ti.");
  assert.equal(accentHeadline("Hands that speak for you."), "Hands that {i}speak{/i} for you.");
  assert.equal(accentHeadline("Uñas con alma"), "Uñas {i}con{/i} alma");
  assert.equal(accentHeadline("Uñas perfectas."), "Uñas {i}perfectas{/i}.");
  assert.equal(accentHeadline("Hola"), "Hola");
  assert.equal(accentHeadline("Mi {i}propio{/i} estilo"), "Mi {i}propio{/i} estilo");
});

test("headline: her own wins, then a line seeded from her trade (both locales), then her name", () => {
  assert.equal(resolveHeadline({ headline: "Mi estilo es tuyo", tradeEn: "Nail Artist", displayName: "Alba" }).source, "own");
  const seed = resolveHeadline({ tradeEn: "Nail Artist", displayName: "Alba" }, "es");
  assert.equal(seed.source, "seed");
  assert.equal(seed.text, "Manos que {i}hablan{/i} por ti.");
  assert.equal(resolveHeadline({ tradeEn: "Nail Artist", displayName: "Alba" }, "en").text, "Hands that {i}speak{/i} for you.");
  const name = resolveHeadline({ tradeEn: "Taxidermist", displayName: "Alba" });
  assert.deepEqual(name, { text: "{i}Alba{/i}", source: "name" });
  assert.equal(seedHeadlineFor(""), null);
  for (const trade of ["Lash Artist", "Brow Artist", "Makeup Artist", "Hair Stylist", "Barber", "Massage Therapist", "Private Chef"]) {
    assert.ok(seedHeadlineFor(trade), `a seeded headline for ${trade}`);
  }
});

test("headline seeds never use an em dash or a hex colour", () => {
  for (const trade of ["Nail Artist", "Lash Artist", "Hair Stylist", "Private Chef", "DJ", "Personal Trainer"]) {
    const s = seedHeadlineFor(trade);
    assert.ok(s, trade);
    assert.doesNotMatch(`${s.en} ${s.es}`, /—|–|#[0-9a-f]{3,8}\b/i);
  }
});

// ── Values ──────────────────────────────────────────────────────────────────

const SRC = {
  displayName: "Alba",
  trade: { en: "Nail Artist", es: "Manicurista" },
  city: { en: "Merida", es: "Mérida" },
  headline: null,
  tagline: "Un estudio privado donde cada cita es solo tuya.",
  proof: { years: 9, languages: ["Spanish", "English"], rating: 4.9, count: 212, demo: false },
  place: "Centro, Mérida",
  hoursDays: "Lun a sáb",
  instagramHref: "https://www.instagram.com/alba.unas.demo/",
};

test("live values: Spanish and English come from real facts, empty parts drop out", () => {
  const es = buildTalentLiveText(SRC, "es").values;
  assert.equal(es.hero_eyebrow, "Manicurista · Mérida");
  assert.equal(es.hero_proof, "9 años de oficio · Español · Inglés · ★ 4.9 · 212 reseñas");
  assert.equal(es.hero_headline, "Manos que {i}hablan{/i} por ti.");
  assert.equal(es.hero_tagline, "Un estudio privado donde cada cita es solo tuya.");
  assert.equal(es.footer_intro, "Manicurista en Mérida.");
  assert.equal(es.footer_where, "Centro, Mérida");
  assert.equal(es.footer_hours, "Con cita, lun a sáb");
  assert.match(es.footer_contact ?? "", /^Instagram · \[@alba\.unas\.demo\]\(https:\/\/[^)]+\)$/);
  const en = buildTalentLiveText(SRC, "en").values;
  assert.equal(en.hero_eyebrow, "Nail Artist · Merida");
  assert.equal(en.hero_proof, "9 years of craft · Español · English · ★ 4.9 · 212 reviews");
  assert.equal(en.footer_hours, "By appointment, Lun a sáb");

  const bare = buildTalentLiveText({ displayName: "Zoe", trade: null, city: null, proof: {} }, "es").values;
  assert.equal(bare.hero_headline, "", "the name fallback is the stored text");
  for (const k of ["hero_eyebrow", "hero_proof", "hero_tagline", "footer_intro", "footer_where", "footer_hours", "footer_contact"] as const) {
    assert.equal(bare[k], "", `${k} is empty without data`);
  }
});

test("live values: a demo's reviews are labelled, her own headline is not reworded", () => {
  const demo = buildTalentLiveText({ ...SRC, proof: { ...SRC.proof, demo: true } }, "es").values;
  assert.match(demo.hero_proof ?? "", /212 reseñas de demo$/);
  const own = buildTalentLiveText({ ...SRC, headline: "Cada cita es solo tuya" }, "es").values;
  assert.equal(own.hero_headline, "Cada cita {i}es{/i} solo tuya");
});

test("instagramHandle reads the handle from a profile URL and refuses anything else", () => {
  assert.equal(instagramHandle("https://www.instagram.com/alba.unas.demo/"), "@alba.unas.demo");
  assert.equal(instagramHandle("https://instagram.com/@alba"), "@alba");
  assert.equal(instagramHandle("https://example.com/alba"), "");
  assert.equal(instagramHandle("not a url"), "");
  assert.equal(instagramHandle(null), "");
});

// ── The transform ───────────────────────────────────────────────────────────

const LIVE: TalentLiveText = buildTalentLiveText(SRC, "es");

test("explicit live lines take the profile value; eyebrow and headline keep their text when empty, proof and footer lines hide", () => {
  const tree = [
    box("hero", [
      h("h", "{i}Alba{/i}", { liveText: "hero_headline" }),
      p("e", "Nail Artist", { liveText: "hero_eyebrow" }),
      p("pr", "x", { liveText: "hero_proof" }),
    ]),
  ];
  const out = applyTalentLiveText(tree, LIVE);
  const kids = (out[0] as unknown as { children: BuilderNode[] }).children;
  assert.equal(textOf(kids[0]!), "Manos que {i}hablan{/i} por ti.");
  assert.equal(textOf(kids[1]!), "Manicurista · Mérida");
  assert.match(textOf(kids[2]!) ?? "", /9 años de oficio/);

  const none = applyTalentLiveText(tree, { values: {} });
  const left = (none[0] as unknown as { children: BuilderNode[] }).children;
  assert.equal(left.length, 2, "the proof line is hidden when there is nothing to say");
  assert.equal(textOf(left[0]!), "{i}Alba{/i}");
  assert.equal(textOf(left[1]!), "Nail Artist");
});

test("a footer column with no live line disappears whole; the contact column keeps its button", () => {
  const col = (slot: string, lines: BuilderNode[]) => box(slot, [h(`${slot}-h`, "x", {}), ...lines, p(`${slot}-l`, "link")], { slotKey: slot });
  const footer = box("f", [
    box("cols", [
      col("footer_where", [p("w", "​", { liveText: "footer_where" }), p("hr", "​", { liveText: "footer_hours" })]),
      col("footer_contact", [p("c", "​", { liveText: "footer_contact" })]),
    ]),
  ]);
  const full = applyTalentLiveText([footer], LIVE);
  assert.equal(JSON.stringify(full).includes("footer_where"), true);

  const empty = applyTalentLiveText([footer], { values: {} });
  const cols = ((empty[0] as unknown as { children: BuilderNode[] }).children[0] as unknown as { children: BuilderNode[] }).children;
  assert.equal(cols.length, 1, "only the contact column is left");
  assert.equal((cols[0]!.props as { slotKey?: string }).slotKey, "footer_contact");
  assert.equal(((cols[0] as unknown as { children: BuilderNode[] }).children).length, 2, "heading + link, the Instagram line is gone");

  const nothing = applyTalentLiveText([box("f2", [box("cols", [col("footer_where", [p("w", "​", { liveText: "footer_where" })])])])], { values: {} });
  assert.equal(nothing.length, 0, "an empty row of nothing goes too");
});

function stampedHero(eyebrow: string, proof: string, headline = "{i}Alba{/i}") {
  const tree = [
    {
      ...box("hero", [
        box("c", [h("h", headline), p("e", eyebrow), p("l", "lede"), p("pr", proof)]),
      ], { slotKey: "hero" }),
    },
  ];
  return stampDesignOrigin(tree, { design: "maison-v2", version: 19 });
}

test("sites applied before 2.7: the eyebrow and proof line follow the profile while they still hold the baked text", () => {
  // Stamps key the hero's children as hero/container/{paragraph, heading, paragraph#2, paragraph#3}; the
  // fixture above nests one container, so the keys are hero/container/*.
  const tree = stampedHero("Nail Artist", "Based in Merida");
  const out = applyTalentLiveText(tree, LIVE);
  const c = (out[0] as unknown as { children: Array<{ children: BuilderNode[] }> }).children[0]!.children;
  assert.equal(textOf(c[1]!), "Manicurista · Mérida");
  assert.match(textOf(c[3]!) ?? "", /9 años de oficio/);
  assert.equal(textOf(c[0]!), "{i}Alba{/i}", "the headline is her copy: it does not change on a published page");
  assert.equal(textOf(c[2]!), "lede", "neither does the tagline");
});

test("sites applied before 2.7: a line she rewrote is never overruled", () => {
  const tree = stampedHero("Nails, lashes and brows", "Mérida, since 2016");
  const out = applyTalentLiveText(tree, LIVE);
  const c = (out[0] as unknown as { children: Array<{ children: BuilderNode[] }> }).children[0]!.children;
  assert.equal(textOf(c[1]!), "Nails, lashes and brows");
  assert.equal(textOf(c[3]!), "Mérida, since 2016");
});

test("an untouched tree comes back identical, and only live candidates ask for the profile reads", () => {
  const plain = [box("a", [h("h", "Hola"), p("p", "Texto")])];
  assert.equal(applyTalentLiveText(plain, LIVE), plain);
  assert.equal(treeHasLiveCandidates(plain), false);
  assert.equal(treeHasLiveCandidates([box("a", [p("p", "x", { liveText: "footer_intro" })])]), true);
  assert.equal(treeHasLiveCandidates(stampedHero("a", "b")), true);
});

// ── Wiring: schema, renderer transform, inspector, ES ───────────────────────

test("liveText is wired at schema, render transform, inspector and ES", () => {
  const registry = read("../site-admin/builder-node/registry.ts");
  assert.equal((registry.match(/liveText: z\.enum\(LIVE_TEXT_KEYS\)\.optional\(\)/g) ?? []).length, 2, "heading and paragraph schemas");
  const types = read("../site-admin/builder-node/types.ts");
  assert.equal((types.match(/liveText\?: LiveTextKey/g) ?? []).length, 2);
  assert.ok(read("./server/talent-site-render-fixups.server.ts").includes("applyTalentLiveText"), "render transform");
  assert.ok(read("../site-admin/builder-node/operations.ts").includes("delete mergedProps.liveText"), "typing new text hands the line back");
  const content = read("../../components/edit-chrome/inspectors/builder-node-content.tsx");
  assert.equal((content.match(/<LiveTextToggle liveText=\{node\.props\.liveText\}/g) ?? []).length, 2, "heading and paragraph inspectors");
  const es = read("../../components/edit-chrome/editor-i18n-es-inspectors-3.ts");
  assert.ok(es.includes('"Follows your profile":'), "ES for the switch");
  assert.ok(read("../../components/edit-chrome/inspectors/live-text-toggle.tsx").includes("Follows your profile"));
});

test("headline, years and the footer tone are wired at schema, renderer, editor and ES", () => {
  // Profile fields: catalog definition (migration), scalar read/write, live loader, Identity editor, ES.
  const migration = read("../../../../supabase/migrations/20261231299620_talent_headline_field.sql");
  assert.ok(migration.includes("'identity.headline'") && migration.includes("ON CONFLICT (field_key) DO NOTHING"), "additive, idempotent");
  assert.doesNotMatch(migration, /ALTER TABLE|DROP |DELETE |UPDATE /i, "no column, no destructive statement");
  const scalars = read("../talent/scalar-field-values-catalog.ts");
  for (const needle of ['headline: "identity.headline"', 'years_total: "experience.years_total"']) assert.ok(scalars.includes(needle), needle);
  assert.ok(read("./server/load-live-text.server.ts").includes("scalars.headline"), "the live loader reads her headline");
  assert.ok(read("./server/load-starter-data.ts").includes("headline: scalars.headline"), "new applies seed from her headline");
  const drawer = read("../../components/admin/shell/internal/drawers/profile-shell/TalentProfileShellDrawer.tsx");
  assert.ok(drawer.includes("<ProfileHeroTextRows"), "Identity editor mounts the rows");
  const rows = read("../../components/admin/shell/internal/drawers/profile-shell/profile-shell-modules/profile-hero-text-rows.tsx");
  for (const label of ["Website headline", "Years of experience", "Tagline"]) assert.ok(rows.includes(`copy.t("${label}")`), label);
  const es = read("../../components/admin/shell/internal/dashboard-i18n-talent-gaps.ts");
  for (const label of ["Website headline", "Years of experience"]) assert.ok(es.includes(`"${label}":`), `ES for ${label}`);
  // Footer tone: token definition with both locales, drawer projection, stylesheet, payload default.
  const tokens = read("../site-admin/tokens/style-tokens.ts");
  assert.ok(tokens.includes('key: "footer.tone"') && tokens.includes('"footer.tone": "data-token-footer-tone"'));
  assert.ok(tokens.includes("Color del pie de página"), "ES label");
  assert.ok(read("./theme-catalog/collection/design-type-system-foot.ts").includes('data-token-footer-tone="dark"'), "dark option styled");
  assert.ok(read("./theme-catalog/collection/maison-v2-tokens.ts").includes('"footer.tone": "light"'), "light by default");
});

// ── v21 gaps: a hero with no proof line, the menu intro default ─────────────

function heroWithoutProof() {
  const tree = [
    box("hero", [box("c", [h("h", "x"), p("e", "Nail Artist"), p("l", "lede"), box("act", [p("b", "buttons")])])], { slotKey: "hero" }),
  ];
  return stampDesignOrigin(tree, { design: "maison-v2", version: 20 });
}
const heroKids = (out: BuilderNode[]) =>
  (out[0] as unknown as { children: Array<{ children: BuilderNode[] }> }).children[0]!.children;

test("a hero that never got a proof line gets one under the buttons once she has facts, and not before", () => {
  const out = applyTalentLiveText(heroWithoutProof(), LIVE);
  const kids = heroKids(out);
  assert.equal(kids.length, 5);
  assert.match(textOf(kids[4]!) ?? "", /^9 años de oficio · Español · Inglés/);
  assert.equal((kids[4]!.props as { liveText?: string }).liveText, "hero_proof");
  // Idempotent: a second pass does not add another.
  assert.equal(heroKids(applyTalentLiveText(out, LIVE)).length, 5);
  // No facts: the page stays as it was.
  const bare = heroWithoutProof();
  assert.equal(applyTalentLiveText(bare, { values: {} }), bare);
});

test("the menu intro line defaults for a Maison v2 menu that never had one, and never overrules hers", () => {
  const catalog = (props: Record<string, unknown>) =>
    stampDesignOrigin(
      [{ id: "s", kind: "container", props: { layout: "stack", slotKey: "services" }, children: [{ id: "c", kind: "services_catalog", props }] }] as unknown as BuilderNode[],
      { design: "maison-v2", version: 20 },
    );
  const sub = (t: BuilderNode[]) => ((t[0] as unknown as { children: BuilderNode[] }).children[0]!.props as { subtitle?: string }).subtitle;
  assert.equal(buildTalentLiveText({ ...SRC, menuCurrency: "mxn" }, "es").menuSubtitle, "Precios en MXN.");
  assert.equal(buildTalentLiveText({ ...SRC, menuCurrency: "USD" }, "en").menuSubtitle, "Prices in USD.");
  assert.equal(buildTalentLiveText(SRC, "es").menuSubtitle, "");
  const live = buildTalentLiveText({ ...SRC, menuCurrency: "MXN" }, "es");
  assert.equal(sub(applyTalentLiveText(catalog({ layout: "rows" }), live)), "Precios en MXN.");
  assert.equal(sub(applyTalentLiveText(catalog({ layout: "rows", subtitle: "Mis precios" }), live)), "Mis precios");
  const none = catalog({ layout: "rows" });
  assert.equal(applyTalentLiveText(none, buildTalentLiveText(SRC, "es")), none, "no currency, no change");
  assert.equal(treeHasLiveCandidates(none), true);
});

test("the footer zone and the menu currency come from the same sources as the Location section", () => {
  const loader = read("./server/load-live-text.server.ts");
  assert.ok(loader.includes("zoneLabel(visit.talentLocation)"), "public zone label, never the address");
  assert.ok(loader.includes("loadMenuCurrency"), "currency of her services");
});

// ── Valeria's exact hero (TAL-93901, v20, read from the database): one proof line, a localised eyebrow ──

function valeriaHero(stamped: boolean) {
  const tree = [
    box("hero", [
      box("copy", [
        p("e", "Nail Artist · Cancun", { layerLabel: "Hero eyebrow" }),
        h("h", "{i}Valeria Uñas{/i}"),
        p("l", "I started painting my cousins' nails in Cancún and now I have seven years of craft behind me.", { layerLabel: "Hero lede" }),
        box("act", [p("b1", "See services"), p("b2", "See work")], { layerLabel: "Hero actions" }),
        p("pr", "7 years of craft · Español · English", { layerLabel: "Hero proof" }),
      ]),
      box("media", [p("m", "photo")], { layerLabel: "Hero media" }),
    ], { slotKey: "hero" }),
  ];
  return stamped ? stampDesignOrigin(tree, { design: "maison-v2", version: 20 }) : tree;
}
const VALERIA = buildTalentLiveText(
  {
    displayName: "Valeria Uñas",
    trade: { en: "Nail Artist", es: "Manicurista" },
    city: { en: "Cancun" },
    cityLabel: "Cancún",
    proof: { years: 7, languages: ["Spanish", "English"], rating: null, count: null },
  },
  "es",
);
const paragraphs = (n: BuilderNode, out: string[] = []): string[] => {
  if (n.kind === "paragraph") out.push(textOf(n) ?? "");
  for (const k of ((n as unknown as { children?: BuilderNode[] }).children ?? [])) paragraphs(k, out);
  return out;
};

test("Valeria's hero: exactly ONE proof line, bound to her facts, and the eyebrow reads Manicurista · Cancún", () => {
  for (const stamped of [true, false]) {
    const out = applyTalentLiveText(valeriaHero(stamped), VALERIA);
    const texts = paragraphs(out[0]!);
    assert.equal(texts.filter((t) => /^7 (años de oficio|years of craft)/.test(t)).length, 1, `one proof line (stamped=${stamped})`);
    assert.ok(texts.includes("7 años de oficio · Español · Inglés"));
    assert.ok(texts.includes("Manicurista · Cancún"), "locale trade and accented city");
  }
});

test("a hero that has a proof line she wrote herself never gets a second one", () => {
  const tree = valeriaHero(true);
  const copy = ((tree[0] as unknown as { children: Array<{ children: BuilderNode[] }> }).children[0]!);
  copy.children[4] = p("pr", "Nueve años creando uñas", { layerLabel: "Hero proof", ...(copy.children[4]!.props as object) } as Record<string, unknown>);
  (copy.children[4]!.props as { text: string }).text = "Nueve años creando uñas";
  const out = applyTalentLiveText(tree, VALERIA);
  assert.equal(paragraphs(out[0]!).filter((t) => /oficio|Nueve años/.test(t)).length, 1);
});

// ── B3 / B4 / A4: the tagline by language, trade headline variants, the header trade ──

import { guessLineLanguage, resolveLocalizedLine } from "./live-line-language";

test("the tagline reads in the visitor's language: Valeria (plain EN, short_bio ES, primary ES)", () => {
  const i = {
    plain: "Clean nails, hand-painted designs and no rush. A private studio in Cancún where every appointment is just yours.",
    alt: "Uñas limpias, diseños a mano y cero prisa. Un estudio privado en Cancún donde cada cita es solo tuya.",
    primary: "es" as const,
  };
  assert.match(resolveLocalizedLine({ ...i, locale: "es" }), /^Uñas limpias/);
  assert.match(resolveLocalizedLine({ ...i, locale: "en" }), /^Clean nails/);
  // Her per-language map wins over both.
  assert.equal(resolveLocalizedLine({ ...i, locale: "en", map: { en: "Nails, no rush." } }), "Nails, no rush.");
  // One language only: the visitor of the other language reads her main one.
  assert.equal(resolveLocalizedLine({ plain: "Modelo en CDMX", primary: "es", locale: "en" }), "Modelo en CDMX");
  assert.equal(resolveLocalizedLine({ locale: "es", primary: "es" }), "");
  assert.equal(guessLineLanguage("Un estudio privado donde cada cita es solo tuya."), "es");
  assert.equal(guessLineLanguage("A private studio where every appointment is just yours."), "en");
  const live = buildTalentLiveText({ ...SRC, tagline: i.plain, shortBio: i.alt, primaryLocale: "es" }, "es").values;
  assert.match(live.hero_tagline ?? "", /^Uñas limpias/);
});

test("trade headlines have variants, picked deterministically per talent", () => {
  const nails = new Set<string>();
  for (const code of ["TAL-93020", "TAL-93003", "TAL-93103", "TAL-93901", "TAL-90001", "TAL-90002", "TAL-90003", "TAL-90004"]) {
    const a = seedHeadlineFor("Nail Artist", code)!;
    assert.deepEqual(a, seedHeadlineFor("Nail Artist", code), "stable for one talent");
    nails.add(a.en);
  }
  assert.ok(nails.size >= 3, `several nail variants in use (${nails.size})`);
  assert.deepEqual(seedHeadlineFor("Nail Artist"), { en: "Hands that speak for you.", es: "Manos que hablan por ti." }, "no key: the classic line");
  // The same variant in both languages, so the Spanish render of an English seed matches.
  const key = "TAL-93901";
  assert.equal(resolveHeadline({ tradeEn: "Nail Artist", displayName: "V", seedKey: key }, "es").text, accentHeadline(seedHeadlineFor("Nail Artist", key)!.es));
  assert.equal(buildTalentLiveText({ ...SRC, headline: null, seedKey: key }, "es").values.hero_headline, accentHeadline(seedHeadlineFor("Nail Artist", key)!.es));
});

test("A4: the header lockup under her name is the trade in the visitor's language, and her own words stay", () => {
  const header = (tagline: string) =>
    [{ id: "h", kind: "section", props: { sectionTypeKey: "site_header", sectionProps: { brand: { tagline } } } }] as unknown as BuilderNode[];
  const live = buildTalentLiveText({ ...SRC, trade: { en: "Nail Artist", es: "Manicurista" } }, "es");
  assert.equal(live.tradeLabel, "Manicurista");
  const read = (t: BuilderNode[]) => ((t[0]!.props as { sectionProps: { brand: { tagline: string } } }).sectionProps.brand.tagline);
  assert.equal(read(applyTalentLiveText(header("Nail Artist"), live)), "Manicurista");
  assert.equal(read(applyTalentLiveText(header("nail artist"), live)), "Manicurista");
  assert.equal(read(applyTalentLiveText(header("Uñas y pestañas"), live)), "Uñas y pestañas", "her own line is kept");
  assert.equal(read(applyTalentLiveText(header("Nail Artist"), buildTalentLiveText({ ...SRC, trade: { en: "Nail Artist", es: "Manicurista" } }, "en"))), "Nail Artist");
  assert.equal(treeHasLiveCandidates(header("Nail Artist")), true);
});

test("TUL-59 C: contact line links the Instagram handle and a WhatsApp link she set; never a bare phone", async () => {
  const { contactLine } = await import("./live-text-values");
  assert.equal(
    contactLine("@alba", "https://instagram.com/alba", "https://wa.me/5219990000000"),
    "Instagram · [@alba](https://instagram.com/alba) · [WhatsApp](https://wa.me/5219990000000)",
  );
  assert.equal(contactLine("@alba", null, null), "Instagram · [@alba](https://instagram.com/alba)");
  assert.equal(contactLine("", null, "javascript:alert(1)"), "");
  assert.equal(contactLine("", null, "https://wa.me/5219990000000"), "[WhatsApp](https://wa.me/5219990000000)");
});
