import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { BuilderNode, BuilderNodeStyle, BuilderNodeTree } from "./types";
import { ejectSectionInTree } from "./section-eject";
import { resolveBuilderNodeRole } from "./role-bindings";
import {
  MIRRORED_CSS_DECLS,
  SECTION_EJECT_BASELINE_TYPE_KEYS,
  resolveSectionEjectBaseline,
  type MirroredCssDecl,
} from "./section-eject-baseline";

// ─────────────────────────────────────────────────────────────────────────────
// Part 1 — DRIFT GUARD. Every value the baseline module mirrors is enrolled in
// MIRRORED_CSS_DECLS; here the REAL stylesheets are parsed in load order
// (token-presets.css is @import-ed at the top of globals.css, so its rules
// precede globals' own) and each pinned declaration is checked against the
// cascade winner (the LAST declaration among rules whose selector list contains
// the exact pinned selector). If the CSS moves, this fails and names the drift.
// ─────────────────────────────────────────────────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(HERE, "..", "..", "..", "app");

interface ParsedRule {
  selectors: string[];
  declarations: Array<{ property: string; value: string }>;
}

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Top-level selector rules only; @-rule blocks (media/supports/keyframes) are
 * skipped whole — the pinned declarations are all unconditional. */
function parseTopLevelRules(cssText: string): ParsedRule[] {
  const src = cssText.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: ParsedRule[] = [];
  let i = 0;
  while (i < src.length) {
    const brace = src.indexOf("{", i);
    if (brace === -1) break;
    // Drop brace-less statements (@import/@charset …;) before the header.
    const rawHeader = src.slice(i, brace);
    const header = normalizeWs(rawHeader.split(";").pop() ?? "");
    let depth = 1;
    let j = brace + 1;
    while (j < src.length && depth > 0) {
      if (src[j] === "{") depth += 1;
      else if (src[j] === "}") depth -= 1;
      j += 1;
    }
    const body = src.slice(brace + 1, j - 1);
    if (header && !header.startsWith("@")) {
      const declarations: Array<{ property: string; value: string }> = [];
      for (const segment of body.split(";")) {
        const colon = segment.indexOf(":");
        if (colon === -1) continue;
        const property = normalizeWs(segment.slice(0, colon)).toLowerCase();
        const value = normalizeWs(segment.slice(colon + 1));
        if (property && value) declarations.push({ property, value });
      }
      rules.push({
        selectors: header.split(",").map((s) => normalizeWs(s)),
        declarations,
      });
    }
    i = j;
  }
  return rules;
}

function loadRulesInCascadeOrder(): ParsedRule[] {
  const tokenPresets = readFileSync(join(APP_DIR, "token-presets.css"), "utf8");
  const globals = readFileSync(join(APP_DIR, "globals.css"), "utf8");
  // Load order: token-presets first (it is @import-ed at the top of globals).
  return [...parseTopLevelRules(tokenPresets), ...parseTopLevelRules(globals)];
}

/** Cascade winner for an exact selector + property: last matching declaration
 * across both sheets. Returns null when no rule declares it. */
function effectiveDecl(
  rules: ParsedRule[],
  selector: string,
  property: string,
): string | null {
  const wanted = normalizeWs(selector);
  const prop = property.toLowerCase();
  let winner: string | null = null;
  for (const rule of rules) {
    if (!rule.selectors.includes(wanted)) continue;
    for (const decl of rule.declarations) {
      if (decl.property === prop) winner = decl.value;
    }
  }
  return winner;
}

test("drift guard: every mirrored baseline value matches the live CSS cascade", () => {
  const rules = loadRulesInCascadeOrder();
  assert.ok(
    MIRRORED_CSS_DECLS.length >= 40,
    `expected a substantial pin registry, got ${MIRRORED_CSS_DECLS.length}`,
  );
  const failures: string[] = [];
  for (const pin of MIRRORED_CSS_DECLS as MirroredCssDecl[]) {
    const actual = effectiveDecl(rules, pin.selector, pin.property);
    if (pin.value === null) {
      if (actual !== null) {
        failures.push(
          `${pin.selector} { ${pin.property} } — pinned ABSENT but CSS declares "${actual}"`,
        );
      }
      continue;
    }
    if (actual === null) {
      failures.push(
        `${pin.selector} { ${pin.property} } — pinned "${pin.value}" but no CSS declaration found`,
      );
    } else if (normalizeWs(actual) !== normalizeWs(pin.value)) {
      failures.push(
        `${pin.selector} { ${pin.property} } — pinned "${pin.value}" but CSS says "${actual}"`,
      );
    }
  }
  assert.deepEqual(failures, [], `CSS drift:\n${failures.join("\n")}`);
});

