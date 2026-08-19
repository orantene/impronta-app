"use client";

/**
 * domain-drawer.tsx — the "domain" drawer key, made REAL.
 *
 * Replaces the fixture `DomainDrawer` that lived in light-05.tsx (fake
 * "2/2 matched" DNS table, invented SSL date, toast-stub buttons, writes into
 * the read-by-nothing `agencies.settings.domain` namespace). Every call site
 * that opens `openDrawer("domain")` — the Site page tier card and the Website
 * health panel's fix affordance — now lands on the same live manager the
 * Website → Setup page embeds: `WebsiteDomainManager`, backed by the
 * `agency_domains` registry and the five real domain server actions.
 *
 * Token classes only — the old drawer's 40+ inline styles die with it.
 */

import { useT } from "@/i18n/use-t";

import { WebsiteDomainManager } from "../page-modules/WebsiteDomainManager";
import { DrawerShell, useAdminShell } from "./drawer-shared";

export function WorkspaceDomainDrawer() {
  const t = useT();
  const { closeDrawer, effectiveWebsiteState } = useAdminShell();
  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={t("dashboard.adminWebsite.domain.drawerTitle")}
      description={effectiveWebsiteState.domain.primaryDomain}
      width={580}
    >
      <WebsiteDomainManager />
    </DrawerShell>
  );
}
