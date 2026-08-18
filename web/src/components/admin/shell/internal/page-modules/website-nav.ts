"use client";

// ════════════════════════════════════════════════════════════════════
// Website sub-navigation — SINGLE SOURCE OF TRUTH.
//
// Before this file, the Website section's sub-page list was defined in
// THREE places that had drifted out of sync:
//   1. Sidebar rail    — WorkspaceShell.tsx `subItemsFor("website")`
//   2. Hover dropdown  — WebsiteNavDropdown.tsx (hardcoded, English-only,
//                         missing "Design")
//   3. Mobile pill strip — WebsiteSubviewTabs in WebsitePage-1.tsx (only 3
//                         of the 6 possible destinations, hidden >720px)
//
// `useWebsiteSubnav()` is now the one place that knows the list, the
// order, the gating, and the routing. All three surfaces map over it.
//
// DUAL I18N REGISTRATION — READ BEFORE EDITING LABELS
// ----------------------------------------------------
// This shell has TWO parallel i18n systems (see reference_i18n_two_systems
// in project memory) and this file's items are consumed by both:
//   - The sidebar renders `label` through `copy.t()` (dashboard-i18n.ts'
//     ES_TEXT map, keyed by the EN literal). Any new `label` string MUST
//     get an ES_TEXT entry there or it silently renders in English for ES
//     users.
//   - The dropdown (and mobile strip) render `i18nKey` / `descriptionI18nKey`
//     through the catalog `useT()` system (web/messages/{en,es,fr}.json,
//     `dashboard.adminWebsite.nav.*`). Any new key MUST be added to EVERY
//     shipped catalog file (en.json, es.json, fr.json) — the fallback chain
//     covers a MISSING catalog file, not a missing key inside a catalog
//     that otherwise has the `dashboard.adminWebsite` block.
// Adding an item here means touching FOUR files: this one, dashboard-i18n.ts,
// and the three messages/*.json catalogs.
// ════════════════════════════════════════════════════════════════════

import { useMemo } from "react";
import { useAdminShell } from "../state";
import { internalWebsiteSubnavItems, type WebsiteSubnavItem } from "./website-nav-types";

export type { WebsiteSubnavItem };
export { internalWebsiteSubnavItems };

/**
 * Computes the gated, ordered Website sub-nav list. Reads directly from
 * `useAdminShell()` — every current consumer (sidebar, dropdown, mobile
 * tabs) already renders inside the shell's provider tree, so there is no
 * need to thread these as props.
 *
 * Order + gating below is preserved EXACTLY from the pre-existing sidebar
 * `subItemsFor("website")` (WorkspaceShell.tsx) — this PR is a consistency
 * fix, not an IA change. The dropdown was previously missing "Design" and
 * hardcoding gating separately (correctly, as it turns out — its
 * `canEditSitePages`/`canManageBilling` checks matched the sidebar already);
 * the mobile strip only exposed 3 of the 6 destinations. Both now inherit
 * the sidebar's list verbatim.
 */
export function useWebsiteSubnav(): WebsiteSubnavItem[] {
  const { adminBasePath, bridgeSessionIdentity } = useAdminShell();

  return useMemo(() => {
    const base = `${adminBasePath}/website`;

    const items: WebsiteSubnavItem[] = [
      {
        id: "overview",
        label: "Overview",
        i18nKey: "dashboard.adminWebsite.nav.overviewLabel",
        descriptionI18nKey: "dashboard.adminWebsite.nav.overviewDescription",
        href: base,
        icon: "globe",
      },
    ];

    items.push(
      // Pages got its own route in P4-A. Before that the full list lived at the
      // bottom of Overview, which is why Overview could never be short: the one
      // surface an operator opens every day also carried the whole inventory.
      // Overview now shows the first few rows and links here for the rest.
      {
        id: "pages",
        label: "Pages",
        i18nKey: "dashboard.adminWebsite.nav.pagesLabel",
        descriptionI18nKey: "dashboard.adminWebsite.nav.pagesDescription",
        href: `${base}/pages`,
        icon: "layers",
      },
      // Design is now an INTERNAL hub, not the external theme deep link it used
      // to be. The theme panel still lives in a drawer inside the storefront
      // editor, but four separate ways to change how the site looks (theme,
      // header/footer, talent cards, profile templates) had no shared entry
      // point, and a nav item that jumps straight into a new tab cannot be one.
      // `/website/design` explains the set and links to each; the theme link
      // is one card there, resolved by `useSiteDesignUrl` at render time.
      {
        id: "design",
        label: "Design",
        i18nKey: "dashboard.adminWebsite.nav.designLabel",
        descriptionI18nKey: "dashboard.adminWebsite.nav.designDescription",
        href: `${base}/design`,
        icon: "palette",
      },
      {
        id: "card-design",
        label: "Card Design",
        i18nKey: "dashboard.adminWebsite.nav.cardDesignLabel",
        descriptionI18nKey: "dashboard.adminWebsite.nav.cardDesignDescription",
        href: `${base}/card-design`,
        icon: "palette",
      },
      {
        id: "profile-pages",
        label: "Profile Pages",
        i18nKey: "dashboard.adminWebsite.nav.profilePagesLabel",
        descriptionI18nKey: "dashboard.adminWebsite.nav.profilePagesDescription",
        href: `${base}/profile-pages`,
        icon: "user",
      },
    );

    // 301/302 URL forwarding. Gated on the SAME capability the route
    // enforces (`agency.site_admin.pages.edit`), resolved server-side and
    // passed through the bridge — a viewer doesn't have it, and a link to a
    // page that 404s is worse than no link.
    if (bridgeSessionIdentity?.canEditSitePages) {
      items.push({
        id: "redirects",
        label: "Redirects",
        i18nKey: "dashboard.adminWebsite.nav.redirectsLabel",
        descriptionI18nKey: "dashboard.adminWebsite.nav.redirectsDescription",
        href: `${base}/redirects`,
        icon: "arrow-right",
      });
    }

    // Web address, search settings, and the tracking / custom-code surfaces
    // that are named but not built yet. Ungated: this is the same read-only
    // configuration summary that used to sit at the bottom of Overview, which
    // every role could see.
    items.push({
      id: "setup",
      label: "Setup",
      i18nKey: "dashboard.adminWebsite.nav.setupLabel",
      descriptionI18nKey: "dashboard.adminWebsite.nav.setupDescription",
      href: `${base}/setup`,
      icon: "settings",
    });

    // Form submissions. Gated on the SAME capability the page enforces
    // (`manage_billing`), resolved server-side and passed through the
    // bridge — inferring it from `state.role` instead let the sidebar and
    // the route disagree.
    if (bridgeSessionIdentity?.canManageBilling) {
      items.push({
        id: "forms",
        label: "Forms",
        i18nKey: "dashboard.adminWebsite.nav.formsLabel",
        descriptionI18nKey: "dashboard.adminWebsite.nav.formsDescription",
        href: `${base}/forms`,
        icon: "mail",
      });
    }

    return items;
  }, [adminBasePath, bridgeSessionIdentity?.canEditSitePages, bridgeSessionIdentity?.canManageBilling]);
}
