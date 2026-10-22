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
  return inlineCatalogScript(code, subtrees);
}

/** Inline-safe: `<` (so `</script>` and `<!--` cannot end or open anything) and U+2028/2029 are escaped. */
export function inlineCatalogScript(code: string, subtrees: unknown): string {
  const json = JSON.stringify(subtrees)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  const g = `self.${CLIENT_MESSAGES_GLOBAL}`;
  // TUL-736: MERGE, never skip. The root layout already inlines the fallback locales as only
  // the keys the request locale lacks (TUL-1156), so on /es the `en` entry exists but is
  // partial; an `if (!g.en)` guard left an English-owned profile with raw keys. Existing
  // strings win, missing ones are added.
  return (
    `${g}=${g}||{};(function(t,s){function m(a,b){for(var k in b){var v=b[k];` +
    `if(v&&typeof v==="object"&&!Array.isArray(v)){if(!a[k]||typeof a[k]!=="object")a[k]={};m(a[k],v)}` +
    `else if(!(k in a))a[k]=v}}m(t,s)})(${g}[${JSON.stringify(code)}]||(${g}[${JSON.stringify(code)}]={}),${json});`
  );
}
