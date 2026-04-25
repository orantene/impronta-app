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
import { TIER_DOT, TIER_LABEL, TIER_RENEW } from "@/lib/admin/plan-tiers";

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
  const ws = useAdminWorkspace();
  const planKey = ws?.plan ?? "free";
  const planLabel = TIER_LABEL[planKey] ?? "Free";
  const planDot = TIER_DOT[planKey] ?? TIER_DOT.free;
  const renewCopy = TIER_RENEW[planKey] ?? TIER_RENEW.free;
  const usageCopy = formatTalentUsage(ws);
  const usageRatio =
    ws && ws.talentLimit && ws.talentLimit > 0
      ? Math.min(1, ws.talentCount / ws.talentLimit)
      : null;
  const seatsTight = usageRatio !== null && usageRatio >= 0.9;

  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      title={ws?.displayName ?? "Workspace"}
      subtitle={`${planLabel} plan · ${renewCopy}`}
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
                {planKey === "network" ? "Manage plan" : "Compare plans"}
              </DrawerPrimaryButton>
            ) : undefined
          }
        />
      }
    >
      <DrawerSection title="At a glance">
        <div className="rounded-xl border border-border/50 bg-muted/20 px-3.5 py-3">
          <div className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: planDot }}
              aria-hidden
            />
            <p className="text-[13px] font-semibold text-foreground">
              {planLabel} plan
            </p>
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">{renewCopy}</p>
        </div>
      </DrawerSection>

      <DrawerSection title="Roster">
        <div className="rounded-xl border border-border/50 bg-muted/20 px-3.5 py-3">
          <div className="flex items-center gap-2">
            <Users className="size-3.5 text-muted-foreground" aria-hidden />
            <p className="text-[12.5px] font-semibold text-foreground">
              {usageCopy || "Roster usage unavailable"}
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
              You&apos;re within 10% of the cap. Bumping the plan unlocks more
              seats immediately.
            </p>
          ) : null}
        </div>
      </DrawerSection>

      <DrawerSection title="Jump to">
        <Link
          href="/admin/account"
          onClick={() => onOpenChange(false)}
          className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/40 px-3.5 py-3 transition-colors hover:bg-muted/40"
        >
          <CreditCard className="size-3.5 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 text-[12.5px] font-medium text-foreground">
            Plan &amp; billing
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
            Recent invoices
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
            Team &amp; permissions
          </span>
          <ArrowUpRight className="size-3.5 text-muted-foreground" aria-hidden />
        </Link>
      </DrawerSection>
    </DrawerShell>
  );
}
