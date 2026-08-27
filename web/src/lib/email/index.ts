/**
 * Transactional email via Resend.
 * Silently no-ops when RESEND_API_KEY is not set (dev / test envs without email).
 */

import { improntaLog } from "@/lib/server/structured-log";
import { Resend } from "resend";
import { logServerError } from "@/lib/server/safe-error";
import { DEFAULT_PLATFORM_FROM } from "@/lib/email/resend-client";

let _client: Resend | null = null;

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_client) _client = new Resend(key);
  return _client;
}

function getFrom(): string {
  return process.env.EMAIL_FROM ?? DEFAULT_PLATFORM_FROM;
}

/**
 * DEV-ONLY outbox. Without `RESEND_API_KEY` a local send is skipped, so the
 * rendered HTML of a real dispatch is unobservable and email work can only be
 * QA'd by reading template source — which is how a broken link or a missing
 * CTA ships. When `EMAIL_DEV_OUTBOX_DIR` is set on a development server, the
 * skipped send is written there instead (one .html per email + a .json with
 * the envelope) so the actual output can be opened in a browser.
 *
 * Hard-gated on NODE_ENV === "development" AND an explicit opt-in path;
 * production builds always have NODE_ENV=production, so this can never write
 * message content to disk there. Never throws — a QA affordance must not be
 * able to break a send path.
 */
async function writeDevOutbox(input: SendEmailInput): Promise<void> {
  if (process.env.NODE_ENV !== "development") return;
  const dir = process.env.EMAIL_DEV_OUTBOX_DIR?.trim();
  if (!dir) return;
  try {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    await mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const slug = input.subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48);
    const base = join(dir, `${stamp}_${slug || "email"}`);
    await writeFile(`${base}.html`, input.html, "utf8");
    await writeFile(
      `${base}.json`,
      JSON.stringify(
        {
          to: input.to,
          subject: input.subject,
          replyTo: input.replyTo ?? null,
          headers: input.headers ?? null,
          tenantId: input.tenantId ?? null,
        },
        null,
        2,
      ),
      "utf8",
    );
  } catch {
    // Diagnostics only — never surface a QA-affordance failure to the caller.
  }
}

/**
 * Resolve the effective `from` for a send. When a caller passes a `tenantId`,
 * a tenant with white_label_email + a VERIFIED custom sending domain gets a
 * branded `from` (via resolveTenantEmailFrom); otherwise the platform default.
 * Server-only (resolveTenantEmailFrom reads the integrations repository) — this
 * module is only imported server-side, and the resolver itself short-circuits
 * to the platform default for a missing tenantId, so the dynamic import is the
 * one server-only dependency and stays lazy.
 */
async function resolveFrom(
  tenantId?: string | null,
  tenantName?: string | null,
): Promise<string> {
  if (!tenantId) return getFrom();
  try {
    const { resolveTenantEmailFrom } = await import("@/lib/email/resend-client");
    return await resolveTenantEmailFrom(tenantId, tenantName ?? null);
  } catch {
    // Never let a white-label lookup failure block the send.
    return getFrom();
  }
}

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  /** Extra MIME headers, e.g. List-Unsubscribe / List-Unsubscribe-Post. */
  headers?: Record<string, string>;
  /**
   * Optional tenant context. When set, a tenant with white_label_email + a
   * VERIFIED sending domain sends from its own branded address instead of the
   * platform EMAIL_FROM. Omit (the default for most callers) for platform mail.
   * Callers that send tenant-scoped mail (roster/team invites, tenant booking
   * notifications, tenant signup) SHOULD pass these so verified domains take
   * effect.
   */
  tenantId?: string | null;
  /** Optional sender display name (e.g. the agency name) for the branded `from`. */
  tenantName?: string | null;
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
    await writeDevOutbox(input);
    return { status: "skipped" };
  }

  const from = await resolveFrom(input.tenantId, input.tenantName);
  const { data, error } = await client.emails.send({
    from,
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
