"use server";

/**
 * One-click unsubscribe — the POST target for the confirm form on
 * `/unsubscribe/[token]`.
 *
 * Flips the requested category's email channel to false and rotates the
 * unsubscribe token (single-use), then redirects back to the page in a
 * terminal `?status=…` state so the result renders without re-resolving the
 * now-rotated token. Runs under the service-role client: the token in the
 * form body is the only credential an unauthenticated email click carries.
 */

import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { applyCategoryUnsubscribe } from "@/lib/notifications/unsubscribe";

export async function confirmUnsubscribeAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "").trim();
  const cat = String(formData.get("cat") ?? "").trim();

  const back = (status: string) =>
    `/unsubscribe/${encodeURIComponent(token)}?cat=${encodeURIComponent(cat)}&status=${status}`;

  const admin = createServiceRoleClient();
  if (!admin) redirect(back("write_failed"));

  const result = await applyCategoryUnsubscribe(admin, token, cat);
  redirect(back(result.ok ? "done" : result.reason));
}
