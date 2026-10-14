/**
 * Staging password gate, request layer (TUL-827). Wraps the proxy entry so it
 * runs before host resolution: an unregistered staging host still gets the
 * gate, not the "Host not registered" 404. Rules live in `staging-gate-core.ts`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { tryConsumeRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/saas/proxy-inbound-sanitize";
import {
  STAGING_GATE_CI_HEADER,
  STAGING_GATE_COOKIE,
  STAGING_GATE_NOT_CONFIGURED,
  STAGING_GATE_PATH,
  STAGING_ROBOTS_TXT,
  gateCookieHeader,
  gateUrlFor,
  isAlwaysAllowedPath,
  isGateActive,
  sanitizeNext,
  signGateCookie,
  verifyCiToken,
  verifyGateCookie,
  verifyPassword,
  type GateEnv,
} from "./staging-gate-core";
import { renderStagingGatePage, stagingGateLang } from "./staging-gate-page";

const ROBOTS_HEADER = "noindex, nofollow";
const ATTEMPT_LIMIT = 10;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
let warnedMissingPassword = false;

function readEnv(): GateEnv {
  return {
    VERCEL_ENV: process.env.VERCEL_ENV,
    STAGING_GATE_ENABLED: process.env.STAGING_GATE_ENABLED,
    STAGING_GATE_FORCE: process.env.STAGING_GATE_FORCE,
    STAGING_GATE_PASSWORD: process.env.STAGING_GATE_PASSWORD,
    STAGING_GATE_CI_TOKEN: process.env.STAGING_GATE_CI_TOKEN,
  };
}

function htmlPage(request: NextRequest, status: number, opts: { next: string; error?: "wrong" | "limited" }): NextResponse {
  const lang = stagingGateLang(request.headers.get("accept-language"));
  return new NextResponse(renderStagingGatePage({ lang, next: opts.next, error: opts.error }), {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

async function handleGateRoute(request: NextRequest, password: string): Promise<NextResponse> {
  if (request.method !== "POST") {
    return htmlPage(request, 200, { next: sanitizeNext(request.nextUrl.searchParams.get("next")) });
  }
  let given: string | null = null;
  let next = "/";
  try {
    const form = await request.formData();
    const pw = form.get("password");
    given = typeof pw === "string" ? pw : null;
    const n = form.get("next");
    next = sanitizeNext(typeof n === "string" ? n : null);
  } catch {
    given = null;
  }
  if (!tryConsumeRateLimit(`staging-gate:${clientIp(request)}`, ATTEMPT_LIMIT, ATTEMPT_WINDOW_MS)) {
    return htmlPage(request, 429, { next, error: "limited" });
  }
  if (!verifyPassword(given, password)) return htmlPage(request, 401, { next, error: "wrong" });
  const res = NextResponse.redirect(new URL(next, request.url), 303);
  res.headers.append("set-cookie", gateCookieHeader(await signGateCookie(password)));
  res.headers.set("cache-control", "no-store");
  return res;
}

/** Decides the gate outcome: a response to send, or null to run the app. */
export async function stagingGateDecision(request: NextRequest, env: GateEnv): Promise<NextResponse | null> {
  const password = env.STAGING_GATE_PASSWORD ?? "";
  if (!password) {
    if (!warnedMissingPassword) {
      warnedMissingPassword = true;
      console.error(`[staging-gate] ${STAGING_GATE_NOT_CONFIGURED}`);
    }
    return new NextResponse(STAGING_GATE_NOT_CONFIGURED, { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const { pathname, search } = request.nextUrl;
  if (pathname === "/robots.txt") {
    return new NextResponse(STAGING_ROBOTS_TXT, { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  if (pathname === STAGING_GATE_PATH) return handleGateRoute(request, password);
  if (isAlwaysAllowedPath(pathname)) return null;
  if (verifyCiToken(request.headers.get(STAGING_GATE_CI_HEADER), env.STAGING_GATE_CI_TOKEN)) return null;
  if (await verifyGateCookie(request.cookies.get(STAGING_GATE_COOKIE)?.value, password)) return null;
  if (request.method === "GET" || request.method === "HEAD") {
    return NextResponse.redirect(new URL(gateUrlFor(`${pathname}${search}`), request.url), 302);
  }
  return new NextResponse("Staging gate: sign in first.", { status: 401, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export function withStagingGate(
  handler: (request: NextRequest) => Promise<NextResponse>,
  getEnv: () => GateEnv = readEnv,
): (request: NextRequest) => Promise<NextResponse> {
  return async (request) => {
    const env = getEnv();
    if (!isGateActive(env, request.headers.get("host"))) return handler(request);
    const res = (await stagingGateDecision(request, env)) ?? (await handler(request));
    res.headers.set("X-Robots-Tag", ROBOTS_HEADER);
    return res;
  };
}
