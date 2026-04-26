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

import { requireStaff } from "@/lib/server/action-guards";

export type LinkValidateResult =
  | { ok: true; status: number; reachable: boolean }
  | { ok: false; error: string };

const TIMEOUT_MS = 4000;

export async function validateLinkUrl(input: {
  url: string;
}): Promise<LinkValidateResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };

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

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    let res = await fetch(target.toString(), {
      method: "HEAD",
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "Tulala-LinkValidator/1.0" },
    });
    // Some servers reject HEAD; retry with GET (no body fetched, just
    // the headers — we abort the body via signal once we have status).
    if (res.status === 405 || res.status === 501) {
      res = await fetch(target.toString(), {
        method: "GET",
        signal: ctrl.signal,
        redirect: "follow",
        headers: { "User-Agent": "Tulala-LinkValidator/1.0" },
      });
    }
    return {
      ok: true,
      status: res.status,
      reachable: res.status >= 200 && res.status < 400,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        (err as Error).name === "AbortError"
          ? "Timed out (4s)."
          : "Couldn't reach URL.",
    };
  } finally {
    clearTimeout(t);
  }
}
