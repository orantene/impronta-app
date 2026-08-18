"use server";

/**
 * admin-code-snippets.ts — CRUD + publish for the tenant custom-code library
 * (Website → Setup → Custom code).
 *
 * AUTH — owner class, not editor class
 * ────────────────────────────────────
 * Gated on `manage_agency_domains`, which `roles.ts` grants to `owner` and NOT
 * to `admin` (asserted in `access/roles.transaction-capabilities.test.ts`). That
 * is deliberate: this surface executes arbitrary code on the live public site,
 * so it belongs in the same tier as pointing the domain somewhere else, not in
 * the tier that edits page copy. `agency.site_admin.pages.edit` — what the
 * neighbouring Redirects surface uses — would have handed it to every editor.
 *
 * TENANT SCOPE
 * ────────────
 * `requireWorkspaceStaffAction` resolves the tenant from the caller's ACTIVE
 * workspace scope and proves an active membership whose role grants the
 * capability. `tenantId` therefore never comes from client input, and every
 * query runs through `tenantScopedQuery` so the filter cannot be forgotten
 * (`ratchet/no-untenanted-from` enforces that in this directory).
 *
 * The row id in an update/delete IS client input, so every write is additionally
 * pinned by the tenant filter that `tenantScopedQuery` applies — a forged id
 * belonging to another workspace matches zero rows rather than being patched.
 *
 * CACHE
 * ─────
 * Writes bust the tenant `storefront` tag, which is what
 * `loadPublishedCodeSnippets` is tagged with, so publish/unpublish is live on
 * the next storefront request rather than at TTL expiry.
 */

import { updateTag } from "next/cache";

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { tagFor } from "@/lib/site-admin/cache-tags";
import {
  CODE_SNIPPET_LIST_LIMIT,
  canAddSnippet,
  isCodeSnippetKind,
  isCodeSnippetPlacement,
  normalizeCodeSnippetInput,
  type CodeSnippetInput,
  type CodeSnippetRecord,
} from "@/lib/site-admin/code-snippets";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

const TABLE = "cms_code_snippets";

const SELECT_COLS =
  "id, name, kind, code, src_url, placement, is_published, published_at, created_at, updated_at, sort_order";

type DbRow = {
  id: string;
  name: string;
  kind: string;
  code: string | null;
  src_url: string | null;
  placement: string;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string | null;
  sort_order: number | null;
};

/**
 * Map a row for the admin list. An unknown kind/placement (a row from a newer
 * deploy) is dropped rather than coerced — the same rule the render path uses,
 * for the same reason.
 */
function toRecord(row: DbRow): CodeSnippetRecord | null {
  if (!isCodeSnippetKind(row.kind)) return null;
  if (!isCodeSnippetPlacement(row.placement)) return null;
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    code: row.code ?? "",
    srcUrl: row.src_url,
    placement: row.placement,
    isPublished: row.is_published === true,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sortOrder: row.sort_order ?? 0,
  };
}

function mapRows(rows: DbRow[] | null): CodeSnippetRecord[] {
  return (rows ?? []).flatMap((r) => {
    const rec = toRecord(r);
    return rec ? [rec] : [];
  });
}

export type CodeSnippetListResult =
  | { ok: true; snippets: CodeSnippetRecord[]; canAddMore: boolean }
  | { ok: false; error: string };

export type CodeSnippetMutateResult =
  | { ok: true; snippet: CodeSnippetRecord }
  | { ok: false; error: string };

export type CodeSnippetSimpleResult = { ok: true } | { ok: false; error: string };

/** Every action starts here; there is no path to a write that skips it. */
async function guard() {
  return requireWorkspaceStaffAction({ capability: "manage_agency_domains" });
}

// ── read ─────────────────────────────────────────────────────────────────────

