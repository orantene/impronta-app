import { headers } from "next/headers";

const GUEST_HEADER = "x-impronta-guest";

/** Guest id from middleware-injected header (stable per browser session). */
export async function getGuestSessionKey(): Promise<string | null> {
  const h = await headers();
  return h.get(GUEST_HEADER);
}
