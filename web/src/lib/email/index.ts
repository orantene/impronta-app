/**
 * Transactional email via Resend.
 * Silently no-ops when RESEND_API_KEY is not set (dev / test envs without email).
 */

import { improntaLog } from "@/lib/server/structured-log";
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
  return process.env.EMAIL_FROM ?? "Tulala <noreply@tulala.digital>";
}

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  /** Extra MIME headers, e.g. List-Unsubscribe / List-Unsubscribe-Post. */
  headers?: Record<string, string>;
};

/**
 * Outcome of a send attempt. Lets callers that care (the notification engine's
 * email channel) distinguish a real provider FAILURE from a skipped send, so a
 * Resend error is recorded as `failed` rather than masked as `sent`.
 *  - `sent`    — Resend accepted the message (`id` is the message id, may be null).
 *  - `skipped` — no RESEND_API_KEY configured (dev / test); nothing was sent.
 *  - `failed`  — Resend returned an error (already logged); the send did not land.
 */
export type SendEmailResult =
  | { status: "sent"; id: string | null }
  | { status: "skipped" }
  | { status: "failed"; error: string };

/**
 * Send a transactional email and report the outcome. NEVER throws — a provider
 * error returns `{ status: "failed" }` (after logging) and a missing API key
 * returns `{ status: "skipped" }`. Use this when the caller must record or react
 * to delivery failure (the notification dispatcher). Most call sites can use the
 * simpler `sendEmail` wrapper below.
 */
export async function sendEmailResult(input: SendEmailInput): Promise<SendEmailResult> {
  const client = getClient();
  if (!client) {
    void improntaLog("email.warn", {
      message: "[email] RESEND_API_KEY not set — skipping email:",
      input: input.subject,
    });
    return { status: "skipped" };
  }

  const { data, error } = await client.emails.send({
    from: getFrom(),
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
    html: input.html,
    replyTo: input.replyTo,
    headers: input.headers,
  });

  if (error) {
    logServerError("email/send", error);
    return {
      status: "failed",
      error: String((error as { message?: unknown })?.message ?? error),
    };
  }
  return { status: "sent", id: data?.id ?? null };
}

/**
 * Send a transactional email, returning the Resend message id on success or
 * `null` when the send is skipped (no API key) OR errored. Errors are logged,
 * never thrown — this is the fire-and-forget contract the direct call sites
 * rely on. Callers that must distinguish a failure from a skip (the notification
 * engine's email channel) use `sendEmailResult` instead.
 */
export async function sendEmail(input: SendEmailInput): Promise<string | null> {
  const result = await sendEmailResult(input);
  return result.status === "sent" ? result.id : null;
}
