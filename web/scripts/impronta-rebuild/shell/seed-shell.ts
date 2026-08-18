/**
 * seed-shell.ts — writes the Impronta freeform site shell (header + footer)
 * into `cms_pages.blocks` for EVERY published locale.
 *
 * SAFETY
 * ──────
 *  1. DRY RUN IS THE DEFAULT. Nothing is written without `--apply`.
 *  2. Never deletes anything. Never touches `published_page_snapshot` — the
 *     editor's Publish button owns that (`publishSiteShellRow`), so the vetted
 *     path keeps its CAS, revision and cache-bust behaviour.
 *  3. Nobody may be in the shell editor while this runs (the editor autosaves
 *     `blocks` with a CAS epoch derived from `updated_at`).
 *
 * WHY THE ANCHOR SECTIONS STAY
 * ────────────────────────────
 * It is tempting to "clean up" the legacy `site_header` / `site_footer`
 * sections once the shell is freeform. Do NOT:
 *   - `loadPublishedShell` returns null when `snapshot.slots` is empty
 *     (`shell-reads.ts:94-96`) → the public reader falls back to the LEGACY
 *     header, i.e. deleting the rows un-does the whole rebuild.
 *   - `republishSiteShellSnapshot` hard-bails with `shell_has_no_sections`
 *     when a shell has zero section rows (`site-shell-publish.ts:139-141`), so
 *     Publish silently no-ops and reports success.
 * The rows are ANCHORS. The freeform tree lives at `snapshot.builderTree`;
 * `slots[]` only has to be non-empty.
 *
 * WHY THE LANDMARKS ARE `ejected`
 * ───────────────────────────────
 * A shell landmark renders its curated `<Comp>` AND THEN its freeform children
 * (`PublishedShell.renderFreeformShellLandmark`), so authored children alone
 * produce the curated bar PLUS our bar — two headers. `props.ejected` is the
 * documented opt-out ("the curated React component no longer renders for it");
 * the shell renderer honours it on both render paths as of the accompanying
 * fix. Ejecting is what makes this an all-freeform shell rather than an
 * addition to the legacy one.
 *
 * TREE SHAPE
 * ──────────
 * Exactly two roots: `[site_header landmark, site_footer landmark]`, each
 * carrying the authored tree as `children` and the REAL slot `sectionId` (a
 * landmark minted without it addresses nothing and its children stop
 * rendering — `site-shell-surface-tree.ts:92-100`). `splitShellTree` cuts at
 * the footer landmark, so header/footer resolve correctly.
 *
 * USAGE (from `web/`)
 *   IMPRONTA_SEED_TENANT_SLUG=impronta npx tsx scripts/impronta-rebuild/shell/seed-shell.ts
 *   IMPRONTA_SEED_TENANT_SLUG=impronta npx tsx scripts/impronta-rebuild/shell/seed-shell.ts --apply
 *   ... --only=es          restrict to one locale
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import {
  applyImageSlotResolution,
  collectImageSlots,
  loadImageSlotPins,
  resolveImageSlots,
} from "../media-curation";

import { localizeTreeHrefs } from "./shared-shell";
import { improntaHeaderTree } from "./header";
import { improntaFooterTree } from "./footer";

type ShellSlotKey = "header" | "footer";

interface ShellPageRow {
  id: string;
  locale: string;
  status: string;
}

interface AnchorIds {
  header: string;
  footer: string;
}

export interface LocaleOutcome {
  locale: string;
  pageId: string;
  action: "update" | "skip";
  headerNodes: number;
  footerNodes: number;
  createdAnchors: ShellSlotKey[];
  note?: string;
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/** Count every node in a tree, children included. */
export function countNodes(tree: unknown): number {
  if (Array.isArray(tree)) {
    return tree.reduce((n: number, node) => n + countNodes(node), 0);
  }
  if (tree && typeof tree === "object" && "kind" in tree) {
    const node = tree as { children?: unknown };
    return 1 + (Array.isArray(node.children) ? countNodes(node.children) : 0);
  }
  return 0;
}

