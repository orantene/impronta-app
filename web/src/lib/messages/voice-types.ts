/**
 * Shared, framework-free types for the voice-notes feature.
 *
 * Plain module (NOT "use server") so both server actions and client
 * components may import these types. A "use server" module may export only
 * async functions, so all voice-note types live here.
 *
 * Stored on `inquiry_messages.metadata.voice` with `message_kind = 'voice'`.
 */
export type VoiceNoteMeta = {
  /** id of the inquiry_attachments row holding the audio object. */
  attachmentId: string;
  /** storage path inside the private `inquiry-files` bucket. */
  storagePath: string;
  /** recorded duration in milliseconds (best-effort from the recorder). */
  durationMs: number;
  /** MIME type of the recorded blob (e.g. "audio/webm"). */
  mimeType: string;
  /** byte size of the recorded blob. */
  byteSize: number;
};
