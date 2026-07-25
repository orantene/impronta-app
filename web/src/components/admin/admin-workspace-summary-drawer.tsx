"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CreditCard,
  FileText,
  Sparkles,
  Users,
} from "lucide-react";

import { useT } from "@/i18n/use-t";
import { withInterpolation } from "@/i18n/interpolate";
import { DrawerShell } from "@/components/admin/drawer/drawer-shell";
import {
  DrawerActionBar,
  DrawerPrimaryButton,
  DrawerSection,
} from "@/components/admin/drawer/drawer-pieces";
import {
  formatTalentUsage,
  useAdminWorkspace,
} from "@/components/admin/workspace-context";
import { TIER_DOT, TIER_LABEL, TIER_RENEW_KEY } from "@/lib/admin/plan-tiers";

/**
 * AdminWorkspaceSummaryDrawer — the plan chip in the top-bar opens this
 * (instead of bouncing the user into the upgrade modal). Reads the same
 * AdminWorkspaceContext, shows headline plan + roster usage + quick links
 * into the deeper account drawers.
 *
 * Why a drawer not the upgrade modal: 80% of plan-chip clicks are "what's
 * my usage?" not "I want to pay more". The upgrade flow is one click away,
 * but the default state is informational.
 */
export function AdminWorkspaceSummaryDrawer({
  open,
  onOpenChange,
  onOpenUpgrade,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onOpenUpgrade?: () => void;
}) {
  const t = useT();
  const ti = React.useMemo(() => withInterpolation(t), [t]);
  const ws = useAdminWorkspace();
  const planKey = ws?.plan ?? "free";
  const planLabel = TIER_LABEL[planKey] ?? "Free";
  const planDot = TIER_DOT[planKey] ?? TIER_DOT.free;
  const renewCopy = t(TIER_RENEW_KEY[planKey] ?? TIER_RENEW_KEY.free!);
  // "{plan} plan" in English reads "Plan {plan}" in Spanish, so the whole
  // sentence is one interpolated key rather than a label glued to a word.
  const planLine = ti("dashboard.adminShell.topBar.planFallback", {
    plan: planLabel,
  });
  const usageCopy = formatTalentUsage(ws, t);
  const usageRatio =
    ws && ws.talentLimit && ws.talentLimit > 0
      ? Math.min(1, ws.talentCount / ws.talentLimit)
      : null;
  const seatsTight = usageRatio !== null && usageRatio >= 0.9;

  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      title={ws?.displayName ?? t("dashboard.adminSummaryDrawer.workspaceFallback")}
      subtitle={ti("dashboard.adminSummaryDrawer.subtitle", {
        plan: planLabel,
        renew: renewCopy,
      })}
      icon={Sparkles}
      size="sm"
      footer={
        <DrawerActionBar
          primary={
            onOpenUpgrade ? (
              <DrawerPrimaryButton
                onClick={() => {
                  onOpenChange(false);
                  onOpenUpgrade();
                }}
              >
                <ArrowUpRight className="size-3.5" aria-hidden />
                {planKey === "network"
                  ? t("dashboard.adminSummaryDrawer.managePlan")
                  : t("dashboard.adminSummaryDrawer.comparePlans")}
              </DrawerPrimaryButton>
            ) : undefined
          }
        />
      }
    >
      <DrawerSection title={t("dashboard.adminSummaryDrawer.atAGlance")}>
        <div className="rounded-xl border border-border/50 bg-muted/20 px-3.5 py-3">
          <div className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: planDot }}
              aria-hidden
            />
            <p className="text-[13px] font-semibold text-foreground">
              {planLine}
            </p>
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">{renewCopy}</p>
        </div>
      </DrawerSection>

      <DrawerSection title={t("dashboard.adminSummaryDrawer.roster")}>
        <div className="rounded-xl border border-border/50 bg-muted/20 px-3.5 py-3">
          <div className="flex items-center gap-2">
            <Users className="size-3.5 text-muted-foreground" aria-hidden />
            <p className="text-[12.5px] font-semibold text-foreground">
              {usageCopy || t("dashboard.adminSummaryDrawer.usageUnavailable")}
            </p>
          </div>
          {usageRatio !== null ? (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]">
              <div
                className={
                  seatsTight
                    ? "h-full rounded-full bg-red-500/80"
                    : "h-full rounded-full bg-foreground/60"
                }
                style={{ width: `${Math.round(usageRatio * 100)}%` }}
              />
            </div>
          ) : null}
          {seatsTight ? (
            <p className="mt-2 text-[11.5px] text-red-600">
              {t("dashboard.adminSummaryDrawer.seatsTight")}
            </p>
          ) : null}
        </div>
      </DrawerSection>

      <DrawerSection title={t("dashboard.adminSummaryDrawer.jumpTo")}>
        <Link
          href="/admin/account"
          onClick={() => onOpenChange(false)}
          className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/40 px-3.5 py-3 transition-colors hover:bg-muted/40"
        >
          <CreditCard className="size-3.5 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 text-[12.5px] font-medium text-foreground">
            {t("dashboard.adminSummaryDrawer.planBilling")}
          </span>
          <ArrowUpRight className="size-3.5 text-muted-foreground" aria-hidden />
        </Link>
        <Link
          href="/admin/account?d=invoices"
          onClick={() => onOpenChange(false)}
          className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/40 px-3.5 py-3 transition-colors hover:bg-muted/40"
        >
          <FileText className="size-3.5 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 text-[12.5px] font-medium text-foreground">
            {t("dashboard.adminSummaryDrawer.recentInvoices")}
          </span>
          <ArrowUpRight className="size-3.5 text-muted-foreground" aria-hidden />
        </Link>
        <Link
          href="/admin/users"
          onClick={() => onOpenChange(false)}
          className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/40 px-3.5 py-3 transition-colors hover:bg-muted/40"
        >
          <Users className="size-3.5 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 text-[12.5px] font-medium text-foreground">
            {t("dashboard.adminShell.topBar.teamPermissions")}
          </span>
          <ArrowUpRight className="size-3.5 text-muted-foreground" aria-hidden />
        </Link>
      </DrawerSection>
    </DrawerShell>
  );
}
