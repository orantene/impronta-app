import { isDisposableEmail } from "@/lib/email/disposable";
import {
  checkSupportGuestCreateByEmail,
  checkSupportGuestCreateByIp,
  checkSupportGuestCreateBySession,
  checkSupportGuestMessageByIp,
  checkSupportGuestMessageBySession,
} from "@/lib/rate-limit-kv-guest-support";

export type GuestSupportAbuseFail = {
  ok: false;
  error: string;
  code: "forbidden" | "rate_limited" | "disposable_email";
};

export type GuestSupportAbuseOk = { ok: true };

function honeypotHit(value: string | null | undefined): boolean {
  return Boolean(value && value.trim());
}

export async function checkGuestSupportCreateAbuse(input: {
  honeypot?: string | null;
  guestSessionId: string;
  ip: string | null;
  email?: string | null;
}): Promise<GuestSupportAbuseOk | GuestSupportAbuseFail> {
  if (honeypotHit(input.honeypot)) {
    return { ok: false, code: "forbidden", error: "Could not start the chat." };
  }
  const session = await checkSupportGuestCreateBySession(input.guestSessionId);
  if (!session.ok) {
    return { ok: false, code: "rate_limited", error: "Too many chats from this session. Try again later." };
  }
  if (input.ip) {
    const ip = await checkSupportGuestCreateByIp(input.ip);
    if (!ip.ok) {
      return { ok: false, code: "rate_limited", error: "Too many chats from this network. Try again later." };
    }
  }
  if (input.email) {
    if (isDisposableEmail(input.email)) {
      return { ok: false, code: "disposable_email", error: "Please use a regular email address, not a disposable one." };
    }
    const email = await checkSupportGuestCreateByEmail(input.email);
    if (!email.ok) {
      return { ok: false, code: "rate_limited", error: "Too many chats from this email. Try again later." };
    }
  }
  return { ok: true };
}

export async function checkGuestSupportMessageAbuse(input: {
  honeypot?: string | null;
  guestSessionId: string;
  ip: string | null;
}): Promise<GuestSupportAbuseOk | GuestSupportAbuseFail> {
  if (honeypotHit(input.honeypot)) {
    return { ok: false, code: "forbidden", error: "Could not send the message." };
  }
  const session = await checkSupportGuestMessageBySession(input.guestSessionId);
  if (!session.ok) {
    return { ok: false, code: "rate_limited", error: "Too many messages. Slow down a moment." };
  }
  if (input.ip) {
    const ip = await checkSupportGuestMessageByIp(input.ip);
    if (!ip.ok) {
      return { ok: false, code: "rate_limited", error: "Too many messages from this network. Try again later." };
    }
  }
  return { ok: true };
}

export async function checkGuestSupportEmailCapture(email: string): Promise<GuestSupportAbuseOk | GuestSupportAbuseFail> {
  if (isDisposableEmail(email)) {
    return {
      ok: false,
      code: "disposable_email",
      error: "Please use a regular email address, not a disposable one. Your chat is still saved.",
    };
  }
  const limited = await checkSupportGuestCreateByEmail(email);
  if (!limited.ok) {
    return { ok: false, code: "rate_limited", error: "Too many emails from this address. Try again later." };
  }
  return { ok: true };
}
