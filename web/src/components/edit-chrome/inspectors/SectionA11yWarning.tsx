"use client";

/**
 * Phase 10 — per-section a11y warnings.
 *
 * Inspects the currently selected section's loaded props and surfaces
 * the most actionable a11y issues:
 *   - section emits a heading at level N but the headline prop is empty
 *     (page outline will skip a level)
 *   - any image-bearing prop has a URL set but no alt text
 *
 * The HeadingLintBadge in NavigatorPanel runs in structural-only mode
 * (no props loaded for the full list); this component is the
 * props-aware companion that runs only for the selected section.
 *
 * Rendered in the Inspector header. Empty when no issues found.
 */

interface SectionA11yWarningProps {
  sectionTypeKey: string;
  draftProps: Record<string, unknown> | null;
}

interface Issue {
  message: string;
  severity: "warn" | "error";
}

// Section-key → which prop fields are image URLs paired with alt fields.
const IMAGE_FIELDS: Record<string, ReadonlyArray<{ url: string; alt: string }>> = {
  hero: [{ url: "backgroundImageUrl", alt: "backgroundImageAlt" }],
  cta_banner: [{ url: "backgroundImageUrl", alt: "backgroundImageAlt" }],
  split_screen: [{ url: "imageUrl", alt: "imageAlt" }],
  before_after: [
    { url: "beforeUrl", alt: "beforeAlt" },
    { url: "afterUrl", alt: "afterAlt" },
  ],
};

// Section-key → headline prop. Mirror of heading-hierarchy HEADING_MAP
// but inlined to avoid a server-only import in this client component.
const HEADLINE_PROPS: Record<string, string | null> = {
  hero: "headline",
  cta_banner: "headline",
  category_grid: "headline",
  destinations_mosaic: "headline",
  testimonials_trio: "headline",
  process_steps: "headline",
  image_copy_alternating: "headline",
  values_trio: "headline",
  press_strip: "eyebrow",
  gallery_strip: "headline",
  featured_talent: "headline",
  trust_strip: "headline",
  stats: "headline",
  faq_accordion: "headline",
  split_screen: "headline",
  timeline: "headline",
  pricing_grid: "headline",
  team_grid: "headline",
  contact_form: "headline",
  before_after: "headline",
  content_tabs: "headline",
  code_embed: "headline",
  marquee: null,
  anchor_nav: null,
};

function evaluate(
  sectionTypeKey: string,
  draftProps: Record<string, unknown>,
): Issue[] {
  const issues: Issue[] = [];

  const headlineProp = HEADLINE_PROPS[sectionTypeKey];
  if (headlineProp) {
    const v = draftProps[headlineProp];
    const text = typeof v === "string" ? v.trim() : "";
    if (!text && sectionTypeKey !== "hero") {
      issues.push({
        severity: "warn",
        message: `Empty ${headlineProp} — section will render without a heading.`,
      });
    } else if (!text && sectionTypeKey === "hero") {
      issues.push({
        severity: "error",
        message: "Hero has no headline. Page may render without an H1.",
      });
    }
  }

  const imageFields = IMAGE_FIELDS[sectionTypeKey] ?? [];
  for (const f of imageFields) {
    const url = draftProps[f.url];
    const alt = draftProps[f.alt];
    if (typeof url === "string" && url.trim() && (typeof alt !== "string" || !alt.trim())) {
      issues.push({
        severity: "warn",
        message: `${f.url} is set but ${f.alt} is empty. Add alt text or mark as decorative.`,
      });
    }
  }

  // Items array with image fields (image_copy_alternating, gallery_strip, team_grid).
  if (Array.isArray(draftProps.items)) {
    let missing = 0;
    for (const item of draftProps.items as Array<Record<string, unknown>>) {
      const url = item?.imageUrl;
      const alt = item?.imageAlt ?? item?.alt;
      if (typeof url === "string" && url.trim() && (typeof alt !== "string" || !alt.trim())) {
        missing += 1;
      }
    }
    if (missing > 0) {
      issues.push({
        severity: "warn",
        message: `${missing} item${missing > 1 ? "s have" : " has"} an image without alt text.`,
      });
    }
  }
  if (Array.isArray(draftProps.members)) {
    let missing = 0;
    for (const m of draftProps.members as Array<Record<string, unknown>>) {
      const url = m?.imageUrl;
      const alt = m?.imageAlt;
      if (typeof url === "string" && url.trim() && (typeof alt !== "string" || !alt.trim())) {
        missing += 1;
      }
    }
    if (missing > 0) {
      issues.push({
        severity: "warn",
        message: `${missing} member${missing > 1 ? "s have" : " has"} a portrait without alt text.`,
      });
    }
  }

  return issues;
}

export function SectionA11yWarning({
  sectionTypeKey,
  draftProps,
}: SectionA11yWarningProps) {
  if (!draftProps) return null;
  const issues = evaluate(sectionTypeKey, draftProps);
  if (issues.length === 0) return null;
  const errors = issues.filter((i) => i.severity === "error").length;
  const tone = errors > 0 ? "error" : "warn";

  return (
    <div
      className={`mb-3 flex flex-col gap-1 rounded-md border px-3 py-2 text-[11px] ${
        tone === "error"
          ? "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300"
          : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      }`}
    >
      <div className="font-semibold uppercase tracking-wide">
        A11y · {issues.length} issue{issues.length > 1 ? "s" : ""}
      </div>
      <ul className="flex flex-col gap-0.5">
        {issues.map((iss, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span aria-hidden>•</span>
            <span>{iss.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
