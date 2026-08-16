#!/usr/bin/env node
/**
 * gen-shell-variant-seed.mjs — regenerate the shell-variant seed migration from
 * `src/lib/site-admin/builder-core/templates/shell-variant-seeds.ts`.
 *
 * WHY GENERATE INSTEAD OF HAND-WRITING THE SQL
 * --------------------------------------------------------------------------
 * The six templates' payloads are `BuilderNode[]` trees of 20-60 nodes each. As
 * hand-written JSONB literals they would be unreviewable and untypeable: a
 * misspelled node `kind` or a prop the renderer does not read produces valid
 * JSON, a green migration, and a variant that renders as an empty band. Written
 * in TypeScript they are type-checked against `BuilderNode` and covered by
 * `shell-variant-seeds.test.ts`.
 *
 * Deterministic: node ids are derived from the template slug, so re-running
 * this on unchanged sources rewrites the file byte-for-byte. That makes "did
 * anyone hand-edit the migration?" a `git diff` away.
 *
 *   node scripts/gen-shell-variant-seed.mjs <migration-path>
 *
 * The migration is idempotent (`ON CONFLICT (kind, slug) DO UPDATE`), so it can
 * also be re-run to push a design revision without minting new rows.
 */

import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const target = process.argv[2];
if (!target) {
  console.error("usage: node scripts/gen-shell-variant-seed.mjs <migration-path>");
  process.exit(1);
}

// `tsx` is a devDependency already used by every test lane. Running this script
// UNDER tsx (`npx tsx scripts/gen-shell-variant-seed.mjs`) is what lets it
// import the TypeScript seed module directly instead of duplicating six trees
// in JavaScript. Fail loudly rather than half-work if it was run under bare
// node: the TS import would throw an opaque syntax error several frames later.
const seedModuleUrl = pathToFileURL(
  path.resolve("src/lib/site-admin/builder-core/templates/shell-variant-seeds.ts"),
).href;

let SHELL_VARIANT_SEEDS;
let buildShellVariantTree;
try {
  ({ SHELL_VARIANT_SEEDS, buildShellVariantTree } = await import(seedModuleUrl));
} catch (error) {
  console.error(
    "Could not load the TypeScript seed module. Run this under tsx:\n" +
      "  npx tsx scripts/gen-shell-variant-seed.mjs <migration-path>\n",
  );
  throw error;
}

/** Single-quote escape for a SQL string literal. */
const q = (value) => `'${String(value).replace(/'/g, "''")}'`;
/** A JSONB literal from a JS value. */
const jsonb = (value) => `${q(JSON.stringify(value))}::jsonb`;
/** A text[] literal. */
const textArray = (values) =>
  `ARRAY[${values.map((v) => q(v)).join(", ")}]::text[]`;

const rows = SHELL_VARIANT_SEEDS.map((seed, index) => {
  const tree = buildShellVariantTree(seed);
  return `  (
    ${q(seed.kind)}::public.builder_template_kind,
    'published'::public.builder_template_status,
    'workspace'::public.builder_template_target,
    ${q(seed.title)},
    ${q(seed.slug)},
    ${q(seed.description)},
    ${q(seed.category)},
    'shell',
    ${textArray(seed.tags)},
    ${q(seed.previewImageUrl)},
    'free',
    ${jsonb(tree)},
    -- Stepped so the gallery's default \`ORDER BY updated_at DESC\` presents the
    -- six in the authored order (headers first, then footers) rather than in
    -- whatever order the INSERT happened to commit.
    now() - interval '${index} seconds'
  )`;
}).join(",\n");

const sql = `-- Shell header / footer VARIANT GALLERY — the six platform-authored templates.
--
-- GENERATED FILE. Do not hand-edit.
--   Source: web/src/lib/site-admin/builder-core/templates/shell-variant-seeds.ts
--   Regenerate: node scripts/gen-shell-variant-seed.mjs <this-file>
--
-- WHAT THIS SHIPS
-- ============================================================================
-- 1. \`builder_templates.preview_image_url\` — a card thumbnail served straight
--    from the app (\`/builder-previews/*.svg\`).
--
--    The table already had \`thumbnail_asset_id\` / \`hero_asset_id\`, both FKs to
--    \`media_assets\`. Those work for a template DONATED from a workspace, which
--    owns its media. A PLATFORM-authored template belongs to no tenant, so it
--    can own no media asset and those two columns have nothing to point at —
--    which is why all six would otherwise render the generic SVG wireframe.
--    Nullable and additive: every existing row is unaffected, and the resolver
--    still falls back to the asset ids when this is null.
--
-- 2. Six published shell templates: three \`shell_header\`, three \`shell_footer\`.
--    Payload is a freeform \`builder_tree\`; applying one REPLACES the target
--    landmark's children via \`applyShellTemplateToTree\` and preserves the other
--    landmark. Every colour in every tree is a theme token with a literal
--    fallback, so a variant adopts the tenant's brand rather than carrying one.
--
-- IDEMPOTENT: \`ON CONFLICT (kind, slug) DO UPDATE\` refreshes the design in
-- place, so a later revision is a re-run rather than a second row.
--
-- REQUIRED PLAN: the rows are \`free\` — plan gating for a shell REPLACE is
-- enforced in the action (\`isShellVariantApplyAllowedForPlan\`, agency+), not by
-- hiding the cards. Free/studio operators can see what the tier buys.

BEGIN;

-- ── 1. preview_image_url ─────────────────────────────────────────────────────

ALTER TABLE public.builder_templates
  ADD COLUMN IF NOT EXISTS preview_image_url text;

COMMENT ON COLUMN public.builder_templates.preview_image_url
  IS 'Gallery-card thumbnail served by the app (/builder-previews/…) or an https URL. Takes priority over thumbnail_asset_id / hero_asset_id. Used by platform-authored templates, which own no media_assets row.';

-- ── 2. the six variants ──────────────────────────────────────────────────────

INSERT INTO public.builder_templates (
  kind,
  status,
  target_context,
  title,
  slug,
  description,
  category,
  gallery_tab,
  tags,
  preview_image_url,
  required_plan,
  builder_tree,
  updated_at
)
VALUES
${rows}
ON CONFLICT (kind, slug) DO UPDATE SET
  status            = EXCLUDED.status,
  target_context    = EXCLUDED.target_context,
  title             = EXCLUDED.title,
  description       = EXCLUDED.description,
  category          = EXCLUDED.category,
  gallery_tab       = EXCLUDED.gallery_tab,
  tags              = EXCLUDED.tags,
  preview_image_url = EXCLUDED.preview_image_url,
  required_plan     = EXCLUDED.required_plan,
  builder_tree      = EXCLUDED.builder_tree,
  -- Bump the version so any cache keyed on it invalidates; \`published_at\` is
  -- set on first publish only, so a design revision does not rewrite history.
  version           = public.builder_templates.version + 1,
  updated_at        = EXCLUDED.updated_at;

UPDATE public.builder_templates
   SET published_at = COALESCE(published_at, now())
 WHERE gallery_tab = 'shell'
   AND status = 'published'
   AND published_at IS NULL;

COMMIT;
`;

writeFileSync(target, sql);
console.log(
  `wrote ${target} (${SHELL_VARIANT_SEEDS.length} variants, ${sql.length} bytes)`,
);
