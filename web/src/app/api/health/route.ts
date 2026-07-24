import { NextResponse } from "next/server";

/**
 * Connectivity probe.
 *
 * Deliberately the cheapest route in the app: no DB, no auth, no session
 * read, no external call. Its only job is to answer "can this browser still
 * reach our origin?" so the admin shell's `OfflineBanner` can disconfirm the
 * browser's own `navigator.onLine` flag before shouting at the user.
 *
 * Why that matters: `navigator.onLine` is false-positive prone — a VPN, a
 * virtual network adapter (Tailscale / Parallels / Docker), a captive portal,
 * or DevTools' Offline throttle all flip it to `false` on a machine with
 * perfectly good internet, and Chrome does not always fire a matching `online`
 * event afterwards. Trusting the flag alone left a permanent "connection lost"
 * banner over the workspace header.
 *
 * `/api/health` is already allow-listed for every host kind in
 * `surface-allow-list.ts` (SHARED_API), and `/api/*` is in the service
 * worker's `isUncacheable` set, so the probe always hits the network rather
 * than a cached response. Unauthenticated on purpose: the smoke test and the
 * banner both probe it without a session.
 */

export const dynamic = "force-dynamic";

const NO_STORE = {
  "cache-control": "no-store, no-cache, must-revalidate",
} as const;

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

/**
 * HEAD is what the offline banner actually uses — same reachability signal
 * with no response body to download on a degraded connection. Next.js will
 * synthesise HEAD from GET, but declaring it keeps the zero-body contract
 * explicit and survives future edits to GET.
 */
export function HEAD(): Response {
  return new Response(null, { status: 200, headers: NO_STORE });
}
