/**
 * POST /api/tulala/email — attach an anonymous intake to an email address.
 *
 * The plan's "email after value" moment. By the time this is called, the visitor
 * has already been understood; the email is what makes that understanding
 * survive closing the tab.
 *
 * WHAT THIS DOES NOT DO
 * ─────────────────────
 * It does not create an account, does not send anything, and does not sign
 * anybody in. It records a marketing signup row and links the Brief to it. That
 * is the whole point of the anonymous-first flow: an email should cost the
 * visitor one field, not a password and a verification round trip, and account
 * creation happens later at approval with a real intent behind it.
 *
 * The email is stored on a `saas_marketing_signups` row rather than on the Brief
 * so it lands in exactly the same place as a classic `/get-started` submission.
 * Two tables holding half the leads each would be a reporting problem forever.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveClientIp, resolveGuestSessionId } from "@/lib/guest/guest-session";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { checkTulalaTurnByIp, isTulalaKvConfigured } from "@/lib/rate-limit-kv-tulala";
import {
  linkBriefObjects,
  loadBrief,
  type BriefOwner,
} from "@/lib/tulala/brief-store.server";
import { factValue, type Brief } from "@/lib/tulala/brief-store";

const BodySchema = z.object({
  email: z.string().trim().email().max(254),
});

export async function POST(req: Request): Promise<Response> {
  if (!isTulalaKvConfigured()) {
    return NextResponse.json({ error: "Unavailable right now." }, { status: 503 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "That email does not look right." }, { status: 400 });
  }

  const ip = await resolveClientIp();
  if (ip) {
    // Shares the turn budget deliberately: a script hammering this endpoint is
    // the same script hammering the conversation, and giving it a second
    // independent allowance would just widen the hole.
    const limit = await checkTulalaTurnByIp(ip);
    if (!limit.ok) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }
  }

  const session = await getCachedActorSession();
  const guestSessionId = session.user ? null : await resolveGuestSessionId();
  if (!session.user && !guestSessionId) {
    return NextResponse.json({ error: "No session." }, { status: 400 });
  }

  const owner: BriefOwner = session.user
    ? { kind: "profile", profileId: session.user.id }
    : { kind: "guest", guestSessionId: guestSessionId! };

  const brief = await loadBrief(owner);
  if (!brief) {
    return NextResponse.json({ error: "Nothing to save yet." }, { status: 400 });
  }
  if (brief.signupLeadId) {
    // Already attached. Idempotent rather than an error: a double submit or a
    // retry after a flaky connection must not read as a failure.
    return NextResponse.json({ ok: true });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Unavailable right now." }, { status: 503 });
  }

  // Name and business come from the Brief rather than from a form: the visitor
  // already said them in conversation, and asking again to fill a lead row is
  // exactly the redundancy the Agent exists to remove.
  const name = stringFact(brief, "person.name") ?? "";
  const businessName =
    stringFact(brief, "business.name") ?? (name ? `${name}` : "Not named yet");
  const description = stringFact(brief, "business.description");

  const { data: inserted, error } = await supabase
    .from("saas_marketing_signups")
    .insert({
      email: body.email,
      name: name || "Unknown",
      business_name: businessName,
      business_description: description,
      // The intake has not asked a taxonomy question and must not invent one.
      // The engine's recommendation is what fills these in at approval.
      audience: "operator",
      roster_size: "1-5",
      source_page: "/get-started/agent",
      ...(session.user ? { claimed_by_profile_id: session.user.id } : {}),
    })
    .select("id")
    .single();

  if (error || !inserted) {
    logServerError("tulala.email.insert", error);
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }

  const linked = await linkBriefObjects(brief.id, {
    signupLeadId: inserted.id as string,
  });
  if (!linked.ok) {
    // The lead row exists, so nothing was lost, but the brief is now orphaned
    // from it and the approval step will not find the email. Worth a log line.
    logServerError(
      "tulala.email.link",
      new Error(`brief ${brief.id} not linked to lead ${inserted.id}`),
    );
  }

  return NextResponse.json({ ok: true });
}

function stringFact(brief: Brief, key: string): string | null {
  const value = factValue(brief, key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
