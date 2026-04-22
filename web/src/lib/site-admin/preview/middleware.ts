/**
 * Phase 5 — preview gate for middleware.
 *
 * Call from web/src/middleware.ts on public surfaces. Returns a
 * PreviewState which the downstream route uses to:
 *   - include draft/unpublished rows in reads
 *   - set `noindex` meta
 *   - bypass `fetch` cache (cache: 'no-store')
 *
 * Invalid cookies are silently dropped; the request proceeds as a
 * normal published read.
 *
 * Two entry points:
 *   - `readPreviewFromRequest(req, resolvedTenantId)` — cookie path. Used
 *     on every public-surface request after the first. Reads the
 *     tenant-scoped cookie set during the query-param handoff.
 *   - `readPreviewFromQueryParam(req, resolvedTenantId)` — URL path. Used
 *     only when the top-level middleware detects `?preview=<jwt>`. The
 *     middleware then redirects to a clean URL with the tenant-scoped
 *     cookie set, so subsequent loads hit the cookie path.
 *
 * The tenantId parameter is required on both paths — the caller has
 * already resolved the host to a tenant, and we cross-check to reject
 * mismatched JWTs (wrong tenant, spoofed token, etc.).
 */

import type { NextRequest } from "next/server";

import {
  PREVIEW_COOKIE_NAME,
  PREVIEW_QUERY_PARAM,
  previewCookieNameFor,
} from "./cookie";
// Edge-runtime safe verifier (Web Crypto). The Node-API verifier in
// ./jwt.ts is used by server components + actions; this module is
// imported only by the top-level middleware which runs on Edge.
import { verifyPreviewJwtEdge } from "./jwt-edge";

export interface PreviewState {
  active: boolean;
  tenantId: string | null;
  actorProfileId: string | null;
  subject: string | null;
  reason?: string;
}

export const PREVIEW_OFF: PreviewState = {
  active: false,
  tenantId: null,
  actorProfileId: null,
  subject: null,
};

/**
 * Read the preview cookie for this tenant. Legacy unscoped-name cookies
 * are ignored — only tenant-scoped cookies count, so cross-tenant leaks
 * are impossible by construction.
 *
 * Async because Web Crypto's `sign`/`verify` are async under the Edge
 * runtime where this runs.
 */
export async function readPreviewFromRequest(
  req: NextRequest,
  resolvedTenantId: string | null,
): Promise<PreviewState> {
  if (!resolvedTenantId) return PREVIEW_OFF;
  let cookieName: string;
  try {
    cookieName = previewCookieNameFor(resolvedTenantId);
  } catch {
    return PREVIEW_OFF;
  }
  const cookie = req.cookies.get(cookieName);
  if (!cookie?.value) return PREVIEW_OFF;
  const result = await verifyPreviewJwtEdge(cookie.value);
  if (!result.ok) {
    return { ...PREVIEW_OFF, reason: result.reason };
  }
  if (result.claims.tenantId !== resolvedTenantId) {
    return { ...PREVIEW_OFF, reason: "tenant_mismatch" };
  }
  return {
    active: true,
    tenantId: result.claims.tenantId,
    actorProfileId: result.claims.actorProfileId,
    subject: result.claims.subject,
  };
}

/**
 * Read the preview JWT from the `?preview=<jwt>` query param. Returns
 * `{ ok: true, claims }` when the token is structurally valid, not
 * expired, and the `tid` claim matches the host's resolved tenant. The
 * caller is responsible for:
 *   1. Setting the tenant-scoped cookie from the returned token.
 *   2. 302-redirecting to the same URL with the `preview` param stripped.
 */
export type QueryParamPreviewResult =
  | {
      ok: true;
      token: string;
      tenantId: string;
      actorProfileId: string;
      subject: string;
    }
  | { ok: false; reason: "absent" | "invalid" | "tenant_mismatch" };

export async function readPreviewFromQueryParam(
  req: NextRequest,
  resolvedTenantId: string | null,
): Promise<QueryParamPreviewResult> {
  const token = req.nextUrl.searchParams.get(PREVIEW_QUERY_PARAM);
  if (!token) return { ok: false, reason: "absent" };
  if (!resolvedTenantId) return { ok: false, reason: "tenant_mismatch" };
  const result = await verifyPreviewJwtEdge(token);
  if (!result.ok) return { ok: false, reason: "invalid" };
  if (result.claims.tenantId !== resolvedTenantId) {
    return { ok: false, reason: "tenant_mismatch" };
  }
  return {
    ok: true,
    token,
    tenantId: result.claims.tenantId,
    actorProfileId: result.claims.actorProfileId,
    subject: result.claims.subject,
  };
}

/**
 * Returns true if the preview cookie belongs to the resolved tenant for
 * the current public-surface host. Mismatched previews are discarded
 * (PREVIEW_TENANT_MISMATCH).
 */
export function previewMatchesTenant(
  state: PreviewState,
  resolvedTenantId: string,
): boolean {
  return state.active && state.tenantId === resolvedTenantId;
}

/** Legacy unscoped-cookie helper — kept for reference, should not be used. */
export const LEGACY_PREVIEW_COOKIE_NAME = PREVIEW_COOKIE_NAME;
