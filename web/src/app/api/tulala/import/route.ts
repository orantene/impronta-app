/**
 * POST /api/tulala/import — read a link the visitor pasted.
 *
 * The fastest intake in the product: someone with an existing site or Instagram
 * has already written their description, named their services and stated their
 * city, and this reads all of it in one request instead of asking for it across
 * six questions.
 *
 * FAIL-CLOSED ON KV, LIKE THE TURN ROUTE
 * ──────────────────────────────────────
 * Harder here than anywhere else in the intake. This is an anonymous endpoint
 * that, given a URL, makes an outbound request from our infrastructure and then
 * spends model tokens on the result. Running it with the limiter switched off is
 * not a degraded feature, it is an open proxy with a billing account attached.
 *
 * WHY THE RESPONSE LISTS FACTS BACK
 * ─────────────────────────────────
 * Every imported fact is `needs_approval`, so the visitor has to see them to
 * approve them, and seeing them is also the only way they can catch the common
 * failure: the page was their employer's, or their old business's. An import
 * that silently filled the Brief would be confidently wrong in a way nobody
 * could find until the site was generated from it.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveClientIp } from "@/lib/guest/guest-session";
import {
  checkTulalaImportByIp,
  checkTulalaImportBySession,
  isTulalaKvConfigured,
} from "@/lib/rate-limit-kv-tulala";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { ensureBrief, loadBrief } from "@/lib/tulala/brief-store.server";
import { factLabel } from "@/lib/tulala/fact-keys";
import { resolveBriefOwner } from "@/lib/tulala/owner.server";
import { importFromUrl } from "@/lib/tulala/url-import.server";

const BodySchema = z.object({
  // 2048 is the practical URL ceiling; the guard re-checks it.
  url: z.string().trim().min(4).max(2048),
  locale: z.enum(["en", "es"]).default("en"),
});

export async function POST(req: Request): Promise<Response> {
  if (!isTulalaKvConfigured()) {
    return NextResponse.json({ error: "Unavailable right now." }, { status: 503 });
  }

  const flags = await getAiFeatureFlags();
  if (!flags.ai_master_enabled || !flags.ai_tulala_agent_enabled) {
    return NextResponse.json({ error: "Unavailable right now." }, { status: 503 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "That does not look like a link." }, { status: 400 });
  }

  const resolved = await resolveBriefOwner();
  if (!resolved) {
    return NextResponse.json({ error: "No session." }, { status: 400 });
  }

  const sessionKey = resolved.userId ?? resolved.guestSessionId ?? "x";
  const bySession = await checkTulalaImportBySession(sessionKey);
  if (!bySession.ok) {
    return NextResponse.json(
      { error: "That is as many links as I can read for now." },
      { status: 429 },
    );
  }

  const ip = await resolveClientIp();
  if (ip) {
    const byIp = await checkTulalaImportByIp(ip);
    if (!byIp.ok) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }
  }

  // A paste can be the first thing that happens, before any turn has run, so
  // the Brief may not exist yet.
  let brief = await loadBrief(resolved.owner);
  if (!brief) {
    const ensured = await ensureBrief(resolved.owner);
    if (!ensured.ok) {
      return NextResponse.json({ error: "Unavailable right now." }, { status: 503 });
    }
    brief = ensured.brief;
  }

  const result = await importFromUrl({
    owner: resolved.owner,
    brief,
    url: body.url,
    locale: body.locale,
  });

  if (!result.ok) {
    // 200 with an error message, not 4xx: "I could not read that page" is a
    // normal conversational outcome, not a client mistake, and the chat renders
    // it as the assistant saying so.
    return NextResponse.json({ ok: false, error: result.error });
  }

  return NextResponse.json({
    ok: true,
    host: result.host,
    facts: result.facts.map((f) => ({
      key: f.factKey,
      label: factLabel(f.factKey),
      value: f.value,
    })),
  });
}
