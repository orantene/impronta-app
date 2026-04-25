"use client";

import * as React from "react";
import { Calendar, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { useUpgradeModal } from "@/components/admin/site-control-center/upgrade-context";
import {
  formatTalentUsage,
  useAdminWorkspace,
} from "@/components/admin/workspace-context";
import { TIER_DOT, TIER_LABEL, TIER_RENEW } from "@/lib/admin/plan-tiers";

/**
 * Drawer bodies for the Account control center (audit Finding #5).
 *
 * The existing AccountBillingPanels stacks five sections in one ~1500px
 * vertical scroll. This file splits each section into a drawer body that
 * AccountShell mounts on demand. The shape mirrors the Site control center
 * drawer bodies so the two surfaces share a mental model.
 *
 * Forms are still presentational — a follow-up phase wires Save organization
 * and Add card to real server actions. Plan changes are already wired.
 */

const FORM_INPUT_CLASS = cn(
  "w-full rounded-lg border border-[rgba(24,24,27,0.18)] bg-white px-2.5 py-2 text-[12.5px]",
  "text-foreground transition-[border-color,box-shadow] focus:border-[rgba(201,162,39,0.4)] focus:outline-none focus:ring-[3px] focus:ring-[rgba(201,162,39,0.15)]",
);
const FORM_LABEL_CLASS =
  "mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground";

function BtnPrimary({
  children,
  onClick,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-foreground bg-foreground px-3.5 py-1.5 text-[12.5px] font-semibold text-background transition-opacity hover:opacity-90"
    >
      {children}
    </button>
  );
}

function BtnSecondary({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-[rgba(24,24,27,0.18)] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-foreground transition-colors hover:border-foreground/40",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function PlanDrawerBody() {
  const upgradeModal = useUpgradeModal();
  const workspace = useAdminWorkspace();

  const planKey = workspace?.plan ?? "free";
  const planLabel = TIER_LABEL[planKey] ?? "Free";
  const planDot = TIER_DOT[planKey] ?? TIER_DOT.free;
  const planUsage = workspace ? `${formatTalentUsage(workspace)} used.` : "—";
  const planRenew = TIER_RENEW[planKey] ?? TIER_RENEW.free;

  return (
    <div className="space-y-5">
      <div className="rounded-[12px] border border-[rgba(24,24,27,0.1)] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(24,24,27,0.18)] bg-white px-3 py-1 text-[12px]">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: planDot }}
                aria-hidden
              />
              <strong className="font-semibold text-foreground">
                {planLabel}
              </strong>
            </span>
            <div>
              <div className="text-[13px] text-foreground">{planUsage}</div>
              <div className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-muted-foreground">
                <Calendar className="size-3" aria-hidden />
                {planRenew}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <BtnSecondary onClick={() => upgradeModal.setOpen(true)}>
          Compare plans
        </BtnSecondary>
        <BtnPrimary onClick={() => upgradeModal.setOpen(true)}>
          Change plan
        </BtnPrimary>
      </div>
      <p className="text-[12px] text-muted-foreground">
        Plans switch on the next billing cycle. VAT calculated at checkout.
      </p>
    </div>
  );
}

export function OrganizationDrawerBody() {
  const workspace = useAdminWorkspace();
  const orgName = workspace?.displayName ?? "";
  return (
    <div className="space-y-4">
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div>
          <label className={FORM_LABEL_CLASS}>Organization name</label>
          <input
            key={orgName}
            className={FORM_INPUT_CLASS}
            defaultValue={orgName}
            placeholder="Your agency name"
          />
        </div>
        <div>
          <label className={FORM_LABEL_CLASS}>Legal entity</label>
          <input
            className={FORM_INPUT_CLASS}
            placeholder="As it appears on receipts"
          />
        </div>
        <div>
          <label className={FORM_LABEL_CLASS}>VAT / Tax ID</label>
          <input
            className={FORM_INPUT_CLASS}
            placeholder="Optional — for EU / LatAm"
          />
        </div>
        <div>
          <label className={FORM_LABEL_CLASS}>Billing email</label>
          <input
            className={FORM_INPUT_CLASS}
            type="email"
            placeholder="billing@your-agency.com"
          />
        </div>
        <div className="sm:col-span-2">
          <label className={FORM_LABEL_CLASS}>Address line 1</label>
          <input className={FORM_INPUT_CLASS} placeholder="Street address" />
        </div>
        <div>
          <label className={FORM_LABEL_CLASS}>City</label>
          <input className={FORM_INPUT_CLASS} placeholder="City" />
        </div>
        <div>
          <label className={FORM_LABEL_CLASS}>Region / State</label>
          <input className={FORM_INPUT_CLASS} placeholder="Region / State" />
        </div>
        <div>
          <label className={FORM_LABEL_CLASS}>Postal code</label>
          <input className={FORM_INPUT_CLASS} placeholder="Postal code" />
        </div>
        <div>
          <label className={FORM_LABEL_CLASS}>Country</label>
          <select className={FORM_INPUT_CLASS} defaultValue="">
            <option value="" disabled>
              Choose country
            </option>
            <option>Mexico</option>
            <option>United States</option>
            <option>Spain</option>
            <option>Italy</option>
            <option>United Kingdom</option>
            <option>Other</option>
          </select>
        </div>
      </div>
      <div className="flex justify-end">
        <BtnPrimary>Save organization</BtnPrimary>
      </div>
    </div>
  );
}

