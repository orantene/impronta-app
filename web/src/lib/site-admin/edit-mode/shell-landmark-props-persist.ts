/**
 * The shell inspectors' bridge to the FREEFORM tree.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * `resolveShellLandmarkSectionProps` (shipped, live) makes a shell landmark's
 * own inline `props.sectionProps` win over the addressed `cms_page_sections`
 * slot on BOTH render paths. Phase 8B seeds those inline props so the legacy
 * anchor rows can be deleted.
 *
 * The SiteHeaderInspector and SiteFooterInspector autosaved to
 * `cms_sections.props_jsonb` — the slot side. That produced two silent
 * failures, one on either side of the migration:
 *
 *   1. SEEDED, ROWS STILL THERE — the row write no longer reaches the live
 *      site. The operator edits header configuration, sees a success state, and
 *      nothing changes. Closed by MIRRORING the same computed props onto the
 *      landmark node (#1509).
 *   2. ROWS DELETED — the resolvers began at the slot pointer, so with no
 *      pointer they returned `null` and both inspectors failed with
 *      `NOT_FOUND`. The shell editor dies the moment 8B completes. A mirror
 *      cannot help here: there is no row write to mirror FROM. Closed by
 *      resolving OWNERSHIP first (`resolveShellLandmark` below) and writing the
 *      node as the PRIMARY store when nothing else owns the landmark.
 *
 * BOTH STORES ARE WRITTEN WHILE BOTH EXIST, DELIBERATELY
 * ------------------------------------------------------
 * The `cms_sections` write stays exactly where it is, unchanged, for as long as
 * there is a row. It is the spine the inspector's whole contract hangs off:
 * `saveSectionDraftAction` supplies Zod validation, the CAS `expectedVersion`
 * check the inspector's autosave uses to detect a concurrent editor, the audit
 * entry and the revision row. None of that exists for `cms_pages.blocks`, and
 * reinventing four mechanisms to save one write is a far worse trade than the
 * drift risk.
 *
 * The drift risk is also small by construction: the mirror runs inside the same
 * action, from the SAME `nextProps` object the row write used, and only AFTER
 * that row write has committed. The two cannot diverge through the inspector
 * path. What the row buys in exchange is Phase 8B's rollback: while the anchor
 * rows still exist, deleting a landmark's inline `sectionProps` restores slot
 * rendering against a row that is still current rather than one frozen at
 * whenever the migration ran.
 *
 * Once the row is GONE there is nothing left to buy, and the node write becomes
 * primary — with its own CAS, because it is then the only thing standing
 * between two operators and a silent overwrite.
 *
 * ONE WRITER, TWO MODES — NOT TWO WRITERS
 * ---------------------------------------
 * `writeShellLandmarkNodeProps` serves both. `expectedPageVersion: null` is
 * MIRROR mode (a row write already applied the authoritative CAS, and a
 * landmark that does not own its props is left strictly alone); a number is
 * PRIMARY mode (full compare-and-swap on `cms_pages.version`). Two functions
 * would be two tree-edit implementations that could drift about children,
 * sibling roots or the ownership test; one function with a mode cannot.
 *
 * ORDERING IS LOAD-BEARING: the caller must write the node BEFORE
 * `republishSiteShellSnapshot`, because the republish bakes `cms_pages.blocks`
 * into `published_page_snapshot.builderTree` and the renderer reads the
 * snapshot. Writing after the bake would persist correctly and still show the
 * operator nothing until the next unrelated publish.
 *
 * NOT A PROMOTION PATH. See `applyShellLandmarkSectionProps` for why a landmark
 * that does not already own its props is left strictly alone — on every shell
 * alive today that means the mirror performs NO `cms_pages` write whatsoever
 * and the behaviour is identical to before it existed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  applyShellLandmarkSectionProps,
  type ShellSideKey,
} from "@/lib/site-admin/builder-node/shell-render-plan";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import { pickShellPageForLocale } from "@/lib/site-admin/site-header/shell-page-pick";

import {
  pickShellLandmarkTarget,
  readLandmarkInlineProps,
  type ShellLandmarkSectionCandidate,
  type ShellLandmarkTarget,
} from "./shell-landmark-config";

interface ShellRow {
  id: string;
  locale: string | null;
  version: number;
  updated_at: string;
  blocks: unknown;
}

export interface ResolvedShellLandmark {
  target: ShellLandmarkTarget;
  /**
   * The shell `cms_pages` row id, present whenever the tenant has a shell page
   * at all — even when the landmark itself resolves to `none`. The footer
   * inspector's read-only freeform child count needs it independently of who
   * owns the config.
   */
  shellPageId: string | null;
  /** The shell page's locale, or `"en"` when there is no shell page. */
  locale: string;
}

