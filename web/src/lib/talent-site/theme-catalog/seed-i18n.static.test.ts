/**
 * Every seeded text node of every released talent design ships BOTH Spanish
 * and English (`props.i18n.es` / `props.i18n.en`), so a new Spanish site never
 * renders English-only starter text. See seed-i18n.ts.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { localizablePropsForKind } from "@/lib/i18n/builder-i18n-props";
import { listOverlayKey, localizableListSpecsForKind } from "@/lib/i18n/builder-i18n-list-props";
import { HEADER_OVERLAY_PREFIX, headerLabelEntries, headerSectionProps } from "../header-i18n";
import type { DesignPayload } from "./types";
import { FINISHED_GALLERY_SLUGS } from "./gallery-meta";
import { COLLECTION_DESIGNS } from "./collection/designs";
import { buildMaisonDesignPayload } from "./maison/design-payload";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { blankComments } from "@/lib/quality/supabase-unchecked-read";
import { localiseOne, localiseSeededDesignLabels } from "../design-cta-mode";
import { guessSeededLabelFallback } from "../design-label-locale";
import { localizeBlockNode } from "@/lib/site-admin/builder-node/block-i18n";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  FOLIO_SPANISH_BASE_PENDING_2914,
  isTokenOnlyText,
  looksLikeSpanishSeedBase,
  MODE_DEPENDENT_LABELS,
  SEED_TEXT_ES,
  THEME_SEED_BASE_LOCALE,
} from "./seed-i18n";

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

/** Folio still seeds Spanish CTA bases until #2914; skip overlay + English-base scans. */
function isPendingFolioSpanishBase(slug: string, text: string): boolean {
  return slug === "folio" && FOLIO_SPANISH_BASE_PENDING_2914.has(text.trim());
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
        if (
          typeof text !== "string" ||
          isTokenOnlyText(text) ||
          MODE_DEPENDENT_LABELS.includes(text.trim()) ||
          isPendingFolioSpanishBase(slug, text)
        )
          continue;
        for (const lang of ["es", "en"] as const) {
          const v = overlayValue(props, lang, prop);
          if (v === undefined) problems.push(`${path}.${prop} missing i18n.${lang} (${JSON.stringify(text)})`);
          else values.push(v);
        }
      }
      if (node.kind === "marquee" && Array.isArray(props.items)) {
        props.items.forEach((it, n) => {
          const text = it && typeof it === "object" ? (it as { text?: unknown }).text : undefined;
          if (
            typeof text !== "string" ||
            isTokenOnlyText(text) ||
            MODE_DEPENDENT_LABELS.includes(text.trim()) ||
            isPendingFolioSpanishBase(slug, text)
          )
            return;
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
            if (
              typeof text !== "string" ||
              isTokenOnlyText(text) ||
              MODE_DEPENDENT_LABELS.includes(text.trim()) ||
              isPendingFolioSpanishBase(slug, text)
            )
              continue;
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
          if (
            isTokenOnlyText(text) ||
            MODE_DEPENDENT_LABELS.includes(text.trim()) ||
            isPendingFolioSpanishBase(slug, text)
          )
            continue;
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

test(`theme seed base locale is ${THEME_SEED_BASE_LOCALE}`, () => {
  assert.equal(THEME_SEED_BASE_LOCALE, "en");
});

for (const [slug, build] of DESIGNS) {
  test(`${slug}: every seeded base text is English (TUL-369)`, () => {
    const problems: string[] = [];
    const bag = build() as unknown as Record<string, unknown>;
    for (const treeName of ["homeTree", "shellTree", "optionalBlocks"] as const) {
      walk(bag[treeName], `${slug}.${treeName}`, (path, node) => {
        const props = (node.props ?? {}) as Record<string, unknown>;
        const kind = node.kind as Parameters<typeof localizablePropsForKind>[0];
        for (const prop of localizablePropsForKind(kind)) {
          const text = props[prop];
          if (typeof text !== "string") continue;
          if (isPendingFolioSpanishBase(slug, text)) continue;
          if (looksLikeSpanishSeedBase(text)) {
            problems.push(`${path}.${prop} Spanish base ${JSON.stringify(text)}`);
          }
        }
        if (node.kind === "marquee" && Array.isArray(props.items)) {
          props.items.forEach((it, n) => {
            const text = it && typeof it === "object" ? (it as { text?: unknown }).text : undefined;
            if (typeof text !== "string" || isPendingFolioSpanishBase(slug, text)) return;
            if (looksLikeSpanishSeedBase(text)) {
              problems.push(`${path}.items.${n}.text Spanish base ${JSON.stringify(text)}`);
            }
          });
        }
        for (const spec of localizableListSpecsForKind(kind)) {
          const items = props[spec.list];
          if (!Array.isArray(items)) continue;
          items.forEach((item, n) => {
            for (const field of spec.fields) {
              const text =
                item && typeof item === "object" ? (item as Record<string, unknown>)[field] : undefined;
              if (typeof text !== "string" || isPendingFolioSpanishBase(slug, text)) continue;
              if (looksLikeSpanishSeedBase(text)) {
                problems.push(
                  `${path}.${listOverlayKey(spec.list, n, field)} Spanish base ${JSON.stringify(text)}`,
                );
              }
            }
          });
        }
        if (node.kind === "section" && props.sectionTypeKey === "site_header") {
          for (const { key, text } of headerLabelEntries(props.sectionProps)) {
            if (isPendingFolioSpanishBase(slug, text)) continue;
            if (looksLikeSpanishSeedBase(text)) {
              problems.push(
                `${path}.${HEADER_OVERLAY_PREFIX}${key} Spanish base ${JSON.stringify(text)}`,
              );
            }
          }
        }
      });
    }
    assert.deepEqual(problems, [], `\n${problems.join("\n")}`);
  });
}

test("folio Consultar CTA bases stay until #2914 code-seed → publish → demos:rebuild", () => {
  const shipped = COLLECTION_DESIGNS.find((d) => d.slug === "folio")!.buildPayload();
  const raw = JSON.stringify(shipped);
  assert.ok(raw.includes("Consultar"), "Folio still seeds Consultar (English base lands via #2914)");
  assert.ok(!/"ctaLabel":"Ask about this"/.test(raw));
  assert.ok(!/"label":"Ask about this"/.test(raw));
});

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
    // Keys are English bases (TUL-369): no Spanish-looking key.
    assert.ok(!looksLikeSpanishSeedBase(en), `SEED_TEXT_ES key looks Spanish: ${en}`);
  }
});