/**
 * Build the two-root shell tree. `ejected: true` is the load-bearing bit — see
 * the module header.
 */
export function buildShellTree(input: {
  anchors: AnchorIds;
  /**
   * The slot sortOrder AS STORED. Do NOT assume header=0 / footer=1: the
   * address key is `sectionId:slotKey:sortOrder`, and Impronta's footer slot is
   * stored with sortOrder 0. Guessing it produced landmarks that matched no
   * slot, so `renderShellSlot` found no builder node, rendered no children --
   * and with the curated component correctly suppressed by `ejected`, the live
   * site had NO header at all.
   */
  sortOrders: { header: number; footer: number };
  header: BuilderNode[];
  footer: BuilderNode[];
}): BuilderNode[] {
  return [
    {
      id: "impronta-shell-header",
      kind: "section",
      props: {
        sectionId: input.anchors.header,
        sectionTypeKey: "site_header",
        slotKey: "header",
        sortOrder: input.sortOrders.header,
        label: "Site header",
        ejected: true,
      },
      children: input.header,
    } as BuilderNode,
    {
      id: "impronta-shell-footer",
      kind: "section",
      props: {
        sectionId: input.anchors.footer,
        sectionTypeKey: "site_footer",
        slotKey: "footer",
        sortOrder: input.sortOrders.footer,
        label: "Site footer",
        ejected: true,
      },
      children: input.footer,
    } as BuilderNode,
  ];
}

/** Pick the authored tree for a locale, falling back to `en`. */
export function treesForLocale(locale: string): {
  header: BuilderNode[];
  footer: BuilderNode[];
} {
  const key = locale === "es" ? "es" : "en";
  // Both locales are authored from one structural builder and therefore carry
  // the same bare hrefs. Without this the Spanish header and footer linked
  // straight back into the English site -- silently, since those pages exist.
  return {
    header: localizeTreeHrefs(improntaHeaderTree[key], key),
    footer: localizeTreeHrefs(improntaFooterTree[key], key),
  };
}

// ---------------------------------------------------------------------------
// DB
// ---------------------------------------------------------------------------

function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are required.",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function resolveTenantId(supabase: SupabaseClient): Promise<string> {
  const id = process.env.IMPRONTA_SEED_TENANT_ID?.trim();
  if (id) return id;
  const slug = process.env.IMPRONTA_SEED_TENANT_SLUG?.trim();
  if (!slug) {
    throw new Error(
      "Set IMPRONTA_SEED_TENANT_ID or IMPRONTA_SEED_TENANT_SLUG. There is no default on purpose.",
    );
  }
  const { data, error } = await supabase
    .from("agencies")
    .select("id")
    .eq("slug", slug)
    .maybeSingle<{ id: string }>();
  if (error || !data) throw new Error(`Tenant "${slug}" not found.`);
  return data.id;
}

