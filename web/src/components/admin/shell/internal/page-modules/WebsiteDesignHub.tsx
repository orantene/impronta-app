"use client";

/**
 * WebsiteDesignHub.tsx — Website → Design.
 *
 * WHAT THIS REPLACED
 * ──────────────────
 * "Design" used to be a single EXTERNAL sidebar link that dropped the operator
 * into a drawer inside the storefront visual editor. The other three ways to
 * change how the site looks lived somewhere else each: header/footer behind a
 * button on Overview that only appears when the server says the surface exists,
 * talent cards at `/website/card-design`, profile templates at
 * `/website/profile-pages`. Nothing named the set, so "change how my site
 * looks" had four unrelated answers and no starting point.
 *
 * This is that starting point: one card per way in, each with a plain-language
 * sentence and an "i" for the jargon. It decides nothing and edits nothing.
 *
 * WHAT STAYS TRUE
 * ───────────────
 *   • Site theme and Header & footer live on the STOREFRONT, not in the admin.
 *     Both open a new tab and both say so before you click.
 *   • Header & footer renders ONLY when `useSiteShellEditorUrl()` is non-null.
 *     That hook is server-probed because the surface is off by default; a card
 *     rendered on an inconclusive answer is a link to a 404.
 *   • Talent cards / Profile pages keep their own routes. The tab strip links
 *     between the three; it does not absorb them.
 *
 * STYLING — token classes only (`ratchet/no-new-inline-style`). Shadcn tokens
 * are unusable here: `text-foreground` is the known white-on-white failure.
 */

import { useRouter } from "next/navigation";

import { useT } from "@/i18n/use-t";
import { InfoTip } from "@/components/ui/info-tip";

import { Icon, type AdminShellIconName } from "../primitives";
import { useAdminShell } from "../state";
import { useSiteDesignUrl } from "./use-site-design-url";
import { useSiteShellEditorUrl } from "./use-site-shell-editor-url";
import { PageHeader } from "./pages-shared";
import { WebsiteDesignTabs } from "./website-design-tabs";

/**
 * One way in. `onOpen` is the whole action surface — the caller decides whether
 * that is a route push or `window.open`, and sets `leavesAdmin` so the card can
 * say so instead of surprising the operator with a new tab.
 */
function DesignEntryCard({
  icon,
  title,
  body,
  infoLabel,
  actionLabel,
  leavesAdmin,
  onOpen,
}: {
  icon: AdminShellIconName;
  title: string;
  body: string;
  infoLabel: string;
  actionLabel: string;
  leavesAdmin?: boolean;
  onOpen: () => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-[10px] rounded-admin-lg border border-admin-border bg-admin-card p-[16px]">
      <div className="flex items-center gap-[8px]">
        <span className="flex size-[26px] shrink-0 items-center justify-center rounded-admin-sm bg-admin-accent-soft text-admin-accent-deep">
          <Icon name={icon} size={14} stroke={1.7} />
        </span>
        <span className="min-w-0 flex-1 text-admin-13h font-semibold text-admin-ink">
          {title}
        </span>
        <InfoTip
          label={infoLabel}
          triggerLabel={t("dashboard.adminWebsite.designHub.whatIsThis")}
          placement="bottom-end"
          className="text-admin-ink-dim hover:text-admin-ink"
        />
      </div>
      <p className="m-0 text-admin-11h leading-relaxed text-admin-ink-muted">{body}</p>
      <div className="mt-auto flex flex-wrap items-center gap-[8px] pt-[2px]">
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex cursor-pointer items-center gap-[5px] rounded-admin-md border border-admin-border bg-admin-card px-[12px] py-[6px] text-admin-12h font-semibold text-admin-ink"
        >
          <Icon name={leavesAdmin ? "external" : "arrow-right"} size={12} stroke={1.7} />
          {actionLabel}
        </button>
        {leavesAdmin ? (
          <span className="text-admin-10h font-semibold uppercase tracking-[0.5px] text-admin-ink-dim">
            {t("dashboard.adminWebsite.designHub.opensNewTab")}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function WebsiteDesignHub() {
  const t = useT();
  const router = useRouter();
  const { adminBasePath } = useAdminShell();
  const siteDesignUrl = useSiteDesignUrl();
  // Null until the server confirms the shell surface is reachable. Rendering
  // the card on an inconclusive answer hands the operator a 404.
  const siteShellUrl = useSiteShellEditorUrl();

  return (
    <>
      <WebsiteDesignTabs active="design" />
      <PageHeader
        title={t("dashboard.adminWebsite.designHub.title")}
        subtitle={t("dashboard.adminWebsite.designHub.subtitle")}
      />
      <section className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-[14px]">
        {siteDesignUrl ? (
          <DesignEntryCard
            icon="palette"
            title={t("dashboard.adminWebsite.designHub.themeTitle")}
            body={t("dashboard.adminWebsite.designHub.themeBody")}
            infoLabel={t("dashboard.adminWebsite.designHub.themeInfo")}
            actionLabel={t("dashboard.adminWebsite.designHub.themeAction")}
            leavesAdmin
            onOpen={() => window.open(siteDesignUrl, "_blank", "noopener,noreferrer")}
          />
        ) : null}
        {siteShellUrl ? (
          <DesignEntryCard
            icon="layers"
            title={t("dashboard.adminWebsite.designHub.shellTitle")}
            body={t("dashboard.adminWebsite.designHub.shellBody")}
            infoLabel={t("dashboard.adminWebsite.designHub.shellInfo")}
            actionLabel={t("dashboard.adminWebsite.designHub.shellAction")}
            leavesAdmin
            onOpen={() => window.open(siteShellUrl, "_blank", "noopener,noreferrer")}
          />
        ) : null}
        <DesignEntryCard
          icon="image"
          title={t("dashboard.adminWebsite.designHub.cardsTitle")}
          body={t("dashboard.adminWebsite.designHub.cardsBody")}
          infoLabel={t("dashboard.adminWebsite.designHub.cardsInfo")}
          actionLabel={t("dashboard.adminWebsite.designHub.cardsAction")}
          onOpen={() => router.push(`${adminBasePath}/website/card-design`)}
        />
        <DesignEntryCard
          icon="user"
          title={t("dashboard.adminWebsite.designHub.profilesTitle")}
          body={t("dashboard.adminWebsite.designHub.profilesBody")}
          infoLabel={t("dashboard.adminWebsite.designHub.profilesInfo")}
          actionLabel={t("dashboard.adminWebsite.designHub.profilesAction")}
          onOpen={() => router.push(`${adminBasePath}/website/profile-pages`)}
        />
      </section>
    </>
  );
}
