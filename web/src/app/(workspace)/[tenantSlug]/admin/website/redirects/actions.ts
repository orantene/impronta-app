"use server";

/**
 * Server actions for Website → Redirects (`admin/website/redirects`).
 *
 * Why these live here rather than reusing `lib/site-admin/cms-seo-actions.ts`:
 * those actions resolve the tenant with `requireTenantScope()`, which reads the
 * active-workspace COOKIE. That's right for the in-canvas storefront drawer
 * (one workspace, one host) but wrong for the workspace admin, where a user
 * with two memberships can be sitting on `/{otherSlug}/admin/...` while the
 * cookie still points at the workspace they opened first — the write would land
 * on the wrong tenant. Every action here takes the slug from the URL and
 * resolves it through `getTenantScopeBySlug`, which only matches workspaces the
 * caller is actually a member of.
 *
 * Gate: `agency.site_admin.pages.edit` — the same capability the storefront
 * drawer enforces, checked in-process because the writes use the service-role
 * client (which bypasses RLS) and the RLS that would apply is role-blind.
 *
 * Cache: writes bust the tenant `storefront` tag and revalidate this page. The
 * resolver (`lib/cms/middleware-redirect`) queries Postgres per request with no
 * cache of its own, so a saved redirect is live on the next request.
 */

import { revalidatePath } from "next/cache";
import { updateTag } from "next/cache";

import { userHasCapability } from "@/lib/access";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tagFor } from "@/lib/site-admin/cache-tags";
import { normalizeRedirectPair } from "@/lib/site-admin/cms-seo";
import {
  parseRedirectImport,
  REDIRECT_IMPORT_MAX,
  REDIRECT_LIST_LIMIT,
  type RedirectRecord,
} from "@/lib/site-admin/redirects";

const GENERIC_ERROR = "Couldn't save — try again.";

const SELECT_COLS = "id, old_path, new_path, status_code, active, created_at, updated_at";

type DbRow = {
  id: string;
  old_path: string;
  new_path: string;
  status_code: number;
  active: boolean;
  created_at: string;
  updated_at: string | null;
};

function toRecord(row: DbRow): RedirectRecord {
  return {
    id: row.id,
    oldPath: row.old_path,
    newPath: row.new_path,
    statusCode: row.status_code,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type Guard =
  | { ok: true; tenantId: string; userId: string; admin: NonNullable<ReturnType<typeof createServiceRoleClient>> }
  | { ok: false; error: string };

/**
 * Auth + membership + capability + service client in one call. Every exported
 * action starts here; there is no path to a write that skips it.
 */
async function requireRedirectsAdmin(tenantSlug: string): Promise<Guard> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not signed in." };

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) return { ok: false, error: "Workspace not found." };

  if (!(await userHasCapability("agency.site_admin.pages.edit", scope.tenantId))) {
    return { ok: false, error: "You don't have permission to manage redirects." };
  }

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  return { ok: true, tenantId: scope.tenantId, userId: session.user.id, admin };
}

function bust(tenantId: string, tenantSlug: string): void {
  updateTag(tagFor(tenantId, "storefront"));
  revalidatePath(`/${tenantSlug}/admin/website/redirects`);
}

/**
 * Friendlier text for the one constraint operators actually hit: the partial
 * unique index on (tenant_id, old_path) WHERE active.
 */
function mapWriteError(message: string, oldPath?: string): string {
  if (/duplicate key|unique/i.test(message)) {
    return oldPath
      ? `An active redirect from ${oldPath} already exists.`
      : "An active redirect from that path already exists.";
  }
  return GENERIC_ERROR;
}

// ── read ─────────────────────────────────────────────────────────────────────

export type ListResult =
  | { ok: true; redirects: RedirectRecord[] }
  | { ok: false; error: string };

export async function listRedirects(tenantSlug: string): Promise<ListResult> {
  const guard = await requireRedirectsAdmin(tenantSlug);
  if (!guard.ok) return guard;

  const { data, error } = await guard.admin
    .from("cms_redirects")
    .select(SELECT_COLS)
    .eq("tenant_id", guard.tenantId)
    .order("created_at", { ascending: false })
    .limit(REDIRECT_LIST_LIMIT);
  if (error) {
    logServerError("redirects/list", error);
    return { ok: false, error: "Couldn't load redirects — try again." };
  }
  return { ok: true, redirects: ((data ?? []) as DbRow[]).map(toRecord) };
}

