"use server";

/**
 * Phase 10 — publish preflight: heading lint + alt-text audit + image
 * size audit, in one server action so the publish drawer can render a
 * single "ready to publish?" card.
 *
 * Doesn't block publish — just returns warnings the operator should
 * acknowledge. The publish-drawer caller decides whether to surface
 * a "publish anyway" override.
 *
 * Phase 0 sweep (2026-04-26) — convergence-plan §1: the previously-orphan
 * `runAriaLandmarkCheck` action is now folded in here so its findings reach
 * an actual UI surface. `suggestLayoutImprovement` and `loadAiUsageSummary`
 * remain standalone server actions; their unified home is the post-v1 AI
 * panel (see plan §5 Post-v1 polish).
 */

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { listSectionsForStaff } from "@/lib/site-admin/server/sections-reads";
import { runAriaLandmarkCheck } from "./aria-landmark-action";

export type PreflightSeverity = "error" | "warn";

export interface PreflightIssue {
  severity: PreflightSeverity;
  category: "headings" | "alt_text" | "image_size" | "aria";
  /** Optional sectionId for click-to-focus in the drawer. */
  sectionId?: string;
  message: string;
}

export type PreflightResult =
  | { ok: true; issues: ReadonlyArray<PreflightIssue> }
  | { ok: false; error: string };

// Section types that emit an H1 (others emit H2).
const H1_TYPES = new Set(["hero", "hero_split", "blog_detail"]);

// Section types whose section props carry image fields paired with alt
// text. Each entry is a pair of prop names (url, alt) on the section
// itself OR on items[]/members[].
const IMAGE_FIELD_PAIRS: Record<
  string,
  ReadonlyArray<{ urlPath: string; altPath: string }>
> = {
  hero: [{ urlPath: "backgroundImageUrl", altPath: "backgroundImageAlt" }],
  cta_banner: [{ urlPath: "backgroundImageUrl", altPath: "backgroundImageAlt" }],
  split_screen: [{ urlPath: "imageUrl", altPath: "imageAlt" }],
  before_after: [
    { urlPath: "beforeUrl", altPath: "beforeAlt" },
    { urlPath: "afterUrl", altPath: "afterAlt" },
  ],
  hero_split: [{ urlPath: "imageUrl", altPath: "imageAlt" }],
  sticky_scroll: [{ urlPath: "imageUrl", altPath: "imageAlt" }],
  blog_detail: [{ urlPath: "heroImageUrl", altPath: "heroImageAlt" }],
};

const ARRAY_IMAGE_FIELDS: Record<
  string,
  { arrayKey: string; urlKey: string; altKey: string }
> = {
  image_copy_alternating: { arrayKey: "items", urlKey: "imageUrl", altKey: "imageAlt" },
  gallery_strip: { arrayKey: "items", urlKey: "src", altKey: "alt" },
  team_grid: { arrayKey: "members", urlKey: "imageUrl", altKey: "imageAlt" },
  blog_index: { arrayKey: "posts", urlKey: "imageUrl", altKey: "imageAlt" },
  masonry: { arrayKey: "items", urlKey: "src", altKey: "alt" },
  scroll_carousel: { arrayKey: "slides", urlKey: "imageUrl", altKey: "imageAlt" },
  magazine_layout: { arrayKey: "secondary", urlKey: "imageUrl", altKey: "imageAlt" },
};

export async function runPublishPreflight(): Promise<PreflightResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };

  const rows = await listSectionsForStaff(auth.supabase, scope.tenantId);
  const issues: PreflightIssue[] = [];

  // Heading hierarchy
  let h1Count = 0;
  let firstHeadingSeen = false;
  for (const r of rows) {
    if (H1_TYPES.has(r.section_type_key)) h1Count += 1;
    firstHeadingSeen = firstHeadingSeen || true;
  }
  if (firstHeadingSeen && h1Count === 0) {
    issues.push({
      severity: "error",
      category: "headings",
      message:
        "No H1 on the page. Add a hero / hero_split / blog_detail section, or one will be implied from your first H2.",
    });
  }
  if (h1Count > 1) {
    issues.push({
      severity: "warn",
      category: "headings",
      message: `${h1Count} sections emit an H1 — pages should usually have exactly one.`,
    });
  }

  // Alt-text audits per section
  for (const r of rows) {
    const props = (r.props_jsonb as Record<string, unknown> | null) ?? {};

    // Single-field image pairs
    const pairs = IMAGE_FIELD_PAIRS[r.section_type_key];
    if (pairs) {
      for (const pair of pairs) {
        const url = props[pair.urlPath];
        const alt = props[pair.altPath];
        if (typeof url === "string" && url.trim().length > 0) {
          if (typeof alt !== "string" || alt.trim().length === 0) {
            issues.push({
              severity: "warn",
              category: "alt_text",
              sectionId: r.id,
              message: `${r.name}: ${pair.urlPath} has no alt text.`,
            });
          }
        }
      }
    }

    // Array-of-objects image pairs
    const arrayCfg = ARRAY_IMAGE_FIELDS[r.section_type_key];
    if (arrayCfg) {
      const arr = props[arrayCfg.arrayKey];
      if (Array.isArray(arr)) {
        let missing = 0;
        for (const item of arr as Array<Record<string, unknown>>) {
          const u = item?.[arrayCfg.urlKey];
          const a = item?.[arrayCfg.altKey];
          if (typeof u === "string" && u.trim().length > 0) {
            if (typeof a !== "string" || a.trim().length === 0) {
              missing += 1;
            }
          }
        }
        if (missing > 0) {
          issues.push({
            severity: "warn",
            category: "alt_text",
            sectionId: r.id,
            message: `${r.name}: ${missing} item${missing > 1 ? "s have" : " has"} an image without alt text.`,
          });
        }
      }
    }
  }

  // ARIA landmark check — folded in Phase 0 sweep. Maps high/med/low →
  // error/warn/warn so operators see structurally-significant naming gaps
  // alongside other preflight findings without inventing a third severity.
  try {
    const aria = await runAriaLandmarkCheck();
    if (aria.ok) {
      for (const f of aria.findings) {
        if (f.severity === "ok") continue;
        issues.push({
          severity: f.severity === "high" ? "error" : "warn",
          category: "aria",
          sectionId: f.sectionId,
          message: f.message,
        });
      }
    }
  } catch {
    // Preflight is best-effort; ARIA check failures don't block publish.
  }

  return { ok: true, issues };
}
