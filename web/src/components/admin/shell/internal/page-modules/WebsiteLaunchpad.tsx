"use client";

/**
 * WebsiteLaunchpad.tsx — the "where do I go next?" grid on Website → Overview.
 *
 * WHAT IT REPLACED
 * ────────────────
 * Overview used to answer that question with four white-on-gradient stat tiles
 * (pages live / posts / redirects / scheduled) and nothing you could click. The
 * numbers were real but inert, and the destinations that could act on them were
 * only reachable from the sidebar rail — which is hidden at ≤720px.
 *
 * Each destination now gets a card: the icon and one-line description the nav
 * config already carries, plus the count or status that tells the operator
 * whether that destination needs them today. The stat tiles are gone; their
 * numbers live on the card of the thing they describe.
 *
 * ONE LIST, NOT TWO
 * ─────────────────
 * The cards are driven by `useWebsiteSubnav()` — the same source the sidebar,
 * the hover dropdown and the mobile pill strip read. Capability gating comes
 * for free: Redirects and Forms simply are not in the list for an operator who
 * cannot open them, so this file never re-derives a permission.
 *
 * HONESTY RULE
 * ────────────
 * A card shows a number only when the number is provably in `WebsiteState`:
 *   REAL — pages (live / draft counts), redirects (active of total), the
 *          primary host on Setup.
 *   NOT  — Forms. Nothing in the Website bridge carries a submissions count, so
 *          the Forms card carries no number at all. A hardcoded "0 unread"
 *          would be the app inventing a fact, and would read as "nobody has
 *          contacted you" on a surface that may well have submissions waiting.
 *   NOT  — Card Design / Profile Pages, which have no countable state.
 *
 * STYLING — token classes only (`ratchet/no-new-inline-style`).
 */

import { useRouter } from "next/navigation";

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";

import { Icon, type AdminShellIconName } from "../primitives";
import { useAdminShell } from "../state";
import { useWebsiteSubnav, type WebsiteSubnavItem } from "./website-nav";
import { StarterDoor } from "./StarterDoor";

function LaunchpadCard({
  icon,
  title,
  body,
  meta,
  onOpen,
}: {
  icon: AdminShellIconName;
  title: string;
  body: string;
  /** Live count or status. Omitted entirely when nothing is provable. */
  meta?: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex cursor-pointer flex-col items-start gap-[8px] rounded-admin-lg border border-admin-border bg-admin-card p-[16px] text-left"
    >
      <span className="flex w-full items-center gap-[8px]">
        <span className="flex size-[26px] shrink-0 items-center justify-center rounded-admin-sm bg-admin-accent-soft text-admin-accent-deep">
          <Icon name={icon} size={14} stroke={1.7} />
        </span>
        <span className="min-w-0 flex-1 text-admin-13h font-semibold text-admin-ink">{title}</span>
        <span className="shrink-0 text-admin-ink-dim">
          <Icon name="arrow-right" size={12} stroke={1.7} />
        </span>
      </span>
      <span className="text-admin-11h leading-relaxed text-admin-ink-muted">{body}</span>
      {meta ? (
        <span className="mt-auto pt-[2px] text-admin-12h font-semibold text-admin-ink">{meta}</span>
      ) : null}
    </button>
  );
}

export function WebsiteLaunchpad() {
  const t = useT();
  const router = useRouter();
  const { effectiveWebsiteState } = useAdminShell();
  const w = effectiveWebsiteState;

  // Overview itself is dropped: you are standing on it. External items are
  // dropped because this grid routes; nothing is external today, but the field
  // is still part of the item shape.
  const items = useWebsiteSubnav().filter(
    (item) => item.id !== "overview" && !item.external,
  );

  const livePages = w.pages.filter((p) => p.status === "published").length;
  const draftPages = w.pages.filter((p) => p.status === "draft").length;
  const activeRedirects = w.redirects.filter((r) => r.active).length;

  const metaFor = (item: WebsiteSubnavItem): string | undefined => {
    switch (item.id) {
      case "pages": {
        if (w.pages.length === 0) return t("dashboard.adminWebsite.launchpadPagesNone");
        const live = interpolate(t("dashboard.adminWebsite.launchpadPagesLive"), {
          count: livePages,
        });
        if (draftPages === 0) return live;
        return `${live} · ${interpolate(t("dashboard.adminWebsite.launchpadPagesDrafts"), {
          count: draftPages,
        })}`;
      }
      case "posts": {
        if (w.posts.length === 0) return t("dashboard.adminWebsite.launchpadPostsNone");
        const livePosts = w.posts.filter((p) => p.status === "published").length;
        return interpolate(t("dashboard.adminWebsite.launchpadPostsMeta"), {
          live: livePosts,
          total: w.posts.length,
        });
      }
      case "design":
        return t("dashboard.adminWebsite.launchpadDesignReassurance");
      case "redirects":
        return w.redirects.length === 0
          ? t("dashboard.adminWebsite.launchpadRedirectsNone")
          : interpolate(t("dashboard.adminWebsite.launchpadRedirectsMeta"), {
              active: activeRedirects,
              total: w.redirects.length,
            });
      case "setup":
        return w.domain.primaryDomain || t("dashboard.adminWebsite.launchpadSetupNoAddress");
      // REAL — the 7d visit count comes straight from the analytics loader
      // (`view_site_page` rows); this is the Overview's replacement for the
      // inline Performance panel (W2).
      case "analytics":
        return interpolate(t("dashboard.adminWebsite.launchpadAnalyticsMeta"), {
          count: w.analytics.last7d.visits.toLocaleString(),
        });
      // Forms carries no submissions count through the Website bridge, and
      // Card Design / Profile Pages have nothing countable. No number, on
      // purpose — see the honesty rule in this file's header.
      default:
        return undefined;
    }
  };

  return (
    <section className="mb-[22px]">
      {/* The empty-site door. Renders only when there are no pages at all —
          the same condition this file already uses to say "No pages yet", a
          sentence that named the problem and offered nothing. */}
      <StarterDoor hasPages={w.pages.length > 0} />
      <h2 className="m-0 mb-[8px] font-admin-display text-admin-17 font-semibold tracking-[-0.2px] text-admin-ink">
        {t("dashboard.adminWebsite.launchpadHeading")}
      </h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-[12px]">
        {items.map((item) => (
          <LaunchpadCard
            key={item.id}
            icon={item.icon}
            title={t(item.i18nKey)}
            body={t(item.descriptionI18nKey)}
            meta={metaFor(item)}
            onOpen={() => router.push(item.href)}
          />
        ))}
      </div>
    </section>
  );
}
