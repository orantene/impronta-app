/**
 * M4 scheduling depth — eligibility, waitlist, safe exchange already in
 * reschedule-booking; this module covers waitlist invitation + substitute.
 */

export type ClassWaitlistEntry = {
  id: string;
  sessionId: string;
  customerId: string;
  position: number;
  invitedAt: string | null;
  expiresAt: string | null;
};

export function nextWaitlistInvite(
  queue: readonly ClassWaitlistEntry[],
  nowIso: string,
): ClassWaitlistEntry | null {
  const now = Date.parse(nowIso);
  const open = queue
    .filter((e) => !e.invitedAt || (e.expiresAt != null && Date.parse(e.expiresAt) < now))
    .sort((a, b) => a.position - b.position);
  return open[0] ?? null;
}

export type SubstituteAssignment = {
  sessionId: string;
  originalTalentId: string;
  substituteTalentId: string;
  reason: string;
};

export function assignSubstitute(input: {
  sessionId: string;
  originalTalentId: string;
  substituteTalentId: string;
  reason: string;
  substituteFree: boolean;
}): { ok: true; assignment: SubstituteAssignment } | { ok: false; error: string } {
  if (!input.reason.trim()) return { ok: false, error: "Substitute needs a reason." };
  if (input.originalTalentId === input.substituteTalentId) {
    return { ok: false, error: "Substitute must be a different person." };
  }
  if (!input.substituteFree) return { ok: false, error: "That substitute is not free." };
  return {
    ok: true,
    assignment: {
      sessionId: input.sessionId,
      originalTalentId: input.originalTalentId,
      substituteTalentId: input.substituteTalentId,
      reason: input.reason.trim(),
    },
  };
}
