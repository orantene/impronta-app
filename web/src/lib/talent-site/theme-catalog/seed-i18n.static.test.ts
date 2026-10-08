/**
 * Every seeded text node of every released talent design ships BOTH Spanish
 * and English (`props.i18n.es` / `props.i18n.en`), so a new Spanish site never
 * renders English-only starter text. See seed-i18n.ts.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { localizablePropsForKind } from "@/lib/i18n/builder-i18n-props";
import type { DesignPayload } from "./types";
import { FINISHED_GALLERY_SLUGS } from "./gallery-meta";
import { COLLECTION_DESIGNS } from "./collection/designs";
import { buildMaisonDesignPayload } from "./maison/design-payload";
import { localiseOne } from "../design-label-locale";
import { isTokenOnlyText, MODE_DEPENDENT_LABELS, SEED_TEXT_ES } from "./seed-i18n";

const DESIGNS: ReadonlyArray<readonly [string, () => DesignPayload]> = [
  ["maison", buildMaisonDesignPayload],
  ...COLLECTION_DESIGNS.map((d) => [d.slug, () => d.buildPayload()] as const),
];

type Visit = (path: string, node: Record<string, unknown>) => void;

/** Walks children and carousel slides recursively. */
function walk(nodes: unknown, path: string, visit: Visit): void {
  if (!Array.isArray(nodes)) return;
  nodes.forEach((raw, i) => {
    if (!raw || typeof raw !== "object") return;
    const node = raw as Record<string, unknown>;
    const here = `${path}/${String(node.kind)}[${i}]`;
    visit(here, node);
    walk(node.children, here, visit);
    walk(node.slides, `${here}/slides`, visit);
  });
}

function overlayValue(props: Record<string, unknown>, lang: "es" | "en", key: string): string | undefined {
  const i18n = props.i18n as Record<string, Record<string, unknown>> | undefined;
  const v = i18n?.[lang]?.[key];
  return typeof v === "string" && v.trim() ? v : undefined;
}

function scan(slug: string, payload: DesignPayload): { problems: string[]; values: string[] } {
  const problems: string[] = [];
  const values: string[] = [];
  const bag = payload as unknown as Record<string, unknown>;
  for (const treeName of ["homeTree", "shellTree", "optionalBlocks"] as const) {
    walk(bag[treeName], `${slug}.${treeName}`, (path, node) => {
      const props = (node.props ?? {}) as Record<string, unknown>;
      const kind = node.kind as Parameters<typeof localizablePropsForKind>[0];
      for (const prop of localizablePropsForKind(kind)) {
        const text = props[prop];
        if (typeof text !== "string" || isTokenOnlyText(text) || MODE_DEPENDENT_LABELS.includes(text.trim())) continue;
        for (const lang of ["es", "en"] as const) {
          const v = overlayValue(props, lang, prop);
          if (v === undefined) problems.push(`${path}.${prop} missing i18n.${lang} (${JSON.stringify(text)})`);
          else values.push(v);
        }
      }
      if (node.kind === "marquee" && Array.isArray(props.items)) {
        props.items.forEach((it, n) => {
          const text = it && typeof it === "object" ? (it as { text?: unknown }).text : undefined;
          if (typeof text !== "string" || isTokenOnlyText(text) || MODE_DEPENDENT_LABELS.includes(text.trim())) return;
          for (const lang of ["es", "en"] as const) {
            const v = overlayValue(props, lang, `items.${n}.text`);
            if (v === undefined) problems.push(`${path}.items.${n}.text missing i18n.${lang} (${JSON.stringify(text)})`);
            else values.push(v);
          }
        });
      }
      // No em dash may hide in any overlay value, localizable or not.
      const i18n = props.i18n as Record<string, Record<string, unknown>> | undefined;
      for (const bagForLang of Object.values(i18n ?? {})) {
        for (const [k, v] of Object.entries(bagForLang ?? {})) {
          if (typeof v === "string" && v.includes("—")) problems.push(`${path}.i18n.${k} has an em dash (${JSON.stringify(v)})`);
        }
      }
    });
  }
  return { problems, values };
}

for (const [slug, build] of DESIGNS) {
  test(`${slug}: every seeded text node ships es + en`, () => {
    const { problems } = scan(slug, build());
    assert.deepEqual(problems, [], `\n${problems.join("\n")}`);
  });
}

test("the released gallery designs are all covered by this test", () => {
  const covered = new Set(DESIGNS.map(([slug]) => slug));
  for (const slug of FINISHED_GALLERY_SLUGS) assert.ok(covered.has(slug), `${slug} is not scanned`);
});

test("the seed Spanish table has no em dash and no voseo", () => {
  for (const [en, es] of Object.entries(SEED_TEXT_ES)) {
    assert.ok(!es.includes("—"), `${en}`);
    assert.ok(!/\b(vos|tenés|podés|querés|escribime|mirá)\b/i.test(es), `${en}`);
    // A token must survive translation.
    assert.deepEqual(es.match(/\{\{\w+\}\}/g) ?? [], en.match(/\{\{\w+\}\}/g) ?? [], `${en}`);
  }
});

test("the scanner flags a missing overlay (guard against a vacuous pass)", () => {
  const fake = {
    shellTree: [],
    homeTree: [{ kind: "heading", id: "x", props: { text: "Plain English" } }],
  } as unknown as DesignPayload;
  assert.equal(scan("fake", fake).problems.length, 2);
});

test("every MODE_DEPENDENT_LABELS exemption is really handled by the mode-aware map", () => {
  for (const label of MODE_DEPENDENT_LABELS) {
    const es = (["instant", "request", "inquiry"] as const).map((m) => localiseOne(label, "es", m));
    assert.ok(es.every((v) => v !== null), `${label}: no mode-aware Spanish`);
    assert.ok(new Set(es).size > 1, `${label}: Spanish does not change with the booking mode`);
    assert.ok(!(label in SEED_TEXT_ES), `${label}: must not also be in the static seed table`);
  }
});
