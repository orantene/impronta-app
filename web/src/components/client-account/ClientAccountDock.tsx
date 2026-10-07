import { resolveClientAccountMount } from "@/lib/client-account/gate";

import { ClientAccountButton } from "./ClientAccountButton";

/**
 * Server gate for the dock account button on talent sites. Flag off (the
 * default) renders null, so nothing visible changes anywhere.
 */
export function ClientAccountDock({ locale, profileCode }: { locale: string; profileCode?: string | null }) {
  if (!resolveClientAccountMount("talent").dock) return null;
  return <ClientAccountButton variant="dock" locale={locale} profileCode={profileCode ?? null} />;
}