/**
 * Resolve WHO OWNS this side's landmark configuration, and hand back everything
 * either write path needs.
 *
 * This replaces the two near-identical `resolveHeaderSection` /
 * `resolveFooterSection` bodies. They began at the slot pointer, which is the
 * bug: no pointer meant no answer. This begins at the shell page, reads the
 * tree and the row, and lets `pickShellLandmarkTarget` decide — so a landmark
 * with no row is still an answer.
 *
 * The shell-page pick is the SAME `pickShellPageForLocale` both resolvers
 * already used: a bilingual tenant has one shell page per locale and
 * `.maybeSingle()` there is an ERROR, not a pick (see `shell-page-pick.ts`).
 *
 * Note it reads `blocks` in the SAME query that finds the shell page. The
 * previous shape re-read `cms_pages` a second time purely to look at the tree;
 * one row already carries both.
 */
export async function resolveShellLandmark(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    side: ShellSideKey;
    preferredLocale?: string | null;
  },
): Promise<ResolvedShellLandmark> {
  const { tenantId, side } = input;

  const { data: shells } = await supabase
    .from("cms_pages")
    .select("id, locale, version, updated_at, blocks")
    .eq("tenant_id", tenantId)
    .eq("system_template_key", "site_shell")
    .neq("status", "archived")
    .returns<ShellRow[]>();

  let preferred = input.preferredLocale ?? null;
  if (!preferred) {
    const { data: identity } = await supabase
      .from("agency_business_identity")
      .select("default_locale")
      .eq("tenant_id", tenantId)
      .maybeSingle<{ default_locale: string | null }>();
    preferred = identity?.default_locale ?? "en";
  }

  const shell = pickShellPageForLocale(shells ?? [], preferred);
  if (!shell) return { target: { kind: "none" }, shellPageId: null, locale: "en" };

  const locale = shell.locale ?? "en";
  const inlineProps = readLandmarkInlineProps(
    (Array.isArray(shell.blocks) ? shell.blocks : []) as BuilderNodeTree,
    side,
  );

  const section = await resolveLandmarkSectionRow(supabase, {
    tenantId,
    pageId: shell.id,
    side,
    locale,
  });

  return {
    target: pickShellLandmarkTarget({
      node: {
        pageId: shell.id,
        pageVersion: shell.version,
        locale,
        inlineProps,
      },
      section,
    }),
    shellPageId: shell.id,
    locale,
  };
}

/**
 * The legacy anchor: slot pointer → `cms_sections` row.
 *
 * Draft pointer first, then the published one — a tenant whose shell has been
 * published but never re-drafted has no `is_draft = true` row, and without the
 * fallback the inspector would report "not found" on exactly the tenants whose
 * landmark is live. `null` once Phase 8B has deleted the anchors, which is no
 * longer fatal: `pickShellLandmarkTarget` then falls to the node.
 */
async function resolveLandmarkSectionRow(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    pageId: string;
    side: ShellSideKey;
    locale: string;
  },
): Promise<ShellLandmarkSectionCandidate | null> {
  const { tenantId, pageId, side, locale } = input;

  const pointerFor = (isDraft: boolean) =>
    supabase
      .from("cms_page_sections")
      .select("section_id")
      .eq("tenant_id", tenantId)
      .eq("page_id", pageId)
      .eq("slot_key", side)
      .eq("is_draft", isDraft)
      .maybeSingle<{ section_id: string }>();

  let { data: ptr } = await pointerFor(true);
  if (!ptr) ({ data: ptr } = await pointerFor(false));
  if (!ptr) return null;

  const { data: sec } = await supabase
    .from("cms_sections")
    .select("id, section_type_key, schema_version, name, version, props_jsonb")
    .eq("tenant_id", tenantId)
    .eq("id", ptr.section_id)
    .maybeSingle<{
      id: string;
      section_type_key: string;
      schema_version: number;
      name: string;
      version: number;
      props_jsonb: Record<string, unknown> | null;
    }>();
  if (!sec) return null;

  return {
    sectionId: sec.id,
    sectionTypeKey: sec.section_type_key,
    schemaVersion: sec.schema_version,
    name: sec.name,
    version: sec.version,
    locale,
    props: sec.props_jsonb ?? {},
  };
}

export type ShellLandmarkNodeWriteResult =
  | { ok: true; wrote: boolean; version: number | null }
  | { ok: false; error: string; code?: string; currentVersion?: number };

