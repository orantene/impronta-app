"use client";

import * as React from "react";
import {
  AlertTriangle,
  Building2,
  ChevronRight,
  CreditCard,
  FileText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { DrawerShell } from "@/components/admin/drawer/drawer-shell";
import { useAdminWorkspace } from "@/components/admin/workspace-context";
import { TIER_LABEL } from "@/lib/admin/plan-tiers";

import {
  DangerZoneDrawerBody,
  InvoicesDrawerBody,
  OrganizationDrawerBody,
  PaymentDrawerBody,
  PlanDrawerBody,
} from "./account-drawer-content";

/**
 * AccountShell — tile-grid + drawer host for /admin/account (audit Finding #5).
 * Mirrors the SiteShell pattern: each card opens a right-side drawer rather
 * than scrolling through 5 stacked sections.
 *
 * Tiles:
 *   - Plan & billing      → PlanDrawerBody
 *   - Organization        → OrganizationDrawerBody
 *   - Payment method      → PaymentDrawerBody
 *   - Invoices            → InvoicesDrawerBody
 *   - Security & session  → securitySlot (rendered by parent server page so
 *                          we keep the existing form components)
 */

type DrawerId =
  | "plan"
  | "organization"
  | "payment"
  | "invoices"
  | "security"
  | "danger";

type DrawerEntry = {
  title: string;
  subtitle: string;
  icon: LucideIcon;
};

function AccountTile({
  icon: Icon,
  label,
  stat,
  badge,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  stat: string;
  badge?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      className={cn(
        "group relative block min-h-[66px] w-full rounded-xl border border-[rgba(24,24,27,0.1)] bg-white px-3.5 py-3 text-left transition-[border-color,box-shadow,transform] duration-150",
        "hover:-translate-y-px hover:border-[rgba(24,24,27,0.32)] hover:shadow-[0_10px_28px_-18px_rgba(0,0,0,0.28)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px]"
          style={{
            backgroundColor: "#f5f4ef",
            color: "#18181b",
            boxShadow: "inset 0 0 0 1px rgba(24, 24, 27, 0.1)",
          }}
        >
          <Icon className="size-[15px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[13.5px] font-semibold tracking-[-0.005em] text-foreground">
            {label}
          </h3>
          <p className="mt-0.5 truncate text-[11.5px] leading-[1.3] text-muted-foreground">
            {stat}
          </p>
        </div>
        {badge ? (
          <span className="shrink-0">{badge}</span>
        ) : (
          <ChevronRight
            className="size-3.5 shrink-0 self-center text-muted-foreground/70 opacity-0 transition-[opacity,transform] group-hover:translate-x-0.5 group-hover:text-foreground group-hover:opacity-100"
            aria-hidden
          />
        )}
      </div>
    </button>
  );
}

export function AccountShell({
  userEmail,
  securitySlot,
}: {
  userEmail: string | null;
  securitySlot: React.ReactNode;
}) {
  const workspace = useAdminWorkspace();
  const planKey = workspace?.plan ?? "free";
  const planLabel = TIER_LABEL[planKey] ?? "Free";
  const hasPaidInvoices = planKey !== "free";

  const [openId, setOpenId] = React.useState<DrawerId | null>(null);

  const drawers: Record<DrawerId, DrawerEntry> = {
    plan: {
      title: "Plan & billing",
      subtitle: `${planLabel} · ${hasPaidInvoices ? "billed monthly" : "no renewal"}`,
      icon: Sparkles,
    },
    organization: {
      title: "Organization",
      subtitle: "Brand · receipts · address",
      icon: Building2,
    },
    payment: {
      title: "Payment method",
      subtitle: hasPaidInvoices ? "Visa ending 4242" : "No card on file",
      icon: CreditCard,
    },
    invoices: {
      title: "Invoices",
      subtitle: hasPaidInvoices ? "PDF receipts · last 3" : "Free plan — no invoices",
      icon: FileText,
    },
    security: {
      title: "Security & session",
      subtitle: userEmail ?? "Signed in as staff",
      icon: ShieldCheck,
    },
    danger: {
      title: "Danger zone",
      subtitle: "Pause or close workspace",
      icon: AlertTriangle,
    },
  };

  const drawer = openId ? drawers[openId] : null;

  function renderBody() {
    switch (openId) {
      case "plan":
        return <PlanDrawerBody />;
      case "organization":
        return <OrganizationDrawerBody />;
      case "payment":
        return <PaymentDrawerBody hasPaidInvoices={hasPaidInvoices} />;
      case "invoices":
        return (
          <InvoicesDrawerBody
            hasPaidInvoices={hasPaidInvoices}
            planKey={planKey}
            planLabel={planLabel}
          />
        );
      case "security":
        return securitySlot;
      case "danger":
        return <DangerZoneDrawerBody />;
      default:
        return null;
    }
  }

  return (
    <>
      <div className="space-y-6">
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(24,24,27,0.06)] px-2.5 py-[3px] text-[10.5px] font-bold uppercase tracking-[0.18em] text-foreground/70">
              Workspace
            </span>
            <h2 className="text-[15px] font-semibold tracking-[-0.005em] text-foreground">
              Billing &amp; identity
            </h2>
            <span className="text-[12px] text-muted-foreground">
              Plan · organization · payment · invoices.
            </span>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            <AccountTile
              icon={drawers.plan.icon}
              label="Plan & billing"
              stat={drawers.plan.subtitle}
              badge={
                <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(24,24,27,0.18)] bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-foreground/70">
                  {planLabel}
                </span>
              }
              onClick={() => setOpenId("plan")}
            />
            <AccountTile
              icon={drawers.organization.icon}
              label="Organization"
              stat={workspace?.displayName ?? drawers.organization.subtitle}
              onClick={() => setOpenId("organization")}
            />
            <AccountTile
              icon={drawers.payment.icon}
              label="Payment method"
              stat={drawers.payment.subtitle}
              onClick={() => setOpenId("payment")}
            />
            <AccountTile
              icon={drawers.invoices.icon}
              label="Invoices"
              stat={drawers.invoices.subtitle}
              onClick={() => setOpenId("invoices")}
            />
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(24,24,27,0.06)] px-2.5 py-[3px] text-[10.5px] font-bold uppercase tracking-[0.18em] text-foreground/70">
              You
            </span>
            <h2 className="text-[15px] font-semibold tracking-[-0.005em] text-foreground">
              Security &amp; session
            </h2>
            <span className="text-[12px] text-muted-foreground">
              Sign-out and password for this device.
            </span>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            <AccountTile
              icon={drawers.security.icon}
              label="Security & session"
              stat={drawers.security.subtitle}
              onClick={() => setOpenId("security")}
            />
            <AccountTile
              icon={drawers.danger.icon}
              label="Danger zone"
              stat={drawers.danger.subtitle}
              onClick={() => setOpenId("danger")}
            />
          </div>
        </section>
      </div>

      <DrawerShell
        open={openId !== null && drawer !== null}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
        title={drawer?.title ?? ""}
        subtitle={drawer?.subtitle}
        icon={drawer?.icon ?? Sparkles}
      >
        {renderBody()}
      </DrawerShell>
    </>
  );
}
