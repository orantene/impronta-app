"use server";

/**
 * Phase 10 — publish preflight: heading lint + alt-text audit + image
 * size audit, in one server action so the publish drawer can render a
 * single "ready to publish?" card.
 *
 * Returns `severity: "error"` (blockers) and `"warn"` (advisory). The publish
 * drawer disables **Publish now** while any error-severity issue remains;
 * warnings do not block publish.
 *
 * Phase 0 sweep (2026-04-26) — convergence-plan §1: the previously-orphan
 * `runAriaLandmarkCheck` action is now folded in here so its findings reach
 * an actual UI surface. Previously-unused AI helper actions
 * (`suggestLayoutImprovement`, `loadAiUsageSummary`) were removed in 2026-05
 * to clear orphan server actions; reinstate from history when a real UI
 * surface ships (post-v1 AI / usage dashboard).
 */

import { requireSession } from "@/lib/server/action-guards";
import { requireEditSurfaceTenantScope } from "@/lib/saas";
import { listSectionsForStaff } from "@/lib/site-admin/server/sections-reads";
import { runAriaLandmarkCheck } from "./aria-landmark-action";
import { cleanSectionName } from "@/lib/site-admin/clean-section-name";
import { validateSectionProps } from "@/lib/site-admin/forms/sections";
import {
  findInvalidInquiryCtas,
  isSectionHidden,
} from "./publish-preflight-rules";
import {
  classifyCanonicalIssue,
  classifyHrefIssue,
  collectLinkCandidates,
} from "./publish-preflight-link-rules";
import {
  collectBreakpointCascadeRisks,
  collectBreakpointOrderRisks,
  collectBreakpointVisibilityRisks,
  collectLayoutOverflowRisks,
  isLayoutOverflowRiskBlocking,
} from "./publish-preflight-layout-rules";
import { featuredTalentSchemaV1 } from "@/lib/site-admin/sections/featured_talent/schema";
import { fetchFeaturedTalentForSection } from "@/lib/site-admin/sections/featured_talent/fetch";
import { DEFAULT_PLATFORM_LOCALE } from "@/lib/site-admin";
import {
  isPaidBuilderPlan,
  loadBuilderWorkspacePlan,
} from "@/lib/site-admin/builder-capabilities";
import type { LegacySnapshotSlot } from "@/lib/site-admin/builder-node/snapshot-slot-bridge";
import {
  collectBuilderPerformanceIssues,
  collectBuilderPerformanceMetrics,
  collectBuilderTreeLayoutFindings,
  collectBuilderDataBindingTreeFindings,
  isBlockingLayoutFindingId,
  validateBuilderNodeTree,
} from "@/lib/site-admin/builder-node";
import {
  collectFreePlanPublishNestedViolations,
} from "@/lib/site-admin/builder-node/free-plan-builder-tree-guard";
import { collectMobileOverflowPreflightIssues } from "./publish-preflight-mobile-overflow";
import { isAdvancedElementLibraryEnabledForPlan } from "@/lib/site-admin/builder-node/element-library-policy";
import { resolveSnapshotBuilderTree } from "@/lib/site-admin/builder-node/snapshot-tree";
import type { HomepageSnapshot } from "@/lib/site-admin/server/homepage";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import {
  collectContrastPreflightIssues,
  loadThemeDraftTokens,
} from "./publish-preflight-contrast-rules";

export type PreflightSeverity = "error" | "warn";

