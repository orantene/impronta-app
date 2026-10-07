/**
 * Display-time localisation of the few English strings the support engine
 * PERSISTS (ticket subjects and system-card bodies). They are stored in
 * English because the server has no reader locale, so a Spanish requester saw
 * "Direct message" as a thread title and "Your ticket is with Orlando." as the
 * ticket preview (TUL-146 F-05, F-06). The stored text stays as is; the panel
 * maps the known phrases through the message catalog when it draws them.
 *
 * Pure so a test can pin it without React.
 */
import { interpolate } from "@/i18n/interpolate";
import { SUPPORT_AGENT_VARS } from "@/lib/support/support-persona";

type T = (key: string) => string;

const NS = "dashboard.adminSupport.";

/** Exact stored subjects the engine writes when the requester typed none. */
const SUBJECT_KEYS: Record<string, string> = {
  "Direct message": `${NS}directMessageSubject`,
  "Support request": `${NS}supportRequestSubject`,
};

export function displayTicketSubject(subject: string | null | undefined, t: T): string {
  const s = (subject ?? "").trim();
  if (!s) return t(`${NS}untitled`);
  const key = SUBJECT_KEYS[s];
  return key ? t(key) : s;
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** System-card bodies the engine writes in English, shown in the reader's language. */
export function displaySupportPreview(body: string | null | undefined, t: T): string {
  const s = (body ?? "").trim();
  if (!s) return "";
  const agent = escapeRe(String(SUPPORT_AGENT_VARS.agent));
  if (new RegExp(`^Your ticket is with ${agent}\\.$`).test(s)) {
    return interpolate(t(`${NS}handoffTitle`), SUPPORT_AGENT_VARS);
  }
  if (s === "Requester asked to keep this ticket open.") return t(`${NS}keepOpenDone`);
  const call = new RegExp(`^${agent} will call you at (.+)\\.$`).exec(s);
  if (call) return interpolate(t(`${NS}callbackConfirmed`), { ...SUPPORT_AGENT_VARS, phone: call[1] });
  if (new RegExp(`^Want ${agent} to take a look\\?$`).test(s)) {
    return interpolate(t(`${NS}offerHumanTitle`), SUPPORT_AGENT_VARS);
  }
  return s;
}
