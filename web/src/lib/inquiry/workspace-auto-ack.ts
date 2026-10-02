/**
 * Step 13d of submitInquiry: the workspace auto-ack ("Thanks, we'll get back
 * to you within 4 hours.") answers a client who wrote in. It never fires on
 * a conversation the talent started herself (initiator 'talent'): nobody is
 * waiting on her, and it posted ahead of her own first message (F54). Pure.
 */
export function shouldSendWorkspaceAutoAck(input: {
  guestSessionId: string | null | undefined;
  autoAckEnabled: boolean;
  clientUserId: string | null | undefined;
  contactEmail: string | null | undefined;
  initiatorRole: string;
}): boolean {
  if (input.initiatorRole === "talent") return false;
  if (input.guestSessionId) return false;
  if (!input.autoAckEnabled) return false;
  return Boolean(input.clientUserId || input.contactEmail);
}
