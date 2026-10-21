"use server";

import { z } from "zod";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { readOwnSeat, setOwnConfirmation } from "@/lib/projects/assignment-confirmation";

/**
 * TUL-1603: a person answers for THEIR OWN seat on a project. The signed-in
 * user is read from the session (never from the input) and `setOwnConfirmation`
 * refuses any seat whose profile is not theirs. Idempotent: answering twice
 * writes the same row.
 */
export async function readMyAssignmentAction(input: { bookingId: string }) {
  const parsed = z.object({ bookingId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return null;
  const supabase = await getCachedServerSupabase();
  if (!supabase) return null;
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  const admin = createServiceRoleClient();
  if (!admin) return null;
  return readOwnSeat(admin, { userId: user.id, bookingId: parsed.data.bookingId });
}

export async function answerMyAssignmentAction(input: { assignmentId: string; status: "confirmed" | "declined" }) {
  await requireNotImpersonating();
  const parsed = z
    .object({ assignmentId: z.string().uuid(), status: z.enum(["confirmed", "declined"]) })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  const supabase = await getCachedServerSupabase();
  if (!supabase) return { ok: false as const, reason: "unavailable" as const };
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { ok: false as const, reason: "not_signed_in" as const };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, reason: "unavailable" as const };
  return setOwnConfirmation(admin, { userId: user.id, assignmentId: parsed.data.assignmentId, status: parsed.data.status });
}
