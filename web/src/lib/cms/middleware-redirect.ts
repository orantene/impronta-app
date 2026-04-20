import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * If `pathname` matches an active `cms_redirects.old_path`, return a redirect response.
 * Use the browser-visible pathname (e.g. `/es/p/foo` for Spanish).
 *
 * `tenantId` null means the request is not on a tenant-scoped host (hub /
 * marketing / app). CMS redirects are per-tenant only — skip lookup.
 */
export async function tryCmsRedirectResponse(
  request: NextRequest,
  pathname: string,
  tenantId: string | null,
): Promise<NextResponse | null> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return null;
  }
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/admin")
  ) {
    return null;
  }
  if (!tenantId) return null;
  if (!isSupabaseConfigured()) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim();

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        /* middleware short-circuit — session cookies not written here */
      },
    },
  });

  const { data, error } = await supabase
    .rpc("cms_public_redirects_for_tenant", { p_tenant_id: tenantId })
    .select("new_path, status_code")
    .eq("old_path", pathname)
    .maybeSingle();

  if (error || !data?.new_path) return null;

  const dest = request.nextUrl.clone();
  dest.pathname = data.new_path;
  const status = data.status_code === 302 ? 302 : 301;
  return NextResponse.redirect(dest, status);
}
