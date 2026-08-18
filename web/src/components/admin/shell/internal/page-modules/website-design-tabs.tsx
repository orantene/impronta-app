"use client";

/**
 * website-design-tabs.tsx — the local strip that ties the three DESIGN
 * surfaces together.
 *
 * Design, Talent cards and Profile pages each own a route (`/website/design`,
 * `/website/card-design`, `/website/profile-pages`) and each used to be reached
 * only from the sidebar. Read as a set they are one job — "decide how the site
 * looks" — so the three routes get a shared strip and read as one place. The
 * routes themselves are unchanged; this only links between them.
 *
 * STYLING — token classes only. `ratchet/no-new-inline-style` forbids any new
 * `style={{…}}` under `components/admin/shell/**`, and shadcn tokens
 * (`text-foreground`, `bg-card`) render white-on-white in this shell.
 */

import { useRouter } from "next/navigation";

import { useT } from "@/i18n/use-t";
import { useAdminShell } from "../state";

/** The three design surfaces, in the order the sidebar lists them. */
export type WebsiteDesignTabId = "design" | "card-design" | "profile-pages";

const TAB_KEYS: { id: WebsiteDesignTabId; segment: string; labelKey: string }[] = [
  { id: "design", segment: "design", labelKey: "dashboard.adminWebsite.designHub.tabDesign" },
  { id: "card-design", segment: "card-design", labelKey: "dashboard.adminWebsite.designHub.tabCards" },
  {
    id: "profile-pages",
    segment: "profile-pages",
    labelKey: "dashboard.adminWebsite.designHub.tabProfiles",
  },
];

export function WebsiteDesignTabs({ active }: { active: WebsiteDesignTabId }) {
  const t = useT();
  const router = useRouter();
  const { adminBasePath } = useAdminShell();

  return (
    <div
      role="tablist"
      aria-label={t("dashboard.adminWebsite.designHub.tabsAria")}
      data-tulala-website-design-tabs
      className="mb-[16px] inline-flex gap-[4px] rounded-full border border-admin-border-soft bg-admin-surface-alt p-[3px]"
    >
      {TAB_KEYS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => router.push(`${adminBasePath}/website/${tab.segment}`)}
            className={`cursor-pointer rounded-full border-none px-[14px] py-[6px] text-admin-12h ${
              isActive
                ? "bg-admin-card font-semibold text-admin-ink shadow-admin-rest"
                : "bg-transparent font-medium text-admin-ink-muted"
            }`}
          >
            {t(tab.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
