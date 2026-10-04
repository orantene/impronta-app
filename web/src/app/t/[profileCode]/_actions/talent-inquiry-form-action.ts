"use server";

/**
 * WSF PR D — the chat-off inquiry form sheet's submit.
 *
 * Not a second writer: it forwards to `startGuestChatInquiry`, the same
 * canonical funnel caller the guest dock uses (→ createInquiryFromIntent),
 * so honeypot, abuse floor, roster gate, trust gate and recipient safety all
 * apply unchanged. The visitor's reply path afterwards is the emailed manage
 * link, exactly as for a chat-started inquiry.
 */

import type { StartGuestChatInput } from "@/lib/inquiry/guest-chat-contract";

import { startGuestChatInquiry } from "./guest-chat-actions";

export type TalentInquiryFormResult =
  | { ok: true; inquiryId: string; guestEmail: string }
  | { ok: false; code: string; message: string };

export async function submitTalentInquiryForm(
  input: StartGuestChatInput,
): Promise<TalentInquiryFormResult> {
  const res = await startGuestChatInquiry({ ...input, entryPoint: "inquiry_form" });
  if (!res.ok) return { ok: false, code: res.code, message: res.message };
  return { ok: true, inquiryId: res.inquiryId, guestEmail: res.guestEmail };
}
