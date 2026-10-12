/**
 * TUL-478: the inbox row preview. Only SYSTEM text and the built-in mock
 * conversations go through the dashboard dictionary; whatever a person wrote
 * (the client, the coordinator, the agency, or the talent) is shown verbatim.
 * Running a guest's "Confirmed" through the dictionary would rewrite their own
 * words in the talent's language. Pure.
 *
 * TUL-379 residual: synthetic status lines ("Awaiting your response.") must
 * translate even when the row sender is `agency` / `coordinator` — the shell
 * then prefixes "Impronta: " and the English body was left verbatim.
 */

export type PreviewSender = "you" | "coordinator" | "client" | "agency" | "system" | string;

/** Catalog English keys the talent adapter invents when there is no real last message. */
const SYNTHETIC_PREVIEWS = new Set([
  "Awaiting your response.",
  "Booking confirmed. Check logistics tab.",
]);

/** Body of a synthetic preview, or null when the text is a real human message. */
export function syntheticInboxPreviewBody(preview: string): string | null {
  const p = preview.trim();
  if (SYNTHETIC_PREVIEWS.has(p)) return p;
  // Rare: whole "Impronta: Awaiting your response." stored as one preview string.
  const colon = p.indexOf(": ");
  if (colon > 0 && colon < 40) {
    const rest = p.slice(colon + 2).trim();
    if (SYNTHETIC_PREVIEWS.has(rest)) return rest;
  }
  return null;
}

export function inboxPreviewText(
  translate: (s: string) => string,
  input: { sender: PreviewSender; isMock: boolean; preview: string },
): string {
  const synthetic = syntheticInboxPreviewBody(input.preview);
  if (input.sender === "system" || input.isMock || synthetic) {
    if (!synthetic) return translate(input.preview);
    const translated = translate(synthetic);
    const trimmed = input.preview.trim();
    if (trimmed === synthetic) return translated;
    const colon = trimmed.indexOf(": ");
    return `${trimmed.slice(0, colon + 2)}${translated}`;
  }
  return input.preview;
}
