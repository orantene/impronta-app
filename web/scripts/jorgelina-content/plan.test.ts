import assert from "node:assert/strict";
import { test } from "node:test";

import { allUserFacingStrings, POLICIES_EN, POLICIES_ES, policyText, SERVICE_DESCRIPTIONS_EN, SERVICE_DESCRIPTIONS_ES } from "./content";
import { computePlan, run, type HomePageRow, type Io, type OfferingRow } from "./plan";

const PROFILE = { id: "p-1", profile_code: "TAL-93938" };

function offerings(): OfferingRow[] {
  return SERVICE_DESCRIPTIONS_ES.map((s, i) => ({
    id: `o-${i}`, title: s.title, description: "old", title_i18n: null, description_i18n: { en: "keep me" }, status: "published",
  }));
}

function homeBlocks() {
  return [
    {
      id: "hero", kind: "container", children: [
        { id: "h1", kind: "heading", props: { level: 1, text: "{{headline}}", liveText: "hero_headline" } },
        { id: "lede", kind: "paragraph", props: { text: "{{tagline}}", liveText: "hero_tagline", layerLabel: "Hero lede" } },
      ],
    },
    { id: "tick", kind: "marquee", props: { items: [{ text: "Gel nails" }, { text: "Acrylic" }], separator: "star" } },
  ];
}

class Fake {
  profile: typeof PROFILE | null = { ...PROFILE };
  site = { id: "s-1", site_slug: "book-jorgelina" as string | null };
  page: HomePageRow = { id: "pg-1", blocks: homeBlocks(), updated_at: "t0" };
  offs: OfferingRow[] = offerings();
  links: unknown = [{ label: "Instagram", href: "@jorgbeauty" }];
  writes: string[] = [];
  io: Io = {
    findProfile: async () => this.profile,
    findSite: async () => this.site,
    findHomePage: async () => this.page,
    listOfferings: async () => this.offs,
    readSocialLinks: async () => this.links,
    writeDraftHome: async (i) => { this.writes.push("draft"); this.page = { ...this.page, blocks: i.after, updated_at: "t1" }; return { ok: true }; },
    updateOffering: async (i) => {
      this.writes.push(`offering:${i.id}`);
      this.offs = this.offs.map((o) => (o.id === i.id ? ({ ...o, ...i.patch } as OfferingRow) : o));
      return { ok: true };
    },
    writeSocialLinks: async (i) => { this.writes.push("links"); this.links = i.after; return { ok: true }; },
  };
}
const quiet = () => {};

test("dry run (default) writes nothing and prints a diff", async () => {
  const f = new Fake();
  const lines: string[] = [];
  const r = await run([], f.io, (s) => lines.push(s));
  assert.equal(r.exitCode, 0);
  assert.deepEqual(f.writes, []);
  const out = lines.join("\n");
  assert.match(out, /DRY RUN/);
  assert.match(out, /Pestañas que enmarcan tu mirada\./);
  assert.match(out, /LIVE \(immediately visible\)/);
  assert.match(out, /never publishes/);
});

test("wrong profile is refused, including the QA talent", async () => {
  for (const code of ["TAL-93900", "TAL-00001", ""]) {
    const f = new Fake();
    const r = await run(["--profile", code, "--apply-draft", "--yes"], f.io, quiet);
    assert.equal(r.exitCode, 2, code);
    assert.deepEqual(f.writes, []);
  }
});

test("a profile whose row resolves to another code is refused", async () => {
  const f = new Fake();
  f.profile = { id: "p-9", profile_code: "TAL-93900" };
  const r = await run(["--apply-draft", "--yes"], f.io, quiet);
  assert.equal(r.exitCode, 2);
  assert.deepEqual(f.writes, []);
});

test("wrong site slug is refused (QA slug and missing slug)", async () => {
  for (const slug of ["jorg-beauty-qa", "someone-else", null]) {
    const f = new Fake();
    f.site.site_slug = slug;
    const r = await run(["--apply-draft", "--yes"], f.io, quiet);
    assert.equal(r.exitCode, 2, String(slug));
    assert.deepEqual(f.writes, []);
  }
});

test("--apply-draft without --yes is refused; --yes alone is refused", async () => {
  for (const argv of [["--apply-draft"], ["--yes"], ["--include-live-fields"], ["--include-live-fields", "--apply-draft"], ["--bogus"]]) {
    const f = new Fake();
    const r = await run(argv, f.io, quiet);
    assert.equal(r.exitCode, 2, argv.join(" "));
    assert.deepEqual(f.writes, []);
  }
});

