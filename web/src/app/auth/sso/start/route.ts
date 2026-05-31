import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/auth-flow";
import { isVerifiedCustomHost, mintSsoHandoff } from "@/lib/auth/sso-handoff";

export const dynamic = "force-dynamic";

/**
 * SSO mint endpoint (Tenant Registration Engine, S6). Runs on a host where the
 * session is readable (the app host / a *.tulala.digital subdomain). Validates
 * that `return` points to a VERIFIED tenant custom domain, mints a single-use
 * nonce for the signed-in user, and redirects to that domain's /auth/sso to
 * establish a host-only session there.
 *
 * If the visitor isn't signed in here yet, bounce through /login and come back.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const returnRaw = searchParams.get("return") ?? "";
  const appUrl = getAppUrl();

  let target: URL | null = null;
  try {
    target = new URL(returnRaw);
  } catch {
    target = null;
  }
  if (!target || target.protocol !== "https:") {
    return NextResponse.redirect(`${appUrl}/login?error=sso_return`);
  }
  const host = target.hostname.toLowerCase();
  if (!(await isVerifiedCustomHost(host))) {
    return NextResponse.redirect(`${appUrl}/login?error=sso_host`);
  }

  const supabase = await createClient();
  const { data } = supabase
    ? await supabase.auth.getUser()
    : { data: { user: null } };
  const user = data?.user ?? null;
  if (!user) {
    const next = `/auth/sso/start?return=${encodeURIComponent(returnRaw)}`;
    return NextResponse.redirect(`${appUrl}/login?next=${encodeURIComponent(next)}`);
  }

  const token = await mintSsoHandoff(user.id, host);
  if (!token) {
    return NextResponse.redirect(`${appUrl}/login?error=sso_mint`);
  }

  const dest = new URL("/auth/sso", `https://${host}`);
  dest.searchParams.set("token", token);
  const nextPath = `${target.pathname}${target.search}`;
  if (nextPath && nextPath !== "/") dest.searchParams.set("next", nextPath);
  return NextResponse.redirect(dest.toString());
}
