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

/** Translate raw prop-name pairs into operator-readable copy. */
function humanizeAltMessage(urlProp: string, altProp: string): string {
  // Map the url prop to a friendly description of the image.
  const imageLabel: Record<string, string> = {
    backgroundImageUrl: "background image",
    imageUrl: "image",
    beforeUrl: "before image",
    afterUrl: "after image",
    heroImageUrl: "hero image",
    src: "image",
  };
  const label = imageLabel[urlProp] ?? "image";
  void altProp; // included via the image label
  return `The ${label} has no alt text — add a short description for screen readers.`;
}

function evaluate(
  sectionTypeKey: string,
  draftProps: Record<string, unknown>,
): Issue[] {
  const issues: Issue[] = [];

  const headlineProp = HEADLINE_PROPS[sectionTypeKey];
  if (headlineProp) {
    const v = draftProps[headlineProp];
    const text = typeof v === "string" ? v.trim() : "";
    if (!text && sectionTypeKey === "hero") {
      issues.push({
        severity: "error",
        message: "This hero has no headline — the page will be missing its main H1 heading, which hurts SEO and accessibility.",
      });
    } else if (!text) {
      issues.push({
        severity: "warn",
        message: "This section has no headline — it will render without a title, which can confuse screen readers.",
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
        message: humanizeAltMessage(f.url, f.alt),
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
        message: `${missing} item image${missing > 1 ? "s are" : " is"} missing alt text — add descriptions so screen readers can describe them.`,
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
        message: `${missing} portrait${missing > 1 ? "s are" : " is"} missing alt text — add names or descriptions.`,
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
      className={`mb-3 rounded-lg border px-3 py-2.5 text-[11.5px] leading-relaxed ${
        tone === "error"
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      <div className={`mb-1.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider ${tone === "error" ? "text-rose-700" : "text-amber-700"}`}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        {tone === "error" ? "Needs attention" : `${issues.length > 1 ? `${issues.length} things` : "Something"} to improve`}
      </div>
      <ul className="flex flex-col gap-1">
        {issues.map((iss, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span aria-hidden className="mt-[3px] shrink-0 opacity-60">·</span>
            <span>{iss.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