export function PaymentDrawerBody({ hasPaidInvoices }: { hasPaidInvoices: boolean }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-[10px] border border-[rgba(24,24,27,0.1)] bg-[#fbfaf5] px-3.5 py-3">
        {hasPaidInvoices ? (
          <span
            className="flex h-[22px] w-[34px] shrink-0 items-center justify-center rounded text-[9px] font-bold tracking-[0.04em] text-white"
            style={{
              background: "linear-gradient(135deg, #1a1f3d, #0a2b5e)",
            }}
          >
            VISA
          </span>
        ) : (
          <span
            className="flex h-[22px] w-[34px] shrink-0 items-center justify-center rounded text-[14px] font-light text-muted-foreground"
            style={{
              background: "#f2efe6",
              borderStyle: "dashed",
              borderWidth: 1,
              borderColor: "rgba(24,24,27,0.18)",
            }}
          >
            <Plus className="size-3" aria-hidden />
          </span>
        )}
        <div className="flex-1 min-w-0">
          {hasPaidInvoices ? (
            <>
              <div className="text-[13px] font-semibold text-foreground">
                Visa ending 4242
              </div>
              <div className="text-[12px] text-muted-foreground">
                Expires 04 / 28 · billed monthly
              </div>
            </>
          ) : (
            <>
              <div className="text-[13px] font-semibold text-foreground">
                No payment method on file
              </div>
              <div className="text-[12px] text-muted-foreground">
                Add one when you&rsquo;re ready to upgrade — we&rsquo;ll walk you
                through it.
              </div>
            </>
          )}
        </div>
      </div>
      <div className="flex justify-end">
        <BtnSecondary>{hasPaidInvoices ? "Replace card" : "Add card"}</BtnSecondary>
      </div>
      <p className="text-[12px] text-muted-foreground">
        Card details go through Stripe — we never store the number directly.
      </p>
    </div>
  );
}

export function DangerZoneDrawerBody() {
  return (
    <div className="space-y-4">
      <p className="text-[12.5px] text-muted-foreground">
        Pause or close your workspace. We keep your data on file for 30 days
        after closure — after that it&rsquo;s purged from our systems.
      </p>
      <div className="space-y-2.5 rounded-[10px] border border-[rgba(24,24,27,0.1)] bg-white p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-foreground">Pause workspace</div>
            <div className="text-[11.5px] text-muted-foreground">
              Hide your public site and freeze billing. Reversible.
            </div>
          </div>
          <BtnSecondary>Pause</BtnSecondary>
        </div>
        <div className="border-t border-[rgba(24,24,27,0.08)] pt-2.5" />
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-foreground">Close workspace</div>
            <div className="text-[11.5px] text-muted-foreground">
              Permanent after 30 days. Cancels billing immediately.
            </div>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-[12.5px] font-semibold transition-colors"
            style={{ color: "#a1302d", borderColor: "rgba(161,48,45,0.35)" }}
          >
            Close
          </button>
        </div>
      </div>
      <p className="text-[11.5px] text-muted-foreground">
        Closing emails the workspace owner a confirmation link — nothing happens
        without that confirmation.
      </p>
    </div>
  );
}

export function InvoicesDrawerBody({ hasPaidInvoices, planKey, planLabel }: {
  hasPaidInvoices: boolean;
  planKey: string;
  planLabel: string;
}) {
  if (!hasPaidInvoices) {
    return (
      <div className="rounded-[12px] border border-[rgba(24,24,27,0.1)] bg-white px-4 py-8 text-center">
        <p className="text-[13px] text-muted-foreground">
          No invoices yet — you&rsquo;re on the Free plan.
        </p>
      </div>
    );
  }
  const amount =
    planKey === "agency" ? "$149.00" :
    planKey === "studio" ? "$49.00" :
    "$499.00";
  const rows = [
    { desc: `${planLabel} plan`, date: "Apr 1, 2026", amount },
    { desc: `${planLabel} plan`, date: "Mar 1, 2026", amount },
    { desc: `${planLabel} plan`, date: "Feb 1, 2026", amount },
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-[rgba(24,24,27,0.1)]">
      {rows.map((inv, idx) => (
        <div
          key={idx}
          className={cn(
            "grid items-center gap-4 px-4 py-3 text-[12.5px]",
            "[grid-template-columns:1fr_auto_auto_auto]",
            idx < rows.length - 1
              ? "border-b border-[rgba(24,24,27,0.1)]"
              : "",
          )}
        >
          <span className="text-foreground">{inv.desc}</span>
          <span className="text-muted-foreground">{inv.date}</span>
          <span className="font-semibold tabular-nums text-foreground">
            {inv.amount}
          </span>
          <button
            type="button"
            className="rounded-md text-[12px] font-semibold text-foreground transition-opacity hover:opacity-70"
          >
            PDF
          </button>
        </div>
      ))}
    </div>
  );
}