export async function listCodeSnippets(): Promise<CodeSnippetListResult> {
  const auth = await guard();
  if (!auth.ok) return { ok: false, error: auth.error };

  const { data, error } = await tenantScopedQuery(auth.supabase, TABLE, auth.tenantId)
    .select(SELECT_COLS)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(CODE_SNIPPET_LIST_LIMIT)
    .returns<DbRow[]>();
  if (error) {
    logServerError("admin-code-snippets.list", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  const snippets = mapRows(data);
  return { ok: true, snippets, canAddMore: canAddSnippet(snippets.length) };
}

// ── create ───────────────────────────────────────────────────────────────────

/**
 * A new snippet always starts as a DRAFT. Publishing is a second, explicit act
 * — nobody should be able to put code on the live site with one click of Save.
 */
export async function createCodeSnippet(
  input: CodeSnippetInput,
): Promise<CodeSnippetMutateResult> {
  const auth = await guard();
  if (!auth.ok) return { ok: false, error: auth.error };

  const normalized = normalizeCodeSnippetInput(input);
  if (!normalized.ok) return { ok: false, error: normalized.error };

  const { count, error: countErr } = await tenantScopedQuery(
    auth.supabase,
    TABLE,
    auth.tenantId,
  ).select("id", { count: "exact", head: true });
  if (countErr) {
    logServerError("admin-code-snippets.create.count", countErr);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
  if (!canAddSnippet(count ?? 0)) {
    return {
      ok: false,
      error: `You can keep up to ${CODE_SNIPPET_LIST_LIMIT} snippets. Delete one you no longer use first.`,
    };
  }

  const { data, error } = await tenantScopedQuery(auth.supabase, TABLE, auth.tenantId)
    .insert({
      name: normalized.value.name,
      kind: normalized.value.kind,
      code: normalized.value.code,
      src_url: normalized.value.srcUrl,
      placement: normalized.value.placement,
      is_published: false,
      sort_order: count ?? 0,
      created_by: auth.user.id,
    })
    .select(SELECT_COLS)
    .single<DbRow>();
  const record = data ? toRecord(data) : null;
  if (error || !record) {
    logServerError("admin-code-snippets.create", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  // A draft changes nothing on the live site, but busting keeps the read path
  // honest if the row is published in the same session.
  updateTag(tagFor(auth.tenantId, "storefront"));
  return { ok: true, snippet: record };
}

// ── update ───────────────────────────────────────────────────────────────────

/**
 * Edit a snippet in place.
 *
 * Editing a PUBLISHED snippet changes the live site immediately — that is the
 * behaviour operators expect from every other CMS, and the admin copy says so.
 * `published_at` is left alone so the list keeps showing when the snippet first
 * went live rather than resetting on every typo fix.
 */
export async function updateCodeSnippet(
  input: CodeSnippetInput & { id: string },
): Promise<CodeSnippetMutateResult> {
  const auth = await guard();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!input.id) return { ok: false, error: CLIENT_ERROR.generic };

  const normalized = normalizeCodeSnippetInput(input);
  if (!normalized.ok) return { ok: false, error: normalized.error };

  const { data, error } = await tenantScopedQuery(auth.supabase, TABLE, auth.tenantId)
    .update({
      name: normalized.value.name,
      kind: normalized.value.kind,
      code: normalized.value.code,
      src_url: normalized.value.srcUrl,
      placement: normalized.value.placement,
    })
    .eq("id", input.id)
    .select(SELECT_COLS)
    .maybeSingle<DbRow>();
  if (error) {
    logServerError("admin-code-snippets.update", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  const record = data ? toRecord(data) : null;
  if (!record) return { ok: false, error: "That snippet no longer exists." };

  updateTag(tagFor(auth.tenantId, "storefront"));
  return { ok: true, snippet: record };
}

// ── publish / unpublish ──────────────────────────────────────────────────────

/**
 * The kill switch. Unpublishing removes the snippet from every page on the next
 * request WITHOUT losing the code, which is the whole reason a per-snippet flag
 * exists instead of one blob.
 *
 * `published_at` is stamped on the first publish and kept afterwards, so the
 * list can answer "since when has this been on my site".
 */
export async function setCodeSnippetPublished(input: {
  id: string;
  isPublished: boolean;
}): Promise<CodeSnippetMutateResult> {
  const auth = await guard();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!input.id) return { ok: false, error: CLIENT_ERROR.generic };

  const { data: current, error: loadErr } = await tenantScopedQuery(
    auth.supabase,
    TABLE,
    auth.tenantId,
  )
    .select(SELECT_COLS)
    .eq("id", input.id)
    .maybeSingle<DbRow>();
  if (loadErr) {
    logServerError("admin-code-snippets.publish.load", loadErr);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
  const existing = current ? toRecord(current) : null;
  if (!existing) return { ok: false, error: "That snippet no longer exists." };

  // Re-validate on the way out: a row that predates a tightening of the rules
  // must not be publishable just because it is already stored.
  if (input.isPublished) {
    const recheck = normalizeCodeSnippetInput({
      name: existing.name,
      kind: existing.kind,
      code: existing.code,
      srcUrl: existing.srcUrl,
      placement: existing.placement,
    });
    if (!recheck.ok) return { ok: false, error: recheck.error };
  }

  const { data, error } = await tenantScopedQuery(auth.supabase, TABLE, auth.tenantId)
    .update({
      is_published: input.isPublished,
      // The DB CHECK requires a stamp on any published row; keep the original
      // date once set so "published on" does not drift on a re-publish.
      published_at: input.isPublished
        ? (existing.publishedAt ?? new Date().toISOString())
        : existing.publishedAt,
      published_by: input.isPublished ? auth.user.id : null,
    })
    .eq("id", input.id)
    .select(SELECT_COLS)
    .maybeSingle<DbRow>();
  if (error) {
    logServerError("admin-code-snippets.publish", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  const record = data ? toRecord(data) : null;
  if (!record) return { ok: false, error: "That snippet no longer exists." };

  updateTag(tagFor(auth.tenantId, "storefront"));
  return { ok: true, snippet: record };
}

// ── delete ───────────────────────────────────────────────────────────────────

export async function deleteCodeSnippet(input: {
  id: string;
}): Promise<CodeSnippetSimpleResult> {
  const auth = await guard();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!input.id) return { ok: false, error: CLIENT_ERROR.generic };

  const { error } = await tenantScopedQuery(auth.supabase, TABLE, auth.tenantId)
    .delete()
    .eq("id", input.id);
  if (error) {
    logServerError("admin-code-snippets.delete", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  updateTag(tagFor(auth.tenantId, "storefront"));
  return { ok: true };
}
