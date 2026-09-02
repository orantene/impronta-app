"use server";

/**
 * Server actions for the in-canvas `<SiteFooterInspector>`.
 *
 * Deliberately the NARROWEST possible mirror of `site-header/actions.ts`. The
 * header inspector spans three tables (identity / branding / navigation) plus
 * the section row, and needs a five-kind save queue to keep their CAS pointers
 * straight. The footer's entire configuration already lives in ONE place — the
 * `site_footer` landmark's section props — so this file has exactly one write
 * path. Inventing the header's multi-kind machinery here would be complexity
 * with nothing behind it.
 *
 * WRITE TARGET, AND THE PROPERTY THAT DEPENDS ON IT
 * --------------------------------------------------------------------------
 * While a `cms_sections` row exists the save goes through the EXISTING
 * canonical `saveSectionDraftAction` (Zod + CAS + audit + revision) against it,
 * then re-bakes the shell snapshot via the EXISTING
 * `republishSiteShellSnapshot`.
 *
 * 2026-09-02 — THIS FILE NO LONGER WRITES ONLY `cms_sections`. It previously
 * said it "NEVER writes `cms_pages.blocks`", and that is now false: the save
 * also calls `writeShellLandmarkNodeProps`, which updates the `site_footer`
 * landmark node's `props.sectionProps` on `cms_pages.blocks` WHEN that landmark
 * owns its config inline — and which becomes the ONLY write once Phase 8B has
 * deleted the anchor row and there is no `cms_sections` row left to save to.
 *
 * It has to. `resolveShellLandmarkSectionProps` makes a landmark's inline
 * `sectionProps` beat the slot row on both render paths, so once Phase 8B seeds
 * inline props a footer save that touched only `cms_sections` would be written,
 * acknowledged, and invisible on the live site. On every shell alive today no
 * landmark carries inline props, the mirror is a no-op, and NO `cms_pages`
 * write happens at all.
 *
 * The freeform-children property still holds, but now by CARE rather than by
 * construction: the mirror rewrites exactly one node's `props.sectionProps` and
 * carries `children` through by reference. It is pinned behaviourally in
 * `site-header/shell-inspector-writes-node.test.ts` [N8]. The static guard
 * (`freeform-children-untouched.static.test.ts`) still forbids a RAW `blocks`
 * write in this file — that remains the wrong way to do it.
 *
 * The read also touches `cms_pages.blocks` read-only: `resolveShellLandmark`
 * prefers the landmark's inline `sectionProps` over the section row so the
 * inspector displays what the site actually renders, and
 * `countFooterFreeformChildren` counts the landmark's children for the drawer.
 *
 * And the file no longer has "exactly one CAS pointer". It has one at a time:
 * `cms_sections.version` while the anchor row exists, `cms_pages.version` once
 * it does not. Which is which is `resolveFooterSection`'s answer, not this
 * file's guess.
 */

import { revalidateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSession } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { userHasCapability } from "@/lib/access/has-capability";
import { tagFor } from "@/lib/site-admin/cache-tags";
import { saveSectionDraftAction } from "@/lib/site-admin/edit-mode/section-actions";
import {
  readShellPageVersion,
  resolveShellLandmark,
  writeShellLandmarkNodeProps,
} from "@/lib/site-admin/edit-mode/shell-landmark-props-persist";
import { republishSiteShellSnapshot } from "@/lib/site-admin/edit-mode/site-shell-publish";
import {
  isShellMutationAllowedForPlan,
  shellEditModeForPlan,
} from "@/lib/site-admin/edit-mode/shell-plan-guard";
import { loadBuilderWorkspacePlan } from "@/lib/site-admin/builder-capabilities";
import type { Locale } from "@/i18n/config";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";


import { mergeFooterProps, readFooterValue } from "./config-merge";
import type { SiteFooterConfig, SiteFooterPatchInput } from "./types";

type ActionResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string; code?: string; currentVersion?: number };

/** The capability every footer read/write is gated on. */
const FOOTER_EDIT_CAPABILITY = "agency.site_admin.pages.edit";

/**
 * What the footer inspector is editing, and WHICH STORE owns it.
 *
 * The old body began at the slot pointer, so with no pointer it returned `null`
 * and the drawer failed with NOT_FOUND — the shell editor dies the moment Phase
 * 8B deletes the anchor rows. `resolveShellLandmark` begins at the shell page
 * and lets ownership decide. It carries the shell-page pick, the
 * draft-then-published pointer fallback, the bilingual `.maybeSingle()` fix and
 * the NODE-FIRST read, so the header and the footer cannot drift apart again.
 *
 *   `owner: "section"` — a `cms_sections` row exists. It stays the write spine
 *                        (Zod + CAS + audit + revision) and 8B's rollback
 *                        target; `version` is that row's, `props` is
 *                        node-first for display, and the save MIRRORS onto the
 *                        node when the landmark owns its config.
 *   `owner: "node"`    — no row left. The node IS the store; `version` is
 *                        `cms_pages.version` and the save CAS's on it.
 *   `null`             — neither exists. An honest empty state, never a save
 *                        that goes nowhere.
 */
