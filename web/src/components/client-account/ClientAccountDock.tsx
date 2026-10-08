import { resolveClientAccountMount } from "@/lib/client-account/gate";

import { ClientAccountButton } from "./ClientAccountButton";

/**
 * Server gate for the dock account button. Two surfaces:
 * - `talent_site` (her own website): the account is the talent's (flag `talent`).
 * - `profile_page` (`/t/<code>`, not a website): the account belongs to the hub
 *   or agency whose host it is (flag `app`), never to the talent.
 * Flag off (the default) renders null, so nothing visible changes anywhere.
 */
export function ClientAccountDock({
  locale,
  surface = "talent_site",
}: {
  locale: string;
  surface?: "talent_site" | "profile_page";
}) {
  if (!resolveClientAccountMount(surface === "profile_page" ? "app" : "talent").dock) return null;
  return <ClientAccountButton variant="dock" locale={locale} />;
}
