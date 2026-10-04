/**
 * Which "ask" entry a talent's public pages offer (Website Settings
 * Foundation PR D, report §7 / §8, scenario 08, QA Q3). Pure: safe on
 * server and client.
 *
 *   chat            — the guest dock takes every Ask / Consultar.
 *   existing_client — the visitor already has a VERIFIED thread (guest cookie,
 *                     the same lookup the dock uses to reopen a thread). The
 *                     dock stays for replies; the server refuses any new
 *                     thread while the talent is not taking inquiries.
 *   form            — chat off, inquiries on: Ask / Consultar open the
 *                     inquiry form sheet.
 *   closed_notice   — chat on, inquiries off, no verified thread: a notice
 *                     pointing to the confirmation-email link. No composer,
 *                     no dock, no way to start a thread. A typed email is
 *                     never treated as identity.
 *   unavailable     — bookings AND inquiries off: an honest unavailable
 *                     notice, never Consultar.
 *   hidden          — nothing to render (chat off, inquiries off, bookings on).
 */
import type { TalentSiteSwitches } from "./site-switches";

export type TalentAskEntry =
  | "chat"
  | "existing_client"
  | "form"
  | "closed_notice"
  | "unavailable"
  | "hidden";

export function resolveTalentAskEntry(
  switches: Pick<TalentSiteSwitches, "chatEnabled" | "acceptingInquiries" | "acceptingBookings">,
  opts: { hasActiveThread?: boolean } = {},
): TalentAskEntry {
  if (switches.chatEnabled && switches.acceptingInquiries) return "chat";
  // §8 "Existing clients": a verified thread keeps replying under any switch.
  if (opts.hasActiveThread) return "existing_client";
  if (switches.acceptingInquiries) return "form";
  if (!switches.acceptingBookings) return "unavailable";
  return switches.chatEnabled ? "closed_notice" : "hidden";
}

/** Whether Ask / Consultar / Pedir cotización entry points render. */
export function askEntryPointsVisible(entry: TalentAskEntry): boolean {
  return entry === "chat" || entry === "form";
}

/** Whether the guest dock (launcher + panel) mounts. */
export function dockMounted(entry: TalentAskEntry): boolean {
  return entry === "chat" || entry === "existing_client";
}

export type TalentIntakeNoticeKind = "closed" | "unavailable";

export function intakeNoticeKind(entry: TalentAskEntry): TalentIntakeNoticeKind | null {
  if (entry === "closed_notice") return "closed";
  if (entry === "unavailable") return "unavailable";
  return null;
}

const NOTICE_COPY: Record<TalentIntakeNoticeKind, { en: string; es: string }> = {
  closed: {
    en: "This talent isn't taking new messages. If you have a booking, use the link in your confirmation email.",
    es: "Ahora no recibe mensajes nuevos. Si tienes una reserva, usa el enlace de tu email de confirmación.",
  },
  unavailable: {
    en: "Not available for bookings or messages right now. If you have a booking, use the link in your confirmation email.",
    es: "Ahora no está disponible para reservas ni mensajes. Si tienes una reserva, usa el enlace de tu email de confirmación.",
  },
};

export function intakeNoticeCopy(kind: TalentIntakeNoticeKind, locale: string): string {
  return locale === "es" ? NOTICE_COPY[kind].es : NOTICE_COPY[kind].en;
}

/** The dock greeting: the talent's own `chat_config.greeting`, else the caller's default. */
export function resolveTalentChatGreeting(
  switches: Pick<TalentSiteSwitches, "chatConfig">,
  fallback: string | null,
): string | null {
  return switches.chatConfig.greeting ?? fallback;
}
