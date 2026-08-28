import { NextResponse, type NextRequest } from "next/server";

import { isProfileCodeOnTenantRoster } from "./host-context";

/** Matches `/t/<code>` and `/<locale>/t/<code>`, with or without a trailing slash. */
const TALENT_PATH = /^\/(?:[a-z]{2}\/)?t\/([^/]+)\/?$/;

/**
 * An agency host may only serve talent on its OWN visible roster — decided at
 * the edge so the 404 is real.
 *
 * The page-level gate (`t/[profileCode]/_guards/agency-roster-visibility`)
 * already renders the right BODY: not-found content, noindex, no Inquire CTA.
 * What it cannot fix is the STATUS. `t/[profileCode]/loading.tsx` puts an
 * implicit Suspense boundary on the segment, so Next flushes the shell before
 * any server component resolves, and a notFound() raised later renders the
 * not-found UI over a 200 that is already on the wire. Measured on production:
 * three off-roster profiles served "Page not found" at HTTP 200 — a soft 404,
 * which is what crawlers and link-preview bots actually read.
 *
 * The alternative was deleting loading.tsx, degrading the perceived load of
 * every talent page to correct three status codes. This is the cheaper half.
 *
 * SAFETY
 *   • GET/HEAD only — a crafted POST is the page gate's job, not the edge's.
 *   • Never in preview, so an operator can still check a talent before making
 *     them site_visible.
 *   • The lookup is cached per (tenant, code) on the host cache's 60s TTL, so
 *     steady state is one query per profile per minute per worker.
 *   • It fails OPEN: a DB blip degrades to the old soft-404 rather than hiding
 *     a real profile, and the page gate is still behind it either way.
 *
 * @returns a 404 rewrite when the talent is not carried here, else null.
 */
export async function offRosterTalentResponse(
  request: NextRequest,
  pathname: string,
  tenantId: string,
  previewParam: string,
): Promise<NextResponse | null> {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  if (
    request.nextUrl.searchParams.has("preview") ||
    request.nextUrl.searchParams.has(previewParam)
  ) {
    return null;
  }

  const code = TALENT_PATH.exec(pathname)?.[1];
  if (!code) return null;

  const onRoster = await isProfileCodeOnTenantRoster(
    request,
    tenantId,
    decodeURIComponent(code),
  );
  if (onRoster) return null;

  // `/_page-not-found` is the existing branded not-found target for a known
  // host on a disallowed path, already whitelisted against rewrite recursion.
  // NOT `/_host-unregistered`, which says "Domain not connected" and would
  // wrongly tell the visitor the whole site is down.
  return NextResponse.rewrite(new URL("/_page-not-found", request.url), {
    status: 404,
  });
}