test("--apply-draft --yes writes ONLY the draft; live fields are off by default", async () => {
  const f = new Fake();
  const r = await run(["--apply-draft", "--yes"], f.io, quiet);
  assert.equal(r.exitCode, 0);
  assert.deepEqual(f.writes, ["draft"]);
  assert.ok(f.offs.every((o) => o.description === "old"));
  assert.deepEqual(f.links, [{ label: "Instagram", href: "@jorgbeauty" }]);
});

test("the draft write sets ES + EN hero and ES ticker, drops liveText, touches nothing else", async () => {
  const f = new Fake();
  await run(["--apply-draft", "--yes"], f.io, quiet);
  const blocks = f.page.blocks as ReturnType<typeof homeBlocks>;
  const h1 = blocks[0]!.children![0]!.props as Record<string, unknown>;
  assert.equal(h1.text, "Pestañas que enmarcan tu mirada.");
  assert.deepEqual(h1.i18n, { es: { text: "Pestañas que enmarcan tu mirada." }, en: { text: "Lashes that frame your look." } });
  assert.equal(h1.liveText, undefined);
  const lede = blocks[0]!.children![1]!.props as Record<string, unknown>;
  assert.equal(lede.text, "Lashista en Playa del Carmen · Extensiones desde $700 MXN");
  assert.equal(lede.layerLabel, "Hero lede");
  const tick = blocks[1]!.props as { items: Array<{ text: string }>; separator: string };
  assert.deepEqual(tick.items.map((i) => i.text), [
    "Extensiones clásicas", "Efecto rímel", "Volumen 2D a 5D", "Volumen americano", "Lifting de pestañas", "Lami Brows",
  ]);
  assert.equal(tick.separator, "star");
});

test("--include-live-fields also writes descriptions and links, keeping other languages", async () => {
  const f = new Fake();
  const r = await run(["--apply-draft", "--yes", "--include-live-fields"], f.io, quiet);
  assert.equal(r.exitCode, 0);
  assert.equal(f.offs[0]!.description, SERVICE_DESCRIPTIONS_ES[0]!.description);
  assert.deepEqual(f.offs[0]!.description_i18n, { en: "keep me", es: SERVICE_DESCRIPTIONS_ES[0]!.description });
  assert.deepEqual(f.links, [
    { label: "Instagram", href: "https://instagram.com/jorgbeauty" },
    { label: "WhatsApp", platform: "whatsapp", href: "https://wa.me/529132300376" },
  ]);
});

test("idempotent: after applying everything, a second plan has no changes and a second run writes nothing", async () => {
  const f = new Fake();
  await run(["--apply-draft", "--yes", "--include-live-fields"], f.io, quiet);
  f.writes = [];
  const plan = await computePlan(f.io, { profileCode: "TAL-93938", applyDraft: false, yes: false, includeLiveFields: false });
  assert.deepEqual(plan.rows, []);
  assert.equal(plan.draftHome, null);
  assert.deepEqual(plan.offeringPatches, []);
  assert.equal(plan.socialLinks, null);
  await run(["--apply-draft", "--yes", "--include-live-fields"], f.io, quiet);
  assert.deepEqual(f.writes, []);
});

test("a service whose title does not match is reported, never guessed", async () => {
  const f = new Fake();
  f.offs = f.offs.filter((o) => o.title !== "Perfilado");
  f.offs.push({ id: "x", title: "Perfilado de cejas", description: "keep", title_i18n: null, description_i18n: null, status: "published" });
  const plan = await computePlan(f.io, { profileCode: "TAL-93938", applyDraft: false, yes: false, includeLiveFields: false });
  assert.ok(plan.notApplied.some((n) => n.includes('Service "Perfilado": no offering with that exact title')));
  assert.ok(plan.notApplied.some((n) => n.includes("Perfilado de cejas") && n.includes("left untouched")));
  assert.ok(!plan.offeringPatches.some((p) => p.id === "x"));
});

