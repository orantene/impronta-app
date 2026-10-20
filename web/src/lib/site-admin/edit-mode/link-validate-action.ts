"use server";

/**
 * Phase 8 — link route validation.
 *
 * HEAD-requests the URL on demand, returns a status code. The UI shows
 * a warning chip if the link returns 404 / 5xx / a network error.
 * Internal paths get HEAD'd against the request's origin (Vercel
 * deploy URL or canonical site host).
 *
 * No caching here — the operator is editing live; we want fresh
 * results each time they ask. 4-second timeout.
 */

import { requireSession } from "@/lib/server/action-guards";
import { getTenantScope } from "@/lib/saas/scope";
import { safeFetch } from "@/lib/security/safe-fetch";

export type LinkValidateResult =
  | { ok: true; status: number; reachable: boolean }
  | { ok: false; error: string };

const TIMEOUT_MS = 4000;

export async function validateLinkUrl(input: {
  url: string;
}): Promise<LinkValidateResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  // Tenant-agnostic builder utility (no row it could scope), so the gate is
  // "member of SOME workspace". `getTenantScope` fails closed without an
  // agency_memberships row — membership, not the global profiles.app_role,
  // is the boundary (see the AUTH MODEL note on requireStaffTenantAction).
  if (!(await getTenantScope())) {
    return { ok: false, error: "Select an agency workspace first." };
  }

  const raw = (input.url ?? "").trim();
  if (!raw) return { ok: false, error: "Empty URL" };

  // Skip non-HTTP modes — those don't have a meaningful HTTP status.
  if (
    raw.startsWith("mailto:") ||
    raw.startsWith("tel:") ||
    raw.startsWith("#")
  ) {
    return { ok: true, status: 200, reachable: true };
  }

  // Resolve internal paths against the canonical site origin if known.
  let target: URL;
  try {
    if (raw.startsWith("/")) {
      const base =
        process.env.NEXT_PUBLIC_SITE_URL ||
        process.env.VERCEL_URL ||
        "http://localhost:3000";
      const baseUrl = base.startsWith("http") ? base : `https://${base}`;
      target = new URL(raw, baseUrl);
    } else {
      target = new URL(raw);
    }
  } catch {
    return { ok: false, error: "Invalid URL" };
  }

  // H1: the URL is typed by an operator. safeFetch refuses private and
  // metadata addresses (a status code for http://10.0.0.5:8080 is a port
  // scanner), pins the vetted IP and re-checks every redirect hop.
  const common = {
    headers: { "User-Agent": "Tulala-LinkValidator/1.0" },
    timeoutMs: TIMEOUT_MS,
    maxBytes: 16 * 1024,
    overflow: "truncate" as const,
  };
  let res = await safeFetch(target.toString(), { ...common, method: "HEAD" });
  // Some servers reject HEAD; retry with GET (body capped at 16 KB).
  if (res.ok && (res.status === 405 || res.status === 501)) {
    res = await safeFetch(target.toString(), { ...common, method: "GET" });
  }
  if (!res.ok) {
    return {
      ok: false,
      error:
        res.reason === "timeout"
          ? "Timed out (4s)."
          : res.reason === "network" || res.reason === "dns_failed" || res.reason === "too_many_redirects"
            ? "Couldn't reach URL."
            : "That link does not point to a public web address.",
    };
  }
  return {
    ok: true,
    status: res.status,
    reachable: res.status >= 200 && res.status < 400,
  };
}
