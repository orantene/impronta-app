"use server";

import { loadWebsiteSettingsEnabledAction } from "@/components/talent/website-settings/website-settings-gate-action";
import { loadMaisonSetupBootstrapAction } from "@/components/talent/site/maison-setup/maison-setup-bootstrap";
import { loadTalentGoLiveAction } from "@/lib/talent-site/history/history-actions";
import {
  loadAvailableBlocksAction,
  loadThemeUpdateNoticesAction,
} from "@/lib/talent-site/theme-releases/talent-update/talent-update-actions";
import { loadMaxSiteManagerAction } from "./site-management-actions";

/**
 * Everything "My presence" needs on mount, in ONE server action (server
 * actions from one client are queued, so six separate loads were a waterfall).
 * A slice that fails is null: its consumer falls back to its own action.
 */
export type PublicPageBootstrap = {
  settingsEnabled: boolean | null;
  manager: Awaited<ReturnType<typeof loadMaxSiteManagerAction>> | null;
  maison: Awaited<ReturnType<typeof loadMaisonSetupBootstrapAction>> | null;
  goLive: Awaited<ReturnType<typeof loadTalentGoLiveAction>> | null;
  availableBlocks: Awaited<ReturnType<typeof loadAvailableBlocksAction>> | null;
  themeNotices: Awaited<ReturnType<typeof loadThemeUpdateNoticesAction>> | null;
};

const safe = <T>(p: Promise<T>): Promise<T | null> => p.then((v) => v, () => null);

export async function loadPublicPageBootstrapAction(): Promise<PublicPageBootstrap> {
  const [settingsEnabled, manager, maison, goLive, availableBlocks, themeNotices] = await Promise.all([
    safe(loadWebsiteSettingsEnabledAction()),
    safe(loadMaxSiteManagerAction()),
    safe(loadMaisonSetupBootstrapAction()),
    safe(loadTalentGoLiveAction()),
    safe(loadAvailableBlocksAction()),
    safe(loadThemeUpdateNoticesAction()),
  ]);
  return { settingsEnabled, manager, maison, goLive, availableBlocks, themeNotices };
}
