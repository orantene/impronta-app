"use client";

/**
 * MW01 — "Switch workspace or location", the phone's sheet.
 *
 * WORKSPACES are the signed-in person's memberships, from the same reader
 * the desktop switcher drawer uses (`actionLoadUserWorkspaces`); the current
 * one wears the `Current` pill, the others open their own admin. LOCATIONS
 * is one row, the workspace's own name, because there is no locations table
 * (D-POS-18): the row is drawn disabled with that reason rather than a
 * second location the engine cannot switch to.
 *
 * Opened by the top bar's workspace pill and the More sheet's workspace row
 * through `WORKSPACE_SWITCH_OPEN_EVENT`. Token classes only.
 */

import { useEffect, useState } from "react";

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { actionLoadUserWorkspaces, type UserWorkspace } from "@/lib/server-actions/admin-user-workspaces";
import { useAdminShell } from "../state";
import { MobileCard, MobileChevron, MobileEyebrow, MobileNote, MobilePill, MobileRow, MobileSheet } from "./MobileSheet";

export const WORKSPACE_SWITCH_OPEN_EVENT = "tulala:mobile-workspace-switch-open";

const K = "dashboard.mobile.switch";

export function WorkspaceSwitchSheet() {
  const { tenantSlug, effectiveTenant } = useAdminShell();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<UserWorkspace[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOpen = () => setOpen(true);
    window.addEventListener(WORKSPACE_SWITCH_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(WORKSPACE_SWITCH_OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setFailed(false);
    void actionLoadUserWorkspaces().then((res) => {
      if (cancelled) return;
      if (res.ok) setWorkspaces(res.workspaces);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const roleLabel = (role: string) => {
    const key = role === "owner" || role === "manager" || role === "admin" ? `dashboard.mobile.role.${role === "admin" ? "manager" : role}` : "dashboard.mobile.role.assistant";
    return t(key);
  };

  return (
    <MobileSheet open={open} name="workspace-switch" title={t(`${K}.title`)} closeLabel={t("dashboard.mobile.close")} onClose={() => setOpen(false)}>
      <MobileEyebrow>{t(`${K}.workspaces`)}</MobileEyebrow>
      <MobileCard>
        {failed ? (
          <MobileRow title={t(`${K}.unavailable`)} />
        ) : workspaces === null ? (
          <MobileRow title={t(`${K}.loading`)} />
        ) : workspaces.length === 0 ? (
          <MobileRow title={t(`${K}.none`)} />
        ) : (
          workspaces.map((w) => {
            const current = w.slug === tenantSlug;
            return (
              <MobileRow
                key={w.id}
                title={w.name}
                detail={`${roleLabel(w.role)} · ${interpolate(t(`${K}.plan`), { plan: w.tier.charAt(0).toUpperCase() + w.tier.slice(1) })}`}
                trailing={current ? <MobilePill tone="brand">{t(`${K}.current`)}</MobilePill> : <MobileChevron />}
                href={current ? undefined : `/${w.slug}/admin`}
              />
            );
          })
        )}
      </MobileCard>
      <MobileEyebrow>{interpolate(t(`${K}.locations`), { workspace: effectiveTenant.name })}</MobileEyebrow>
      <MobileCard>
        <MobileRow
          title={effectiveTenant.name}
          detail={t(`${K}.oneLocation`)}
          trailing={<MobilePill tone="brand">{t(`${K}.current`)}</MobilePill>}
          disabled
          disabledReason={t(`${K}.oneLocation`)}
        />
      </MobileCard>
      <MobileNote>{t(`${K}.note`)}</MobileNote>
    </MobileSheet>
  );
}
