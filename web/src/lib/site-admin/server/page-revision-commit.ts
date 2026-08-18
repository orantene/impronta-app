/**
 * Shared WAVE1-1.5 commit: write the revision, THEN bump `cms_pages.version`.
 *
 * Homepage already does this via `commitHomepageRevisionThenVersion`. Inner
 * cms-page save and publish still bumped first and inserted the revision last,
 * so a killed request after the CAS left version N+1 with no matching tree.
 *
 * This helper is snapshot-agnostic. Callers build their own JSONB (homepage
 * nested shape vs flat cms-page shape) and pass it in. Compensation deletes
 * the minted revision if the CAS loses, so no orphan is left at a version
 * that never happened.
 */

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { improntaLog } from "@/lib/server/structured-log";

export type PageRevisionKind = "draft" | "published" | "rollback";

export type PageRevisionCommitResult =
  | { ok: true }
  | {
      ok: false;
      reason: "revision_insert" | "cas_error" | "cas_conflict";
      message?: string;
    };

export async function commitPageRevisionThenVersion(
  supabase: SupabaseClient,
  args: {
    tenantId: string;
    pageId: string;
    beforeVersion: number;
    update: Record<string, unknown> & { version: number };
    revision: {
      kind: PageRevisionKind;
      version: number;
      templateSchemaVersion: number;
      snapshot: Record<string, unknown>;
    };
    actorProfileId: string | null;
    logScope?: string;
  },
): Promise<PageRevisionCommitResult> {
  const logScope = args.logScope ?? "site-admin/page-revision-commit";
  const revisionId = randomUUID();

  const { error: revErr } = await supabase.from("cms_page_revisions").insert({
    id: revisionId,
    tenant_id: args.tenantId,
    page_id: args.pageId,
    kind: args.revision.kind,
    version: args.revision.version,
    template_schema_version: args.revision.templateSchemaVersion,
    snapshot: args.revision.snapshot,
    created_by: args.actorProfileId,
  });
  if (revErr) {
    void improntaLog("site_admin_pages.warn", {
      message: `[${logScope}] revision insert failed — version not bumped`,
      tenantId: args.tenantId,
      pageId: args.pageId,
      kind: args.revision.kind,
      version: args.revision.version,
      error: revErr.message,
    });
    return { ok: false, reason: "revision_insert", message: revErr.message };
  }

  const { data: updated, error: updErr } = await supabase
    .from("cms_pages")
    .update(args.update)
    .eq("id", args.pageId)
    .eq("tenant_id", args.tenantId)
    .eq("version", args.beforeVersion)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (updErr || !updated) {
    const { error: cleanupErr } = await supabase
      .from("cms_page_revisions")
      .delete()
      .eq("id", revisionId)
      .eq("tenant_id", args.tenantId);
    if (cleanupErr) {
      void improntaLog("site_admin_pages.warn", {
        message: `[${logScope}] orphan revision cleanup failed`,
        tenantId: args.tenantId,
        pageId: args.pageId,
        revisionId,
        error: cleanupErr.message,
      });
    }
    if (updErr) {
      return { ok: false, reason: "cas_error", message: updErr.message };
    }
    return { ok: false, reason: "cas_conflict" };
  }

  return { ok: true };
}
