/**
 * DEV + PREVIEW sign-in shortcut.
 *
 * GET /api/dev/signin?email=foo@bar.com&password=xxx&next=/slug/admin
 *
 * Signs in with email + password using the anon key, sets Supabase SSR cookies
 * on the response, then redirects to `next`. Whether it answers is decided by
 * `devSigninAllowed` (./guard.ts): never against the prod Supabase project, never on
 * a Vercel deploy without the `x-dev-signin-token` header, open on a non-Vercel
 * server that talks to the isolated or a local Supabase (local QA slot, CI).
 *
 * ⚠ PRE-MERGE GATE (P5-SHIP): this file MUST be dropped or verified still
 * 403-guarded before the feat/builder-2027-fullpage branch is merged to main.
 * Search for this comment in the P5-SHIP checklist.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { mintFixtureSession } from "./fixture-session";
import { devSigninAllowed } from "./guard";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // TUL-1269: see ./guard.ts. Never against the prod project; never on Vercel without the token.
  if (!devSigninAllowed(process.env, request.headers)) {
    return new NextResponse("Not available.", { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const email    = searchParams.get("email") ?? "";
  const password = searchParams.get("password") ?? "";
  const next     = searchParams.get("next") ?? "/";

  if (!email) {
    return new NextResponse("email required", { status: 400 });
  }

  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // Preserve the incoming request host (from x-forwarded-host or host header) so
  // tenant-gated redirects stay on the same host (e.g., impronta.lvh.me:3000).
  // Falls back to request.url if no forwarding headers are present.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "http";
  const host = request.headers.get("host");
  const baseUrl = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : host
      ? `${forwardedProto}://${host}`
      : request.url;

  const response = NextResponse.redirect(new URL(next, baseUrl));

  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // Passwordless QA-fixture branch: no password supplied + the email is a
  // seeded @impronta.test fixture → mint the session via the service-role
  // (admin generateLink → server-side verifyOtp sets the SSR cookies). Lets a
  // QA agent reach staff surfaces without placing a password in the URL. Still
  // dev/preview-only (gated above) and restricted to the @impronta.test domain.
  if (!password && email.toLowerCase().endsWith("@impronta.test")) {
    const admin = createServiceRoleClient();
    if (!admin) {
      return new NextResponse("service-role not configured", { status: 503 });
    }
    // D-173: create, then mint, then verify (fixture-session.ts): one call
    // signs a brand-new fixture address in.
    const minted = await mintFixtureSession(
      {
        createUser: (input) => admin.auth.admin.createUser(input),
        generateLink: (input) => admin.auth.admin.generateLink(input),
      },
      (input) => supabase.auth.verifyOtp(input),
      email,
      {
        // TUL-1352: staging must not mint new users unless the flag says so.
        allowCreate: process.env.DEV_SIGNIN_CREATE_FIXTURE_USERS === "1",
        userExists: async (addr) => {
          const target = addr.toLowerCase();
          for (let page = 1; page <= 10; page += 1) {
            const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
            const users = data?.users ?? [];
            if (users.some((u) => u.email?.toLowerCase() === target)) return true;
            if (users.length < 1000) return false;
          }
          return false;
        },
      },
    );
    if (!minted.ok) return new NextResponse(minted.message, { status: minted.status });
    return response;
  }

  if (!password) {
    return new NextResponse("email and password required", { status: 400 });
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return new NextResponse(`Sign-in failed: ${error.message}`, { status: 401 });
  }

  return response;
}