test("design-label-locale.ts and header-cta-locale.ts stay as guess-map FALLBACK until heal (TUL-369 split)", () => {
  const root = path.join(__dirname, "..");
  assert.equal(existsSync(path.join(root, "design-label-locale.ts")), true);
  assert.equal(existsSync(path.join(root, "header-cta-locale.ts")), true);
  const fallbackSrc = blankComments(readFileSync(path.join(root, "design-label-locale.ts"), "utf8"));
  assert.ok(fallbackSrc.includes("guessSeededLabelFallback"));
  assert.ok(fallbackSrc.includes("FALLBACK") || fallbackSrc.includes("fallback"));
  // Mode-aware CTA remaps stay free of an inline SEED_TEXT_ES table.
  const modeSrc = blankComments(readFileSync(path.join(root, "design-cta-mode.ts"), "utf8"));
  assert.ok(modeSrc.includes("SiteCtaMode"));
  assert.ok(modeSrc.includes("guessSeededLabelFallback"));
  assert.ok(!modeSrc.includes("CODE_SEEDED_LABELS_ES"));
  assert.ok(!modeSrc.includes("CTA_LABEL_BY_LOCALE"));
});

test("looksLikeSpanishSeedBase is language-based (no accent regex) (TUL-369)", () => {
  // Exact seed values + unaccented Spanish UI words.
  assert.equal(looksLikeSpanishSeedBase("Consultar"), true);
  assert.equal(looksLikeSpanishSeedBase("Servicios"), true);
  assert.equal(looksLikeSpanishSeedBase("Contactanos"), true);
  assert.equal(looksLikeSpanishSeedBase("Para editoriales y campañas"), true);
  // English stays English.
  assert.equal(looksLikeSpanishSeedBase("Ask about this"), false);
  assert.equal(looksLikeSpanishSeedBase("Services"), false);
  assert.equal(looksLikeSpanishSeedBase("Recent work"), false);
  // Accented English names / loanwords alone must not be flagged.
  assert.equal(looksLikeSpanishSeedBase("José"), false);
  assert.equal(looksLikeSpanishSeedBase("Café"), false);
});

/**
 * Render-time Spanish for one seeded string: props.i18n.es when present,
 * else mode-aware CTA map, else guess-map FALLBACK (TUL-369 split), else base.
 */
function renderedEs(base: string, esOverlay: string | undefined, href?: unknown): string {
  if (typeof esOverlay === "string" && esOverlay.trim()) return esOverlay;
  if (MODE_DEPENDENT_LABELS.includes(base.trim())) {
    return localiseOne(base, "es", "instant", href) ?? base;
  }
  if (base.trim() === "Book" && href === "#gallery") {
    return localiseOne(base, "es", "instant", href) ?? base;
  }
  return guessSeededLabelFallback(base, "es") ?? base;
}

