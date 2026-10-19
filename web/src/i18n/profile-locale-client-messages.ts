/**
 * A talent profile renders in the TALENT's language (bounded to the languages
 * she offers), which can differ from the request locale the root layout inlined
 * the browser catalogs for. The browser translator then held only the request
 * locale's subtrees: every client component on the profile (Inquire, Message me,
 * the booking dock) fell back to English on hydration while the server HTML
 * was Spanish (TUL-1272 / C3 part 2). This builds the one inline script that
 * adds the profile locale's client subtrees to the same global before hydration.
 */
import { CLIENT_MESSAGES_GLOBAL } from "./messages.client";
import { catalogLocaleKey, getClientMessagesPayload, hasMessageCatalog } from "./messages";

export function profileLocaleMessagesScript(profileLocale: string, requestLocale: string): string | null {
  const code = catalogLocaleKey(profileLocale);
  if (code === catalogLocaleKey(requestLocale) || !hasMessageCatalog(code)) return null;
  const subtrees = getClientMessagesPayload(code)[code];
  if (!subtrees) return null;
  const json = JSON.stringify(subtrees).replace(/</g, "\\u003c");
  const g = `self.${CLIENT_MESSAGES_GLOBAL}`;
  return `${g}=${g}||{};if(!${g}[${JSON.stringify(code)}])${g}[${JSON.stringify(code)}]=${json};`;
}
