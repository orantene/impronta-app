"use server";

/**
 * Server actions for the in-canvas `<SiteFooterInspector>`.
 *
 * Deliberately the NARROWEST possible mirror of `site-header/actions.ts`. The
 * header inspector spans three tables (identity / branding / navigation) plus
 * the section row, and needs a five-kind save queue to keep their CAS pointers
 * straight. The footer's entire configuration already lives in ONE place — the
 * `site_footer` section's `props_jsonb` — so this file has exactly one write
 * path and one CAS pointer. Inventing the header's multi-kind machinery here
 * would be complexity with nothing behind it.
 *
 * WRITE TARGET, AND THE PROPERTY THAT DEPENDS ON IT
 * --------------------------------------------------------------------------
 * The save goes through the EXISTING canonical `saveSectionDraftAction` (Zod +
 * CAS + audit + revision) against `cms_sections`, then re-bakes the shell
 * snapshot via the EXISTING `republishSiteShellSnapshot`. It NEVER writes
 * `cms_pages.blocks`.
 *
 * That is what makes "an inspector save preserves the landmark's freeform
 * children" true by construction rather than by care: the children live in
 * `blocks`, and this module has no code path that reaches them. A static guard
 * (`freeform-children-untouched.test.ts`) pins the property to the source so a
 * future refactor that adds a `blocks` write here fails CI instead of silently
 * deleting operator content.
 *
 * The read DOES touch `cms_pages.blocks` — read-only, to count the landmark's
 * freeform children so the drawer can tell the operator they exist. A count is
 * not a write; the guard distinguishes the two.
 */

import { revalidateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSession } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { userHasCapability } from "@/lib/access/has-capability";
import { tagFor } from "@/lib/site-admin/cache-tags";
import { saveSectionDraftAction } from "@/lib/site-admin/edit-mode/section-actions";
import { republishSiteShellSnapshot } from "@/lib/site-admin/edit-mode/site-shell-publish";
import {
  isShellMutationAllowedForPlan,
  shellEditModeForPlan,
} from "@/lib/site-admin/edit-mode/shell-plan-guard";
import { loadBuilderWorkspacePlan } from "@/lib/site-admin/builder-capabilities";
import type { Locale } from "@/i18n/config";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import { pickShellPageForLocale } from "@/lib/site-admin/site-header/shell-page-pick";

import { mergeFooterProps, readFooterValue } from "./config-merge";
import type { SiteFooterConfig, SiteFooterPatchInput } from "./types";

type ActionResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string; code?: string; currentVersion?: number };

/** The capability every footer read/write is gated on. */
const FOOTER_EDIT_CAPABILITY = "agency.site_admin.pages.edit";

interface FooterSectionFacts {
  sectionId: string;
  sectionTypeKey: string;
  schemaVersion: number;
  name: string;
  version: number;
  locale: string;
  props: Record<string, unknown>;
  /** The shell `cms_pages` row id — used for the read-only child count. */
  shellPageId: string;
}

/**
 * Resolve the tenant's `site_footer` section row.
 *
 * Byte-for-byte the header's `resolveHeaderSection` with `slot_key = "footer"`,
 * including the draft-then-published pointer fallback: a tenant whose shell has
 * been published but never re-drafted has no `is_draft = true` pointer, and
 * without the fallback the inspector would report "not found" on exactly the
 * tenants whose footer is live.
 */
async function resolveFooterSection(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<FooterSectionFacts | null> {
  // 2026-08-17 — this used `.maybeSingle()`, the exact bug the header already
  // fixed: with one shell page PER LOCALE, PostgREST errors instead of picking,
  // and every footer control silently renders its empty state on a bilingual
  // tenant. Ported verbatim from `resolveHeaderSection`; the rule + its test
  // live in `site-header/shell-page-pick.ts`.
  const { data: shells } = await supabase
    .from("cms_pages")
    .select("id, locale")
    .eq("tenant_id", tenantId)
    .eq("system_template_key", "site_shell")
    .neq("status", "archived")
    .returns<Array<{ id: string; locale: string | null }>>();
  const { data: identity } = await supabase
    .from("agency_business_identity")
    .select("default_locale")
    .eq("tenant_id", tenantId)
    .maybeSingle<{ default_locale: string | null }>();
  const shell = pickShellPageForLocale(
    shells ?? [],
    identity?.default_locale ?? "en",
  );
  if (!shell) return null;

  let { data: ptr } = await supabase
    .from("cms_page_sections")
    .select("section_id")
    .eq("tenant_id", tenantId)
    .eq("page_id", shell.id)
    .eq("slot_key", "footer")
    .eq("is_draft", true)
    .maybeSingle<{ section_id: string }>();
  if (!ptr) {
    ({ data: ptr } = await supabase
      .from("cms_page_sections")
      .select("section_id")
      .eq("tenant_id", tenantId)
      .eq("page_id", shell.id)
      .eq("slot_key", "footer")
      .eq("is_draft", false)
      .maybeSingle<{ section_id: string }>());
  }
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
    locale: shell.locale ?? "en",
    props: sec.props_jsonb ?? {},
    shellPageId: shell.id,
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
      sectionId: facts.sectionId,
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
