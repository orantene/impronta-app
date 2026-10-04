/**
 * Server-action helpers: clear parent-domain auth shadows on Desk hosts so
 * host-only Desk sessions win after email/OTP login.
 */

import { cookies, headers } from "next/headers";

import { isSupportDeskHost } from "@/lib/support/desk-hosts";
import {
  expireParentDomainAuthCookies,
  isSupabaseAuthCookie,
} from "@/lib/supabase/cookie-domain";

/** Request host for Desk remaps (proxy-stamped name preferred). */
export async function deskRequestHost(): Promise<string | null> {
  try {
    const h = await headers();
    return (
      h.get("x-impronta-host-name") ?? h.get("host") ?? null
    );
  } catch {
    return null;
  }
}

/**
 * On Desk hosts only: expire `.tulala.digital` / `.lvh.me` Supabase auth
 * cookies currently visible on the request. Safe no-op elsewhere.
 */
export async function clearParentDomainAuthCookiesOnDeskHost(): Promise<void> {
  const host = await deskRequestHost();
  if (!isSupportDeskHost(host)) return;
  const store = await cookies();
  const names = store
    .getAll()
    .map((c) => c.name)
    .filter(isSupabaseAuthCookie);
  if (names.length === 0) return;
  expireParentDomainAuthCookies(store, names);
}
