/**
 * TUL-478: the inbox row preview. Only SYSTEM text and the built-in mock
 * conversations go through the dashboard dictionary; whatever a person wrote
 * (the client, the coordinator, the agency, or the talent) is shown verbatim.
 * Running a guest's "Confirmed" through the dictionary would rewrite their own
 * words in the talent's language. Pure.
 */
export type PreviewSender = "you" | "coordinator" | "client" | "agency" | "system" | string;

export function inboxPreviewText(translate: (s: string) => string, input: { sender: PreviewSender; isMock: boolean; preview: string }): string {
  return input.sender === "system" || input.isMock ? translate(input.preview) : input.preview;
}
