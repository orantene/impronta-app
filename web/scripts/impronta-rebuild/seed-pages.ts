/**
 * seed-pages.ts — idempotent seeder for the 14 Impronta rebuild pages.
 *
 * SAFETY NOTES — READ BEFORE RUNNING
 * ─────────────────────────────────────
 *  1. NOBODY MAY BE IN THE PAGE EDITOR WHILE THIS RUNS. The editor's autosave
 *     uses a compare-and-swap on `cms_pages.version` / `updated_at`; a direct
 *     SQL-level UPDATE from this script races that CAS and can silently
 *     clobber (or be clobbered by) whatever the editor was about to save.
 *     Confirm with the team before running against a tenant anyone might have
 *     open.
 *  2. THIS WRITES THROUGH SUPABASE DIRECTLY, NOT THROUGH THE APP. It bypasses
 *     every Next.js cache tag the normal publish path busts
 *     (`revalidateTag`/`revalidatePath` for the pages cache). After a real
 *     (non-dry-run) apply, the INTEGRATOR MUST bust the pages cache tag (see
 *     `web/src/lib/site-admin/server/*publish*` for the tag names) or the
 *     storefront keeps serving stale content until the tag's natural TTL.
 *  3. Dry-run is the DEFAULT. Nothing is written unless `--apply` is passed.
 *  4. `home` is special: see {@link applyHomeInPlaceGuard} — this script
 *     never deletes/recreates the home page row, and never downgrades it from
 *     `published` to `draft`, no matter what the page module says, unless
 *     `--allow-home-status-downgrade` is explicitly passed.
 *
 * THE PAGE MODULE CONTRACT
 * ───────────────────────────
 * W4a/W4b each write one file per page under `./pages/<name>.ts`. This file
 * does not import them statically (they don't exist yet in this worktree) —
 * it dynamically imports each expected filename at run time and skips (with a
 * warning, not an abort) any that are missing. Each module must export either
 * a named `PAGE` or a `default` export matching {@link ImprontaPageModule}:
 *
 *   export const PAGE: ImprontaPageModule = {
 *     slug: "about",                 // -> cms_pages.slug (see effectiveSlug below)
 *     title: "About Impronta",       // -> cms_pages.title
 *     blocks: [ ...BuilderNode[] ],  // -> cms_pages.blocks, validated before write
 *     seo: {
 *       metaTitle: "...",
 *       metaDescription: "...",
 *       ogTitle: "...",
 *       ogDescription: "...",
 *       ogImageUrl: IMAGE_SLOT("about-og"),   // may be a slot token too
 *       canonicalPath: "/about",              // optional; default is `/p/<slug>`
 *       noindex: false,
 *       includeInSitemap: true,               // optional; default true
 *       jsonLd: { "@context": "https://schema.org", ... }, // optional
 *     },
 *   };
 *
 * Any `src`-shaped prop inside `blocks` (an `image` node's `props.src`, a
 * container's `props.backgroundMedia.src`, ...) may be
 * `IMAGE_SLOT("some-name")` from `media-curation.ts` instead of a real URL —
 * this script resolves every slot against the tenant's media library before
 * validating or writing anything. See `media-curation.ts`'s header for the
 * full contract and the pinning mechanism.
 *
 * The integrator reconciles this contract against whatever W4a/W4b actually
 * exported (rename the export, adjust field names) — that reconciliation is
 * expected to be a small, mechanical diff, not a rewrite of this file.
 *
 * CLI USAGE (run from `web/`)
 * ──────────────────────────────
 *   # Preview only — the default, writes nothing:
 *   IMPRONTA_SEED_TENANT_SLUG=impronta npx tsx scripts/impronta-rebuild/seed-pages.ts
 *
 *   # Seed everything for real:
 *   IMPRONTA_SEED_TENANT_SLUG=impronta npx tsx scripts/impronta-rebuild/seed-pages.ts --apply
 *
 *   # Just one page, at a shadow slug, so the live page is untouched:
 *   IMPRONTA_SEED_TENANT_SLUG=impronta npx tsx scripts/impronta-rebuild/seed-pages.ts \
 *     --apply --only=about --slug-suffix=-new
 *
 *   # Tenant by id instead of slug:
 *   IMPRONTA_SEED_TENANT_ID=<uuid> npx tsx scripts/impronta-rebuild/seed-pages.ts --apply
 *
 * Flags:
 *   --apply                          Actually write. Omit (or pass --dry-run) to preview only.
 *   --dry-run                        Explicit no-op flag; conflicts with --apply.
 *   --only=slug-a,slug-b             Restrict to these page-module slugs (comma-separated).
 *   --slug-suffix=-new                Append this suffix to every effective DB slug.
 *   --allow-home-status-downgrade    Let the home page's write set status to draft. Dangerous.
 *   --pins=<path>                    Override the image-slots.json path (default: ./image-slots.json).
 *
 * Required env: IMPRONTA_SEED_TENANT_ID or IMPRONTA_SEED_TENANT_SLUG. The
 * script refuses to run without one — there is no "just pick the first
 * tenant" fallback, on purpose.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { BuilderNode, BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";

import {
  DEFAULT_IMAGE_SLOT_PINS_PATH,
  IMAGE_SLOT,
  applyImageSlotResolution,
  collectImageSlots,
  loadImageSlotPins,
  resolveImageSlots,
  resolveSingleImageSlotValue,
  type ImageSlotPinFile,
} from "./media-curation";

export { IMAGE_SLOT };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// The page module contract
// ---------------------------------------------------------------------------

export interface ImprontaPageSeo {
  metaTitle?: string;
  metaDescription?: string;
  ogTitle?: string;
  ogDescription?: string;
  /** May be an IMAGE_SLOT(...) token; resolved the same way as tree image props. */
  ogImageUrl?: string;
  /** Overrides the default canonical `/p/<effectiveSlug>`. Must start with "/" when provided. */
  canonicalPath?: string;
  noindex?: boolean;
  /** Defaults to `true` when omitted. cms_pages.include_in_sitemap itself
   *  defaults to FALSE at the DB layer, so this script always writes the
   *  column explicitly — see buildCmsPageUpsertPayload. */
  includeInSitemap?: boolean;
  /** schema.org JSON-LD (object or array). Written to cms_pages.json_ld
   *  verbatim ONLY when provided — omitting it leaves any existing value on
   *  an update untouched rather than clobbering it with null. */
  jsonLd?: unknown;
}

