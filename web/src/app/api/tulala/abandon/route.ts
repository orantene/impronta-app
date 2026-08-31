/**
 * POST /api/tulala/abandon — the session went cold.
 *
 * Signal 1 of the learning loop. Called from `navigator.sendBeacon` on pagehide,
 * because the question that was on screen when someone left is the strongest
 * evidence that question is bad, and it is unrecoverable after the fact: no
 * scheduled job can reconstruct "they stopped here" from the event rows.
 *
 * Writes one analytics row and nothing else. No model call, so no AI gate and no
 * KV limiter beyond the shape checks below — the write is cheap and the payload
 * cannot say anything that matters. A visitor who forges one has faked one row
 * about their own abandoned session.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveGuestSessionId } from "@/lib/guest/guest-session";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { recordAbandonment } from "@/lib/tulala/turn.server";
import { loadBrief, type BriefOwner } from "@/lib/tulala/brief-store.server";
import { packForBrief } from "@/lib/tulala/pack-for-brief";

const BodySchema = z.object({
  pendingQuestionId: z.string().max(80).nullable().default(null),
  userTurns: z.number().int().min(0).max(200).default(0),
  factsKnown: z.number().int().min(0).max(500).default(0),
});

export async function POST(req: Request): Promise<Response> {
  let body: z.infer<typeof BodySchema>;
  try {
    // sendBeacon posts a bare string with no content-type we control, so parse
    // the text rather than trusting `req.json()` to be reached.
    body = BodySchema.parse(JSON.parse(await req.text()));
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // A session that never took a turn did not abandon anything. Logging those
  // would bury the real signal under every bounce on the page.
  if (body.userTurns === 0) return NextResponse.json({ ok: true });

  const session = await getCachedActorSession();
  const guestSessionId = session.user ? null : await resolveGuestSessionId();

  // The pack is re-derived from the Brief rather than accepted from the beacon.
  // It is the axis every abandonment report is sliced by — "photographers leave
  // at this question" is the finding worth acting on — and a client-supplied
  // value would let a forged beacon skew that reading for everyone.
  const owner: BriefOwner | null = session.user
    ? { kind: "profile", profileId: session.user.id }
    : guestSessionId
      ? { kind: "guest", guestSessionId }
      : null;
  const brief = owner ? await loadBrief(owner) : null;

  await recordAbandonment({
    scope: { sessionId: guestSessionId, userId: session.user?.id ?? null },
    pendingQuestionId: body.pendingQuestionId,
    userTurns: body.userTurns,
    factsKnown: body.factsKnown,
    packId: brief ? (packForBrief(brief)?.id ?? null) : null,
  });

  return NextResponse.json({ ok: true });
}
