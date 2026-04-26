/**
 * Phase 10 — heading-hierarchy lint.
 *
 * Pure utility: given the published-section list of a homepage snapshot,
 * compute a synthetic outline of headings the page will render and flag
 * structural issues:
 *
 *   - missing H1 (no hero/headline section produced one)
 *   - more than one H1 on the page
 *   - skipped heading levels (e.g. H1 → H3)
 *   - H2 appearing before any H1
 *
 * Most existing section components emit an `<h2>` for their headline
 * and the hero emits `<h1>`. We mirror that mapping here in a single
 * place so the lint stays in sync with renderers without scraping the
 * DOM.
 *
 * Used by the inspector chrome to render an a11y status pill, and
 * (eventually) by a publish-time gate.
 */

export interface HeadingNode {
  level: number;
  text: string;
  /** Section id this heading came from, for click-to-focus. */
  sectionId: string;
  sectionTypeKey: string;
}

export interface HeadingLintIssue {
  kind:
    | "missing_h1"
    | "multiple_h1"
    | "skipped_level"
    | "h2_before_h1";
  message: string;
  /** Heading involved in the issue (or null for missing_h1). */
  heading: HeadingNode | null;
  severity: "warn" | "error";
}

interface SectionLike {
  sectionId: string;
  sectionTypeKey: string;
  props: unknown;
}

// Map of section_type_key → heading level the renderer produces (and the
// prop-key its headline lives under). Keep aligned with each section's
// Component.tsx — when a section starts emitting an additional heading,
// add it here.
const HEADING_MAP: Record<
  string,
  { level: number; propKey: "headline" | "title" | "eyebrow" }
> = {
  hero: { level: 1, propKey: "headline" },
  cta_banner: { level: 2, propKey: "headline" },
  category_grid: { level: 2, propKey: "headline" },
  destinations_mosaic: { level: 2, propKey: "headline" },
  testimonials_trio: { level: 2, propKey: "headline" },
  process_steps: { level: 2, propKey: "headline" },
  image_copy_alternating: { level: 2, propKey: "headline" },
  values_trio: { level: 2, propKey: "headline" },
  press_strip: { level: 2, propKey: "eyebrow" },
  gallery_strip: { level: 2, propKey: "headline" },
  featured_talent: { level: 2, propKey: "headline" },
  trust_strip: { level: 2, propKey: "headline" },
  // M9
  stats: { level: 2, propKey: "headline" },
  faq_accordion: { level: 2, propKey: "headline" },
  split_screen: { level: 2, propKey: "headline" },
  marquee: { level: 0, propKey: "headline" }, // emits no heading
};

export function buildHeadingOutline(
  sections: ReadonlyArray<SectionLike>,
): HeadingNode[] {
  const out: HeadingNode[] = [];
  for (const s of sections) {
    const cfg = HEADING_MAP[s.sectionTypeKey];
    if (!cfg || cfg.level === 0) continue;
    const props = (s.props as Record<string, unknown> | null) ?? {};
    const text = String(props[cfg.propKey] ?? "").trim();
    if (!text) continue;
    out.push({
      level: cfg.level,
      text,
      sectionId: s.sectionId,
      sectionTypeKey: s.sectionTypeKey,
    });
  }
  return out;
}

export function lintHeadingOutline(
  outline: ReadonlyArray<HeadingNode>,
): HeadingLintIssue[] {
  const issues: HeadingLintIssue[] = [];
  const h1s = outline.filter((h) => h.level === 1);
  if (h1s.length === 0 && outline.length > 0) {
    issues.push({
      kind: "missing_h1",
      message:
        "No H1 on the page. Add a hero section or promote one heading to H1.",
      heading: null,
      severity: "error",
    });
  }
  if (h1s.length > 1) {
    for (const extra of h1s.slice(1)) {
      issues.push({
        kind: "multiple_h1",
        message: `More than one H1 on the page ("${truncate(extra.text)}").`,
        heading: extra,
        severity: "warn",
      });
    }
  }
  let lastLevel = 0;
  let seenH1 = false;
  for (const h of outline) {
    if (h.level === 1) seenH1 = true;
    if (h.level === 2 && !seenH1) {
      issues.push({
        kind: "h2_before_h1",
        message: `H2 "${truncate(h.text)}" appears before any H1.`,
        heading: h,
        severity: "warn",
      });
    }
    if (lastLevel > 0 && h.level > lastLevel + 1) {
      issues.push({
        kind: "skipped_level",
        message: `Skipped heading level: H${lastLevel} → H${h.level} ("${truncate(h.text)}").`,
        heading: h,
        severity: "warn",
      });
    }
    lastLevel = h.level;
  }
  return issues;
}

function truncate(s: string, n = 40): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