type FooterSectionFacts =
  | {
      owner: "node";
      pageId: string;
      version: number;
      locale: string;
      props: Record<string, unknown>;
      /** The shell `cms_pages` row id — used for the read-only child count. */
      shellPageId: string;
    }
  | {
      owner: "section";
      sectionId: string;
      sectionTypeKey: string;
      schemaVersion: number;
      name: string;
      version: number;
      locale: string;
      props: Record<string, unknown>;
      /**
       * The shell `cms_pages` row id — used for the read-only child count, and
       * for the landmark-node props mirror.
       */
      shellPageId: string;
    };

async function resolveFooterSection(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<FooterSectionFacts | null> {
  const resolved = await resolveShellLandmark(supabase, {
    tenantId,
    side: "footer",
  });
  if (resolved.target.kind === "none" || !resolved.shellPageId) return null;
  if (resolved.target.kind === "node") {
    return {
      owner: "node",
      pageId: resolved.target.pageId,
      version: resolved.target.version,
      locale: resolved.target.locale,
      props: resolved.target.props,
      shellPageId: resolved.shellPageId,
    };
  }
  return {
    owner: "section",
    sectionId: resolved.target.sectionId,
    sectionTypeKey: resolved.target.sectionTypeKey,
    schemaVersion: resolved.target.schemaVersion,
    name: resolved.target.name,
    version: resolved.target.version,
    locale: resolved.target.locale,
    props: resolved.target.props,
    shellPageId: resolved.shellPageId,
  };
}

/**
 * READ-ONLY count of the footer landmark's freeform children.
 *
 * Returns null when the shell has no freeform draft yet (a tenant still on the
 * legacy slot path) — "unknown", which the drawer renders as nothing at all,
 * rather than a misleading "0 custom blocks".
 */
async function countFooterFreeformChildren(
  supabase: SupabaseClient,
  tenantId: string,
  shellPageId: string,
): Promise<number | null> {
  const { data } = await supabase
    .from("cms_pages")
    .select("blocks")
    .eq("id", shellPageId)
    .eq("tenant_id", tenantId)
    .maybeSingle<{ blocks: unknown }>();
  if (!data || !Array.isArray(data.blocks)) return null;
  for (const node of data.blocks as BuilderNode[]) {
    if (
      node?.kind === "section" &&
      (node.props as { sectionTypeKey?: unknown })?.sectionTypeKey === "site_footer"
    ) {
      return Array.isArray(node.children) ? node.children.length : 0;
    }
  }
  return null;
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function loadFooterConfigAction(): Promise<
  ActionResult<{ config: SiteFooterConfig; shellEditMode: "locked" | "basic" | "full" }>
> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return { ok: false, error: "No tenant in scope. Pick a workspace." };
  }
  if (!(await userHasCapability(FOOTER_EDIT_CAPABILITY, scope.tenantId))) {
    return { ok: false, error: "You don't have permission to edit this site." };
  }

  const facts = await resolveFooterSection(auth.supabase, scope.tenantId);
  if (!facts) {
    return {
      ok: false,
      error: "Site footer section not found.",
      code: "NOT_FOUND",
    };
  }

  const plan = await loadBuilderWorkspacePlan(auth.supabase, scope.tenantId, {
    logTag: "site_footer.load",
  });
  const freeformChildCount = await countFooterFreeformChildren(
    auth.supabase,
    scope.tenantId,
    facts.shellPageId,
  );

  return {
    ok: true,
    shellEditMode: shellEditModeForPlan(plan),
    config: {
      // On the node-primary path there is no section row; this is the shell
      // page id, and nothing reads it as a `cms_sections` key.
      sectionId: facts.owner === "node" ? facts.pageId : facts.sectionId,
      version: facts.version,
      locale: facts.locale,
      value: readFooterValue(facts.props),
      freeformChildCount,
    },
  };
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Persist one inspector patch.
 *
 * The patch is merged onto the row's CURRENT props (re-read here, not trusted
 * from the client) by the pure `mergeFooterProps`, so a field the inspector does
 * not model cannot be dropped by a stale client payload either.
 */