export interface ImprontaPageModule {
  /** cms_pages.slug (pre slug-suffix). No leading/trailing slash, no locale prefix. */
  slug: string;
  /** cms_pages.title */
  title: string;
  /** The BuilderNode[] tree. May contain IMAGE_SLOT(...) tokens — see the module header. */
  blocks: BuilderNodeTree;
  seo: ImprontaPageSeo;
}

/** Filenames (no extension) this seeder expects under `./pages/`. Matches the
 *  14-page rebuild scope: 9 from W4a, 5 from W4b. A missing file is a
 *  skip-with-warning, not an abort — the pages are being written in parallel. */
export const EXPECTED_PAGE_MODULE_FILES: readonly string[] = [
  "home",
  "about",
  "contact",
  "for-clients",
  "become-a-model",
  "faq",
  "terms",
  "privacy",
  "404",
  "fashion-models",
  "hosts-promoters",
  "performers",
  "music-djs",
  "chefs-culinary",
];

// ---------------------------------------------------------------------------
// Pure helpers — payload building, the home guard, node counting
// ---------------------------------------------------------------------------

/** The subset of cms_pages columns this script ever writes. */
export interface CmsPageWritePayload {
  tenant_id: string;
  locale: "en";
  slug: string;
  title: string;
  status: "draft" | "published";
  is_freeform: true;
  blocks: unknown;
  meta_title: string | null;
  meta_description: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
  canonical_url: string;
  noindex: boolean;
  include_in_sitemap: boolean;
  json_ld?: unknown;
}

