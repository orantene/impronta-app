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
import { createServiceRoleClient } from "@/lib/supabase/admin";

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

  if (!email) {
    return new NextResponse("email required", { status: 400 });
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
    const { data: linkData, error: linkError } =
      await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (linkError || !linkData?.properties?.hashed_token) {
      return new NextResponse(
        `Failed to generate sign-in link: ${linkError?.message ?? "no hashed_token"}`,
        { status: 500 },
      );
    }
    const { error: otpError } = await supabase.auth.verifyOtp({
      type: "magiclink",
      token_hash: linkData.properties.hashed_token,
    });
    if (otpError) {
      return new NextResponse(`Sign-in failed: ${otpError.message}`, { status: 401 });
    }
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
