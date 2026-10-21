/**
 * TUL-1377: pure rules for "Match me with a professional" (open networks, any trade).
 * No I/O: the persistence and the notifications live in `match-me.server.ts`.
 */

export const MATCH_MAX_RECIPIENTS = 5;
export const MATCH_WIDEN_AFTER_MS = 2 * 60 * 60 * 1000;
/** A rated professional below this is not sent a job; an unrated one stays in. */
export const MATCH_MIN_RATING = 3.5;

export type MatchCandidate = {
  id: string;
  zones: readonly string[];
  rating: number | null;
  available: boolean;
  /** When this professional was last offered a matched job (rotation); null = never. */
  lastOfferedAt: string | null;
};

const norm = (s: string) => s.trim().toLowerCase();

/** Up to 5 professionals: zone, availability and rating filter, then fairness rotation, then rating. */
export function pickMatches(
  candidates: readonly MatchCandidate[],
  job: { zone: string | null },
  opts: { excludeIds?: readonly string[]; max?: number } = {},
): MatchCandidate[] {
  const excluded = new Set(opts.excludeIds ?? []);
  const zone = job.zone ? norm(job.zone) : null;
  return candidates
    .filter((p) => !excluded.has(p.id))
    .filter((p) => p.available)
    .filter((p) => zone === null || p.zones.some((z) => norm(z) === zone))
    .filter((p) => p.rating === null || p.rating >= MATCH_MIN_RATING)
    .sort((a, b) => {
      const at = a.lastOfferedAt ? Date.parse(a.lastOfferedAt) : -Infinity;
      const bt = b.lastOfferedAt ? Date.parse(b.lastOfferedAt) : -Infinity;
      if (at !== bt) return at < bt ? -1 : 1;
      const ar = a.rating ?? 0;
      const br = b.rating ?? 0;
      if (ar !== br) return br - ar;
      return a.id.localeCompare(b.id);
    })
    .slice(0, opts.max ?? MATCH_MAX_RECIPIENTS);
}

export type MatchStatus = "open" | "accepted" | "cancelled";

/**
 * Widen an OPEN request once its round is 2h old. A request nobody was ever offered (no candidate
 * matched at all, `offeredCount === 0`) is never widened: the client sees "no one is available"
 * instead of a request that silently waits and later reappears.
 */
export function shouldWiden(req: { status: MatchStatus; roundStartedAtMs: number; offeredCount?: number }, nowMs: number): boolean {
  if (req.offeredCount === 0) return false;
  return req.status === "open" && nowMs - req.roundStartedAtMs >= MATCH_WIDEN_AFTER_MS;
}

export type AcceptOutcome = "won" | "already_taken" | "not_offered" | "closed";

export function resolveAccept(
  req: { status: MatchStatus; winnerId: string | null; offeredIds: readonly string[] },
  talentId: string,
): AcceptOutcome {
  if (req.status === "cancelled") return "closed";
  if (!req.offeredIds.includes(talentId)) return "not_offered";
  if (req.status === "accepted" || req.winnerId) return "already_taken";
  return "won";
}

export type ClientContact = { name: string; email?: string | null; phone?: string | null };

/** Only the first name-level info until THIS professional has accepted; then the full contact. */
export function maskedContact(
  client: ClientContact,
  req: { status: MatchStatus; winnerId: string | null },
  viewerTalentId: string,
): ClientContact {
  return req.status === "accepted" && req.winnerId === viewerTalentId ? client : { name: client.name };
}

/**
 * Who may accept a job: the signed-in owner of the professional profile that was offered it,
 * while that profile is on the roster of the SAME tenant the request belongs to.
 */
export function authorizeAccept(input: {
  requestTenantId: string;
  ctxTenantId: string;
  talentUserId: string | null;
  callerUserId: string | null;
  onRoster: boolean;
}): boolean {
  if (input.requestTenantId !== input.ctxTenantId) return false;
  if (!input.callerUserId || input.talentUserId !== input.callerUserId) return false;
  return input.onRoster;
}
