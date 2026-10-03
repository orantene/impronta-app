"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { isSupabaseAuthCookie } from "@/lib/supabase/cookie-domain";
import { SUPPORT_DESK_HOST_PATH } from "@/lib/support/desk/desk-url";

/** Parent domains that may still hold a session visible on Desk hosts. */
const PARENT_AUTH_DOMAINS = [".tulala.digital", ".lvh.me"] as const;

/**
 * Sign out on the Desk host and send the operator to Desk login.
 * Clears host-only AND parent-domain auth cookies so a talent session on
 * support.tulala.digital cannot keep shadowing a platform-admin login.
 */
export async function deskSignOutToLogin(): Promise<void> {
  const supabase = await getCachedServerSupabase();
  if (supabase) {
    await supabase.auth.signOut().catch(() => null);
  }

  const store = await cookies();
  const names = new Set<string>();
  for (const c of store.getAll()) {
    if (isSupabaseAuthCookie(c.name)) names.add(c.name);
  }
  for (const name of names) {
    store.set(name, "", { maxAge: 0, path: "/" });
    for (const domain of PARENT_AUTH_DOMAINS) {
      try {
        store.set(name, "", { maxAge: 0, path: "/", domain });
      } catch {
        /* domain attribute may be rejected off those roots */
      }
    }
  }

  redirect(`/login?next=${encodeURIComponent(SUPPORT_DESK_HOST_PATH)}`);
}
