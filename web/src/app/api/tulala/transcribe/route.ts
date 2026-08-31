/**
 * POST /api/tulala/transcribe — audio in, text out.
 *
 * The fallback path for browsers with no Web Speech API. The composer prefers
 * on-device dictation whenever it exists, so this only runs where the
 * alternative is no microphone at all.
 *
 * IT WRITES NOTHING
 * ─────────────────
 * No Brief, no fact, no storage object, no log of the audio. Text is returned to
 * the browser and the person decides whether to send it. Everything downstream
 * of that is an ordinary typed turn, which means voice adds no new path into the
 * Brief and no new way for an unreviewed claim to become a fact.
 *
 * Metered on the import budget rather than the turn budget: transcription is a
 * paid provider call with a payload the caller controls, which is the import
 * risk profile, not the conversation one.
 */

import { NextResponse } from "next/server";

import { resolveClientIp } from "@/lib/guest/guest-session";
import {
  checkTulalaImportByIp,
  checkTulalaImportBySession,
  isTulalaKvConfigured,
} from "@/lib/rate-limit-kv-tulala";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { assertAiInvocationAllowed, recordAiUsageEstimate } from "@/lib/ai/ai-usage-gate";
import { isAcceptedAudioType, transcribeAudio } from "@/lib/ai/transcribe.server";
import { resolveBriefOwner } from "@/lib/tulala/owner.server";

/**
 * Well under the provider's 25MB and under the platform body cap. At opus
 * bitrates this is minutes of speech, and an intake answer is seconds.
 */
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request): Promise<Response> {
  if (!isTulalaKvConfigured()) {
    return NextResponse.json({ error: "Unavailable right now." }, { status: 503 });
  }

  const flags = await getAiFeatureFlags();
  if (!flags.ai_master_enabled || !flags.ai_tulala_agent_enabled) {
    return NextResponse.json({ error: "Unavailable right now." }, { status: 503 });
  }

  const resolved = await resolveBriefOwner();
  if (!resolved) {
    return NextResponse.json({ error: "No session." }, { status: 400 });
  }

  const sessionKey = resolved.userId ?? resolved.guestSessionId ?? "x";
  const bySession = await checkTulalaImportBySession(sessionKey);
  if (!bySession.ok) {
    return NextResponse.json({ error: "Too many recordings for now." }, { status: 429 });
  }

  const ip = await resolveClientIp();
  if (ip) {
    const byIp = await checkTulalaImportByIp(ip);
    if (!byIp.ok) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }
  }

  const gate = await assertAiInvocationAllowed();
  if (!gate.ok) {
    return NextResponse.json({ error: "Unavailable right now." }, { status: 503 });
  }

  let audio: Blob;
  let locale: "en" | "es" = "en";
  try {
    const form = await req.formData();
    const file = form.get("audio");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "No audio." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "That recording is too long." }, { status: 413 });
    }
    if (!isAcceptedAudioType(file.type)) {
      return NextResponse.json({ error: "Unsupported recording." }, { status: 415 });
    }
    audio = file;
    if (form.get("locale") === "es") locale = "es";
  } catch {
    return NextResponse.json({ error: "No audio." }, { status: 400 });
  }

  const result = await transcribeAudio({
    audio,
    filename: `intake.${extensionFor(audio.type)}`,
    locale,
  });

  if (!result.ok) {
    if (result.code === "not_configured") {
      // The browser should not have shown the button. 503 rather than an error
      // string so the client can hide it for the rest of the session instead of
      // telling the visitor about our configuration.
      return NextResponse.json({ error: "Unavailable." }, { status: 503 });
    }
    if (result.code === "bad_audio") {
      return NextResponse.json({ ok: false, error: "I did not catch that." });
    }
    return NextResponse.json({ ok: false, error: "Could not read that recording." });
  }

  void recordAiUsageEstimate().catch(() => {});

  return NextResponse.json({ ok: true, text: result.text });
}

function extensionFor(mime: string): string {
  const base = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  if (base.includes("mp4") || base.includes("m4a")) return "m4a";
  if (base.includes("ogg")) return "ogg";
  if (base.includes("mpeg")) return "mp3";
  if (base.includes("wav")) return "wav";
  return "webm";
}
