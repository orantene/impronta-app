import "server-only";

import { loadWebsiteSettingsEnabledAction } from "@/components/talent/website-settings/website-settings-gate-action";
import { loadMaisonSetupBootstrapAction } from "@/components/talent/site/maison-setup/maison-setup-bootstrap";
import { loadTalentGoLiveAction } from "@/lib/talent-site/history/history-actions";
import { loadMaxSiteManagerAction } from "./site-management-actions";

/**
 * What "My presence" needs for its FIRST paint, loaded on the server by the
 * `/talent/site` route (never a server action called from the client, and never
 * during a client render: both queue into a fetch waterfall). Loaded in
 * parallel; a slice that fails is null and its consumer falls back to its own
 * action. Available blocks and the theme-update notice are NOT here: they are
 * not needed for first paint and load after it.
 */
export type PublicPageBootstrap = {
  settingsEnabled: boolean | null;
  manager: Awaited<ReturnType<typeof loadMaxSiteManagerAction>> | null;
  maison: Awaited<ReturnType<typeof loadMaisonSetupBootstrapAction>> | null;
  goLive: Awaited<ReturnType<typeof loadTalentGoLiveAction>> | null;
};

const safe = <T>(p: Promise<T>): Promise<T | null> => p.then((v) => v, () => null);

export async function loadPublicPageBootstrap(): Promise<PublicPageBootstrap> {
  const [settingsEnabled, manager, maison, goLive] = await Promise.all([
    safe(loadWebsiteSettingsEnabledAction()),
    safe(loadMaxSiteManagerAction()),
    safe(loadMaisonSetupBootstrapAction()),
    safe(loadTalentGoLiveAction()),
  ]);
  return { settingsEnabled, manager, maison, goLive };
}