export interface PreflightIssue {
  severity: PreflightSeverity;
  category:
    | "headings"
    | "alt_text"
    | "image_size"
    | "aria"
    | "cta"
    | "builder_payload"
    | "featured_talent"
    | "data_binding"
    | "link_integrity"
    | "seo"
    | "layout"
    | "mobile_overflow"
    | "performance";
  /** Optional sectionId for click-to-focus in the drawer. */
  sectionId?: string;
  /**
   * Optional builder node id for node-level click-to-locate in the drawer
   * (W3-M1 mobile overflow blockers point at the exact offending block via
   * `locateCanvasNode`, more precise than the section-level focus).
   */
  nodeId?: string;
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

type PreflightPageContext = {
  id: string;
  version: number;
  canonical_url: string | null;
  noindex: boolean | null;
  publishedCompositionSnapshot: HomepageSnapshot | null;
};

export async function runPublishPreflight(input?: {
  locale?: string;
  /**
   * When the editor is on a non-homepage CMS page, pass that row’s id so draft
   * revision + `published_page_snapshot` participate in builder preflight (including
   * Free nested-node policy). Omit for homepage (resolved via `locale`).
   */
  pageId?: string | null;
  /**
   * homepage keeps the tenant-wide section scan. cms_page / site_shell /
   * talent_page skip it — those scans false-positive against homepage slots.
   */
  surfaceKind?: string | null;
  /** Live canvas tree for surfaces that have no cms_pages revision (talent). */
  builderTree?: unknown;
}): Promise<PreflightResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireEditSurfaceTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };
  const locale = input?.locale?.trim() || DEFAULT_PLATFORM_LOCALE;
  const workspacePlan = await loadBuilderWorkspacePlan(auth.supabase, scope.tenantId, {
    logTag: "publish-preflight",
  });

  let preflightPage: PreflightPageContext | null = null;
  if (input?.pageId) {
    const { data: row } = await auth.supabase
      .from("cms_pages")
      .select(
        "id, version, canonical_url, noindex, published_homepage_snapshot, published_page_snapshot, system_template_key",
      )
      .eq("tenant_id", scope.tenantId)
      .eq("id", input.pageId)
      .maybeSingle<{
        id: string;
        version: number;
        canonical_url: string | null;
        noindex: boolean | null;
        published_homepage_snapshot: HomepageSnapshot | null;
        published_page_snapshot: HomepageSnapshot | null;
        system_template_key: string | null;
      }>();
    if (row) {
      const publishedCompositionSnapshot =
        row.system_template_key === "homepage"
          ? row.published_homepage_snapshot
          : row.published_page_snapshot;
      preflightPage = {
        id: row.id,
        version: row.version,
        canonical_url: row.canonical_url,
        noindex: row.noindex,
        publishedCompositionSnapshot,
      };
    }
  } else {
    const { data: homepageMeta } = await auth.supabase
      .from("cms_pages")
      .select("id, version, canonical_url, noindex, published_homepage_snapshot")
      .eq("tenant_id", scope.tenantId)
      .eq("locale", locale)
      .eq("system_template_key", "homepage")
      .maybeSingle<{
        id: string;
        version: number;
        canonical_url: string | null;
        noindex: boolean | null;
        published_homepage_snapshot: HomepageSnapshot | null;
      }>();
    if (homepageMeta) {
      preflightPage = {
        id: homepageMeta.id,
        version: homepageMeta.version,
        canonical_url: homepageMeta.canonical_url,
        noindex: homepageMeta.noindex,
        publishedCompositionSnapshot: homepageMeta.published_homepage_snapshot,
      };
    }
  }

  const runSectionScans = !input?.surfaceKind || input.surfaceKind === "homepage";
  const rows = runSectionScans
    ? await listSectionsForStaff(auth.supabase, scope.tenantId)
    : [];
  const issues: PreflightIssue[] = [];
  const featuredChecks: Array<Promise<void>> = [];

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
    if (r.status === "archived") continue;
    const props = (r.props_jsonb as Record<string, unknown> | null) ?? {};
    const sectionName = cleanSectionName(r.name) || r.name;

    // Schema drift guard: preflight should surface invalid payloads before the
    // operator gets to "Publish". This catches legacy rows where shape drifted
    // (including malformed nodePresentation) and turns it into an actionable
    // blocking issue.
    const propsValidation = validateSectionProps(
      r.section_type_key,
      r.schema_version,
      props,
    );
    if (!propsValidation.ok) {
      const issueHint =
        propsValidation.issues && propsValidation.issues.length > 0
          ? propsValidation.issues
              .slice(0, 2)
              .map((i) => `${i.path.join(".") || "props"}: ${i.message}`)
              .join("; ")
          : propsValidation.message;
      issues.push({
        severity: "error",
        category: "builder_payload",
        sectionId: r.id,
        message: `${sectionName}: invalid section payload (${propsValidation.code}). ${issueHint}`,
      });
      // Skip secondary checks for payloads that don't parse safely.
      continue;
    }

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
              message: `${cleanSectionName(r.name) || r.name}: missing alt text on ${pair.urlPath}.`,
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
            message: `${sectionName}: ${missing} image${missing > 1 ? "s are" : " is"} missing alt text.`,
          });
        }
      }
    }

    // CTA audit — inquiry-intent labels must point to contact/inquiry destinations.
    for (const message of findInvalidInquiryCtas(sectionName, props)) {
      issues.push({
        severity: "error",
        category: "cta",
        sectionId: r.id,
        message,
      });
    }

    // Generic link integrity audit.
    for (const candidate of collectLinkCandidates(props)) {
      const hrefIssue = classifyHrefIssue(candidate.href);
      if (!hrefIssue) continue;
      issues.push({
        severity: hrefIssue.severity,
        category: "link_integrity",
        sectionId: r.id,
        message: `${sectionName}: ${hrefIssue.message} (${candidate.path})`,
      });
    }

    // Mobile/layout safety audit: long unbroken text can overflow small
    // viewports even when section schema is valid.
    for (const risk of collectLayoutOverflowRisks(props).slice(0, 2)) {
      const preview =
        risk.token.length > 24 ? `${risk.token.slice(0, 24)}…` : risk.token;
      const blocking = isLayoutOverflowRiskBlocking(risk);
      issues.push({
        severity: blocking ? "error" : "warn",
        category: "layout",
        sectionId: r.id,
        message: blocking
          ? `${sectionName}: blocking mobile overflow risk from long unbroken text in ${risk.path} (${risk.length} chars: "${preview}"). Add wraps/spacing or shorten before publish.`
          : `${sectionName}: possible mobile overflow from long unbroken text in ${risk.path} (${risk.length} chars: "${preview}").`,
      });
    }
    for (const risk of collectBreakpointVisibilityRisks(props).slice(0, 1)) {
      issues.push({
        severity: "warn",
        category: "layout",
        sectionId: r.id,
        message: `${sectionName}: content is hidden on ${risk.breakpoint} (${risk.path}). Confirm this is intentional.`,
      });
    }
    for (const risk of collectBreakpointCascadeRisks(props).slice(0, 1)) {
      issues.push({
        severity: "warn",
        category: "layout",
        sectionId: r.id,
        message: `${sectionName}: mobile override "${risk.field}" skips tablet (${risk.path}). Add tablet intent or an explicit mobile reset.`,
      });
    }
    for (const risk of collectBreakpointOrderRisks(props).slice(0, 1)) {
      issues.push({
        severity: "warn",
        category: "layout",
        sectionId: r.id,
        message: `${sectionName}: mobile "${risk.field}" (${risk.mobileValue}) is larger than tablet (${risk.tabletValue}) at ${risk.path}. Confirm breakpoint order intent.`,
      });
    }

    // Featured-talent publish guardrail — if a visible block resolves zero
    // cards, surface an actionable warning before publish.
    if (r.section_type_key === "featured_talent" && !isSectionHidden(props)) {
      const parsed = featuredTalentSchemaV1.safeParse(props);
      if (!parsed.success) {
        issues.push({
          severity: "warn",
          category: "featured_talent",
          sectionId: r.id,
          message: `${sectionName}: featured talent settings are invalid. Open the section and review source filters.`,
        });
      } else {
        featuredChecks.push(
          (async () => {
            const cards = await fetchFeaturedTalentForSection(
              scope.tenantId,
              parsed.data,
              locale,
            );
            if (cards.length === 0) {
              const freePlan = workspacePlan === "free";
              issues.push({
                severity: freePlan ? "error" : "warn",
                category: "featured_talent",
                sectionId: r.id,
                message: freePlan
                  ? `${sectionName}: this visible featured roster block resolves zero public profiles. Free workspaces should publish up to five profiles before going live.`
                  : `${sectionName}: this visible featured roster block resolves zero public profiles. Add/publish roster people or adjust the source filter.`,
              });
            }
          })(),
        );
      }
    }
  }

  await Promise.all(featuredChecks);

  // BuilderTree data-binding guardrails. Section schema validation catches
  // section props; this checks the newer freeform/nested BuilderNode layer
  // before it becomes the published snapshot.
  let builderTree: unknown = Array.isArray(input?.builderTree)
    ? input.builderTree
    : null;
  if (preflightPage?.id && typeof preflightPage.version === "number") {
    const { data: revisionRow } = await auth.supabase
      .from("cms_page_revisions")
      .select("snapshot")
      .eq("tenant_id", scope.tenantId)
      .eq("page_id", preflightPage.id)
      .eq("version", preflightPage.version)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ snapshot: { builderTree?: unknown } | null }>();
    if (
      revisionRow?.snapshot &&
      typeof revisionRow.snapshot === "object" &&
      Array.isArray(revisionRow.snapshot.builderTree)
    ) {
      builderTree = revisionRow.snapshot.builderTree;
    }
  }
  if (builderTree) {
      const validation = validateBuilderNodeTree(builderTree);
      if (!validation.ok) {
        issues.push({
          severity: "error",
          category: "builder_payload",
          message: `Builder tree is invalid: ${validation.issues
            .slice(0, 2)
            .map((issue) => `${issue.path}: ${issue.message}`)
            .join("; ")}`,
        });
      } else {
        for (const finding of collectBuilderPerformanceIssues(
          collectBuilderPerformanceMetrics(validation.tree),
        )) {
          issues.push({
            severity: finding.severity === "error" ? "error" : "warn",
            category: "performance",
            message: `Builder performance: ${finding.message}`,
          });
        }
        for (const finding of collectBuilderDataBindingTreeFindings(validation.tree, {
          workspacePlan,
        })) {
          if (finding.severity === "info") continue;
          issues.push({
            severity: finding.severity === "error" ? "error" : "warn",
            category: "data_binding",
            nodeId: finding.nodeId ?? undefined,
            message: finding.message,
          });
        }
        for (const finding of collectBuilderTreeLayoutFindings(validation.tree)) {
          const blocking = isBlockingLayoutFindingId(finding.id);
          // The node id rides in the STRUCTURED `nodeId` field, not glued onto
          // the message. It used to be prefixed as `container <uuid>: …`, which
          // (a) showed a raw uuid to the operator and (b) made four findings of
          // the SAME problem read as four different messages, so the drawer
          // could not group them. `nodeId` already drives the Locate button.
          issues.push({
            severity: blocking ? "error" : "warn",
            category: "layout",
            sectionId: finding.ownerSectionId ?? undefined,
            nodeId: finding.nodeId ?? undefined,
            message: blocking
              ? `${finding.message} Resolve this layout issue before publish.`
              : finding.message,
          });
        }

        // W3-M1 — mobile horizontal overflow is a publish-BLOCKING error, not a
        // shipped advisory. A block whose resolved fixed width/min-width on the
        // mobile breakpoint exceeds the narrowest viewport (e.g. a
        // `width: 1120px` container inside a ~390px frame) forces a horizontal
        // scrollbar on phones — that page cannot go live until it's fixed. The
        // offending node id rides along so the drawer can point straight at it
        // (and the W3-M3 AI fixer can target it). The softer "likely overflow"
        // heuristics (multi-column grids, non-collapsing splits) stay advisory
        // in MobileHealthPanel and are intentionally NOT promoted here.
        for (const overflowIssue of collectMobileOverflowPreflightIssues(
          validation.tree,
        )) {
          issues.push(overflowIssue);
        }

        // Paid-plan blocks: social_feed is gated to paid workspaces. The Add
        // gallery already refuses the insert on free plans; this is the
        // server-side backstop (a downgraded workspace, an imported tree, or a
        // bypassed client all land here).
        if (!isPaidBuilderPlan(workspacePlan)) {
          const found: string[] = [];
          const walk = (nodes: ReadonlyArray<{ kind: string; children?: unknown }>) => {
            for (const n of nodes) {
              if (n.kind === "social_feed") found.push(n.kind);
              if (Array.isArray((n as { children?: unknown }).children)) {
                walk((n as { children: ReadonlyArray<{ kind: string }> }).children);
              }
            }
          };
          walk(validation.tree as ReadonlyArray<{ kind: string }>);
          if (found.length > 0) {
            issues.push({
              severity: "error",
              category: "builder_payload",
              message: `This page uses ${found.length === 1 ? "a Social feed block" : `${found.length} Social feed blocks`}, which is available on paid plans. Upgrade in Settings, Plan & billing, or remove the block to publish.`,
            });
          }
        }

        if (
          // Pre-launch: the freeform builder is open to all plans, so the
          // nested-composition publish guard only applies where advanced
          // composition is gated. Mirrors the single source flag the client
          // EditContext + server save guard use (currently open for everyone).
          !isAdvancedElementLibraryEnabledForPlan(workspacePlan) &&
          preflightPage?.publishedCompositionSnapshot &&
          Array.isArray(preflightPage.publishedCompositionSnapshot.slots)
        ) {
          const snap = preflightPage.publishedCompositionSnapshot;
          const legacySlots: LegacySnapshotSlot[] = snap.slots.map((s) => ({
            slotKey: s.slotKey,
            sortOrder: s.sortOrder,
            sectionId: s.sectionId,
            sectionTypeKey: s.sectionTypeKey,
            name: s.name,
            props: s.props,
          }));
          const publishedResolved = resolveSnapshotBuilderTree({
            slots: legacySlots,
            builderTree: snap.builderTree,
          });
          const publishedSectionIds = new Set(snap.slots.map((s) => s.sectionId));
          for (const msg of collectFreePlanPublishNestedViolations(
            publishedResolved.tree,
            validation.tree,
            publishedSectionIds,
          )) {
            issues.push({
              severity: "error",
              category: "builder_payload",
              message: msg,
            });
          }
        }
      }
    }

  // SEO baseline audit.
  for (const issue of classifyCanonicalIssue({
    canonicalUrl: preflightPage?.canonical_url ?? null,
    noindex: preflightPage?.noindex ?? false,
  })) {
    issues.push({
      severity: issue.severity,
      category: "seo",
      message: issue.message,
    });
  }

  // Locale completeness guardrail for multi-locale workspaces.
  try {
    const localeSettings = await loadTenantLocaleSettings(scope.tenantId);
    const supportedLocales = localeSettings.supportedLocales ?? [];
    if (supportedLocales.length > 1) {
      const { data: homepageLocales } = await auth.supabase
        .from("cms_pages")
        .select("locale, status, published_homepage_snapshot")
        .eq("tenant_id", scope.tenantId)
        .eq("system_template_key", "homepage")
        .in("locale", supportedLocales);
      const byLocale = new Map(
        (homepageLocales ?? []).map((row) => [row.locale as string, row]),
      );
      const missingPublishedLocales = supportedLocales.filter((supported) => {
        const row = byLocale.get(supported);
        if (!row) return true;
        if (row.status !== "published") return true;
        return row.published_homepage_snapshot == null;
      });
      if (missingPublishedLocales.length > 0) {
        issues.push({
          severity: "warn",
          category: "seo",
          message: `Missing published homepage snapshot for locale${missingPublishedLocales.length > 1 ? "s" : ""}: ${missingPublishedLocales.join(", ")}.`,
        });
      }
    }
  } catch {
    // Locale completeness is best-effort.
  }

  // WS4 — WCAG AA contrast check against the workspace's brand token palette.
  // Advisory only (severity "warn") — a failing palette is a design issue, not
  // a publish blocker. Operators are directed to the Theme drawer to fix.
  //
  // Limitation: this checks *theme-level* token pairs only (the same 5 pairs
  // shown in the ContrastChecker widget inside the Theme Drawer). Per-node
  // background-inheritance resolution (walking the BuilderNode ancestor chain
  // and resolving `token:<key>` sentinels) is not done here because it requires
  // the full CSS cascade to be accurate. That deeper check is tracked as a
  // future enhancement in publish-preflight-contrast-rules.ts.
  try {
    const themeTokens = await loadThemeDraftTokens(auth.supabase, scope.tenantId);
    for (const finding of collectContrastPreflightIssues(themeTokens)) {
      issues.push({
        severity: "warn",
        category: "aria",
        message: finding.message,
      });
    }
  } catch {
    // Contrast check is best-effort; failures don't block publish.
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

  const normalizedIssues = issues.map((issue) => {
    if (issue.category === "alt_text" && issue.severity === "warn") {
      return {
        ...issue,
        severity: "error" as const,
        message: `${issue.message} Add alt text before publishing.`,
      };
    }
    if (
      workspacePlan === "free" &&
      issue.severity === "warn" &&
      (issue.category === "link_integrity" || issue.category === "seo")
    ) {
      return {
        ...issue,
        severity: "error" as const,
        message: `${issue.message} (Free publish policy)`,
      };
    }
    return issue;
  });

  return { ok: true, issues: normalizedIssues };
}
