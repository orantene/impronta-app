import { getAppUrl } from "@/lib/auth-flow";
import { isAppleAuthProviderEnabled } from "@/lib/auth/apple-provider-flag";
import { accountHrefFor } from "@/lib/client-account/agency-area-pure";
import { readAccountHost } from "@/lib/client-account/area-site.server";
import { mountKindForHostContext, resolveClientAccountMount } from "@/lib/client-account/gate";

import { ClientAccountButton } from "./ClientAccountButton";

/**
 * Server gate for the dock account button. Flag kind comes from
 * `x-impronta-host-context` (TUL-64): talent sites use `talent`; agency / hub /
 * app / marketing use their own kind — never a hard-coded `app` for every
 * non-talent surface. Flag off (the default) renders null.
 * On the marketing apex "My account" links to the app host (it has no /account).
 */
export async function ClientAccountDock({
  locale,
  surface = "talent_site",
}: {
  locale: string;
  surface?: "talent_site" | "profile_page";
}) {
  const { hostContext } = await readAccountHost();
  const flagKind = mountKindForHostContext(hostContext)
    ?? (surface === "profile_page" ? "app" : "talent");
  if (!resolveClientAccountMount(flagKind).dock) return null;
  return (
    <ClientAccountButton
      variant="dock"
      locale={locale}
      accountHref={accountHrefFor(hostContext, getAppUrl())}
      appleSignInEnabled={isAppleAuthProviderEnabled()}
    />
  );
}