/**
 * Write `nextProps` onto this side's landmark node in `cms_pages.blocks`.
 *
 * TWO MODES, one implementation:
 *
 *   `expectedPageVersion: null` — MIRROR. The caller has already written the
 *   `cms_sections` row under its own CAS; this follows it onto the node so the
 *   renderer sees the same value. A landmark that does not own its props inline
 *   is left strictly alone (`wrote: false`, and no `cms_pages` write at all),
 *   which is every shell alive today. `version` comes back `null` because the
 *   caller's version pointer is the row's, not the page's.
 *
 *   `expectedPageVersion: <number>` — PRIMARY. There is no row; the node IS the
 *   store. The update is a genuine compare-and-swap on `cms_pages.version` and
 *   bumps it, so two operators racing from the same loaded version produce one
 *   winner and one `CONFLICT`, exactly as the section path does. That token is
 *   not invented for this: `republishSiteShellSnapshot` already filters on it
 *   and bumps it, so it is live and load-bearing on this exact row.
 *
 * BOTH modes take the `updated_at` equality guard, which closes the window
 * between the SELECT below and the UPDATE — including for the mirror, which
 * previously had no concurrency protection on `cms_pages` at all.
 *
 * STATED LIMIT, because a half-honest CAS is the thing to avoid: the freeform
 * shell builder's full-tree save (`saveSiteShellRow`) writes `blocks` WITHOUT
 * bumping `version`, so a builder save landing between an operator's load and
 * their next keystroke is not caught by the version filter. The `updated_at`
 * guard catches it only inside this function. That gap is not a regression —
 * before this, the tree save and the inspector save touched different tables
 * and detected each other not at all.
 *
 * The tree edit itself is `applyShellLandmarkSectionProps`, the renderer's own
 * write counterpart: exactly one node's `props.sectionProps` differs, and the
 * landmark's operator-added `children`, its sibling roots and the other side's
 * landmark are all carried through by reference.
 */
export async function writeShellLandmarkNodeProps(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    shellPageId: string;
    side: ShellSideKey;
    nextProps: Record<string, unknown>;
    expectedPageVersion: number | null;
  },
): Promise<ShellLandmarkNodeWriteResult> {
  const { tenantId, shellPageId, side, nextProps, expectedPageVersion } = input;

  const { data: row } = await supabase
    .from("cms_pages")
    .select("id, locale, version, updated_at, blocks")
    .eq("id", shellPageId)
    .eq("tenant_id", tenantId)
    .maybeSingle<ShellRow>();
  if (!row || !Array.isArray(row.blocks)) {
    // No freeform tree at all. In mirror mode that is the ordinary answer for a
    // legacy shell. In primary mode it cannot happen — the caller only gets a
    // node target BECAUSE a landmark was found in this tree — so treat it as
    // the concurrent deletion it would have to be.
    if (expectedPageVersion === null) return { ok: true, wrote: false, version: null };
    return { ok: false, error: "Site shell page not found.", code: "NOT_FOUND" };
  }

  if (expectedPageVersion !== null && row.version !== expectedPageVersion) {
    return {
      ok: false,
      error: CONCURRENT_EDIT_ERROR,
      code: "CONFLICT",
      currentVersion: row.version,
    };
  }

  const { tree: nextTree, changed } = applyShellLandmarkSectionProps(
    row.blocks as BuilderNodeTree,
    side,
    nextProps,
  );
  if (!changed) {
    if (expectedPageVersion === null) return { ok: true, wrote: false, version: null };
    // Primary mode: the landmark disappeared between the load and the save.
    // Refusing is the point — appending one would invent a shell the operator
    // never authored.
    return {
      ok: false,
      error: "This site shell no longer has that landmark.",
      code: "NOT_FOUND",
    };
  }

  const patch: Record<string, unknown> = { blocks: nextTree };
  if (expectedPageVersion !== null) {
    patch.version = expectedPageVersion + 1;
    patch.updated_at = new Date().toISOString();
  }

  let query = supabase
    .from("cms_pages")
    .update(patch)
    .eq("id", shellPageId)
    .eq("tenant_id", tenantId)
    // Closes the window between the SELECT above and this UPDATE, in BOTH modes.
    .eq("updated_at", row.updated_at);
  if (expectedPageVersion !== null) {
    query = query.eq("version", expectedPageVersion);
  }
  const { data: updated, error } = await query
    .select("version")
    .maybeSingle<{ version: number }>();

  if (error) {
    // Fail LOUD. A swallowed error here is precisely the silent failure this
    // module exists to remove: the row saved, the node did not, and the live
    // site keeps rendering the old header while the inspector says "saved".
    return {
      ok: false,
      error:
        "Saved the section, but could not update the site shell layout. " +
        "Reload and try again.",
    };
  }
  if (!updated) return { ok: false, error: CONCURRENT_EDIT_ERROR, code: "CONFLICT" };

  return {
    ok: true,
    wrote: true,
    version: expectedPageVersion === null ? null : updated.version,
  };
}

const CONCURRENT_EDIT_ERROR =
  "Someone else changed this site shell while you were editing. Reopen the panel to pick up their version.";

/**
 * The shell row's current `version`, re-read after a republish.
 *
 * `republishSiteShellSnapshot` bumps `version` itself, so the value the client
 * must hold for its next CAS is NOT the one `writeShellLandmarkNodeProps`
 * returned. Deriving it (`+ 1`) would encode the republish's internals here and
 * rot the first time they change; one cheap read is the honest answer.
 *
 * Only the node-primary path needs this. On the section path the client's
 * version pointer is `cms_sections.version`, which the republish does not touch.
 */
export async function readShellPageVersion(
  supabase: SupabaseClient,
  input: { tenantId: string; pageId: string },
): Promise<number | null> {
  const { data } = await supabase
    .from("cms_pages")
    .select("version")
    .eq("id", input.pageId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle<{ version: number }>();
  return data?.version ?? null;
}