export interface BuildUpsertPayloadOptions {
  tenantId: string;
  effectiveSlug: string;
  resolvedBlocks: unknown;
  resolvedOgImageUrl?: string;
  /** Set by {@link applyHomeInPlaceGuard} to force-keep an already-published home page published. */
  statusOverride?: "published";
}

export function buildCmsPageUpsertPayload(
  page: Pick<ImprontaPageModule, "title" | "seo">,
  opts: BuildUpsertPayloadOptions,
): CmsPageWritePayload {
  const seo = page.seo ?? {};
  const canonicalUrl = seo.canonicalPath ?? `/p/${opts.effectiveSlug}`;
  const payload: CmsPageWritePayload = {
    tenant_id: opts.tenantId,
    locale: "en",
    slug: opts.effectiveSlug,
    title: page.title,
    status: opts.statusOverride ?? "draft",
    is_freeform: true,
    blocks: opts.resolvedBlocks,
    meta_title: seo.metaTitle ?? null,
    meta_description: seo.metaDescription ?? null,
    og_title: seo.ogTitle ?? null,
    og_description: seo.ogDescription ?? null,
    og_image_url: opts.resolvedOgImageUrl ?? null,
    canonical_url: canonicalUrl,
    noindex: seo.noindex ?? false,
    include_in_sitemap: seo.includeInSitemap ?? true,
  };
  if (seo.jsonLd !== undefined) payload.json_ld = seo.jsonLd;
  return payload;
}

/** Minimal shape of an existing cms_pages row this script needs to reason about. */
export interface ExistingCmsPageRow {
  id: string;
  status: "draft" | "published" | "archived";
  slug: string;
}

/**
 * The home-in-place guard. `home` is not a fresh rebuild page — it already
 * exists, is live, and holds the tenant's `home` page role. This function
 * NEVER causes a delete/recreate (that's enforced structurally in
 * {@link runSeed}, which only ever UPDATEs an existing row's `id` or INSERTs
 * a brand new one); its only job is to say whether the write about to happen
 * must keep `status: "published"` instead of the seeder's normal `draft`
 * default.
 *
 * Returns `"published"` (an override buildCmsPageUpsertPayload must honor)
 * exactly when: the effective slug is literally `home`, a row already exists
 * there, that row is currently published, and the caller has not passed
 * `--allow-home-status-downgrade`. Returns `undefined` in every other case
 * (including: slug isn't home, no existing row, existing row isn't published
 * yet, or the downgrade was explicitly allowed) — meaning "no override, let
 * the normal draft default apply."
 */
export function applyHomeInPlaceGuard(
  effectiveSlug: string,
  existing: ExistingCmsPageRow | null,
  options: { allowHomeStatusDowngrade: boolean },
): "published" | undefined {
  if (effectiveSlug !== "home") return undefined;
  if (!existing) return undefined;
  if (existing.status !== "published") return undefined;
  if (options.allowHomeStatusDowngrade) return undefined;
  return "published";
}

export function countBuilderNodes(tree: unknown): number {
  if (Array.isArray(tree)) {
    return tree.reduce((sum: number, node) => sum + countBuilderNodes(node), 0);
  }
  if (tree && typeof tree === "object" && "kind" in tree) {
    const node = tree as { children?: unknown };
    return 1 + (Array.isArray(node.children) ? countBuilderNodes(node.children) : 0);
  }
  return 0;
}

