/**
 * Client IP for the OTP send budget. When no proxy header is present the old
 * code keyed every caller to the literal "unknown", so strangers shared one
 * 20-per-15-minutes bucket and a first try could already be "too many". Each
 * unidentifiable caller now gets a key of its own, so only the per-email
 * budget applies to them.
 */
type HeaderGetter = { get(name: string): string | null };

export function pickClientIp(h: HeaderGetter): string {
  const forwarded = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim();
  const ip = forwarded || h.get("x-real-ip")?.trim() || h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  return ip || `unknown:${crypto.randomUUID()}`;
}
