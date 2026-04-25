"use server";

/**
 * Phase 9 — share-link generation server action.
 *
 * Issues a signed share JWT bound to the current homepage's most recent
 * revision id. The operator presses "Share" in the topbar; the action
 * returns a public URL like `/share/<token>` that any client can open
 * to view the bound revision without staff authentication.
 *
 * Why bind to "most recent revision" by default:
 *   - The autosave pipeline writes a `cms_page_revisions` row of
 *     `kind='draft'` on every save, so "most recent" is always a fresh
 *     snapshot.
 *   - Operators who want to share an older state can rewind through
 *     the Revisions drawer first; the share action then captures
 *     whatever's now the latest revision row. (A Phase 9 follow-up
 *     adds an explicit `revisionId` parameter — for v1, the implicit
 *     "latest" is what the topbar Share button surfaces.)
 *
 * Capability gate: requireStaff + requireTenantScope, mirroring every
 * other edit-mode action wrapper. The JWT itself carries `tenantId` so
 * the public share route can re-verify scope without re-running auth.
 */

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { logServerError } from "@/lib/server/safe-error";
import { isLocale, type Locale } from "@/lib/site-admin/locales";
import { loadDraftHomepage } from "@/lib/site-admin/server/homepage-reads";
import {
  signShareJwt,
  SHARE_JWT_DEFAULT_TTL_SECONDS,
  SHARE_JWT_MAX_TTL_SECONDS,
  SHARE_JWT_MIN_TTL_SECONDS,
  type ShareCommentPermission,
} from "./jwt";

export interface CreateShareLinkInput {
  /** Locale of the homepage to share. Defaults to "en" if omitted. */
  locale?: string;
  /**
   * Lifetime in hours, clamped to [1, 720]. Default: 168 (7 days).
   * The JWT layer also clamps; double-clamping is intentional so an
   * out-of-range UI input can't accidentally extend the ceiling.
   */
  ttlHours?: number;
  /** Optional human label surfaced on the share landing page. */
  label?: string;
  /**
   * Phase 11 — comment permission level for the recipient. Defaults to
   * `none` (no comment access). The mint UI exposes this as a single
   * "Allow comments" checkbox that toggles between `none` and `rw`.
   */
  comment?: ShareCommentPermission;
}

export type CreateShareLinkResult =
  | {
      ok: true;
      /** Path-only share URL — caller composes with `window.location.origin`. */
      path: string;
      token: string;
      pageId: string;
      revisionId: string;
      expiresAt: string;
      label: string | null;
    }
  | { ok: false; error: string; code?: string };

function asLocale(raw: string | undefined): Locale | null {
  return isLocale(raw ?? "en") ? (raw ?? "en") as Locale : null;
}

const HOURS_TO_SECONDS = 60 * 60;

export async function createShareLinkAction(
  input: CreateShareLinkInput = {},
): Promise<CreateShareLinkResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before issuing a share link.",
    };
  }

  const locale = asLocale(input.locale);
  if (!locale) {
    return { ok: false, error: `Unsupported locale "${input.locale}".` };
  }

  try {
    const page = await loadDraftHomepage(scope.tenantId, locale);
    if (!page) {
      return {
        ok: false,
        error: "Homepage not seeded for this locale.",
        code: "NOT_FOUND",
      };
    }

    // Pick the latest revision row for this page. The autosave path
    // writes a draft revision on every save, so this is always the
    // freshest state. Falls through to NOT_FOUND when a brand-new
    // tenant has zero revisions yet — in that case a publish or save
    // first is required before sharing makes sense.
    const { data: latestRev, error: revErr } = await auth.supabase
      .from("cms_page_revisions")
      .select("id, created_at, kind, version")
      .eq("page_id", page.pageId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (revErr) {
      logServerError("share-link/select-latest-revision", revErr);
      return { ok: false, error: "Failed to read revision history." };
    }
    if (!latestRev) {
      return {
        ok: false,
        error: "No revisions to share yet — save a draft first.",
        code: "NO_REVISIONS",
      };
    }

    // Clamp TTL twice (UI + JWT layer) so an out-of-range value can't
    // accidentally extend the ceiling.
    const ttlSeconds = (() => {
      const requested = input.ttlHours ?? null;
      if (requested === null || !Number.isFinite(requested)) {
        return SHARE_JWT_DEFAULT_TTL_SECONDS;
      }
      return Math.max(
        SHARE_JWT_MIN_TTL_SECONDS,
        Math.min(SHARE_JWT_MAX_TTL_SECONDS, requested * HOURS_TO_SECONDS),
      );
    })();

    const label = input.label?.trim() ? input.label.trim().slice(0, 80) : undefined;

    const signed = signShareJwt(
      {
        tenantId: scope.tenantId,
        pageId: page.pageId,
        revisionId: (latestRev as { id: string }).id,
        issuerProfileId: auth.user.id,
        label,
        comment: input.comment ?? "none",
      },
      ttlSeconds,
    );

    return {
      ok: true,
      path: `/share/${signed.token}`,
      token: signed.token,
      pageId: page.pageId,
      revisionId: (latestRev as { id: string }).id,
      expiresAt: signed.expiresAt.toISOString(),
      label: label ?? null,
    };
  } catch (error) {
    logServerError("share-link/create", error);
    return { ok: false, error: "Failed to generate share link." };
  }
}
