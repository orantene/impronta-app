/**
 * Transactional email via Resend.
 * Silently no-ops when RESEND_API_KEY is not set (dev / test envs without email).
 */

import { Resend } from "resend";
import { logServerError } from "@/lib/server/safe-error";

let _client: Resend | null = null;

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_client) _client = new Resend(key);
  return _client;
}

function getFrom(): string {
  return process.env.EMAIL_FROM ?? "Impronta <noreply@impronta.com>";
}

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
};

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const client = getClient();
  if (!client) {
    console.warn("[email] RESEND_API_KEY not set — skipping email:", input.subject);
    return;
  }

  const { error } = await client.emails.send({
    from: getFrom(),
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
    html: input.html,
    replyTo: input.replyTo,
  });

  if (error) {
    logServerError("email/send", error);
  }
}
