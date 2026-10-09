"use client";

import { useDashboardText } from "../dashboard-i18n";

/**
 * The rail's Talent | Admin segmented switch: which HAT this person wears,
 * not which business (the chip above picks the business). "Admin" reads the
 * same for someone who runs three businesses; a business type would not.
 *
 * One component for both rails (TUL "dual owner has no switch on /talent"): the
 * half you are on is the lit, inert one; the other half carries that side's
 * unread count and leaves. The admin rail and the talent rail render the SAME
 * markup in the same position, so the labels and the look cannot drift.
 */
export function RailModeSwitch({
  active,
  talentUnread = 0,
  adminUnread = 0,
  onSwitch,
}: {
  /** The hat this surface is: "admin" on the workspace rail, "talent" on the talent rail. */
  active: "talent" | "admin";
  talentUnread?: number;
  adminUnread?: number;
  /** Leaves for the OTHER hat. */
  onSwitch: () => void;
}) {
  const copy = useDashboardText();
  const half =
    "inline-flex h-[26px] flex-1 items-center justify-center gap-[6px] rounded-[7px] border-none font-admin-body text-admin-11h font-semibold [transition:background_var(--transition-admin-micro),color_var(--transition-admin-micro)]";
  const unreadBadge = (n: number) =>
    n > 0 ? (
      <span
        aria-label={`${n} ${copy.t("unread")}`}
        className="inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-admin-brand px-[4px] text-[9.5px] font-bold leading-none text-white"
      >
        {n > 99 ? "99+" : n}
      </span>
    ) : null;
  const litClass = `${half} cursor-default bg-admin-card text-admin-ink shadow-admin-rest`;
  const linkClass = `${half} cursor-pointer bg-transparent text-admin-ink-muted hover:bg-[rgba(11,11,13,0.04)] hover:text-admin-ink`;
  return (
    <div
      role="group"
      data-tulala-rail-mode-switch
      aria-label={copy.t("Switch between Talent and Admin")}
      className="flex w-full items-center gap-[2px] rounded-[9px] bg-[rgba(11,11,13,0.05)] p-[3px]"
    >
      {active === "talent" ? (
        <span aria-current="true" className={litClass}>
          {copy.t("Talent")}
        </span>
      ) : (
        <button
          type="button"
          onClick={onSwitch}
          aria-label={copy.t("Switch to talent")}
          title={copy.t("Go to your talent dashboard")}
          className={linkClass}
        >
          {copy.t("Talent")}
          {unreadBadge(talentUnread)}
        </button>
      )}
      {active === "admin" ? (
        <span aria-current="true" className={litClass}>
          {copy.t("Admin")}
        </span>
      ) : (
        <button
          type="button"
          onClick={onSwitch}
          aria-label={copy.t("Switch to admin")}
          title={copy.t("Go to your admin workspace")}
          className={linkClass}
        >
          {copy.t("Admin")}
          {unreadBadge(adminUnread)}
        </button>
      )}
    </div>
  );
}