async function loadShellPages(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<ShellPageRow[]> {
  const { data, error } = await supabase
    .from("cms_pages")
    .select("id, locale, status")
    .eq("tenant_id", tenantId)
    .eq("system_template_key", "site_shell")
    .neq("status", "archived")
    .returns<ShellPageRow[]>();
  if (error) throw new Error(`Could not read shell pages: ${error.message}`);
  return data ?? [];
}

/**
 * Resolve the anchor section id for one slot, creating the section + its
 * draft/live pointers when the locale has none (the ES shell ships with zero
 * sections, which is exactly the state that makes Publish a silent no-op).
 */
async function ensureAnchor(
  supabase: SupabaseClient,
  opts: {
    tenantId: string;
    pageId: string;
    slotKey: ShellSlotKey;
    locale: string;
    sourceProps: Record<string, unknown> | null;
    apply: boolean;
  },
): Promise<{ sectionId: string | null; sortOrder: number; created: boolean }> {
  const sectionTypeKey =
    opts.slotKey === "header" ? "site_header" : "site_footer";

  const { data: existing } = await supabase
    .from("cms_page_sections")
    .select("section_id, is_draft, sort_order")
    .eq("tenant_id", opts.tenantId)
    .eq("page_id", opts.pageId)
    .eq("slot_key", opts.slotKey)
    .returns<Array<{ section_id: string; is_draft: boolean; sort_order: number | null }>>();

  const rows = existing ?? [];
  const draft = rows.find((r) => r.is_draft);
  const live = rows.find((r) => !r.is_draft);
  const source = draft ?? live;
  const found = source?.section_id ?? null;
  // Read the STORED sortOrder — the address key depends on it exactly.
  if (found) {
    return { sectionId: found, sortOrder: source?.sort_order ?? 0, created: false };
  }

  const newSortOrder = opts.slotKey === "header" ? 0 : 1;
  if (!opts.apply) return { sectionId: null, sortOrder: newSortOrder, created: true };

  const { data: section, error: sectionErr } = await supabase
    .from("cms_sections")
    .insert({
      tenant_id: opts.tenantId,
      section_type_key: sectionTypeKey,
      schema_version: 1,
      // cms_sections has a UNIQUE (tenant, name) constraint, so a per-locale
      // anchor MUST carry its locale in the name or the second locale's
      // insert dies on a duplicate key.
      name: `Impronta — site ${opts.slotKey} (${opts.locale})`,
      props_jsonb: opts.sourceProps ?? {},
      version: 1,
    })
    .select("id")
    .maybeSingle<{ id: string }>();
  if (sectionErr || !section) {
    throw new Error(
      `Could not create ${sectionTypeKey} anchor: ${sectionErr?.message ?? "no row"}`,
    );
  }

  // Draft AND live pointers: the snapshot bake reads draft rows and falls back
  // to live ones, and the inspector's "not found" path keys off the draft.
  for (const isDraft of [true, false]) {
    const { error } = await supabase.from("cms_page_sections").insert({
      tenant_id: opts.tenantId,
      page_id: opts.pageId,
      section_id: section.id,
      slot_key: opts.slotKey,
      sort_order: newSortOrder,
      is_draft: isDraft,
    });
    if (error) {
      throw new Error(
        `Could not attach ${sectionTypeKey} anchor (is_draft=${isDraft}): ${error.message}`,
      );
    }
  }
  return { sectionId: section.id, sortOrder: newSortOrder, created: true };
}

/** Props of an existing anchor, used to seed a new locale's anchor. */
async function anchorProps(
  supabase: SupabaseClient,
  sectionId: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await supabase
    .from("cms_sections")
    .select("props_jsonb")
    .eq("id", sectionId)
    .maybeSingle<{ props_jsonb: Record<string, unknown> | null }>();
  return data?.props_jsonb ?? null;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export async function runShellSeed(opts: {
  supabase: SupabaseClient;
  tenantId: string;
  apply: boolean;
  onlyLocales?: string[];
  /** Escape hatch for a deliberate pre-launch link. Never the default. */
  allowDeadLinks?: boolean;
}): Promise<{ outcomes: LocaleOutcome[]; abortReason?: string }> {
  const pages = await loadShellPages(opts.supabase, opts.tenantId);
  if (pages.length === 0) {
    return { outcomes: [], abortReason: "No site_shell page rows for tenant." };
  }

  // Reference props come from whichever locale already has anchors (EN), so a
  // newly created ES anchor starts from the same curated config rather than {}.
  const reference: Partial<Record<ShellSlotKey, Record<string, unknown> | null>> =
    {};
  for (const page of pages) {
    for (const slotKey of ["header", "footer"] as ShellSlotKey[]) {
      if (reference[slotKey] != null) continue;
      const { data } = await opts.supabase
        .from("cms_page_sections")
        .select("section_id")
        .eq("tenant_id", opts.tenantId)
        .eq("page_id", page.id)
        .eq("slot_key", slotKey)
        .limit(1)
        .maybeSingle<{ section_id: string }>();
      if (data?.section_id) {
        reference[slotKey] = await anchorProps(opts.supabase, data.section_id);
      }
    }
  }

  const outcomes: LocaleOutcome[] = [];

  for (const page of pages) {
    if (opts.onlyLocales && !opts.onlyLocales.includes(page.locale)) continue;

    const createdAnchors: ShellSlotKey[] = [];
    const anchors: Partial<AnchorIds> = {};
    const sortOrders: { header: number; footer: number } = { header: 0, footer: 1 };
    for (const slotKey of ["header", "footer"] as ShellSlotKey[]) {
      const res = await ensureAnchor(opts.supabase, {
        tenantId: opts.tenantId,
        pageId: page.id,
        slotKey,
        locale: page.locale,
        sourceProps: reference[slotKey] ?? null,
        apply: opts.apply,
      });
      if (res.created) createdAnchors.push(slotKey);
      if (res.sectionId) anchors[slotKey] = res.sectionId;
      sortOrders[slotKey] = res.sortOrder;
    }

    const { header, footer } = treesForLocale(page.locale);

    // Preflight: refuse to publish a shell whose own links 404. The shell is on
    // every page, so a dead link here is dead site-wide, and it is invisible to
    // every other check — the tree validates, the publish succeeds.
    const deadLinks = await findDeadShellLinks(
      opts.supabase,
      opts.tenantId,
      page.locale,
      collectInternalHrefs([...header, ...footer]),
    );
    if (deadLinks.length > 0 && !opts.allowDeadLinks) {
      outcomes.push({
        locale: page.locale,
        pageId: page.id,
        action: "skip",
        headerNodes: countNodes(header),
        footerNodes: countNodes(footer),
        createdAnchors,
        note: `DEAD LINKS (${deadLinks.length}): ${deadLinks.join(" ")} — no page in "${page.locale}". Fix the tree or pass --allow-dead-links.`,
      });
      continue;
    }

    if (!anchors.header || !anchors.footer) {
      outcomes.push({
        locale: page.locale,
        pageId: page.id,
        action: "skip",
        headerNodes: countNodes(header),
        footerNodes: countNodes(footer),
        createdAnchors,
        note: opts.apply
          ? "anchor missing after create — investigate"
          : "would CREATE anchors (dry run cannot know their ids)",
      });
      continue;
    }

    const rawTree = buildShellTree({
      anchors: { header: anchors.header, footer: anchors.footer },
      sortOrders,
      header,
      footer,
    });

    // IMAGE SLOTS. The authored trees carry `slot://impronta-rebuild/<name>`
    // placeholders (the shell logo). Writing those raw puts the literal token
    // in an <img src> -- a broken logo in the header of every page. Resolve
    // against the tenant's media library first and ABORT if any slot cannot be
    // resolved, rather than shipping a placeholder string.
    const slotNames = collectImageSlots(rawTree);
    let tree = rawTree;
    if (slotNames.length > 0) {
      const resolution = await resolveImageSlots(
        opts.supabase,
        opts.tenantId,
        slotNames,
        loadImageSlotPins(),
      );
      if (resolution.unresolvedSlots.length > 0) {
        return {
          outcomes,
          abortReason: `Unresolved image slot(s) for "${page.locale}": ${resolution.unresolvedSlots.join(", ")}`,
        };
      }
      const applied = applyImageSlotResolution(rawTree, resolution.resolved);
      if (applied.unresolvedTokens.length > 0) {
        return {
          outcomes,
          abortReason: `Image slot tokens survived resolution for "${page.locale}": ${applied.unresolvedTokens.join(", ")}`,
        };
      }
      tree = applied.tree as BuilderNode[];
    }

    const validation = validateBuilderNodeTree(tree);
    if (!validation.ok) {
      return {
        outcomes,
        abortReason: `Shell tree invalid for locale "${page.locale}": ${validation.issues
          .map((i) => i.message)
          .join("; ")}`,
      };
    }

    if (opts.apply) {
      const { error } = await opts.supabase
        .from("cms_pages")
        .update({ blocks: tree, updated_at: new Date().toISOString() })
        .eq("id", page.id);
      if (error) {
        return {
          outcomes,
          abortReason: `Write failed for locale "${page.locale}": ${error.message}`,
        };
      }
    }

    outcomes.push({
      locale: page.locale,
      pageId: page.id,
      action: "update",
      headerNodes: countNodes(header),
      footerNodes: countNodes(footer),
      createdAnchors,
    });
  }

  return { outcomes };
}


// ---------------------------------------------------------------------------
// Dead-link preflight
// ---------------------------------------------------------------------------

/**
 * Every internal href a shell tree points at, for one locale.
 *
 * The shell is the ONE surface that appears on every page, so a link that goes
 * nowhere there is broken site-wide. This shipped: the Spanish header and
 * footer carried the four division links, and those pages exist only in
 * English, so `/es/p/fashion-models` was a 404 in the primary navigation of
 * every Spanish page. Nothing errored — the tree was valid, the shell
 * published, and the 404 only appeared to someone who clicked.
 */
function collectInternalHrefs(nodes: readonly BuilderNode[]): string[] {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "href" && typeof value === "string" && value.startsWith("/")) {
        out.push(value);
      } else {
        walk(value);
      }
    }
  };
  walk(nodes);
  return [...new Set(out)];
}

