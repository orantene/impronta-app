/**
 * Edge/proxy helper: hard-redirect retired vanity /t/<old> codes to the live
 * numeric TAL code. Fast path skips every already-numeric code (no DB).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import {
  isNumericTalentProfileCode,
  talentProfileAliasRedirectPath,
} from "@/lib/talent/profile-code";

const TALENT_PROFILE_PATH_RE = /^(\/t\/)([^/]+)(\/.*)?$/;

export function matchTalentProfileCodePath(
  pathname: string,
): { code: string; prefix: string; suffix: string } | null {
  const m = TALENT_PROFILE_PATH_RE.exec(pathname);
  if (!m) return null;
  const code = decodeURIComponent(m[2] ?? "").trim();
  if (!code) return null;
  return { code, prefix: m[1] ?? "/t/", suffix: m[3] ?? "" };
}

/**
 * When the path uses a retired vanity code, return a permanent redirect to the
 * live numeric code. Returns null to continue the proxy chain.
 */
export async function talentProfileCodeAliasRedirectResponse(
  request: NextRequest,
  pathname: string,
): Promise<NextResponse | null> {
  if (request.method !== "GET" && request.method !== "HEAD") return null;

  const matched = matchTalentProfileCodePath(pathname);
  if (!matched) return null;
  // Live codes never need an alias lookup — keep the hot path DB-free.
  if (isNumericTalentProfileCode(matched.code)) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return null;

  try {
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          /* read-only */
        },
      },
    });
    const { data, error } = await supabase.rpc("resolve_talent_profile_code", {
      p_code: matched.code,
    });
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.is_alias || !row.profile_code) return null;
    if (row.profile_code === matched.code) return null;

    const targetPath =
      talentProfileAliasRedirectPath({
        canonicalCode: row.profile_code as string,
        pathname,
        requestedCode: matched.code,
        search: request.nextUrl.search,
      }) ??
      `/t/${encodeURIComponent(String(row.profile_code))}${matched.suffix}${request.nextUrl.search}`;

    const target = request.nextUrl.clone();
    const parsed = new URL(targetPath, request.nextUrl.origin);
    target.pathname = parsed.pathname;
    target.search = parsed.search;
    // Owner asked for 301 (permanent). Prefer that over Next's RSC soft redirect.
    return NextResponse.redirect(target, 301);
  } catch {
    return null;
  }
}