/**
 * Intentional Spanish wording that differs from the deleted
 * `CODE_SEEDED_LABELS_ES` / `CTA_LABEL_BY_LOCALE` maps for overlapping keys
 * (empty = full equivalence). Document any future drift here.
 */
const SPANISH_RENDER_DIFFS_FROM_OLD_MAPS: ReadonlyArray<{ en: string; oldEs: string; newEs: string }> = [];

/**
 * Seed-table wording that changed when `SEED_TEXT_ES` absorbed the guess maps
 * (pre-TUL-369 seed → current). Listed so the Spanish-render bounce is auditable
 * even when guess-map overlap diffs are empty.
 */
const SEED_TEXT_ES_WORDING_CHANGES: ReadonlyArray<{ en: string; oldEs: string; newEs: string }> = [
  {
    en: "No photos in your portfolio yet.",
    oldEs: "Aún no hay fotos en el portafolio.",
    newEs: "Aún no hay fotos en tu portafolio.",
  },
];

test("Spanish render diffs vs deleted guess maps are listed (TUL-369)", () => {
  assert.deepEqual(
    SPANISH_RENDER_DIFFS_FROM_OLD_MAPS,
    [],
    "overlapping guess-map keys must stay equivalent or be listed",
  );
  for (const { en, oldEs, newEs } of SEED_TEXT_ES_WORDING_CHANGES) {
    assert.equal(SEED_TEXT_ES[en], newEs, en);
    assert.notEqual(newEs, oldEs, en);
  }
});