export async function saveFooterSectionAction(input: {
  expectedVersion: number;
  patch: SiteFooterPatchInput;
}): Promise<ActionResult<{ version: number }>> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "No tenant in scope." };
  if (!(await userHasCapability(FOOTER_EDIT_CAPABILITY, scope.tenantId))) {
    return { ok: false, error: "You don't have permission to edit this site." };
  }

  // Plan gate — the shared shell predicate, same one the dock's ShellLockedState
  // renders from. Server-side because the client gate is a UX affordance, not a
  // boundary: a free-plan operator with a stale bundle must still be refused.
  const plan = await loadBuilderWorkspacePlan(auth.supabase, scope.tenantId, {
    logTag: "site_footer.save",
  });
  if (
    !isShellMutationAllowedForPlan({
      systemTemplateKey: "site_shell",
      planTier: plan,
    })
  ) {
    return {
      ok: false,
      error: "Editing the shared footer is available on a paid plan.",
      code: "PLAN_LOCKED",
    };
  }

  const facts = await resolveFooterSection(auth.supabase, scope.tenantId);
  if (!facts) {
    return {
      ok: false,
      error: "Site footer section not found.",
      code: "NOT_FOUND",
    };
  }

  const nextProps = mergeFooterProps(facts.props, input.patch);

  // NODE-PRIMARY — Phase 8B has deleted this landmark's anchor row, so there is
  // no `cms_sections` write to make and no row CAS to hang off. The node is the
  // store. Before this branch existed the resolver returned null here and the
  // whole drawer failed with NOT_FOUND.
  if (facts.owner === "node") {
    const written = await writeShellLandmarkNodeProps(auth.supabase, {
      tenantId: scope.tenantId,
      shellPageId: facts.pageId,
      side: "footer",
      nextProps,
      expectedPageVersion: input.expectedVersion,
    });
    if (!written.ok) {
      return {
        ok: false,
        error: written.error,
        code: written.code,
        currentVersion: written.currentVersion,
      };
    }
    const nodeRep = await republishSiteShellSnapshot(auth.supabase, {
      tenantId: scope.tenantId,
      locale: facts.locale as Locale,
      actorProfileId: null,
    });
    if (!nodeRep.ok) return { ok: false, error: nodeRep.error };

    revalidateTag(tagFor(scope.tenantId, "pages-all"), "default");
    revalidateTag(tagFor(scope.tenantId, "storefront"), "default");

    // The republish bumps `cms_pages.version` again — read back the value the
    // drawer must hold for its next CAS rather than deriving it.
    const current = await readShellPageVersion(auth.supabase, {
      tenantId: scope.tenantId,
      pageId: facts.pageId,
    });
    return {
      ok: true,
      version: current ?? written.version ?? input.expectedVersion,
    };
  }

  const res = await saveSectionDraftAction({
    id: facts.sectionId,
    sectionTypeKey: facts.sectionTypeKey,
    schemaVersion: facts.schemaVersion,
    name: facts.name,
    props: nextProps,
    expectedVersion: input.expectedVersion,
  });
  if (!res.ok) {
    return {
      ok: false,
      error: res.error,
      code: res.code,
      currentVersion: res.currentVersion,
    };
  }

  // MIRROR onto the landmark node when it owns its config inline — the footer
  // carries the identical bug the header does: once the `site_footer` landmark
  // has inline `sectionProps`, `resolveShellLandmarkSectionProps` makes the node
  // win and this row write stops reaching the live site. A no-op, and no
  // `cms_pages` write at all, on every slot-owned shell. Must run BEFORE the
  // republish, which bakes `blocks` into the rendered snapshot.
  //
  // `expectedPageVersion: null` is MIRROR mode: the authoritative CAS was the
  // row's, applied above, so this must not impose a second one.
  const mirror = await writeShellLandmarkNodeProps(auth.supabase, {
    tenantId: scope.tenantId,
    shellPageId: facts.shellPageId,
    side: "footer",
    nextProps,
    expectedPageVersion: null,
  });
  if (!mirror.ok) return { ok: false, error: mirror.error };

  // Re-bake the published shell snapshot — the renderer reads the snapshot, not
  // the draft section row, so without this the operator's edit lands in the DB
  // and never appears on the page. (This is the same step the header's section
  // save takes, and the reason it takes it.)
  const rep = await republishSiteShellSnapshot(auth.supabase, {
    tenantId: scope.tenantId,
    locale: facts.locale as Locale,
    actorProfileId: null,
  });
  if (!rep.ok) return { ok: false, error: rep.error };

  revalidateTag(tagFor(scope.tenantId, "pages-all"), "default");
  revalidateTag(tagFor(scope.tenantId, "storefront"), "default");

  return { ok: true, version: res.version };
}
