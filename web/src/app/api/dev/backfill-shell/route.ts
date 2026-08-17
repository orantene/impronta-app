/**
 * DEV + PREVIEW shell-backfill trigger (QA harness).
 *
 * GET /api/dev/backfill-shell
 * GET /api/dev/backfill-shell?dryRun=1  — preview only, no writes (see below)
 *
 * Calls `backfillSiteShellForCurrentTenant()` under the current request's
 * cookie session, so a QA agent on a tenant host can idempotently seed that
 * tenant's `site_shell` row without an onboarding flow. The backfill action
 * resolves scope itself (requireStaff + requireTenantScope) — this route adds
 * no auth of its own beyond mirroring the dev/preview gate below; the action's
 * own guards reject unauthenticated / unscoped callers with an `{ ok: false }`.
 *
 * `dryRun=1` (or `=true`): the action performs its read-only lookups
 * (existing row, identity/nav facts or the existing snapshot) but skips every
 * INSERT/UPDATE/DELETE, returning a `{ ok: true, dryRun: true, wouldAction,
 * ... }` preview instead. Use this to see what a real call would create,
 * repair, or no-op before writing anything — important on this codebase's
 * local dev, where `NODE_ENV=development` points at the PRODUCTION Supabase
 * project (see CLAUDE.md), not a local/branch database.
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
import { NextResponse, type NextRequest } from "next/server";
import { backfillSiteShellForCurrentTenant } from "@/lib/site-admin/edit-mode/site-shell-backfill-action";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";
  const isPreview = process.env.VERCEL_ENV === "preview";
  if (!isDev && !isPreview) {
    return new NextResponse("Not available in production.", { status: 403 });
  }

  const dryRunParam = request.nextUrl.searchParams.get("dryRun");
  const dryRun = dryRunParam === "1" || dryRunParam === "true";

  try {
    const result = await backfillSiteShellForCurrentTenant({ dryRun });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    if (result.dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        wouldAction: result.wouldAction,
        tenantId: result.tenantId,
        existingPageId: result.existingPageId,
        existingStatus: result.existingStatus,
        brandLabel: result.brandLabel,
        headerNavItemCount: result.headerNavItemCount,
        footerNavColumnLinkCount: result.footerNavColumnLinkCount,
        socialLinkCount: result.socialLinkCount,
        sourcedFromExistingSnapshot: result.sourcedFromExistingSnapshot,
      });
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
