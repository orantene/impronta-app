/**
 * TUL-494: Maison v2 theme core ships both languages on every seeded localizable
 * prop, kit aftercare carries explicit en on an es-default tenant, and bilingual
 * demo hero facts include headlineEn (and taglineEn when a tagline is set) so
 * `/en` never falls back to Spanish hero copy.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { localizablePropsForKind } from "@/lib/i18n/builder-i18n-props";
import { aftercareBlock } from "@/lib/talent-site/theme-catalog/section-kit-aftercare";
import { buildMaisonV2Payload } from "@/lib/talent-site/theme-catalog/collection/maison-v2";
import { HERO_FACTS } from "./hero-facts";
import { applyDemoSiteCopy } from "./site-copy";

type Node = { id?: string; kind: string; props?: Record<string, unknown>; children?: Node[] };

function walk(nodes: Node[] | undefined, visit: (n: Node) => void): void {
  for (const n of nodes ?? []) {
    visit(n);
    walk(n.children, visit);
  }
}

function bag(n: Node, lang: "en" | "es"): Record<string, string> {
  const i18n = n.props?.i18n as Record<string, Record<string, string>> | undefined;
  return i18n?.[lang] ?? {};
}

test("maison-v2 seed: every localizable seeded prop carries both es and en overlays", () => {
  const payload = buildMaisonV2Payload();
  let checked = 0;
  walk([...(payload.shellTree as Node[]), ...(payload.homeTree as Node[])], (n) => {
    const props = localizablePropsForKind(n.kind as never);
    if (!props.length) return;
    for (const prop of props) {
      const v = n.props?.[prop];
      if (typeof v !== "string" || !v.trim()) continue;
      // Token-only / mode-dependent labels may skip seeded overlays.
      if (/\{\{/.test(v)) continue;
      const es = bag(n, "es")[prop];
      const en = bag(n, "en")[prop];
      if (!es && !en) continue;
      assert.ok(es, `${n.kind}.${prop} missing es`);
      assert.ok(en, `${n.kind}.${prop} missing en`);
      checked += 1;
    }
  });
  assert.ok(checked >= 10, `expected seeded overlays, checked ${checked}`);
});

test("aftercare kit: explicit en overlay on es-default (no Spanish on /en path)", () => {
  let n = 0;
  const block = aftercareBlock(() => `a${++n}`) as Node;
  let withEn = 0;
  walk([block], (n) => {
    const text = n.props?.text;
    if (typeof text !== "string" || !text.trim()) return;
    const en = bag(n, "en").text;
    if (en) {
      assert.doesNotMatch(en, /Cuidados|Sigue|Pregúntame|Planea/);
      withEn += 1;
    }
  });
  assert.ok(withEn >= 3, `expected aftercare EN overlays, got ${withEn}`);
});

test("bilingual Maison hero facts ship headlineEn; Sofía also ships taglineEn", () => {
  const bilingual = ["TAL-93020", "TAL-93002", "TAL-93003", "TAL-93105"] as const;
  for (const code of bilingual) {
    const f = HERO_FACTS[code]!;
    assert.ok(f.headlineEn, `${code} headlineEn`);
    assert.ok(!/—|–/.test(f.headlineEn));
  }
  const sofia = HERO_FACTS["TAL-93105"]!;
  assert.ok(sofia.tagline);
  assert.ok(sofia.taglineEn);
  assert.match(sofia.tagline!, /Palermo/);
  assert.match(sofia.taglineEn!, /Palermo/);
  assert.doesNotMatch(sofia.taglineEn!, /Maquillaje/);
});

test("Maison site-copy heroOverlays write props.i18n.en on hero heading and lede", () => {
  const home: Node[] = [
    {
      id: "hero",
      kind: "section",
      props: { anchorId: "hero" },
      children: [
        { id: "h", kind: "heading", props: { level: 1, text: "Old" } },
        {
          id: "p",
          kind: "paragraph",
          props: { text: "Old lede", style: { textTransform: "none" } },
        },
      ],
    },
  ];
  const out = applyDemoSiteCopy(
    [],
    home,
    {
      heroHeading: "Manos que hablan por ti.",
      heroLede: "Un estudio privado donde cada cita es solo tuya.",
      heroOverlays: {
        en: {
          heading: "Hands that speak for you.",
          lede: "A private studio where every appointment is yours alone.",
        },
      },
    },
    () => null,
    () => "x",
  );
  const heading = out.home[0]!.children![0]!;
  const lede = out.home[0]!.children![1]!;
  assert.equal((heading.props as { text: string }).text, "Manos que hablan por ti.");
  assert.equal(bag(heading, "en").text, "Hands that speak for you.");
  assert.equal(bag(lede, "en").text, "A private studio where every appointment is yours alone.");
});
