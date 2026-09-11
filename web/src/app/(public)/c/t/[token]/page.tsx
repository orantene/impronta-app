import { notFound } from "next/navigation";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { customerVisibleMessages, loadMessagingThread } from "@/lib/messaging/thread";
import { verifyThreadToken } from "@/lib/messaging/thread-token";

import { CustomerThread } from "./CustomerThread";

export const dynamic = "force-dynamic";

export default async function PublicConversationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const verified = verifyThreadToken(decodeURIComponent(token));
  if (!verified.ok) notFound();
  const admin = createServiceRoleClient();
  if (!admin) notFound();
  const thread = await loadMessagingThread(admin, {
    tenantId: verified.tenantId,
    inquiryId: verified.inquiryId,
  });
  if (!thread.ok) notFound();
  return (
    <CustomerThread
      token={token}
      messages={customerVisibleMessages(thread.messages)}
    />
  );
}
