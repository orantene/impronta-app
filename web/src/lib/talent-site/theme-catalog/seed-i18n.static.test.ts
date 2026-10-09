/**
 * Every seeded text node of every released talent design ships BOTH Spanish
 * and English (`props.i18n.es` / `props.i18n.en`), so a new Spanish site never
 * renders English-only starter text. See seed-i18n.ts.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { localizablePropsForKind } from "@/lib/i18n/builder-i18n-props";
import { listOverlayKey, localizableListSpecsForKind } from "@/lib/i18n/builder-i18n-list-props";
import { HEADER_OVERLAY_PREFIX, headerLabelEntries } from "../header-i18n";
import type { DesignPayload } from "./types";
import { FINISHED_GALLERY_SLUGS } from "./gallery-meta";
import { COLLECTION_DESIGNS } from "./collection/designs";
import { buildMaisonDesignPayload } from "./maison/design-payload";
import { localiseOne } from "../design-label-locale";
import { isTokenOnlyText, MODE_DEPENDENT_LABELS, RECENT_JOBS_LABEL, SEED_TEXT_ES } from "./seed-i18n";

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
      // Ticket #209: list items (spec table rows, masthead contents) ...
      for (const spec of localizableListSpecsForKind(kind)) {
        const items = props[spec.list];
        if (!Array.isArray(items)) continue;
        items.forEach((item, n) => {
          for (const field of spec.fields) {
            const text = item && typeof item === "object" ? (item as Record<string, unknown>)[field] : undefined;
            if (typeof text !== "string" || isTokenOnlyText(text) || MODE_DEPENDENT_LABELS.includes(text.trim())) continue;
            const key = listOverlayKey(spec.list, n, field);
            for (const lang of ["es", "en"] as const) {
              const v = overlayValue(props, lang, key);
              if (v === undefined) problems.push(`${path}.${key} missing i18n.${lang} (${JSON.stringify(text)})`);
              else values.push(v);
            }
          }
        });
      }
      // ... and the header's nav and CTA labels, which live in sectionProps.
      if (node.kind === "section" && props.sectionTypeKey === "site_header") {
        for (const { key, text } of headerLabelEntries(props.sectionProps)) {
          if (isTokenOnlyText(text) || MODE_DEPENDENT_LABELS.includes(text.trim())) continue;
          for (const lang of ["es", "en"] as const) {
            const v = overlayValue(props, lang, `${HEADER_OVERLAY_PREFIX}${key}`);
            if (v === undefined) problems.push(`${path}.${HEADER_OVERLAY_PREFIX}${key} missing i18n.${lang} (${JSON.stringify(text)})`);
            else values.push(v);
          }
        }
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

test("TUL-516 C1: Recent jobs seed and render-time map stay one pair", () => {
  assert.equal(SEED_TEXT_ES[RECENT_JOBS_LABEL.en], RECENT_JOBS_LABEL.es);
  assert.equal(localiseOne(RECENT_JOBS_LABEL.en, "es"), RECENT_JOBS_LABEL.es);
  assert.equal(localiseOne(RECENT_JOBS_LABEL.es, "en"), RECENT_JOBS_LABEL.en);
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

test("the new block kinds are registered and the scanner reaches them (#209)", () => {
  const kinds = ["portfolio", "reviews", "alert_band", "task_picker", "spec_table", "visit", "masthead", "statement_footer", "comp_card", "utility_bar"] as const;
  for (const kind of kinds) assert.ok(localizablePropsForKind(kind).length > 0, `${kind} has no localizable props`);
  const seen = new Set<string>();
  for (const [, build] of DESIGNS) {
    const bag = build() as unknown as Record<string, unknown>;
    for (const treeName of ["homeTree", "shellTree", "optionalBlocks"] as const) {
      walk(bag[treeName], treeName, (_path, node) => void seen.add(String(node.kind)));
    }
  }
  for (const kind of kinds) assert.ok(seen.has(kind), `no released design seeds a ${kind}, the test would be vacuous for it`);
});

test("the scanner flags a seeded English-only node of a new kind, a list row and a header label (#209)", () => {
  const fake = {
    shellTree: [
      {
        kind: "section",
        id: "h",
        props: { sectionTypeKey: "site_header", sectionProps: { navItems: [{ label: "Work", href: "#g" }], primaryCta: { label: "Inquire", href: "/c" } } },
      },
    ],
    homeTree: [
      { kind: "portfolio", id: "p", props: { title: "Recent work", emptyMessage: "No photos in your portfolio yet." } },
      { kind: "spec_table", id: "s", props: { title: "How it works", rows: [{ label: "Response", value: "" }] } },
    ],
  } as unknown as DesignPayload;
  const problems = scan("fake", fake).problems;
  // portfolio: title + emptyMessage, spec_table: title + 1 row label, header: nav + cta; each x (es, en).
  assert.equal(problems.length, 12, problems.join("\n"));
  assert.ok(problems.some((p) => p.includes("rows.0.label")));
  assert.ok(problems.some((p) => p.includes("sectionProps.navItems.0.label")));
});

test("FAQ, stats and services catalog kinds are registered and the scanner reaches the seeded ones (TUL-207)", () => {
  for (const kind of ["accordion_item", "stats", "services_catalog"] as const) {
    assert.ok(
      localizablePropsForKind(kind).length > 0 || localizableListSpecsForKind(kind).length > 0,
      `${kind} has nothing registered`,
    );
  }
  assert.ok(localizablePropsForKind("services_catalog").includes("ctaLabel"));
  assert.deepEqual(localizableListSpecsForKind("stats").map((s) => s.list), ["items"]);
  const seen = new Set<string>();
  for (const [, build] of DESIGNS) {
    const bag = build() as unknown as Record<string, unknown>;
    for (const treeName of ["homeTree", "shellTree", "optionalBlocks"] as const) {
      walk(bag[treeName], treeName, (_path, node) => void seen.add(String(node.kind)));
    }
  }
  // The released FAQ is a bound accordion (its rows are live data), so the
  // scanner is proven on accordion_item by the fake payload below.
  for (const kind of ["stats", "services_catalog", "accordion"] as const) {
    assert.ok(seen.has(kind), `no released design seeds a ${kind}`);
  }
});

test("the scanner flags a seeded FAQ item, stats cell and catalog string lacking es or en (TUL-207)", () => {
  const fake = {
    shellTree: [],
    homeTree: [
      {
        kind: "accordion",
        id: "f",
        props: {},
        children: [{ kind: "accordion_item", id: "q", props: { title: "How long does it last?" } }],
      },
      { kind: "stats", id: "s", props: { variant: "spec", items: [{ label: "Response", value: "Within a day" }] } },
      { kind: "services_catalog", id: "c", props: { title: "Rates", ctaLabel: "Book now" } },
    ],
  } as unknown as DesignPayload;
  const problems = scan("fake", fake).problems;
  // accordion_item title, stats label + value, catalog title + ctaLabel; each x (es, en).
  assert.equal(problems.length, 10, problems.join("\n"));
  assert.ok(problems.some((p) => p.includes("items.0.label")));
  assert.ok(problems.some((p) => p.includes("items.0.value")));
  assert.ok(problems.some((p) => p.includes("accordion_item") && p.includes(".title")));
  assert.ok(problems.some((p) => p.includes("services_catalog") && p.includes(".ctaLabel")));
});
