import { getAppUrl } from "@/lib/auth-flow";
import { isAppleAuthProviderEnabled } from "@/lib/auth/apple-provider-flag";
import { accountHrefFor } from "@/lib/client-account/agency-area-pure";
import { readAccountHost } from "@/lib/client-account/area-site.server";
import { resolveClientAccountMount } from "@/lib/client-account/gate";

import { ClientAccountButton } from "./ClientAccountButton";

/**
 * Server gate for the dock account button. Two surfaces:
 * - `talent_site` (her own website): the account is the talent's (flag `talent`).
 * - `profile_page` (`/t/<code>`, not a website): the account belongs to the hub
 *   or agency whose host it is (flag `app`), never to the talent.
 * Flag off (the default) renders null, so nothing visible changes anywhere.
 * On the marketing apex "My account" links to the app host (it has no /account).
 */
export async function ClientAccountDock({
  locale,
  surface = "talent_site",
}: {
  locale: string;
  surface?: "talent_site" | "profile_page";
}) {
  if (!resolveClientAccountMount(surface === "profile_page" ? "app" : "talent").dock) return null;
  const { hostContext } = await readAccountHost();
  return (
    <ClientAccountButton
      variant="dock"
      locale={locale}
      accountHref={accountHrefFor(hostContext, getAppUrl())}
      appleSignInEnabled={isAppleAuthProviderEnabled()}
    />
  );
}