// ── create ───────────────────────────────────────────────────────────────────

export type MutateResult =
  | { ok: true; redirect: RedirectRecord }
  | { ok: false; error: string };

export async function createRedirect(
  tenantSlug: string,
  input: { oldPath: string; newPath: string; statusCode?: number },
): Promise<MutateResult> {
  const guard = await requireRedirectsAdmin(tenantSlug);
  if (!guard.ok) return guard;

  const pair = normalizeRedirectPair(input);
  if (!pair.ok) return { ok: false, error: pair.error };

  const { data, error } = await guard.admin
    .from("cms_redirects")
    .insert({
      tenant_id: guard.tenantId,
      old_path: pair.oldPath,
      new_path: pair.newPath,
      status_code: pair.statusCode,
      active: true,
      created_by: guard.userId,
    })
    .select(SELECT_COLS)
    .single<DbRow>();
  if (error || !data) {
    logServerError("redirects/create", error);
    return { ok: false, error: mapWriteError(error?.message ?? "", pair.oldPath) };
  }

  bust(guard.tenantId, tenantSlug);
  return { ok: true, redirect: toRecord(data) };
}

// ── update (inline edit) ─────────────────────────────────────────────────────

/**
 * Edit an existing redirect's From / To / status in place.
 *
 * The row is re-read under the tenant filter first so a forged id from another
 * workspace can't be patched, and so the "no actual change" case can short out
 * before touching the unique index (re-saving a row with its own From path must
 * not read as a duplicate of itself).
 */