test("ambiguous matches and missing hero/ticker nodes are reported, not guessed", async () => {
  const f = new Fake();
  f.offs.push({ ...f.offs[0]!, id: "dup" });
  f.page = { ...f.page, blocks: [{ id: "a", kind: "heading", props: { level: 1, text: "x" } }, { id: "b", kind: "heading", props: { level: 1, text: "y" } }] };
  const plan = await computePlan(f.io, { profileCode: "TAL-93938", applyDraft: false, yes: false, includeLiveFields: false });
  assert.ok(plan.notApplied.some((n) => n.includes("ambiguous")));
  assert.ok(plan.notApplied.some((n) => n.startsWith("Hero headline: found 2")));
  assert.ok(plan.notApplied.some((n) => n.startsWith("Hero subline: found 0")));
  assert.ok(plan.notApplied.some((n) => n.startsWith("Ticker: found 0")));
  assert.equal(plan.draftHome, null);
});

test("policies are reported as not applied, with the EN translation matching clause for clause", async () => {
  const f = new Fake();
  const plan = await computePlan(f.io, { profileCode: "TAL-93938", applyDraft: false, yes: false, includeLiveFields: false });
  assert.ok(plan.notApplied.some((n) => n.startsWith("Booking policies")));
  assert.equal(POLICIES_EN.length, POLICIES_ES.length);
  assert.match(policyText(POLICIES_ES), /^1\. Confirmación\nTu cita queda confirmada/);
});

test("a lost compare-and-swap fails the run without writing live fields", async () => {
  const f = new Fake();
  f.io.writeDraftHome = async () => ({ ok: false });
  const r = await run(["--apply-draft", "--yes", "--include-live-fields"], f.io, quiet);
  assert.equal(r.exitCode, 1);
  assert.deepEqual(f.writes, []);
});

test("no em dash or en dash in any approved string", () => {
  for (const s of allUserFacingStrings()) {
    assert.ok(!/[—–]/.test(s), `dash in: ${s}`);
  }
});

// ---------------------------------------------------------------- English descriptions

const ALL = ["--apply-draft", "--yes", "--include-live-fields", "--include-english-descriptions"];
const DRY = { profileCode: "TAL-93938", applyDraft: false, yes: false, includeLiveFields: false };

test("English descriptions: en written, es and other locales preserved, base description untouched", async () => {
  const f = new Fake();
  f.offs = f.offs.map((o) => ({ ...o, description_i18n: { fr: "garde", es: "ya" } }));
  const r = await run(ALL, f.io, quiet);
  assert.equal(r.exitCode, 0);
  const first = f.offs.find((o) => o.title === SERVICE_DESCRIPTIONS_EN[0]!.title)!;
  assert.equal(first.description_i18n?.en, SERVICE_DESCRIPTIONS_EN[0]!.description);
  // es is the approved Spanish text (written by the existing live step), fr preserved
  assert.equal(first.description_i18n?.es, SERVICE_DESCRIPTIONS_ES[0]!.description);
  assert.equal(first.description_i18n?.fr, "garde");
  assert.equal(first.description, SERVICE_DESCRIPTIONS_ES[0]!.description);
  for (const e of SERVICE_DESCRIPTIONS_EN) {
    assert.equal(f.offs.find((o) => o.title === e.title)!.description_i18n?.en, e.description);
  }
});

test("English descriptions: es is preserved even when the Spanish step has nothing to do", async () => {
  const f = new Fake();
  f.offs = f.offs.map((o) => {
    const es = SERVICE_DESCRIPTIONS_ES.find((s) => s.title === o.title)!.description;
    return { ...o, description: es, description_i18n: { es, de: "x" } };
  });
  const plan = await computePlan(f.io, DRY);
  assert.deepEqual(plan.offeringPatches, []);
  assert.equal(plan.englishPatches.length, SERVICE_DESCRIPTIONS_EN.length);
  for (const p of plan.englishPatches) {
    const i18n = p.patch.description_i18n as Record<string, string>;
    assert.deepEqual(Object.keys(p.patch), ["description_i18n"]);
    assert.ok(i18n.es && i18n.de === "x" && i18n.en);
  }
});

test("English descriptions: without the new flag nothing English is written", async () => {
  const f = new Fake();
  await run(["--apply-draft", "--yes", "--include-live-fields"], f.io, quiet);
  assert.ok(f.offs.every((o) => o.description_i18n?.en === "keep me"));
  assert.ok(f.writes.every((w) => w === "draft" || w === "links" || w.startsWith("offering:")));
});

