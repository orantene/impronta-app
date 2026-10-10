/**
 * TUL-478 / TUL-518: the inbox row preview. SYSTEM text, built-in mock
 * conversations, and bridge-generated placeholders go through the dashboard
 * dictionary; whatever a person wrote (the client, the coordinator, the
 * agency, or the talent) is shown verbatim. Running a guest's "Confirmed"
 * through the dictionary would rewrite their own words in the talent's
 * language. Pure.
 */
import { isGeneratedInboxPreview } from "./inbox-generated-previews";

export type PreviewSender = "you" | "coordinator" | "client" | "agency" | "system" | string;

export function inboxPreviewText(translate: (s: string) => string, input: { sender: PreviewSender; isMock: boolean; preview: string }): string {
  return input.sender === "system" || input.isMock || isGeneratedInboxPreview(input.preview)
    ? translate(input.preview)
    : input.preview;
}
