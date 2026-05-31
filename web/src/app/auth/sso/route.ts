import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { normalizeNextPath } from "@/lib/auth-flow";
import { redeemSsoHandoff } from "@/lib/auth/sso-handoff";
import { logServerError } from "@/lib/server/safe-error";

export const dynamic = "force-dynamic";

/**
 * SSO redeem endpoint (Tenant Registration Engine, S6). Runs on the tenant
 * CUSTOM domain. Redeems the single-use nonce (validated + atomically claimed
 * in redeemSsoHandoff), then mints a FRESH host-only session via Supabase
 * generateLink + verifyOtp — no session tokens ever cross the wire. On any
 * failure it lands the visitor on the target page logged-out (safe degrade).
 *
 * NOTE: verifyOtp type for a generateLink('magiclink') hashed_token —
 * QA confirms 'email' vs 'magiclink' on a real custom domain before trusting.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const next = normalizeNextPath(url.searchParams.get("next")) || "/";

  const hdrs = await headers();
  const host = (hdrs.get("x-impronta-host-name") ?? hdrs.get("host") ?? url.host)
    .split(":")[0]
    .toLowerCase();
  const safeNext = next.startsWith("/") ? next : "/";
  const returnTo = `https://${host}${safeNext}`;
  const fail = NextResponse.redirect(returnTo);

  if (!token) return fail;

  const redeemed = await redeemSsoHandoff(token, host);
  if (!redeemed.ok) return fail;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return fail;

  const admin = createServiceRoleClient();
  if (!admin) return fail;

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: redeemed.email,
  });
  const tokenHash = linkData?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    logServerError("sso.generateLink", linkError ?? new Error("no hashed_token"));
    return fail;
  }

  const cookieStore = await cookies();
  const response = NextResponse.redirect(returnTo);
  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        toSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: tokenHash,
  });
  if (verifyError) {
    logServerError("sso.verifyOtp", verifyError);
    return fail;
  }

  return response;
}
