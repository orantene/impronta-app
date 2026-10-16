/**
 * Rate-limit key for unauthenticated public endpoints. Vercel sets
 * `x-real-ip`; otherwise the LAST forwarded hop is the one our edge appended
 * (earlier hops are client-controlled).
 */
export function resolvePublicClientIp(h: Headers): string {
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = h.get("x-forwarded-for");
  if (fwd) {
    const hops = fwd.split(",").map((s) => s.trim()).filter(Boolean);
    const trusted = hops[hops.length - 1];
    if (trusted) return trusted;
  }
  return "x";
}
