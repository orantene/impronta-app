/**
 * template-import.ts (A4) — zod-validated portable template importer.
 *
 * `parsePortableTemplate(json)` validates an unknown value against the
 * PortableTemplate schema produced by A3's `toPortableTemplateJson` / download.
 * Returns a discriminated ok/error result so callers can show the exact reason
 * for rejection inline (admin-edit-UX bar).
 *
 * `buildImportDraftInput(parsed, newSlug)` maps a validated PortableTemplate
 * plus a collision-safe slug (minted by the caller via `mintCopySlug`) into a
 * `CreateTemplateDraftInput` ready to pass to `createTemplateDraft`.
 *
 * PURE — no I/O, no server imports.  The DB round-trip that feeds
 * `existingSlugs` for collision avoidance, and the `createTemplateDraft` call,
 * live in the UI component so this module stays independently unit-testable.
 *
 * Rejection reasons (explicit, shown in the UI):
 *   - Missing required fields (kind, title, slug, category, gallery_tab, …)
 *   - Unknown `kind` value (not in the BuilderTemplateKind union)
 *   - Unknown `gallery_tab` value (not in the BuilderGalleryTab union)
 *   - Oversized builder_tree (> MAX_TREE_NODES nodes)
 *   - JSON parse failure (handled by the caller before calling this function)
 */

import { z } from "zod";
import type { CreateTemplateDraftInput } from "@/lib/site-admin/builder-core/templates/registry-rows";

// ── Limits ────────────────────────────────────────────────────────────────────

/**
 * Maximum number of nodes allowed in an imported builder_tree.
 * Mirrors the practical ceiling for a single page template; oversized trees
 * are rejected with a clear reason rather than silently truncated.
 */
export const MAX_IMPORT_TREE_NODES = 2_000;

// ── Zod schema ────────────────────────────────────────────────────────────────

/**
 * All valid BuilderTemplateKind values — kept in sync with registry-rows.ts.
 * Listed explicitly so zod can surface the exact invalid value in the error.
 */
const BUILDER_TEMPLATE_KIND_VALUES = [
  "element",
  "section",
  "connected",
  "page_template",
  "starter_kit",
  "shell_header",
  "shell_footer",
] as const;

/**
 * All valid BuilderGalleryTab values — kept in sync with registry-rows.ts.
 */
const BUILDER_GALLERY_TAB_VALUES = [
  "sections",
  "elements",
  "connected",
  "page_templates",
  "shell",
] as const;

/**
 * All valid BuilderTemplateTarget values.
 */
const BUILDER_TEMPLATE_TARGET_VALUES = [
  "talent",
  "workspace",
  "both",
  "platform",
] as const;

/**
 * All valid required_plan values.
 */
const REQUIRED_PLAN_VALUES = [
  "free",
  "studio",
  "agency",
  "network",
] as const;

/**
 * Zod schema for the PortableTemplate shape produced by A3's
 * `toPortableTemplateJson`.  Uses the same field set as PORTABLE_TEMPLATE_KEYS.
 *
 * We are deliberately lenient on `builder_tree` elements (z.record + z.unknown)
 * so that future BuilderNode fields do not break imports of older exports.
 * The `MAX_IMPORT_TREE_NODES` limit is enforced in the refine step.
 */