export async function updateRedirect(
  tenantSlug: string,
  input: { id: string; oldPath: string; newPath: string; statusCode?: number },
): Promise<MutateResult> {
  const guard = await requireRedirectsAdmin(tenantSlug);
  if (!guard.ok) return guard;

  const pair = normalizeRedirectPair(input);
  if (!pair.ok) return { ok: false, error: pair.error };

  const { data: current, error: loadErr } = await guard.admin
    .from("cms_redirects")
    .select(SELECT_COLS)
    .eq("id", input.id)
    .eq("tenant_id", guard.tenantId)
    .maybeSingle<DbRow>();
  if (loadErr || !current) return { ok: false, error: "Redirect not found." };

  const unchanged =
    current.old_path === pair.oldPath &&
    current.new_path === pair.newPath &&
    current.status_code === pair.statusCode;
  if (unchanged) return { ok: true, redirect: toRecord(current) };

  // Friendlier than the raw constraint: only an ACTIVE row can collide, and
  // only when the From path is moving onto one that's already claimed.
  if (current.active && current.old_path !== pair.oldPath) {
    const { data: clash } = await guard.admin
      .from("cms_redirects")
      .select("id")
      .eq("tenant_id", guard.tenantId)
      .eq("old_path", pair.oldPath)
      .eq("active", true)
      .neq("id", input.id)
      .maybeSingle<{ id: string }>();
    if (clash) {
      return { ok: false, error: `An active redirect from ${pair.oldPath} already exists.` };
    }
  }

  const { data, error } = await guard.admin
    .from("cms_redirects")
    .update({
      old_path: pair.oldPath,
      new_path: pair.newPath,
      status_code: pair.statusCode,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("tenant_id", guard.tenantId)
    .select(SELECT_COLS)
    .single<DbRow>();
  if (error || !data) {
    logServerError("redirects/update", error);
    return { ok: false, error: mapWriteError(error?.message ?? "", pair.oldPath) };
  }

  bust(guard.tenantId, tenantSlug);
  return { ok: true, redirect: toRecord(data) };
}

// ── enable / disable ─────────────────────────────────────────────────────────

export type SimpleResult = { ok: true } | { ok: false; error: string };

export async function setRedirectActive(
  tenantSlug: string,
  input: { id: string; active: boolean },
): Promise<SimpleResult> {
  const guard = await requireRedirectsAdmin(tenantSlug);
  if (!guard.ok) return guard;

  const { error } = await guard.admin
    .from("cms_redirects")
    .update({ active: input.active, updated_at: new Date().toISOString() })
    .eq("id", input.id)
    .eq("tenant_id", guard.tenantId);
  if (error) {
    logServerError("redirects/setActive", error);
    if (/duplicate key|unique/i.test(error.message ?? "")) {
      return {
        ok: false,
        error: "Another active redirect already uses that From path. Disable it first.",
      };
    }
    return { ok: false, error: GENERIC_ERROR };
  }

  bust(guard.tenantId, tenantSlug);
  return { ok: true };
}

// ── delete ───────────────────────────────────────────────────────────────────

export async function deleteRedirect(
  tenantSlug: string,
  input: { id: string },
): Promise<SimpleResult> {
  const guard = await requireRedirectsAdmin(tenantSlug);
  if (!guard.ok) return guard;

  const { error } = await guard.admin
    .from("cms_redirects")
    .delete()
    .eq("id", input.id)
    .eq("tenant_id", guard.tenantId);
  if (error) {
    logServerError("redirects/delete", error);
    return { ok: false, error: GENERIC_ERROR };
  }

  bust(guard.tenantId, tenantSlug);
  return { ok: true };
}

// ── bulk import ──────────────────────────────────────────────────────────────

export type ImportResult =
  | {
      ok: true;
      created: number;
      /** Rows the DB rejected, with the reason, so nothing fails silently. */
      failures: Array<{ line: number; path: string; error: string }>;
      redirects: RedirectRecord[];
    }
  | { ok: false; error: string };

/**
 * Insert a pasted batch. Parsing/validation is `parseRedirectImport`; this adds
 * the two things only the server can know — which From paths are already taken
 * in this tenant, and what the DB says about the rest.
 *
 * Inserted one row at a time rather than as a single `insert([...])`: a batch
 * insert is all-or-nothing, so one duplicate would throw away 200 good rows.
 * Per-row lets the good ones land and reports the rest by line number.
 */
export async function importRedirects(
  tenantSlug: string,
  text: string,
): Promise<ImportResult> {
  const guard = await requireRedirectsAdmin(tenantSlug);
  if (!guard.ok) return guard;

  const parsed = parseRedirectImport(text);
  const valid = parsed.rows.flatMap((r) => (r.ok ? [r] : []));
  if (valid.length === 0) {
    return { ok: false, error: "Nothing to import — every line had a problem." };
  }
  if (valid.length > REDIRECT_IMPORT_MAX) {
    return { ok: false, error: `Import at most ${REDIRECT_IMPORT_MAX} redirects at a time.` };
  }

  const { data: existingRows } = await guard.admin
    .from("cms_redirects")
    .select("old_path")
    .eq("tenant_id", guard.tenantId)
    .eq("active", true);
  const taken = new Set(
    ((existingRows ?? []) as Array<{ old_path: string }>).map((r) => r.old_path),
  );

  const failures: Array<{ line: number; path: string; error: string }> = [];
  const created: RedirectRecord[] = [];

  for (const row of valid) {
    if (taken.has(row.oldPath)) {
      failures.push({
        line: row.line,
        path: row.oldPath,
        error: "An active redirect from this path already exists.",
      });
      continue;
    }
    const { data, error } = await guard.admin
      .from("cms_redirects")
      .insert({
        tenant_id: guard.tenantId,
        old_path: row.oldPath,
        new_path: row.newPath,
        status_code: row.statusCode,
        active: true,
        created_by: guard.userId,
      })
      .select(SELECT_COLS)
      .single<DbRow>();
    if (error || !data) {
      logServerError("redirects/import", error);
      failures.push({
        line: row.line,
        path: row.oldPath,
        error: mapWriteError(error?.message ?? ""),
      });
      continue;
    }
    taken.add(row.oldPath);
    created.push(toRecord(data));
  }

  if (created.length > 0) bust(guard.tenantId, tenantSlug);
  return { ok: true, created: created.length, failures, redirects: created };
}
