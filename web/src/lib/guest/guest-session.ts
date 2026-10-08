import { cookies, headers } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { ensureGuestIdentity } from "@/lib/guest/ensure-guest-identity.server";
import { GUEST_COOKIE_NAME, GUEST_HEADER_NAME, peekGuestIdentity } from "@/lib/guest-cookie";

/**
 * Client IP — the TRUSTED hop. Vercel appends the real client IP to the RIGHT
 * of x-forwarded-for at the edge, so the rightmost entry is the platform-set,
 * non-spoofable value; the leftmost is attacker-controllable (a client can send
 * its own x-forwarded-for). Using split(',')[0] would key the rate-limit on a
 * value the abuser can rotate per request — defeating the IP dimension. Prefer
 * x-real-ip (single value, also platform-set) and fall back to the rightmost
 * x-forwarded-for hop. Returns null when unavailable.
 */
export async function resolveClientIp(): Promise<string | null> {
  const h = await headers();
  // x-real-ip is set by Vercel to the true client IP (not a chain) — trust it.
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = h.get("x-forwarded-for");
  if (fwd) {
    const hops = fwd.split(",").map((s) => s.trim()).filter(Boolean);
    // Rightmost = the IP the platform appended (trusted); leftmost = spoofable.
    const trusted = hops[hops.length - 1];
    if (trusted) return trusted;
  }
  return null;
}

async function guestKeyFromRequest(): Promise<string | null> {
  const fromHeader = (await headers()).get(GUEST_HEADER_NAME)?.trim();
  if (fromHeader) return fromHeader;
  const raw = (await cookies()).get(GUEST_COOKIE_NAME)?.value;
  return peekGuestIdentity(raw)?.guestKey ?? null;
}

async function sessionIdForGuestKey(guestKey: string): Promise<string | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;

  await admin.rpc("ensure_guest_session", { p_session_key: guestKey });
  const { data: guestRow, error } = await admin
    .from("guest_sessions")
    .select("id")
    .eq("session_key", guestKey)
    .maybeSingle();

  if (error) {
    logServerError("guest-session.sessionIdForGuestKey", error);
    return null;
  }
  return (guestRow?.id as string | undefined) ?? null;
}

/**
 * Resolve guest_sessions.id from an existing guest identity (proxy header or
 * verified cookie). Does NOT mint — SSR resume and read paths stay soft-null
 * for first-time visitors (TUL-445 CDN). Write paths use `ensureGuestSessionId`.
 */
export async function resolveGuestSessionId(): Promise<string | null> {
  const guestKey = await guestKeyFromRequest();
  if (!guestKey) return null;
  return sessionIdForGuestKey(guestKey);
}

/**
 * Mint a guest cookie if needed, then resolve guest_sessions.id. Call from
 * chat / booking write actions so the first guest action works without a
 * prior page-view mint.
 */
export async function ensureGuestSessionId(): Promise<string | null> {
  const guestKey = await ensureGuestIdentity();
  return sessionIdForGuestKey(guestKey);
}
