import type { User } from "@supabase/supabase-js";

/** True if the user can sign in with the email + password provider (not OAuth-only). */
export function userHasEmailPasswordIdentity(user: User): boolean {
  const ids = user.identities ?? [];
  return ids.some((i) => i.provider === "email");
}
