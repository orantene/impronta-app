/**
 * Which "ask" entry a talent's public pages offer (Website Settings
 * Foundation PR D, report §7 / §8, scenario 08, QA Q3). Pure: safe on
 * server and client.
 *
 *   chat            — the guest dock takes every Ask / Consultar.
 *   existing_client — the dock stays, but only for existing clients (§8
 *                     "On/Off/On": chat on, inquiries off; or any visitor who
 *                     already has a thread). Ask / Consultar entry points are
 *                     hidden; a new thread is refused server-side unless the
 *                     email already has a booking/thread with this talent.
 *   form            — chat off, inquiries on: Ask / Consultar open the
 *                     inquiry form sheet.
 *   hidden          — nothing new can start and the visitor has no thread.
 *
 * §8 "Existing clients": manage links, threads and replies keep working, so a
 * visitor with an active thread always keeps the dock. Only NEW conversation
 * starts are gated.
 */
import type { TalentSiteSwitches } from "./site-switches";

export type TalentAskEntry = "chat" | "existing_client" | "form" | "hidden";

export function resolveTalentAskEntry(
  switches: Pick<TalentSiteSwitches, "chatEnabled" | "acceptingInquiries">,
  opts: { hasActiveThread?: boolean } = {},
): TalentAskEntry {
  if (switches.chatEnabled && switches.acceptingInquiries) return "chat";
  if (opts.hasActiveThread) return "existing_client";
  if (switches.chatEnabled) return "existing_client";
  return switches.acceptingInquiries ? "form" : "hidden";
}

/** Whether Ask / Consultar / Pedir cotización entry points render. */
export function askEntryPointsVisible(entry: TalentAskEntry): boolean {
  return entry === "chat" || entry === "form";
}

/** Whether the guest dock (launcher + panel) mounts. */
export function dockMounted(entry: TalentAskEntry): boolean {
  return entry === "chat" || entry === "existing_client";
}

const EXISTING_CLIENT_GREETING = {
  en: "Message only about an existing booking. Use the email you booked with.",
  es: "Escribe solo sobre una reserva que ya tienes. Usa el email con el que reservaste.",
} as const;

/**
 * The dock greeting: existing-client mode always explains itself; otherwise
 * the talent's own `chat_config.greeting` when set, else the caller's default.
 */
export function resolveTalentChatGreeting(
  switches: Pick<TalentSiteSwitches, "chatConfig">,
  fallback: string | null,
  opts: { entry?: TalentAskEntry; locale?: string } = {},
): string | null {
  if (opts.entry === "existing_client") {
    return opts.locale === "es" ? EXISTING_CLIENT_GREETING.es : EXISTING_CLIENT_GREETING.en;
  }
  return switches.chatConfig.greeting ?? fallback;
}
