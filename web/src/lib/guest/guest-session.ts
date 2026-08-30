import { headers } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

const GUEST_HEADER = "x-impronta-guest";

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

/**
 * Resolve guest_sessions.id from the middleware-injected x-impronta-guest
 * header. The session key is read SERVER-SIDE only; never accepted from the
 * client. Returns null when the header is missing, the RPC fails, or no row.
 */
export async function resolveGuestSessionId(): Promise<string | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;

  const guestKey = (await headers()).get(GUEST_HEADER);
  if (!guestKey) return null;

  await admin.rpc("ensure_guest_session", { p_session_key: guestKey });
  const { data: guestRow, error } = await admin
    .from("guest_sessions")
    .select("id")
    .eq("session_key", guestKey)
    .maybeSingle();

  if (error) {
    logServerError("guest-session.resolveGuestSessionId", error);
    return null;
  }
  return (guestRow?.id as string | undefined) ?? null;
}
