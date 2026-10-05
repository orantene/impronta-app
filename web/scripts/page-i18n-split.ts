/**
 * page-i18n-split.ts — move a page's base copy into a locale overlay and
 * translate the base from an operator-supplied map.
 *
 *   npx tsx scripts/page-i18n-split.ts --tenant <slug> --page <slug> \
 *       --from <base locale> --to <overlay locale> --map <base-to-primary.json>
 *   … --apply        write the tree (draft revision + publish)
 *   … --dry-run      report only (DEFAULT)
 *
 * The map is `{ "<exact current base text>": "<text in the base locale>" }`.
 * (The Impronta /lumina case that motivated this was applied by another
 * session's one-off, `scripts/impronta-rebuild/pages/lumina-english-overlay.ts`
 * on `work/impronta-language-audit`; this is the reusable, tested form.)
 *
 * THE PROBLEM IT FIXES. A freeform page is ONE design: the base string props
 * are the tenant's primary language, every other language is a per-element
 * overlay (`node.i18n[locale][prop]`, mirrored on `props.i18n`). A page whose
 * base props were authored in the SECONDARY language with an empty overlay
 * therefore shows that language on every locale URL — the primary URL shows
 * it because it IS the base, the secondary URL shows it via fallback.
 *
 * WHAT IT DOES, per translatable string (the same walk the Translations panel
 * uses — `buildOverlayTranslationReport`, so nothing this script cannot see
 * is invisible to the audit either):
 *   1. MOVE: overlay[to][prop] empty → overlay[to][prop] = base. The copy that
 *      was authored in `to` now lives where `to` renders from.
 *   2. TRANSLATE: base still equals overlay[to][prop] (the base has not been
 *      translated yet) and map[base] exists → base = map[base].
 *      Numeral / symbol-only values ("<24h", "01", "100%") are exempt: they
 *      are identical in every language and never counted as unmatched.
 *   3. Anything else that still equals its overlay is UNMATCHED and listed
 *      for the operator to translate in the next round.
 *
 * Idempotent by construction: a second run finds every overlay filled (moves
 * nothing) and every translated base different from its overlay (translates
 * nothing). Strings that are legitimately the same in both languages (a
 * brand name) stay in the unmatched list until the map says so explicitly
 * (`"LUMINA": "LUMINA"`).
 *
 * WRITES go through the editor's own freeform save + publish core
 * (`cms-freeform-publish-core.ts`), so the C1 lock re-assert, the draft
 * normalization gate and the `cms_page_revisions` checkpoints (draft, then
 * published) are exactly what the operator's Save + Publish produce. The
 * tree is strict-validated with `validateBuilderNodeTree` first; an invalid
 * tree is never saved.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

import {
  buildOverlayTranslationReport,
  isNonLinguisticValue,
} from "../src/lib/site-admin/builder-node/translation-status";
import { setOverlayProp } from "../src/lib/site-admin/builder-node/i18n-overlay";
import { validateBuilderNodeTree } from "../src/lib/site-admin/builder-node/validate";
import type { BuilderNode } from "../src/lib/site-admin/builder-node/types";
import {
  publishCmsFreeformPageWithClient,
  saveCmsFreeformPageWithClient,
} from "../src/lib/site-admin/builder-core/adapters/cms-freeform-publish-core";

// ---- pure transform -------------------------------------------------------

export type TranslationMap = Readonly<Record<string, string>>;

export interface SplitChange {
  nodeId: string;
  kind: string;
  prop: string;
  /** Base value before this run. */
  before: string;
  /** Base value after this run (same as `before` when only moved). */
  after: string;
  moved: boolean;
  translated: boolean;
}

export interface SplitReport {
  /** Overlay entries filled from the base this run. */
  moved: number;
  /** Base strings replaced from the map this run. */
  translated: number;
  /** Numeral / symbol-only bases left identical on purpose. */
  numeric: number;
  /** Bases still equal to their overlay with no map entry — the next round. */
  unmatched: string[];
  /** Every prop touched this run, in tree order. */
  changes: SplitChange[];
  /** Translatable strings visited. */
  total: number;
}

export interface SplitResult {
  tree: BuilderNode[];
  report: SplitReport;
}