for (const [slug, build] of DESIGNS) {
  test(`${slug}: Spanish render via seed overlays leaves no seeded English labels (TUL-369)`, () => {
    const leaks: string[] = [];
    /** Overlay applications this design's seed actually changes (en → es). */
    const changed: Array<{ path: string; en: string; es: string }> = [];
    const bag = build() as unknown as Record<string, unknown>;
    const contentLocale = { locale: "es", defaultLocale: "en", chain: ["es", "en"] as const };
    for (const treeName of ["homeTree", "shellTree", "optionalBlocks"] as const) {
      walk(bag[treeName], `${slug}.${treeName}`, (path, node) => {
        const kind = node.kind as Parameters<typeof localizablePropsForKind>[0];
        const localized = localizeBlockNode(node as unknown as BuilderNode, contentLocale);
        const props = (localized.props ?? {}) as Record<string, unknown>;
        const i18nEs = ((node.props as Record<string, unknown> | undefined)?.i18n as
          | { es?: Record<string, string> }
          | undefined)?.es;

        for (const prop of localizablePropsForKind(kind)) {
          const base = (node.props as Record<string, unknown> | undefined)?.[prop];
          if (typeof base !== "string" || isTokenOnlyText(base)) continue;
          if (isPendingFolioSpanishBase(slug, base)) continue;
          const shown = renderedEs(base, i18nEs?.[prop]);
          if (base.trim() in SEED_TEXT_ES) {
            if (shown === base) leaks.push(`${path}.${prop} still English ${JSON.stringify(base)}`);
            else {
              assert.equal(shown, SEED_TEXT_ES[base.trim()], `${path}.${prop}`);
              changed.push({ path: `${path}.${prop}`, en: base.trim(), es: shown });
            }
            // localizeBlockNode must surface the same Spanish for registered props.
            if (typeof props[prop] === "string") assert.equal(props[prop], shown, `${path}.${prop} localizeBlockNode`);
          } else if (MODE_DEPENDENT_LABELS.includes(base.trim()) && shown === base) {
            leaks.push(`${path}.${prop} mode label still English ${JSON.stringify(base)}`);
          }
        }

        if (node.kind === "marquee" && Array.isArray(((node.props as Record<string, unknown>) ?? {}).items)) {
          const rawItems = ((node.props as Record<string, unknown>).items ?? []) as unknown[];
          rawItems.forEach((raw, n) => {
            const base = raw && typeof raw === "object" ? (raw as { text?: unknown }).text : undefined;
            if (typeof base !== "string" || isTokenOnlyText(base) || isPendingFolioSpanishBase(slug, base)) return;
            const key = `items.${n}.text`;
            const shown = renderedEs(base, i18nEs?.[key]);
            if (base.trim() in SEED_TEXT_ES) {
              if (shown === base) leaks.push(`${path}.${key} still English ${JSON.stringify(base)}`);
              else {
                assert.equal(shown, SEED_TEXT_ES[base.trim()], `${path}.${key}`);
                changed.push({ path: `${path}.${key}`, en: base.trim(), es: shown });
              }
            }
          });
        }

        for (const spec of localizableListSpecsForKind(kind)) {
          const rawItems = ((node.props as Record<string, unknown>)?.[spec.list] ?? []) as unknown[];
          if (!Array.isArray(rawItems)) continue;
          rawItems.forEach((raw, n) => {
            for (const field of spec.fields) {
              const base =
                raw && typeof raw === "object" ? (raw as Record<string, unknown>)[field] : undefined;
              if (typeof base !== "string" || isTokenOnlyText(base) || isPendingFolioSpanishBase(slug, base)) {
                continue;
              }
              const key = listOverlayKey(spec.list, n, field);
              const shown = renderedEs(base, i18nEs?.[key]);
              if (base.trim() in SEED_TEXT_ES) {
                if (shown === base) leaks.push(`${path}.${key} still English ${JSON.stringify(base)}`);
                else {
                  assert.equal(shown, SEED_TEXT_ES[base.trim()], `${path}.${key}`);
                  changed.push({ path: `${path}.${key}`, en: base.trim(), es: shown });
                }
              }
            }
          });
        }

        if (node.kind === "section" && (node.props as Record<string, unknown>)?.sectionTypeKey === "site_header") {
          const rawSp = (node.props as Record<string, unknown>).sectionProps;
          const esSp = headerSectionProps(node as unknown as BuilderNode, "es");
          for (const { key, text } of headerLabelEntries(rawSp)) {
            if (isTokenOnlyText(text) || isPendingFolioSpanishBase(slug, text)) continue;
            const href =
              key === "primaryCta.label" && rawSp && typeof rawSp === "object"
                ? (rawSp as { primaryCta?: { href?: unknown } }).primaryCta?.href
                : undefined;
            const overlayKey = `${HEADER_OVERLAY_PREFIX}${key}`;
            const shown = renderedEs(text, i18nEs?.[overlayKey], href);
            const esEntry = headerLabelEntries(esSp).find((e) => e.key === key);
            if (text.trim() in SEED_TEXT_ES) {
              if (shown === text) leaks.push(`${path}.${overlayKey} still English ${JSON.stringify(text)}`);
              else {
                assert.equal(shown, SEED_TEXT_ES[text.trim()], `${path}.${overlayKey}`);
                changed.push({ path: `${path}.${overlayKey}`, en: text.trim(), es: shown });
              }
              if (esEntry) assert.equal(esEntry.text, shown, `${path}.${overlayKey} headerSectionProps`);
            } else if (MODE_DEPENDENT_LABELS.includes(text.trim()) && shown === text) {
              leaks.push(`${path}.${overlayKey} mode label still English ${JSON.stringify(text)}`);
            }
          }
        }
      });
    }
    assert.deepEqual(leaks, [], `\n${leaks.join("\n")}`);
    // Non-vacuous: every released design must change at least one seeded string via overlay.
    assert.ok(
      changed.length > 0,
      `${slug}: seed overlay changed zero strings (test would be vacuous)\n` +
        changed.map((c) => `${c.path}: ${c.en} → ${c.es}`).join("\n"),
    );
  });
}

test("without overlays localizeBlockNode stays English; guess-map FALLBACK fills via localiseSeededDesignLabels (TUL-369 split)", () => {
  const bare = {
    kind: "portfolio",
    id: "bare",
    props: { title: "Recent work", emptyMessage: "No photos in your portfolio yet." },
  } as unknown as BuilderNode;
  // Overlay path alone does not invent Spanish.
  const bareEs = localizeBlockNode(bare, { locale: "es", defaultLocale: "en", chain: ["es", "en"] });
  assert.equal((bareEs.props as { title?: string }).title, "Recent work");
  // Guess-map fallback (until heal recount=0) localises when no i18n.es.
  const viaGuess = localiseSeededDesignLabels([bare], "es");
  assert.equal((viaGuess[0]!.props as { title?: string }).title, SEED_TEXT_ES["Recent work"]);
  assert.equal(
    (viaGuess[0]!.props as { emptyMessage?: string }).emptyMessage,
    SEED_TEXT_ES["No photos in your portfolio yet."],
  );
  // With an overlay bag present, guess map must not rewrite.
  const withOverlay = {
    ...bare,
    props: {
      ...bare.props,
      i18n: { es: { title: "Trabajo reciente (authored)" } },
    },
  } as unknown as BuilderNode;
  const kept = localiseSeededDesignLabels([withOverlay], "es");
  assert.equal((kept[0]!.props as { title?: string }).title, "Recent work");
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