function seoFieldsSet(payload: CmsPageWritePayload): string[] {
  const fields: string[] = [];
  if (payload.meta_title) fields.push("meta_title");
  if (payload.meta_description) fields.push("meta_description");
  if (payload.og_title) fields.push("og_title");
  if (payload.og_description) fields.push("og_description");
  if (payload.og_image_url) fields.push("og_image_url");
  fields.push("canonical_url"); // always set
  if (payload.noindex) fields.push("noindex");
  fields.push("include_in_sitemap"); // always set explicitly
  if ("json_ld" in payload) fields.push("json_ld");
  return fields;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export interface RunSeedOptions {
  tenantId: string;
  dryRun: boolean;
  only?: readonly string[];
  slugSuffix?: string;
  allowHomeStatusDowngrade?: boolean;
  pins?: ImageSlotPinFile;
}

export interface PageOutcome {
  slug: string;
  effectiveSlug: string;
  action: "insert" | "update" | "skip";
  nodeCount: number;
  seoFields: string[];
  note?: string;
}

export interface RunSeedResult {
  outcomes: PageOutcome[];
  aborted: boolean;
  abortReason?: string;
  imageSlotReport: string;
}

/**
 * Load, resolve, validate, and (unless dryRun) write every page in `pages`.
 * Aborts the ENTIRE run — no partial writes — if any tree fails validation or
 * any image slot cannot be resolved at all. Never issues a DELETE.
 */
export async function runSeed(
  supabase: SupabaseClient,
  pages: readonly ImprontaPageModule[],
  options: RunSeedOptions,
): Promise<RunSeedResult> {
  const filtered = options.only
    ? pages.filter((p) => options.only!.includes(p.slug))
    : pages;

  const pins = options.pins ?? loadImageSlotPins();

  // One batched slot collection + resolution across every page in this run —
  // one report, one read of the media library, not N of each.
  const allSlots = new Set<string>();
  for (const page of filtered) {
    for (const slot of collectImageSlots(page.blocks)) allSlots.add(slot);
    for (const slot of collectImageSlots(page.seo?.ogImageUrl)) allSlots.add(slot);
  }

  const slotResolution = await resolveImageSlots(supabase, options.tenantId, [...allSlots], pins);

  if (slotResolution.unresolvedSlots.length > 0) {
    return {
      outcomes: [],
      aborted: true,
      abortReason: `${slotResolution.unresolvedSlots.length} image slot(s) could not be resolved (no pin, no fallback image available): ${slotResolution.unresolvedSlots.join(", ")}`,
      imageSlotReport: slotResolution.report,
    };
  }

  // Resolve + validate every page BEFORE writing any of them.
  type Prepared = {
    page: ImprontaPageModule;
    effectiveSlug: string;
    validatedBlocks: BuilderNodeTree;
    resolvedOgImageUrl?: string;
  };
  const prepared: Prepared[] = [];
  const validationFailures: string[] = [];

  for (const page of filtered) {
    const { tree: resolvedBlocks, unresolvedTokens } = applyImageSlotResolution(
      page.blocks,
      slotResolution.resolved,
    );
    if (unresolvedTokens.length > 0) {
      // Should be unreachable — resolveImageSlots already aborted on any
      // globally-unresolvable slot — but a page-scoped guard costs nothing.
      validationFailures.push(
        `${page.slug}: unresolved image slot token(s) survived resolution: ${unresolvedTokens.join(", ")}`,
      );
      continue;
    }

    const result = validateBuilderNodeTree(resolvedBlocks);
    if (!result.ok) {
      const issueList = result.issues.map((issue) => `  - [${issue.path}] ${issue.message}`).join("\n");
      validationFailures.push(`${page.slug}: tree failed validation:\n${issueList}`);
      continue;
    }

    const { value: resolvedOgImageUrl, unresolvedToken } = resolveSingleImageSlotValue(
      page.seo?.ogImageUrl,
      slotResolution.resolved,
    );
    if (unresolvedToken) {
      validationFailures.push(`${page.slug}: seo.ogImageUrl slot "${unresolvedToken}" did not resolve.`);
      continue;
    }

    const effectiveSlug = options.slugSuffix ? `${page.slug}${options.slugSuffix}` : page.slug;
    prepared.push({ page, effectiveSlug, validatedBlocks: result.tree, resolvedOgImageUrl });
  }

  if (validationFailures.length > 0) {
    return {
      outcomes: [],
      aborted: true,
      abortReason: `${validationFailures.length} page(s) failed validation — aborting the whole run, nothing was written:\n${validationFailures.join("\n")}`,
      imageSlotReport: slotResolution.report,
    };
  }

  const outcomes: PageOutcome[] = [];

  for (const item of prepared) {
    const { data: existingRaw, error: readError } = await supabase
      .from("cms_pages")
      .select("id, status, slug")
      .eq("tenant_id", options.tenantId)
      .eq("locale", "en")
      .eq("slug", item.effectiveSlug)
      .maybeSingle();

    if (readError) {
      return {
        outcomes,
        aborted: true,
        abortReason: `Failed to read existing cms_pages row for slug "${item.effectiveSlug}": ${readError.message}`,
        imageSlotReport: slotResolution.report,
      };
    }

    const existing = existingRaw as ExistingCmsPageRow | null;
    const statusOverride = applyHomeInPlaceGuard(item.effectiveSlug, existing, {
      allowHomeStatusDowngrade: options.allowHomeStatusDowngrade ?? false,
    });

    const payload = buildCmsPageUpsertPayload(item.page, {
      tenantId: options.tenantId,
      effectiveSlug: item.effectiveSlug,
      resolvedBlocks: item.validatedBlocks,
      resolvedOgImageUrl: item.resolvedOgImageUrl,
      statusOverride,
    });

    const action: PageOutcome["action"] = existing ? "update" : "insert";

    if (!options.dryRun) {
      if (existing) {
        // UPDATE by id — never delete/recreate, home or otherwise.
        const { error: writeError } = await supabase.from("cms_pages").update(payload).eq("id", existing.id);
        if (writeError) {
          return {
            outcomes,
            aborted: true,
            abortReason: `Write failed for slug "${item.effectiveSlug}" (update): ${writeError.message}`,
            imageSlotReport: slotResolution.report,
          };
        }
      } else {
        const { error: writeError } = await supabase.from("cms_pages").insert(payload);
        if (writeError) {
          return {
            outcomes,
            aborted: true,
            abortReason: `Write failed for slug "${item.effectiveSlug}" (insert): ${writeError.message}`,
            imageSlotReport: slotResolution.report,
          };
        }
      }
    }

    outcomes.push({
      slug: item.page.slug,
      effectiveSlug: item.effectiveSlug,
      action,
      nodeCount: countBuilderNodes(item.validatedBlocks),
      seoFields: seoFieldsSet(payload),
      note:
        item.effectiveSlug === "home" && statusOverride === "published"
          ? "home guard: kept status=published"
          : undefined,
    });
  }

  return { outcomes, aborted: false, imageSlotReport: slotResolution.report };
}

export function printSummaryTable(outcomes: readonly PageOutcome[]): void {
  if (outcomes.length === 0) {
    console.log("(no pages processed)");
    return;
  }
  const slugWidth = Math.max(4, ...outcomes.map((o) => o.effectiveSlug.length));
  console.log(`${"SLUG".padEnd(slugWidth)}  ACTION  NODES  SEO FIELDS SET`);
  for (const o of outcomes) {
    const seo = o.seoFields.join(", ") || "(none)";
    const note = o.note ? `  [${o.note}]` : "";
    console.log(`${o.effectiveSlug.padEnd(slugWidth)}  ${o.action.padEnd(6)}  ${String(o.nodeCount).padEnd(5)}  ${seo}${note}`);
  }
}

// ---------------------------------------------------------------------------
// Page module loading (dynamic — files may not exist yet)
// ---------------------------------------------------------------------------

function isImprontaPageModule(value: unknown): value is ImprontaPageModule {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.slug === "string" &&
    v.slug.length > 0 &&
    typeof v.title === "string" &&
    Array.isArray(v.blocks) &&
    typeof v.seo === "object" &&
    v.seo !== null
  );
}

