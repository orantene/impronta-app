/**
 * F45: who the talent can ask for a review from her own client list. Only a
 * client with a completed booking and an email on file qualifies; the rest
 * never did work with her (or cannot receive the ask). Pure.
 */
export type ReviewInviteClient = {
  readonly id: string;
  readonly name: string;
  readonly email: string | null;
  readonly completedCount: number;
  readonly lastVisit: string | null;
};

export type ReviewInviteCandidate = { id: string; name: string; email: string; lastVisit: string | null };

export function reviewInviteCandidates(
  clients: readonly ReviewInviteClient[],
  alreadyAskedEmails: ReadonlySet<string> = new Set(),
): ReviewInviteCandidate[] {
  const seen = new Set<string>();
  const out: ReviewInviteCandidate[] = [];
  for (const c of clients) {
    const email = c.email?.trim().toLowerCase() ?? "";
    if (!email || c.completedCount <= 0) continue;
    if (seen.has(email) || alreadyAskedEmails.has(email)) continue;
    seen.add(email);
    out.push({ id: c.id, name: c.name.trim() || email, email, lastVisit: c.lastVisit });
  }
  return out.sort((a, b) => (b.lastVisit ?? "").localeCompare(a.lastVisit ?? ""));
}
