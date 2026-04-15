import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";

export async function notifyUsers(
  supabase: SupabaseClient,
  recipients: Array<{ userId: string; title: string; body?: string | null }>,
): Promise<Error[]> {
  const errors: Error[] = [];
  for (const r of recipients) {
    const { error } = await supabase.from("notifications").insert({
      user_id: r.userId,
      title: r.title,
      body: r.body ?? null,
    });
    if (error) {
      logServerError("inquiry-notifications/insert", error);
      errors.push(new Error(error.message));
    }
  }
  return errors;
}
