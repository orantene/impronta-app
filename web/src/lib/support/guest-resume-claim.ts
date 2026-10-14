import { evaluateResumeClaim } from "./guest-resume-token";

/**
 * TUL-618 follow-up: atomic first-use claim without a migration. The update is
 * conditional on the `updated_at` we read (and always bumps it), so two
 * simultaneous first opens cannot both win: the loser updates 0 rows, reloads
 * once (which now shows the winner's claim) and is refused, or is allowed if
 * the winner was the same session. A second lost race counts as "already opened".
 */
export type ResumeTicketRow = {
  updatedAt: string | null;
  metadata: Record<string, unknown>;
  guestSessionId: string | null;
};

export type ResumeClaimDeps = {
  load(): Promise<{ row: ResumeTicketRow | null; error: boolean }>;
  /** Conditional update; `rows` is how many rows matched (0 = lost the race). */
  update(
    patch: { guestSessionId: string; metadata: Record<string, unknown>; updatedAt: string },
    expectedUpdatedAt: string | null,
  ): Promise<{ rows: number; error: boolean }>;
};

export type ResumeClaimOutcome = "claimed" | "not_found" | "already_opened" | "error";

export async function claimGuestResume(
  deps: ResumeClaimDeps,
  issuedAtMs: number,
  sessionId: string,
  nowIso: () => string = () => new Date().toISOString(),
): Promise<ResumeClaimOutcome> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { row, error } = await deps.load();
    if (error) return "error";
    if (!row) return "not_found";
    const claim = evaluateResumeClaim(row.metadata.resume_claims, issuedAtMs, sessionId);
    if (!claim.allow) return "already_opened";
    const prior = Array.isArray(row.metadata.prior_guest_sessions)
      ? [...(row.metadata.prior_guest_sessions as string[])]
      : [];
    if (row.guestSessionId && row.guestSessionId !== sessionId) prior.push(row.guestSessionId);
    const res = await deps.update(
      {
        guestSessionId: sessionId,
        metadata: { ...row.metadata, prior_guest_sessions: prior, resume_claims: claim.claims },
        updatedAt: nowIso(),
      },
      row.updatedAt,
    );
    if (res.error) return "error";
    if (res.rows > 0) return "claimed";
  }
  return "already_opened";
}
