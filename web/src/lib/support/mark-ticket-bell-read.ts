import "server-only";

import { logServerError } from "@/lib/server/safe-error";

/** The slice of the Supabase builder this helper needs (fakeable in tests). */
export type BellUpdateClient = {
  from(table: "user_notifications"): {
    update(values: { read_at: string }): {
      eq(col: string, val: string): {
        eq(col: string, val: string): {
          is(col: string, val: null): {
            filter(col: string, op: string, val: string): PromiseLike<{ error: { message: string } | null }>;
          };
        };
      };
    };
  };
};

/**
 * Reading a ticket in the panel also reads its bell rows. Without this the
 * Tickets badge cleared while the bell kept counting the same reply forever,
 * so the two numbers could never agree. Best effort: a failure here must not
 * fail mark-read.
 */
export async function markTicketBellRead(
  client: BellUpdateClient,
  userId: string,
  ticketId: string,
  nowIso: string = new Date().toISOString(),
): Promise<boolean> {
  try {
    const { error } = await client
      .from("user_notifications")
      .update({ read_at: nowIso })
      .eq("user_id", userId)
      .eq("kind", "ticket")
      .is("read_at", null)
      .filter("target_payload->>ticketId", "eq", ticketId);
    if (error) {
      logServerError("support.markTicketBellRead", error);
      return false;
    }
    return true;
  } catch (err) {
    logServerError("support.markTicketBellRead", err);
    return false;
  }
}
