/**
 * DEV + PREVIEW sign-in shortcut.
 *
 * GET /api/dev/signin?email=foo@bar.com&password=xxx&next=/slug/admin
 *
 * Signs in with email + password using the anon key, sets Supabase SSR cookies
 * on the response, then redirects to `next`. Allowed in:
 *   - NODE_ENV=development (local `npm run dev`)
 *   - VERCEL_ENV=preview (Vercel preview deploys — already SSO-gated behind
 *     the Vercel team-auth wall, so the relaxation doesn't expose anything
 *     to anonymous internet visitors)
 * Blocked in production (NODE_ENV=production AND VERCEL_ENV=production).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";
  const isPreview = process.env.VERCEL_ENV === "preview";
  if (!isDev && !isPreview) {
    return new NextResponse("Not available in production.", { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const email    = searchParams.get("email") ?? "";
  const password = searchParams.get("password") ?? "";
  const next     = searchParams.get("next") ?? "/";

  if (!email || !password) {
    return new NextResponse("email and password required", { status: 400 });
  }

  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const response = NextResponse.redirect(new URL(next, request.url));

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

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return new NextResponse(`Sign-in failed: ${error.message}`, { status: 401 });
  }

  return response;
}
