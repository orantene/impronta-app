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
 */

import type { NextRequest } from "next/server";

import { PREVIEW_COOKIE_NAME } from "./cookie";
import { verifyPreviewJwt } from "./jwt";

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

export function readPreviewFromRequest(req: NextRequest): PreviewState {
  const cookie = req.cookies.get(PREVIEW_COOKIE_NAME);
  if (!cookie?.value) return PREVIEW_OFF;
  const result = verifyPreviewJwt(cookie.value);
  if (!result.ok) {
    return { ...PREVIEW_OFF, reason: result.reason };
  }
  return {
    active: true,
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
