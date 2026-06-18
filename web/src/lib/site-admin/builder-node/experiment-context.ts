import "server-only";
import { cookies, headers } from "next/headers";

import {
  EXPERIMENT_VISITOR_COOKIE,
  isValidExperimentVisitorId,
} from "./experiment-visitor-cookie";

/**
 * experiment-context.ts — ABTEST-1 SSR seed resolver (server-only).
 *
 * Resolves a STABLE per-visitor seed for the deterministic A/B bucketing, plus
 * the tenant + surface tags the experiment analytics carry. Read-only: it never
 * writes a cookie (so it is safe in any RSC render path), and it degrades
 * safely — when no stable signal is available it returns `experimentSeed: null`,
 * which makes the renderer serve the control variant with NO tracking (rather
 * than re-bucketing the visitor on every render and polluting the data).
 *
 * Seed precedence (first stable signal wins):
 *   1. An existing Supabase auth cookie (`sb-…-auth-token` / `sb-access-token`)
 *      — stable per signed-in visitor across renders.
 *   2. The first-party visitor cookie (`impronta_vid`) the proxy mints + sets —
 *      stable per anonymous visitor across requests, immune to IP drift (mobile
 *      networks, shared egress IPs). Degrade-safe: absent ⇒ skip to (3).
 *   3. A hash of `x-forwarded-for` (client IP) + `user-agent` — stable per
 *      anonymous visitor within a request stream, no cookie required.
 *   4. null → control, no tracking.
 *
 * The seed itself is never sent to analytics; only the assigned variant key is.
 */
export interface ExperimentRenderContext {
  experimentSeed: string | null;
  experimentTenantId: string | null;
  experimentSurface: string | null;
}

const EMPTY_CONTEXT: ExperimentRenderContext = {
  experimentSeed: null,
  experimentTenantId: null,
  experimentSurface: null,
};

async function readStableSeed(): Promise<string | null> {
  // 1. Supabase auth cookie (signed-in visitor) — the most stable per-visitor
  //    signal. The cookie NAME varies by project ref, so match by prefix.
  //    Read once and reuse for the visitor-id lookup below.
  try {
    const cookieStore = await cookies();
    const all = cookieStore.getAll();
    const auth = all.find(
      (c) =>
        c.value &&
        (c.name.startsWith("sb-") &&
          (c.name.endsWith("-auth-token") || c.name.includes("auth-token"))),
    );
    if (auth?.value) return `auth:${auth.value.slice(0, 64)}`;
    // 2. First-party visitor cookie — stable per anon visitor across requests,
    //    immune to IP drift. Validated so a forged cookie can't skew the hash.
    const vid = all.find((c) => c.name === EXPERIMENT_VISITOR_COOKIE)?.value;
    if (isValidExperimentVisitorId(vid)) return `vid:${vid}`;
  } catch {
    // cookies() outside a request → fall through to the header fallback.
  }
  // 3. Anonymous fallback: client IP + user-agent. Stable enough to keep a
  //    visitor in one arm across the renders of their visit, with no cookie.
  try {
    const h = await headers();
    const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim();
    const ua = h.get("user-agent") ?? "";
    const combined = `${ip}|${ua}`.trim();
    if (combined.length > 1) return `anon:${combined}`;
  } catch {
    // headers() outside a request → no seed.
  }
  return null;
}

/**
 * Resolve the experiment render context for a public surface. Pass the tenant id
 * (already resolved by the caller's scope) and a short surface tag
 * ("adminWorkspace" | "talentProfile" | "talentSite" | …) for reporting. Spread
 * the result into the `renderBuilderNodes` options. Safe to call from any RSC.
 */
export async function resolveExperimentRenderContext(args: {
  tenantId?: string | null;
  surface?: string | null;
}): Promise<ExperimentRenderContext> {
  const experimentSeed = await readStableSeed();
  if (!experimentSeed) return EMPTY_CONTEXT;
  return {
    experimentSeed,
    experimentTenantId: args.tenantId ?? null,
    experimentSurface: args.surface ?? null,
  };
}