test("English descriptions: dry run prints before/after and writes nothing", async () => {
  const f = new Fake();
  const lines: string[] = [];
  const r = await run([], f.io, (s) => lines.push(s));
  assert.equal(r.exitCode, 0);
  assert.deepEqual(f.writes, []);
  const out = lines.join("\n");
  assert.match(out, /description_i18n\.en/);
  assert.match(out, /before: keep me/);
  assert.match(out, /after:  Fans of 3\. A fuller look for everyday wear\./);
});

test("English descriptions: every bad flag combination is refused, LIVE named", async () => {
  const bad = [
    ["--include-english-descriptions"],
    ["--include-english-descriptions", "--apply-draft"],
    ["--include-english-descriptions", "--apply-draft", "--yes"],
    ["--include-english-descriptions", "--include-live-fields"],
    ["--include-english-descriptions", "--include-live-fields", "--apply-draft"],
  ];
  for (const argv of bad) {
    const f = new Fake();
    const lines: string[] = [];
    const r = await run(argv, f.io, (s) => lines.push(s));
    assert.equal(r.exitCode, 2, argv.join(" "));
    assert.deepEqual(f.writes, []);
  }
  const f = new Fake();
  const lines: string[] = [];
  await run(["--include-english-descriptions", "--apply-draft", "--yes"], f.io, (s) => lines.push(s));
  assert.match(lines.join("\n"), /LIVE/);
});

test("English descriptions: idempotent, second diff is empty and second run writes nothing", async () => {
  const f = new Fake();
  await run(ALL, f.io, quiet);
  f.writes = [];
  const plan = await computePlan(f.io, DRY);
  assert.deepEqual(plan.englishRows, []);
  assert.deepEqual(plan.englishPatches, []);
  await run(ALL, f.io, quiet);
  assert.deepEqual(f.writes, []);
});

test("English descriptions: title mismatch and duplicates are reported, never guessed", async () => {
  const f = new Fake();
  f.offs = f.offs.filter((o) => o.title !== "Tecnológicas 3D");
  f.offs.push({ id: "x", title: "Tecnológicas 3D plus", description: "keep", title_i18n: null, description_i18n: null, status: "published" });
  f.offs.push({ ...f.offs.find((o) => o.title === "Efecto rímel")!, id: "dup" });
  const plan = await computePlan(f.io, DRY);
  assert.ok(plan.notApplied.some((n) => n.startsWith('English description for "Tecnológicas 3D": no offering')));
  assert.ok(plan.notApplied.some((n) => n.startsWith('English description for "Efecto rímel": 2 offerings')));
  assert.ok(!plan.englishPatches.some((p) => p.id === "x" || p.id === "dup"));
  assert.ok(!plan.englishPatches.some((p) => p.label === "Efecto rímel" || p.label === "Tecnológicas 3D"));
});

test("English descriptions: wrong profile is refused", async () => {
  for (const code of ["TAL-93900", "TAL-00001"]) {
    const f = new Fake();
    const r = await run(["--profile", code, ...ALL], f.io, quiet);
    assert.equal(r.exitCode, 2, code);
    assert.deepEqual(f.writes, []);
  }
  const f = new Fake();
  f.site.site_slug = "jorg-beauty-qa";
  assert.equal((await run(ALL, f.io, quiet)).exitCode, 2);
  assert.deepEqual(f.writes, []);
});

test("English descriptions: never touch title, title_i18n or prices", async () => {
  const f = new Fake();
  await run(ALL, f.io, quiet);
  const plan = await computePlan(f.io, DRY);
  void plan;
  const seen = new Set<string>();
  const f2 = new Fake();
  f2.io.updateOffering = async (i) => { Object.keys(i.patch).forEach((k) => seen.add(k)); return { ok: true }; };
  await run(ALL, f2.io, quiet);
  assert.deepEqual([...seen].sort(), ["description", "description_i18n"]);
});

test("English constants are the approved eight and use no dashes", () => {
  assert.equal(SERVICE_DESCRIPTIONS_EN.length, 8);
  assert.deepEqual(SERVICE_DESCRIPTIONS_EN.map((s) => s.title), SERVICE_DESCRIPTIONS_ES.slice(0, 8).map((s) => s.title));
  const all = allUserFacingStrings();
  for (const e of SERVICE_DESCRIPTIONS_EN) {
    assert.ok(all.includes(e.description), "covered by the no-dash test");
    assert.ok(!/[—–]/.test(e.description) && !/[—–]/.test(e.title));
  }
});