type Overlay = Record<string, Record<string, string>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read the string at a dotted path under `props` (`items.0.text`). */
function readPath(root: unknown, segments: readonly string[]): string | undefined {
  let cur: unknown = root;
  for (const seg of segments) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = Array.isArray(cur) ? cur[Number(seg)] : (cur as Record<string, unknown>)[seg];
  }
  return typeof cur === "string" ? cur : undefined;
}

/**
 * Immutably set a dotted path that ALREADY resolves to a string, cloning only
 * the containers along it. Never creates structure — mirrors `nested-i18n.ts`.
 */
function writePath<T>(root: T, segments: readonly string[], value: string): T {
  if (readPath(root, segments) === undefined) return root;
  const [head, ...rest] = segments;
  if (head === undefined) return root;
  if (Array.isArray(root)) {
    const idx = Number(head);
    if (!Number.isInteger(idx) || idx < 0 || idx >= root.length) return root;
    const next = [...root];
    next[idx] = rest.length === 0 ? value : writePath(next[idx], rest, value);
    return next as unknown as T;
  }
  if (!isRecord(root)) return root;
  return {
    ...root,
    [head]: rest.length === 0 ? value : writePath(root[head], rest, value),
  } as T;
}

function readOverlay(node: BuilderNode): Overlay | undefined {
  const own = (node as { i18n?: unknown }).i18n;
  if (isRecord(own)) return own as Overlay;
  const fromProps = isRecord(node.props) ? (node.props as { i18n?: unknown }).i18n : undefined;
  return isRecord(fromProps) ? (fromProps as Overlay) : undefined;
}

interface PlannedEdit {
  setOverlay?: string;
  setBase?: string;
}

/**
 * Move every untranslated base string into `to`'s overlay, then translate the
 * base through `map`. Pure: returns a new tree (structurally shared where
 * untouched) and a report. Nothing outside translatable string props is read
 * or written.
 */
export function splitPageI18n(
  tree: ReadonlyArray<BuilderNode>,
  options: { to: string; map: TranslationMap },
): SplitResult {
  const { to, map } = options;
  const report = buildOverlayTranslationReport(tree, to);

  // Plan per (nodeId, prop) from the report, then apply per node in one pass.
  const plans = new Map<string, Map<string, PlannedEdit>>();
  const changes: SplitChange[] = [];
  const unmatched: string[] = [];
  let moved = 0;
  let translated = 0;
  let numeric = 0;

  for (const row of report.rows) {
    const base = row.currentText; // trimmed, non-empty by construction
    const edit: PlannedEdit = {};
    let overlayValue = row.siblingText; // overlay[to][prop] or null

    if (overlayValue === null) {
      edit.setOverlay = base;
      overlayValue = base;
      moved += 1;
    }

    // "identical" — the base still repeats the overlay verbatim, so it has not
    // been translated yet. "translated" — someone already did; leave it alone.
    if (overlayValue === base) {
      const target = map[base]?.trim();
      if (target) {
        if (target !== base) {
          edit.setBase = target;
          translated += 1;
        }
      } else if (isNonLinguisticValue(base)) {
        numeric += 1;
      } else if (!unmatched.includes(base)) {
        unmatched.push(base);
      }
    }

    if (edit.setOverlay !== undefined || edit.setBase !== undefined) {
      const byProp = plans.get(row.nodeId) ?? new Map<string, PlannedEdit>();
      byProp.set(row.prop, edit);
      plans.set(row.nodeId, byProp);
      changes.push({
        nodeId: row.nodeId,
        kind: row.kind,
        prop: row.prop,
        before: base,
        after: edit.setBase ?? base,
        moved: edit.setOverlay !== undefined,
        translated: edit.setBase !== undefined,
      });
    }
  }

  const applyNode = (node: BuilderNode): BuilderNode => {
    const byProp = plans.get(node.id);
    const rawChildren = (node as { children?: unknown }).children;
    let children: unknown = rawChildren;
    if (Array.isArray(rawChildren)) {
      let changed = false;
      const next = rawChildren.map((child) => {
        const out = applyNode(child as BuilderNode);
        if (out !== child) changed = true;
        return out;
      });
      if (changed) children = next;
    }
    if (!byProp && children === rawChildren) return node;

    const next = { ...node } as BuilderNode;
    if (children !== rawChildren) (next as { children?: unknown }).children = children;
    if (!byProp) return next;

    let props: Record<string, unknown> = isRecord(node.props) ? node.props : {};
    let overlay: Overlay | undefined = readOverlay(node);
    let overlayTouched = false;
    for (const [prop, edit] of byProp) {
      if (edit.setOverlay !== undefined) {
        overlay = setOverlayProp(overlay, to, prop, edit.setOverlay);
        overlayTouched = true;
      }
      if (edit.setBase !== undefined) {
        props = writePath(props, prop.split("."), edit.setBase);
      }
    }
    if (overlayTouched) {
      // props.i18n is the source of truth; node.i18n is the renderer's mirror.
      // Write both so the tree is correct before AND after validate re-derives.
      props = { ...props, i18n: overlay };
      (next as { i18n?: Overlay }).i18n = overlay;
    }
    (next as { props: Record<string, unknown> }).props = props;
    return next;
  };

  const nextTree = tree.map(applyNode);
  return {
    tree: nextTree,
    report: {
      moved,
      translated,
      numeric,
      unmatched,
      changes,
      total: report.total,
    },
  };
}

