/**
 * transcribe.server.ts — speech to text.
 *
 * The recording half already existed: `VoiceRecorderButton` has been capturing
 * `MediaRecorder` audio and uploading voice notes for a while. What was missing
 * was turning audio into words, which is this file and nothing else.
 *
 * WHY IT EXISTS WHEN THE COMPOSER ALREADY DICTATES
 * ───────────────────────────────────────────────
 * The Tulala composer uses the Web Speech API, which is free, on-device and
 * instant — and absent in Firefox, unreliable on Android, and noticeably worse
 * at Spanish spoken with a Mexican accent, which is most of this product's
 * market. Web Speech stays the default because a local transcript costs nothing
 * and leaves no audio anywhere. This is the fallback for the browsers where it
 * simply is not there, and it is the reason a Firefox user is not silently
 * offered a mic that does nothing.
 *
 * IT RETURNS TEXT, IT DOES NOT SEND A MESSAGE
 * ───────────────────────────────────────────
 * The transcript lands in the textarea for the person to read and fix before
 * they send it. That is not a UI nicety: an intake answer becomes a FACT about
 * someone's business, and "I work from home" versus "I work from a home studio"
 * changes which product they are recommended. Autosending a transcript would
 * make a mishearing into a billing decision.
 *
 * NO AUDIO IS KEPT
 * ────────────────
 * The bytes go from the request to the provider and are never written to
 * storage, never logged, and never attached to the Brief. Only the text is
 * returned, and only the text can be persisted (as a fact, once approved). This
 * keeps `docs/ai-data-retention.md` intact — it is explicit that draft AI
 * material is not persisted without a product decision and a TTL, and an
 * anonymous visitor's voice is the last thing that should become the exception.
 */

import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { resolveOpenAiApiKey } from "@/lib/ai/resolve-api-keys";

/**
 * 25MB is the provider's own limit; the route caps far lower. Kept here as the
 * hard backstop so a future caller cannot exceed it by forgetting.
 */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/**
 * Formats `MediaRecorder` actually produces, which is a short list: Chrome and
 * Firefox give webm/opus, Safari gives mp4/aac. Anything else is not a browser
 * recording and does not need to be accepted.
 */
export const ACCEPTED_AUDIO_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-m4a",
  "audio/m4a",
] as const;

export function isAcceptedAudioType(mime: string): boolean {
  const base = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  return (ACCEPTED_AUDIO_TYPES as readonly string[]).includes(base);
}

/**
 * `gpt-4o-mini-transcribe` over `whisper-1`: materially better on accented
 * Spanish, cheaper per minute, and it does not return the timestamp scaffolding
 * that would have to be stripped. There is no diarisation or timing need here —
 * one person, one answer, plain text out.
 */
const MODEL = "gpt-4o-mini-transcribe";

export type TranscribeResult =
  | { ok: true; text: string }
  | { ok: false; code: "not_configured" | "too_large" | "bad_audio" | "failed" };

export async function transcribeAudio(input: {
  audio: Blob;
  filename: string;
  /** Given to the provider as a hint. Wrong-language guesses are the main error. */
  locale?: "en" | "es";
}): Promise<TranscribeResult> {
  if (input.audio.size === 0) return { ok: false, code: "bad_audio" };
  if (input.audio.size > MAX_AUDIO_BYTES) return { ok: false, code: "too_large" };

  const apiKey = await resolveOpenAiApiKey();
  if (!apiKey) {
    // Not an error worth logging: a deploy with no OpenAI key is a valid
    // configuration, and the caller's job is to hide the button rather than to
    // report a fault.
    return { ok: false, code: "not_configured" };
  }

  try {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey });

    const file = new File([input.audio], input.filename, {
      type: input.audio.type || "audio/webm",
    });

    const response = await client.audio.transcriptions.create({
      file,
      model: MODEL,
      // Naming the language stops the single worst failure mode, which is
      // Spanish audio transcribed as phonetically similar English.
      ...(input.locale ? { language: input.locale } : {}),
      response_format: "text",
    });

    // `response_format: "text"` yields a bare string. The runtime check is not
    // redundant with the SDK's types: a provider that answered with the JSON
    // shape anyway would otherwise stringify to "[object Object]" and land that
    // in the composer.
    const raw: unknown = response;
    const text =
      typeof raw === "string"
        ? raw
        : typeof (raw as { text?: unknown })?.text === "string"
          ? ((raw as { text: string }).text)
          : "";
    const cleaned = text.trim();

    // Silence and room noise come back as an empty string or as one of the
    // provider's stock hallucinations for near-silent input. Treating that as a
    // success would drop "Thank you." into the composer after a failed take.
    if (!cleaned || isSilenceArtefact(cleaned)) {
      return { ok: false, code: "bad_audio" };
    }

    return { ok: true, text: cleaned };
  } catch (error) {
    logServerError("ai.transcribe", error);
    return { ok: false, code: "failed" };
  }
}

/**
 * Known outputs for silence.
 *
 * Transcription models trained on subtitled video reproduce the boilerplate that
 * appears over quiet footage. This is a well-documented artefact, and the list
 * is short because the phrases are remarkably consistent.
 */
const SILENCE_ARTEFACTS = [
  "thank you.",
  "thanks for watching!",
  "thank you for watching.",
  "subtítulos realizados por la comunidad de amara.org",
  "subtitles by the amara.org community",
  "gracias por ver el video.",
  "[música]",
  "[music]",
  "you",
  ".",
];

function isSilenceArtefact(text: string): boolean {
  const normalised = text.toLowerCase().trim();
  // Only applied to very short outputs. "Thank you" inside a real answer is a
  // person being polite, not an artefact.
  if (normalised.length > 60) return false;
  return SILENCE_ARTEFACTS.includes(normalised);
}
