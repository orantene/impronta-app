import "server-only";

import { getPublicHostContext } from "@/lib/saas/scope";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";

import { showCardLocaleToggle } from "./card-locale-toggle";

/** Resolve the host + tenant locale settings the auth layout footer uses. */
export async function resolveShowCardLocaleToggle(): Promise<boolean> {
  const ctx = await getPublicHostContext();
  if (ctx.kind !== "agency" && ctx.kind !== "hub") {
    return showCardLocaleToggle({ hostKind: ctx.kind });
  }
  const s = await loadTenantLocaleSettings(ctx.tenantId);
  return showCardLocaleToggle({
    hostKind: ctx.kind,
    supportedLocales: s.supportedLocales,
    showLanguageSwitcher: s.showLanguageSwitcher,
    defaultLocale: s.defaultLocale,
  });
}
