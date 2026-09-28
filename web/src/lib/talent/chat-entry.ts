/**
 * Which "ask" entry a talent's public pages offer (Website Settings
 * Foundation PR D, report §7 / §8 row "On/On/Off", scenario 08, QA Q3).
 * Pure: safe on server and client.
 *
 *   chat   — the guest dock (launcher + panel) takes every Ask / Consultar.
 *   form   — chat is off: every Ask / Consultar opens the inquiry form sheet.
 *   hidden — inquiries are off: no new-conversation entry is rendered.
 *            Enforcement lives server-side in another PR; this only decides
 *            what the page shows.
 */
import type { TalentSiteSwitches } from "./site-switches";

export type TalentAskEntry = "chat" | "form" | "hidden";

export function resolveTalentAskEntry(
  switches: Pick<TalentSiteSwitches, "chatEnabled" | "acceptingInquiries">,
): TalentAskEntry {
  if (!switches.acceptingInquiries) return "hidden";
  return switches.chatEnabled ? "chat" : "form";
}

/**
 * The dock greeting: the talent's own `chat_config.greeting` when set,
 * otherwise the caller's default (trade voice / agency greeting).
 */
export function resolveTalentChatGreeting(
  switches: Pick<TalentSiteSwitches, "chatConfig">,
  fallback: string | null,
): string | null {
  return switches.chatConfig.greeting ?? fallback;
}