test("drift guard self-check: the parser sees the cascade override the earlier decl", () => {
  const rules = loadRulesInCascadeOrder();
  // token-presets declares .site-cta-banner__headline font-size twice (the
  // per-section clamp, then the H2-token group). The winner must be the group.
  assert.equal(
    effectiveDecl(rules, ".site-cta-banner__headline", "font-size"),
    "var(--token-typography-h2-size, clamp(28px, 4vw, 48px))",
  );
  // globals (loaded after token-presets) wins the hero headline font-size.
  assert.equal(
    effectiveDecl(rules, ".site-hero__headline", "font-size"),
    "clamp(2rem, 5vw, 3.75rem)",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Part 2 — BEHAVIOUR. Ejecting an untouched section carries the curated look;
// explicit styling still wins; uncovered types degrade to today's behaviour.
// ─────────────────────────────────────────────────────────────────────────────

function ctaSection(children: BuilderNode[]): BuilderNode {
  return {
    id: "legacy:main:0:sec1",
    kind: "section",
    props: { sectionTypeKey: "cta_banner", sectionId: "sec1" },
    children,
  } as BuilderNode;
}

function ctaChildren(): BuilderNode[] {
  return [
    {
      id: "legacy:main:0:sec1:paragraph:subheadline",
      kind: "paragraph",
      props: { text: "Eyebrow" },
    },
    {
      id: "legacy:main:0:sec1:heading:headline",
      kind: "heading",
      props: { text: "Headline", level: 2 },
    },
    {
      id: "legacy:main:0:sec1:paragraph:copy",
      kind: "paragraph",
      props: { text: "Copy" },
    },
    {
      id: "legacy:main:0:sec1:button:primaryCta",
      kind: "button",
      props: { label: "Go", href: "/x", tone: "primary" },
    },
  ] as BuilderNode[];
}

function styleOf(node: BuilderNode): BuilderNodeStyle {
  return ((node.props as { style?: BuilderNodeStyle }).style ?? {}) as BuilderNodeStyle;
}

test("untouched cta_banner ejects with the curated typography/colour/alignment baked", () => {
  const baseline = resolveSectionEjectBaseline("cta_banner", {
    variant: "centered-overlay",
    backgroundImageUrl: "/img/banner.jpg",
  });
  assert.ok(baseline, "cta_banner must have a baseline");
  const tree: BuilderNodeTree = [ctaSection(ctaChildren())];
  const { tree: next, ejected } = ejectSectionInTree(
    tree,
    "legacy:main:0:sec1",
    undefined,
    baseline,
  );
  assert.equal(ejected, true);
  const sec = next[0] as BuilderNode & { children: BuilderNode[] };
  const [eyebrow, headline, copy, button] = sec.children;

  // Headline: the exact curated values, not just "some style".
  const h = styleOf(headline);
  assert.equal(h.fontSize, "var(--token-typography-h2-size, clamp(28px, 4vw, 48px))");
  assert.equal(h.fontFamily, "var(--site-heading-font)");
  assert.equal(h.lineHeight, "1.05");
  assert.equal(h.letterSpacing, "var(--site-heading-tracking, normal)");
  assert.equal(h.textColor, "var(--token-color-surface-raised)");
  assert.equal(h.align, "center");

  // Eyebrow: 12px label, curated tracking + on-image colour.
  const e = styleOf(eyebrow);
  assert.equal(e.fontSize, "12px");
  assert.equal(e.fontWeight, 500);
  assert.equal(e.letterSpacing, "var(--site-label-tracking)");
  assert.equal(e.textColor, "var(--token-color-surface-raised)");
  assert.equal(e.align, "center");

  // Copy: 17px reading size + on-image tint.
  const c = styleOf(copy);
  assert.equal(c.fontSize, "17px");
  assert.equal(c.lineHeight, "1.55");
  assert.equal(c.textColor, "rgba(255, 255, 255, 0.88)");
  assert.equal(c.align, "center");

  // Primary CTA: the shared Cta primitive, not the freeform button default
  // (0.82rem / uppercase / 0.08em).
  const b = styleOf(button);
  assert.equal(b.fontSize, "14px");
  assert.equal(b.fontWeight, 500);
  assert.equal(b.letterSpacing, "0.005em");
  assert.equal(b.textTransform, "none");
  assert.equal(b.backgroundColor, "var(--token-color-primary, #1a1a1a)");
  assert.equal(b.textColor, "var(--token-color-surface-raised, #ffffff)");
  assert.equal(b.paddingTop, "12px");
  assert.equal(b.paddingLeft, "22px");
  assert.equal(b.borderRadius, "999px");
});

test("cta_banner variants select the right colour/alignment layer", () => {
  const band = resolveSectionEjectBaseline("cta_banner", {
    variant: "minimal-band",
  });
  assert.equal(band?.headline?.textColor, "var(--token-color-ink)");
  assert.equal(band?.copy?.textColor, "var(--token-color-muted)");
  assert.equal(band?.subheadline?.textColor, "var(--token-color-primary)");

  const espresso = resolveSectionEjectBaseline("cta_banner", {
    variant: "minimal-band",
    bandTone: "espresso",
  });
  assert.equal(espresso?.headline?.textColor, "#f6f1ea");

  const noImage = resolveSectionEjectBaseline("cta_banner", {
    variant: "centered-overlay",
  });
  assert.equal(noImage?.headline?.textColor, "#f6f1ea");
  assert.equal(noImage?.copy?.textColor, "rgba(246, 241, 234, 0.88)");

  const split = resolveSectionEjectBaseline("cta_banner", {
    variant: "split-image",
  });
  assert.equal(split?.headline?.align, "left");
  assert.equal(split?.copy?.align, "left");
});

test("hero baseline: centered default + photographic on-scrim + cinematic mood", () => {
  const base = resolveSectionEjectBaseline("hero", {});
  assert.equal(base?.headline?.fontSize, "clamp(2rem, 5vw, 3.75rem)");
  assert.equal(base?.headline?.align, "center");
  assert.equal(
    base?.headline?.textColor,
    "color-mix(in oklab, var(--token-color-ink, var(--foreground)) 96%, white)",
  );
  assert.equal(base?.subheadline?.fontSize, "clamp(1rem, 1.4vw, 1.25rem)");
  assert.equal(base?.primaryCta?.fontSize, "0.95rem");
  assert.equal(base?.primaryCta?.textTransform, "none");

  const photo = resolveSectionEjectBaseline("hero", {
    slides: [{ backgroundImageUrl: "/img/a.jpg" }],
  });
  assert.equal(photo?.headline?.textColor, "#f8fafc");
  assert.equal(photo?.headline?.textShadow, "0 2px 24px rgba(0, 0, 0, 0.55)");
  assert.equal(photo?.subheadline?.textColor, "rgba(248, 250, 252, 0.92)");
  assert.equal(photo?.secondaryCta?.backgroundColor, "rgba(248, 250, 252, 0.14)");

  const cinematic = resolveSectionEjectBaseline("hero", { mood: "cinematic" });
  assert.equal(cinematic?.headline?.fontSize, "clamp(2.5rem, 7vw, 5rem)");
  assert.equal(cinematic?.headline?.letterSpacing, "0.01em");

  const split = resolveSectionEjectBaseline("hero", { layout: "split-left" });
  assert.equal(split?.headline?.align, "left");
  assert.equal(split?.subheadline?.align, "left");
});

test("an explicit per-role override still WINS over the baked baseline", () => {
  const baseline = resolveSectionEjectBaseline("cta_banner", {
    variant: "centered-overlay",
    backgroundImageUrl: "/img/banner.jpg",
  });
  const children = ctaChildren();
  // The operator directly styled the headline child (Engine-A explicit style).
  (children[1].props as { style?: BuilderNodeStyle }).style = {
    fontSize: "72px",
    align: "left",
  };
  // …and set a curated per-role override for the copy (Engine-B).
  const rolePresentation = {
    copy: { align: "right" as const, fontSizePx: 20 },
  };
  const { tree: next } = ejectSectionInTree(
    [ctaSection(children)],
    "legacy:main:0:sec1",
    rolePresentation,
    baseline,
  );
  const sec = next[0] as BuilderNode & { children: BuilderNode[] };
  const h = styleOf(sec.children[1]);
  assert.equal(h.fontSize, "72px", "explicit child style wins over baseline");
  assert.equal(h.align, "left");
  // Non-overridden baseline keys still carry.
  assert.equal(h.lineHeight, "1.05");
  const c = styleOf(sec.children[2]);
  assert.equal(c.align, "right", "nodePresentation wins over baseline");
  assert.equal(c.fontSize, "20px");
  assert.equal(c.textColor, "rgba(255, 255, 255, 0.88)", "baseline fills the gaps");
});

test("responsive: nodePresentation breakpoints layer over a baseline's responsive buckets", () => {
  const children = ctaChildren();
  const rolePresentation = {
    headline: {
      breakpoints: {
        tablet: { fontSizePx: 40 },
        mobile: { align: "left" as const },
      },
    },
  };
  // Synthetic baseline with its own responsive buckets to prove the deep merge.
  const baseline = {
    headline: {
      fontSize: "64px",
      responsive: {
        tablet: { fontSize: "48px", lineHeight: "1.1" },
        mobile: { fontSize: "32px" },
      },
    },
  };
  const { tree: next } = ejectSectionInTree(
    [ctaSection(children)],
    "legacy:main:0:sec1",
    rolePresentation,
    baseline,
  );
  const sec = next[0] as BuilderNode & { children: BuilderNode[] };
  const h = styleOf(sec.children[1]);
  assert.equal(h.fontSize, "64px");
  assert.equal(h.responsive?.tablet?.fontSize, "40px", "np tablet wins");
  assert.equal(h.responsive?.tablet?.lineHeight, "1.1", "baseline tablet fills");
  assert.equal(h.responsive?.mobile?.fontSize, "32px", "baseline mobile carries");
  assert.equal(h.responsive?.mobile?.align, "left", "np mobile carries");
});

test("a section type with no baseline degrades to today's behaviour and does not throw", () => {
  assert.equal(resolveSectionEjectBaseline("faq_accordion"), undefined);
  assert.equal(resolveSectionEjectBaseline("not_a_real_type"), undefined);
  assert.equal(resolveSectionEjectBaseline("hasOwnProperty"), undefined);
  const children = ctaChildren();
  const tree: BuilderNodeTree = [
    {
      id: "legacy:main:0:sec2",
      kind: "section",
      props: { sectionTypeKey: "faq_accordion", sectionId: "sec2" },
      children,
    } as BuilderNode,
  ];
  const { tree: next, ejected } = ejectSectionInTree(
    tree,
    "legacy:main:0:sec2",
    undefined,
    resolveSectionEjectBaseline("faq_accordion"),
  );
  assert.equal(ejected, true);
  const sec = next[0] as BuilderNode & { children: BuilderNode[] };
  // No STYLING appears out of nowhere — byte-equal props except fresh ids and
  // the `originRole` provenance stamp, which every eject writes regardless of
  // baseline coverage (it is what lets "Restore original styling" find the
  // right child later; see section-eject-repair.ts). It carries no design.
  for (let i = 0; i < children.length; i += 1) {
    const { originRole, ...rest } = sec.children[i].props as Record<
      string,
      unknown
    >;
    assert.deepEqual(rest, children[i].props);
    assert.equal(originRole, resolveBuilderNodeRole(children[i].id));
    assert.equal(
      (sec.children[i] as { style?: unknown }).style ??
        (rest as { style?: unknown }).style,
      undefined,
      "a baseline-free eject must not invent styling",
    );
  }
});

test("coverage registry names exactly the flagship sections", () => {
  assert.deepEqual(
    [...SECTION_EJECT_BASELINE_TYPE_KEYS].sort(),
    ["cta_banner", "hero"],
  );
});
