import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Returns whether an auth account already exists for the given email.
 * Used by public signup to route existing users to sign-in without creating duplicates.
 */
export async function findAuthUserIdByEmail(
  email: string,
): Promise<{ userId: string | null; error: boolean }> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return { userId: null, error: false };

  const admin = createServiceRoleClient();
  if (!admin) return { userId: null, error: true };

  let page = 1;
  const perPage = 200;

  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      logServerError("find-auth-user-by-email.listUsers", error);
      return { userId: null, error: true };
    }

    const users = data?.users ?? [];
    const match = users.find((u) => (u.email ?? "").trim().toLowerCase() === normalized);
    if (match?.id) return { userId: match.id, error: false };

    if (users.length < perPage) break;
    page += 1;
  }

  return { userId: null, error: false };
}