/** Hrefs served by a route rather than a `cms_pages` row. */
const SYSTEM_PATHS = new Set(["", "directory", "register", "login"]);

/**
 * Resolve each href against the pages that actually exist in that locale.
 * Returns the ones that would 404.
 */
async function findDeadShellLinks(
  supabase: SupabaseClient,
  tenantId: string,
  locale: string,
  hrefs: readonly string[],
): Promise<string[]> {
  const { data } = await supabase
    .from("cms_pages")
    .select("slug")
    .eq("tenant_id", tenantId)
    .eq("locale", locale)
    .eq("status", "published");
  const slugs = new Set((data ?? []).map((r) => (r as { slug: string }).slug));

  const dead: string[] = [];
  for (const href of hrefs) {
    // Strip the locale prefix the tree carries for non-default locales.
    const path = href.replace(new RegExp(`^/${locale}(?=/|$)`), "") || "/";
    const trimmed = path.replace(/^\//, "").replace(/\/$/, "");
    if (SYSTEM_PATHS.has(trimmed)) continue;
    const slug = trimmed.startsWith("p/") ? trimmed.slice(2) : trimmed;
    if (!slugs.has(slug)) dead.push(href);
  }
  return dead;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  // Same env bootstrap the page seeder uses — `.env.local` is not loaded for a
  // bare `tsx` run, so without this every invocation dies on a missing key.
  const { loadEnvLocal } = await import("../../load-env-local.mjs");
  loadEnvLocal();

  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const allowDeadLinks = argv.includes("--allow-dead-links");
  const onlyArg = argv.find((a) => a.startsWith("--only="));
  const onlyLocales = onlyArg
    ? onlyArg.slice("--only=".length).split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  if (!apply) console.log("DRY RUN — no writes will be made.\n");

  const supabase = serviceClient();
  const tenantId = await resolveTenantId(supabase);
  const { outcomes, abortReason } = await runShellSeed({
    supabase,
    tenantId,
    apply,
    onlyLocales,
    allowDeadLinks,
  });

  console.log("LOCALE  ACTION  HEADER  FOOTER  ANCHORS CREATED  NOTE");
  for (const o of outcomes) {
    console.log(
      [
        o.locale.padEnd(6),
        o.action.padEnd(6),
        String(o.headerNodes).padStart(6),
        String(o.footerNodes).padStart(6),
        (o.createdAnchors.join(",") || "-").padEnd(16),
        o.note ?? "",
      ].join("  "),
    );
  }

  if (abortReason) {
    console.error(`\nABORTED: ${abortReason}`);
    process.exitCode = 1;
    return;
  }
  if (apply) {
    console.log(
      "\nWrites complete. The shell is still a DRAFT: open the shell editor and " +
        "Publish once per locale (the adapter binds one locale at a time), then " +
        "verify the storefront renders the freeform tree.",
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
