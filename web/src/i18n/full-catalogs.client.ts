/**
 * Full message catalogs for dashboard code. Imported for its side effect by
 * `use-t.ts`, so the catalogs ship only with routes that use `useT`; public
 * pages read the small inlined subtrees instead (see `client-subtrees.ts`).
 * On the server `registerFullCatalogs` is a no-op.
 */
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import fr from "../../messages/fr.json";

import { registerFullCatalogs } from "@/i18n/messages";

registerFullCatalogs({
  en: en as Record<string, unknown>,
  es: es as Record<string, unknown>,
  fr: fr as Record<string, unknown>,
});
