"use server";

import { revalidatePath } from "next/cache";
import { sendMessage } from "@/lib/inquiry/inquiry-engine";
import { requireStaff } from "@/lib/server/action-guards";
export async function actionSendInquiryMessage(formData: FormData): Promise<void> {
  const auth = await requireStaff();
  if (!auth.ok) return;
  const { supabase } = auth;

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const threadType = String(formData.get("thread_type") ?? "private") as "private" | "group";
  const body = String(formData.get("body") ?? "").trim();
  if (!inquiryId || !body) return;

  const res = await sendMessage(supabase, {
    inquiryId,
    actorUserId: auth.user.id,
    threadType: threadType === "group" ? "group" : "private",
    body,
  });

  if (!res.success) {
    return;
  }
  revalidatePath(`/admin/inquiries/${inquiryId}`);
}