// ---- CLI ------------------------------------------------------------------

interface CliOptions {
  tenant: string;
  page: string;
  from: string;
  to: string;
  mapPath: string;
  apply: boolean;
}

const USAGE =
  "usage: npx tsx scripts/page-i18n-split.ts --tenant <slug> --page <slug> " +
  "--from <base locale> --to <overlay locale> --map <json> [--dry-run | --apply]";

export function parseArgs(argv: readonly string[]): CliOptions {
  const values: Record<string, string> = {};
  let apply = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--dry-run") {
      apply = false;
      continue;
    }
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument "${arg}"\n${USAGE}`);
    const eq = arg.indexOf("=");
    const key = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    const value = eq === -1 ? argv[++i] : arg.slice(eq + 1);
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`--${key} needs a value\n${USAGE}`);
    }
    values[key] = value;
  }
  for (const key of ["tenant", "page", "from", "to", "map"] as const) {
    if (!values[key]?.trim()) throw new Error(`--${key} is required\n${USAGE}`);
  }
  const from = values.from!.trim().toLowerCase();
  const to = values.to!.trim().toLowerCase();
  if (from === to) throw new Error("--from and --to must differ");
  return {
    tenant: values.tenant!.trim(),
    page: values.page!.trim(),
    from,
    to,
    mapPath: values.map!,
    apply,
  };
}

export function readTranslationMap(file: string): TranslationMap {
  const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!isRecord(raw)) throw new Error(`${file}: expected a JSON object of { base: translation }`);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string") throw new Error(`${file}: value for "${key}" is not a string`);
    out[key.trim()] = value;
  }
  return out;
}

function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are required (web/.env.local).",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

interface PageRow {
  id: string;
  locale: string;
  slug: string;
  title: string;
  status: string;
  is_freeform: boolean;
  blocks: unknown;
  updated_at: string;
}

function printReport(report: SplitReport, options: CliOptions): void {
  console.log(
    `\n${options.tenant}/${options.page}  base=${options.from}  overlay=${options.to}\n` +
      `  translatable strings : ${report.total}\n` +
      `  moved into ${options.to} overlay: ${report.moved}\n` +
      `  base translated (map): ${report.translated}\n` +
      `  numeral / symbol only: ${report.numeric}\n` +
      `  UNMATCHED            : ${report.unmatched.length}`,
  );
  if (report.unmatched.length > 0) {
    console.log(`\nUNMATCHED base strings (add these to the map, keyed by this exact text):`);
    for (const text of report.unmatched) console.log(`  ${JSON.stringify(text)}`);
  }
}

function printDiffSample(report: SplitReport, limit = 12): void {
  const sample = report.changes.slice(0, limit).map((c) => ({
    node: `${c.kind}#${c.nodeId}`,
    prop: c.prop,
    ...(c.moved ? { overlay: c.before } : {}),
    ...(c.translated ? { base: { before: c.before, after: c.after } } : {}),
  }));
  console.log(
    `\nDIFF SAMPLE (${sample.length} of ${report.changes.length} change(s)):\n` +
      JSON.stringify(sample, null, 2),
  );
}

