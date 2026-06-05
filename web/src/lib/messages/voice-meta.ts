/**
 * Tolerant parser the bubble renderers use to detect a voice message and
 * pull its playback metadata off `inquiry_messages.metadata`.
 *
 * Plain module — safe to import from client components and server code.
 * Returns null for anything that isn't a well-formed voice payload so the
 * caller can fall back to the normal text/markdown render path.
 */
import type { VoiceNoteMeta } from "./voice-types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Reads `metadata.voice` (the shape written by uploadAndSendVoiceNote) and
 * returns a normalized VoiceNoteMeta, or null when absent/malformed.
 *
 * Tolerant: numbers may arrive as strings (jsonb round-trips), so durationMs
 * and byteSize are coerced; non-finite values clamp to 0. attachmentId and
 * storagePath are required — without them there's nothing to play.
 */
export function readVoiceMetaFromMessageMetadata(
  metadata: unknown,
): VoiceNoteMeta | null {
  if (!isRecord(metadata)) return null;
  const voice = metadata.voice;
  if (!isRecord(voice)) return null;

  const attachmentId =
    typeof voice.attachmentId === "string" ? voice.attachmentId.trim() : "";
  const storagePath =
    typeof voice.storagePath === "string" ? voice.storagePath.trim() : "";
  if (!attachmentId || !storagePath) return null;

  const toNum = (v: unknown): number => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const mimeType =
    typeof voice.mimeType === "string" && voice.mimeType.trim()
      ? voice.mimeType.trim()
      : "audio/webm";

  return {
    attachmentId,
    storagePath,
    durationMs: toNum(voice.durationMs),
    mimeType,
    byteSize: toNum(voice.byteSize),
  };
}