export const portableTemplateSchema = z.object({
  kind: z.enum(BUILDER_TEMPLATE_KIND_VALUES, {
    errorMap: (issue, ctx) => {
      if (issue.code === "invalid_enum_value") {
        return {
          message: `Unknown kind "${String(ctx.data)}" — must be one of: ${BUILDER_TEMPLATE_KIND_VALUES.join(", ")}`,
        };
      }
      return { message: ctx.defaultError };
    },
  }),
  title: z
    .string({ required_error: "title is required" })
    .min(1, "title must not be empty"),
  slug: z
    .string({ required_error: "slug is required" })
    .min(1, "slug must not be empty"),
  description: z.string().nullable(),
  category: z
    .string({ required_error: "category is required" })
    .min(1, "category must not be empty"),
  gallery_tab: z.enum(BUILDER_GALLERY_TAB_VALUES, {
    errorMap: (issue, ctx) => {
      if (issue.code === "invalid_enum_value") {
        return {
          message: `Unknown gallery_tab "${String(ctx.data)}" — must be one of: ${BUILDER_GALLERY_TAB_VALUES.join(", ")}`,
        };
      }
      return { message: ctx.defaultError };
    },
  }),
  target_context: z.enum(BUILDER_TEMPLATE_TARGET_VALUES),
  required_plan: z.enum(REQUIRED_PLAN_VALUES),
  tags: z.array(z.string()),
  theme_tokens: z.record(z.string(), z.unknown()).nullable(),
  builder_tree: z
    .array(z.record(z.string(), z.unknown()))
    .refine(
      (tree) => tree.length <= MAX_IMPORT_TREE_NODES,
      (tree) => ({
        message: `builder_tree is too large (${tree.length} nodes, max ${MAX_IMPORT_TREE_NODES})`,
      }),
    ),
  schema_version: z.number().int().positive(),
});

/** The validated portable template shape (output of the schema). */
export type ParsedPortableTemplate = z.output<typeof portableTemplateSchema>;

// ── Parse result ──────────────────────────────────────────────────────────────

export type ParsePortableTemplateResult =
  | { ok: true; data: ParsedPortableTemplate }
  | { ok: false; error: string };

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Validate an unknown value against the PortableTemplate schema.
 *
 * Returns `{ ok: true, data }` on success or `{ ok: false, error }` with a
 * human-readable rejection reason on failure. The reason is suitable for
 * display in the admin UI (admin-edit-UX bar). PURE — no I/O.
 */
export function parsePortableTemplate(
  json: unknown,
): ParsePortableTemplateResult {
  const result = portableTemplateSchema.safeParse(json);

  if (result.success) {
    return { ok: true, data: result.data };
  }

  // Surface the first (most specific) error message so the admin knows exactly
  // what to fix. Zod's flatten() groups by path; we prefer the first issue
  // ordered by path depth for readability.
  const issues = result.error.issues;
  const first = issues[0];

  let reason: string;
  if (first) {
    const path = first.path.join(".");
    reason = path ? `${path}: ${first.message}` : first.message;
  } else {
    reason = "Invalid template file — could not parse.";
  }

  return { ok: false, error: reason };
}

/**
 * Map a validated `ParsedPortableTemplate` + a collision-safe `newSlug` (minted
 * by the caller via `mintCopySlug`) into a `CreateTemplateDraftInput` ready to
 * pass directly to `createTemplateDraft`.
 *
 * The original slug from the exported file is used as the TITLE (preserved
 * as-is); the `newSlug` is the collision-safe DB slug (which may be the
 * original or a `-copy` variant). PURE — no I/O.
 */
export function buildImportDraftInput(
  parsed: ParsedPortableTemplate,
  newSlug: string,
): CreateTemplateDraftInput {
  return {
    kind: parsed.kind,
    title: parsed.title,
    slug: newSlug,
    description: parsed.description ?? null,
    category: parsed.category,
    gallery_tab: parsed.gallery_tab,
    target_context: parsed.target_context,
    required_plan: parsed.required_plan,
    tags: [...parsed.tags],
    theme_tokens: parsed.theme_tokens ?? null,
    // Cast needed: the zod schema uses z.record(z.string(), z.unknown()) for
    // builder_tree items (intentionally loose for forward-compat); the registry
    // action types the tree as BuilderNode[]. The shape is structurally
    // compatible; the cast is safe because createTemplateDraft re-validates via
    // computeDataBindingRequirements before persisting.
    builder_tree: parsed.builder_tree as CreateTemplateDraftInput["builder_tree"],
  };
}
