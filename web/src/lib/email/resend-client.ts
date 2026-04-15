import { Resend } from "resend";

let _resend: Resend | null = null;

/** Returns a singleton Resend client. Returns null if RESEND_API_KEY is not set. */
export function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!_resend) _resend = new Resend(apiKey);
  return _resend;
}

/** Agency sender identity. Customise via env vars or set once here. */
export const EMAIL_FROM =
  process.env.EMAIL_FROM ?? "Impronta Agency <noreply@impronta.agency>";

/** Agency support address shown in email footers. */
export const EMAIL_REPLY_TO =
  process.env.EMAIL_REPLY_TO ?? undefined;
