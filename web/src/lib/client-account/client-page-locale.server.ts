import "server-only";

import { cache } from "react";

import { getCachedActorSession } from "@/lib/server/request-cache";

import { resolveAccountLocale } from "./account-locale.server";

/**
 * TUL-1856: the language a `/client*` PAGE body renders in. The client layout already
 * follows the URL, then the language cookie, then the client's saved language, then
 * Accept-Language (TUL-968), but the pages called `getRequestLocale()`, which only sees the
 * path-derived header. A client with no cookie on a fresh browser got a Spanish shell around
 * an English home. Same rule everywhere, once per request.
 */
export const getClientPageLocale = cache(async (): Promise<"en" | "es"> => {
  const session = await getCachedActorSession();
  return resolveAccountLocale(session.user?.id ?? null);
});