export async function loadPageModules(
  files: readonly string[] = EXPECTED_PAGE_MODULE_FILES,
): Promise<{ pages: ImprontaPageModule[]; warnings: string[] }> {
  const pages: ImprontaPageModule[] = [];
  const warnings: string[] = [];
  for (const file of files) {
    let mod: unknown;
    try {
      mod = await import(`./pages/${file}`);
    } catch {
      warnings.push(`pages/${file}.ts not found yet — skipping.`);
      continue;
    }
    const candidate = (mod as { PAGE?: unknown; default?: unknown }).PAGE ?? (mod as { default?: unknown }).default;
    if (!isImprontaPageModule(candidate)) {
      warnings.push(`pages/${file}.ts does not export a valid PAGE/default ImprontaPageModule — skipping.`);
      continue;
    }
    pages.push(candidate);
  }
  return { pages, warnings };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function resolveTenantId(supabase: SupabaseClient): Promise<string | null> {
  const idEnv = process.env.IMPRONTA_SEED_TENANT_ID?.trim();
  if (idEnv) return idEnv;
  const slugEnv = process.env.IMPRONTA_SEED_TENANT_SLUG?.trim();
  if (!slugEnv) return null;
  const { data, error } = await supabase
    .from("agencies")
    .select("id")
    .eq("slug", slugEnv)
    .maybeSingle<{ id: string }>();
  if (error || !data) return null;
  return data.id;
}

async function main(): Promise<void> {
  const { loadEnvLocal } = await import("../load-env-local.mjs");
  loadEnvLocal();
  const { createClient } = await import("@supabase/supabase-js");

  if (!process.env.IMPRONTA_SEED_TENANT_ID?.trim() && !process.env.IMPRONTA_SEED_TENANT_SLUG?.trim()) {
    console.error(
      "Refusing to run: set IMPRONTA_SEED_TENANT_ID or IMPRONTA_SEED_TENANT_SLUG in the environment. There is no default tenant.",
    );
    process.exitCode = 1;
    return;
  }

  const argv = process.argv.slice(2);
  const flag = (name: string) => argv.includes(`--${name}`);
  const value = (name: string): string | undefined =>
    argv.find((a) => a.startsWith(`--${name}=`))?.slice(`--${name}=`.length);

  const applyWrite = flag("apply");
  const explicitDryRun = flag("dry-run");
  if (applyWrite && explicitDryRun) {
    console.error("Both --apply and --dry-run were passed — ambiguous, refusing to guess. Pick one.");
    process.exitCode = 1;
    return;
  }
  const dryRun = !applyWrite; // dry-run is the default whenever --apply is absent

  const only = value("only")?.split(",").map((s) => s.trim()).filter(Boolean);
  const slugSuffix = value("slug-suffix");
  const allowHomeStatusDowngrade = flag("allow-home-status-downgrade");
  const pinsPath = value("pins") ?? DEFAULT_IMAGE_SLOT_PINS_PATH;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (web/.env.local).");
    process.exitCode = 1;
    return;
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const tenantId = await resolveTenantId(supabase);
  if (!tenantId) {
    console.error("Could not resolve a tenant from IMPRONTA_SEED_TENANT_ID / IMPRONTA_SEED_TENANT_SLUG.");
    process.exitCode = 1;
    return;
  }

  console.log(dryRun ? "DRY RUN — no writes will be made.\n" : "APPLY MODE — writes WILL be made.\n");

  const { pages, warnings: loadWarnings } = await loadPageModules();
  for (const w of loadWarnings) console.warn(`[seed-pages] ${w}`);
  if (pages.length === 0) {
    console.error("No valid page modules found under ./pages — nothing to do.");
    process.exitCode = 1;
    return;
  }

  const pins = loadImageSlotPins(pinsPath);

  const result = await runSeed(supabase, pages, {
    tenantId,
    dryRun,
    only,
    slugSuffix,
    allowHomeStatusDowngrade,
    pins,
  });

  console.log(result.imageSlotReport);
  console.log("");
  printSummaryTable(result.outcomes);

  if (result.aborted) {
    console.error(`\nABORTED — nothing was written. ${result.abortReason ?? ""}`);
    process.exitCode = 1;
    return;
  }

  if (!dryRun) {
    console.log(
      "\nWrites complete. Remember: this bypassed the app's cache-revalidation path — bust the pages cache tag before calling this done.",
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
