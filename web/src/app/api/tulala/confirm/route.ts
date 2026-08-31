/**
 * POST /api/tulala/confirm — the visitor answers "is this right?"
 *
 * The other half of the import. Every imported fact lands `needs_approval`, and
 * this is the only route in the intake that clears that status, which is where
 * decision L20 is actually enforced for anything read off a page.
 *
 * WHY IT IS AN ENDPOINT AND NOT A SERVER ACTION
 * ─────────────────────────────────────────────
 * The confirmation sits inside the chat, and the caller is frequently an
 * anonymous guest whose Brief is keyed to a signed cookie rather than a session.
 * The other Tulala routes resolve that owner the same way, so the confirmation
 * shares their shape instead of being the one flow that resolves identity
 * differently. `/account/brief` keeps its server actions: an authenticated
 * settings page is a different caller with a different threat model.
 *
 * Rejection is a first-class outcome, not a failure. "That is my employer's
 * site" is the single most likely response to an Instagram import, and it has to
 * be one click rather than a correction typed into a form.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { checkTulalaTurnBySession, isTulalaKvConfigured } from "@/lib/rate-limit-kv-tulala";
import { loadBrief, resolveFactApprovals } from "@/lib/tulala/brief-store.server";
import { resolveBriefOwner } from "@/lib/tulala/owner.server";

const BodySchema = z.object({
  decisions: z
    .array(z.object({ factKey: z.string().min(1).max(80), approve: z.boolean() }))
    // Bounded because an import cannot produce more than a handful of facts, and
    // an unbounded array is one UPDATE per element.
    .min(1)
    .max(40),
});

export async function POST(req: Request): Promise<Response> {
  if (!isTulalaKvConfigured()) {
    return NextResponse.json({ error: "Unavailable right now." }, { status: 503 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const resolved = await resolveBriefOwner();
  if (!resolved) {
    return NextResponse.json({ error: "No session." }, { status: 400 });
  }

  // Shares the turn budget: confirming is part of the conversation, and it
  // spends nothing beyond a few row updates.
  const limit = await checkTulalaTurnBySession(
    resolved.userId ?? resolved.guestSessionId ?? "x",
  );
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const brief = await loadBrief(resolved.owner);
  if (!brief) {
    return NextResponse.json({ error: "Nothing to confirm." }, { status: 400 });
  }

  // Only keys that are actually on this Brief. Without the filter, the body
  // could name any fact key and the update would be a no-op that still reported
  // success, which would let a confirmation UI drift out of sync silently.
  const own = new Set(brief.facts.map((f) => f.factKey));
  const decisions = body.decisions.filter((d) => own.has(d.factKey));
  if (decisions.length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  const result = await resolveFactApprovals(brief.id, decisions);
  return NextResponse.json({ ok: result.ok, updated: result.updated });
}
