"use client";

/**
 * The phone's top bar (MW00), drawn by the identity bar below 720px.
 *
 * Two shapes, as the boards draw them:
 *   - the WORKSPACE bar: a pill with the workspace's initials and name that
 *     opens the switch sheet (MW01), the role chip, the search button (MW05)
 *     and the bell with its unread count (MW35);
 *   - the BACK header, while a record page has published one
 *     (`mobile-header-store.ts`): a chevron, the record's title, its subtitle.
 *
 * Token classes only; the identity bar hides its desktop row under the same
 * breakpoint. The workspace pill reads "Workspace · Location" on the board;
 * there is no locations table (D-POS-18), so it reads the workspace's name.
 */

import { useRouter } from "next/navigation";

import { useT } from "@/i18n/use-t";
import type { WorkRole } from "@/lib/workspace/destinations";
import { deriveWorkRole } from "@/lib/workspace/nav-context";
import { NotificationsBell } from "../notifications-hub";
import { Icon } from "../primitives";
import { useAdminShell } from "../state";
import { GLOBAL_SEARCH_OPEN_EVENT } from "./GlobalSearchOverlay";
import { useMobileDetailHeader } from "./mobile-header-store";
import { WORKSPACE_SWITCH_OPEN_EVENT } from "./WorkspaceSwitchSheet";

const ROLE_KEY: Readonly<Record<WorkRole, string>> = {
  owner: "dashboard.mobile.role.owner",
  manager: "dashboard.mobile.role.manager",
  assistant: "dashboard.mobile.role.assistant",
};

const ICON_BUTTON =
  "relative inline-flex h-[34px] w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-admin-border bg-admin-card text-admin-ink-muted";

export function MobileTopBar() {
  const { state, effectiveTenant } = useAdminShell();
  const t = useT();
  const router = useRouter();
  const detail = useMobileDetailHeader();
  const role = deriveWorkRole(state.role);
  const initials = effectiveTenant.name.slice(0, 2).toUpperCase();

  if (detail) {
    return (
      <div data-tulala-mobile-topbar="detail" className="flex h-full w-full items-center gap-[10px] font-admin-body">
        <button
          type="button"
          aria-label={t("dashboard.mobile.back")}
          onClick={() => (detail.backHref ? router.push(detail.backHref) : router.back())}
          className="inline-flex h-[36px] w-[36px] shrink-0 cursor-pointer items-center justify-center rounded-[10px] border-0 bg-transparent text-admin-ink"
        >
          <span aria-hidden className="inline-flex rotate-180">
            <Icon name="chevron-right" size={18} stroke={1.75} color="currentColor" />
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[16px] font-semibold text-admin-ink">
            {detail.title}
          </div>
          {detail.subtitle ? (
            <div className="overflow-hidden text-ellipsis whitespace-nowrap text-admin-11h text-admin-ink-muted">
              {detail.subtitle}
            </div>
          ) : null}
        </div>
        <NotificationsBell size="sm" />
      </div>
    );
  }

  return (
    <div data-tulala-mobile-topbar="workspace" className="flex h-full w-full items-center gap-[8px] font-admin-body">
      <button
        type="button"
        data-tulala-mobile-workspace-pill
        onClick={() => window.dispatchEvent(new Event(WORKSPACE_SWITCH_OPEN_EVENT))}
        aria-label={`${effectiveTenant.name} · ${t("dashboard.mobile.switch.title")}`}
        className="flex min-w-0 cursor-pointer items-center gap-[7px] rounded-full border border-admin-border bg-admin-card py-[5px] pl-[5px] pr-[9px] text-left"
      >
        <span
          aria-hidden
          className="inline-flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full bg-admin-brand text-[10px] font-bold text-white"
        >
          {initials}
        </span>
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-admin-13 font-semibold text-admin-ink">
          {effectiveTenant.name}
        </span>
        <Icon name="chevron-down" size={13} stroke={1.75} color="var(--color-admin-ink-dim)" />
      </button>
      <span className="flex-1" />
      <span
        role="status"
        className="whitespace-nowrap rounded-full bg-admin-royal-soft px-[7px] py-[3px] text-admin-10h font-semibold text-admin-royal"
      >
        {t(ROLE_KEY[role])}
      </span>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(GLOBAL_SEARCH_OPEN_EVENT))}
        aria-label={t("dashboard.mobile.search")}
        className={ICON_BUTTON}
      >
        <Icon name="search" size={16} stroke={1.75} color="currentColor" />
      </button>
      <NotificationsBell size="md" />
    </div>
  );
}