async function main(argv: readonly string[]): Promise<number> {
  const options = parseArgs(argv);
  loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
  const db = serviceClient();
  const map = readTranslationMap(options.mapPath);

  const { data: tenant, error: tenantErr } = await db
    .from("agencies")
    .select("id, slug")
    .eq("slug", options.tenant)
    .maybeSingle<{ id: string; slug: string }>();
  if (tenantErr) throw new Error(`Could not read tenant: ${tenantErr.message}`);
  if (!tenant) throw new Error(`No tenant with slug "${options.tenant}"`);

  const { data: identity, error: identityErr } = await db
    .from("agency_business_identity")
    .select("default_locale, supported_locales")
    .eq("tenant_id", tenant.id)
    .maybeSingle<{ default_locale: string | null; supported_locales: string[] | null }>();
  if (identityErr) throw new Error(`Could not read locale settings: ${identityErr.message}`);
  const defaultLocale = identity?.default_locale?.trim().toLowerCase() || "en";
  const supported = (identity?.supported_locales ?? []).map((l) => l.toLowerCase());
  if (defaultLocale !== options.from) {
    throw new Error(
      `--from ${options.from} is not the tenant's primary language (${defaultLocale}); ` +
        `the base props are always the primary language.`,
    );
  }
  if (!supported.includes(options.to)) {
    throw new Error(
      `--to ${options.to} is not in the tenant's supported languages (${supported.join(", ") || "none"})`,
    );
  }

  // The DESIGN row: (tenant, primary locale, slug). Secondary-locale rows no
  // longer render, so the page is always read at the primary locale.
  const { data: page, error: pageErr } = await db
    .from("cms_pages")
    .select("id, locale, slug, title, status, is_freeform, blocks, updated_at")
    .eq("tenant_id", tenant.id)
    .eq("locale", options.from)
    .eq("slug", options.page)
    .maybeSingle<PageRow>();
  if (pageErr) throw new Error(`Could not read page: ${pageErr.message}`);
  if (!page) throw new Error(`No page ${options.from}/${options.page} on tenant "${options.tenant}"`);
  if (!page.is_freeform) {
    throw new Error(
      `${options.page} is not a freeform page (its tree is not in cms_pages.blocks); this script only handles freeform pages.`,
    );
  }
  const tree = Array.isArray(page.blocks) ? (page.blocks as BuilderNode[]) : [];
  if (tree.length === 0) throw new Error(`${options.page} has an empty tree; nothing to do.`);

  const { tree: nextTree, report } = splitPageI18n(tree, { to: options.to, map });
  printReport(report, options);

  // Strict validation BEFORE any write — the same gate publish runs.
  const validated = validateBuilderNodeTree(nextTree);
  if (!validated.ok) {
    console.error(`\nTransformed tree FAILS validation (${validated.issues.length} issue(s)):`);
    for (const issue of validated.issues.slice(0, 20)) {
      console.error(`  ${issue.path}: ${issue.message}`);
    }
    return 1;
  }

  if (!options.apply) {
    printDiffSample(report);
    console.log(`\nDRY RUN — nothing written. Re-run with --apply to save + publish.`);
    return 0;
  }

  if (report.changes.length === 0) {
    console.log(`\nNothing to apply — the page is already split. No revision written.`);
    return 0;
  }

  const saved = await saveCmsFreeformPageWithClient({
    supabase: db,
    tenantId: tenant.id,
    pageId: page.id,
    patch: {
      blocks: nextTree,
      updated_at: new Date().toISOString(),
      title: page.title,
    },
    actorProfileId: null,
  });
  if (!saved.ok) throw new Error(`Draft save failed: ${saved.error}`);
  console.log(`\nDraft saved (revision kind=draft) at ${saved.updatedAt}.`);

  const published = await publishCmsFreeformPageWithClient({
    supabase: db,
    tenantId: tenant.id,
    pageId: page.id,
    actorProfileId: null,
  });
  if (!published.ok) throw new Error(`Publish failed after draft save: ${published.error}`);
  console.log(`Published (revision kind=published) at ${published.publishedAt}.`);
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
