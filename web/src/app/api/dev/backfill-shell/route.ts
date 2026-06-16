/**
 * DEV + PREVIEW shell-backfill trigger (QA harness).
 *
 * GET /api/dev/backfill-shell
 *
 * Calls `backfillSiteShellForCurrentTenant()` under the current request's
 * cookie session, so a QA agent on a tenant host can idempotently seed that
 * tenant's `site_shell` row without an onboarding flow. The backfill action
 * resolves scope itself (requireStaff + requireTenantScope) — this route adds
 * no auth of its own beyond mirroring the dev/preview gate below; the action's
 * own guards reject unauthenticated / unscoped callers with an `{ ok: false }`.
 *
 * Allowed in:
 *   - NODE_ENV=development (local `npm run dev` / `npm run dev:qa`)
 *   - VERCEL_ENV=preview (Vercel preview deploys — already SSO-gated behind
 *     the Vercel team-auth wall, so the relaxation doesn't expose anything
 *     to anonymous internet visitors)
 * Blocked in production (NODE_ENV=production AND VERCEL_ENV=production) — the
 * handler returns HTTP 403 in that path (see the !isDev && !isPreview guard),
 * matching `api/dev/signin/route.ts`. Also covered by proxy.ts's `/api/dev/`
 * host-resolution bypass (dev/preview only).
 */
import { NextResponse } from "next/server";
import { backfillSiteShellForCurrentTenant } from "@/lib/site-admin/edit-mode/site-shell-backfill-action";

export const dynamic = "force-dynamic";

export async function GET() {
  const isDev = process.env.NODE_ENV === "development";
  const isPreview = process.env.VERCEL_ENV === "preview";
  if (!isDev && !isPreview) {
    return new NextResponse("Not available in production.", { status: 403 });
  }

  try {
    const result = await backfillSiteShellForCurrentTenant();
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      shellPageId: result.shellPageId,
      action: result.action,
      published: result.published,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 },
    );
  }
}
