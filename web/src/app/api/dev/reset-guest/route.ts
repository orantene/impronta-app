/**
 * QA/E2E fresh-guest-session reset (W0-H).
 *
 * POST /api/dev/reset-guest
 *
 * The guest identity cookie (`impronta_guest` — HMAC-signed, httpOnly; see
 * `src/lib/supabase/middleware.ts` + `src/lib/guest-cookie.ts`) cannot be
 * cleared from client JS. That blocks fresh-guest QA and E2E runs of the
 * guest chat panel: every request from the same browser keeps resuming the
 * same guest session / inquiry thread instead of starting clean. This route
 * expires that cookie so the very next request mints a brand-new guest id
 * via middleware's `crypto.randomUUID()` + `signGuestCookie()` path. It does
 * NOT delete any DB rows — the old `guest_sessions` row (if any) is simply
 * orphaned; nothing references it once the cookie is gone.
 *
 * Gating — allowed if EITHER passes; 404 (never 403, to avoid advertising
 * this route) if neither does:
 *   (a) non-production dev mode — mirrors `api/dev/signin/route.ts` exactly:
 *       NODE_ENV=development OR VERCEL_ENV=preview (previews are already
 *       SSO-gated behind Vercel team-auth, so the relaxation exposes nothing
 *       new to anonymous internet visitors).
 *   (b) an authenticated STAFF session — `requireStaff()`, the same session
 *       resolver `requireStaffTenantAction` is built on. A read-only check;
 *       no tenant scope is required. Lets a logged-in staff member reset
 *       their own guest cookie while QA-ing the LIVE guest chat panel on
 *       production, where raw preview URLs aren't reachable (host-gated).
 *
 * proxy.ts's `/api/dev/` short-circuit bypass only fires in dev + preview, so
 * on production this exact path is instead let through host-resolution by a
 * dedicated entry in `src/lib/saas/surface-allow-list.ts` (SHARED_API_PREFIXES)
 * — the gating above is what actually restricts who can use it.
 */
import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/server/action-guards";

export const dynamic = "force-dynamic";

const GUEST_COOKIE = "impronta_guest";

export async function POST() {
  const isDev = process.env.NODE_ENV === "development";
  const isPreview = process.env.VERCEL_ENV === "preview";

  let allowed = isDev || isPreview;
  if (!allowed) {
    const staff = await requireStaff();
    allowed = staff.ok;
  }

  if (!allowed) {
    // 404, not 403 — a 403 confirms the route exists; a 404 does not.
    return new NextResponse("Not found.", { status: 404 });
  }

  const response = NextResponse.json({ ok: true });
  // Expire with the EXACT attributes the cookie was set with
  // (`guestCookieOptions` in src/lib/supabase/middleware.ts) — httpOnly,
  // sameSite=lax, path=/, no domain (host-only), secure in production —
  // so the browser actually drops it instead of leaving a stray duplicate
  // with mismatched attributes.
  response.cookies.set(GUEST_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
