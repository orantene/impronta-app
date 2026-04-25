"use client";

import * as React from "react";
import { Calendar, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { useUpgradeModal } from "@/components/admin/site-control-center/upgrade-context";
import {
  formatTalentUsage,
  useAdminWorkspace,
} from "@/components/admin/workspace-context";

/**
 * AccountBillingPanels — workspace billing surface from the
 * site-control-center mockup (Account view, lines 1168-1308).
 * Renders Current plan / Organization / Payment / Invoices / Danger
 * zone as a stack of `account-panel` cards. Reads the workspace summary
 * (plan, name, seat usage) from {@link useAdminWorkspace} so every
 * surface stays in sync with the underlying agencies row.
 */

const TIER_DOT: Record<string, string> = {
  free: "#a1a1aa",
  studio: "#3a7bff",
  agency: "#c9a227",
  network: "#146b3a",
};
const TIER_LABEL: Record<string, string> = {
  free: "Free",
  studio: "Studio",
  agency: "Agency",
  network: "Network",
};
const TIER_RENEW: Record<string, string> = {
  free: "No renewal — Free plan.",
  studio: "$49 / month.",
  agency: "$149 / month.",
  network: "Custom contract · contact billing.",
};

const PANEL_CLASS =
  "rounded-[14px] border border-[rgba(24,24,27,0.1)] bg-white p-[22px]";

const FORM_INPUT_CLASS = cn(
  "w-full rounded-lg border border-[rgba(24,24,27,0.18)] bg-white px-2.5 py-2 text-[12.5px]",
  "text-foreground transition-[border-color,box-shadow] focus:border-[rgba(201,162,39,0.4)] focus:outline-none focus:ring-[3px] focus:ring-[rgba(201,162,39,0.15)]",
);
const FORM_LABEL_CLASS =
  "mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground";

function PanelHeader({ title, body }: { title: string; body: string }) {
  return (
    <>
      <h2 className="mb-1 text-[14px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </h2>
      <p className="mb-4 text-[12.5px] text-muted-foreground">{body}</p>
    </>
  );
}

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
  style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-[rgba(24,24,27,0.18)] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-foreground transition-colors hover:border-foreground/40",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function AccountBillingPanels() {
  const upgradeModal = useUpgradeModal();
  const workspace = useAdminWorkspace();

  const planKey = workspace?.plan ?? "free";
  const planLabel = TIER_LABEL[planKey] ?? "Free";
  const planDot = TIER_DOT[planKey] ?? TIER_DOT.free;
  const planUsage = workspace
    ? `${formatTalentUsage(workspace)} used.`
    : "—";
  const planRenew = TIER_RENEW[planKey] ?? TIER_RENEW.free;
  const hasPaidInvoices = planKey !== "free";

  // Default the org-name field to the live workspace name so admins see
  // their actual brand instead of a leftover mockup placeholder. The form
  // is still presentational (Save organization is wired in a later phase).
  const orgName = workspace?.displayName ?? "";

  return (
    <div className="space-y-3.5">
      {/* Current plan */}
      <section className={PANEL_CLASS}>
        <PanelHeader
          title="Current plan"
          body="The plan powering this workspace. All tiers share the same product — higher tiers unlock more cards and capabilities."
        />
        <div className="flex flex-wrap items-center justify-between gap-4">
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
          <div className="flex gap-2">
            <BtnSecondary onClick={() => upgradeModal.setOpen(true)}>
              Compare plans
            </BtnSecondary>
            <BtnPrimary onClick={() => upgradeModal.setOpen(true)}>
              Change plan
            </BtnPrimary>
          </div>
        </div>
      </section>

      {/* Organization */}
      <section className={PANEL_CLASS}>
        <PanelHeader
          title="Organization"
          body="How we invoice you and how your brand appears on receipts."
        />
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
            <input
              className={FORM_INPUT_CLASS}
              placeholder="Street address"
            />
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
        <div className="mt-3 flex justify-end">
          <BtnPrimary>Save organization</BtnPrimary>
        </div>
      </section>

      {/* Payment method */}
      <section className={PANEL_CLASS}>
        <PanelHeader
          title="Payment method"
          body={
            hasPaidInvoices
              ? "Update or replace the card we charge for your subscription."
              : "On Free, no payment is needed. Adding a card unlocks one-click upgrades."
          }
        />
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
                  Add one when you're ready to upgrade — we'll walk you through
                  it.
                </div>
              </>
            )}
          </div>
          <BtnSecondary>{hasPaidInvoices ? "Replace" : "Add card"}</BtnSecondary>
        </div>
      </section>

      {/* Invoices */}
      <section className={PANEL_CLASS}>
        <PanelHeader title="Invoices" body="PDF receipts for every billing cycle." />
        <div className="overflow-hidden rounded-xl border border-[rgba(24,24,27,0.1)]">
          {hasPaidInvoices ? (
            <>
              {[
                {
                  desc: `${planLabel} plan`,
                  date: "Apr 1, 2026",
                  amount: planKey === "agency" ? "$149.00" : planKey === "studio" ? "$49.00" : "$499.00",
                },
                {
                  desc: `${planLabel} plan`,
                  date: "Mar 1, 2026",
                  amount: planKey === "agency" ? "$149.00" : planKey === "studio" ? "$49.00" : "$499.00",
                },
                {
                  desc: `${planLabel} plan`,
                  date: "Feb 1, 2026",
                  amount: planKey === "agency" ? "$149.00" : planKey === "studio" ? "$49.00" : "$499.00",
                },
              ].map((inv, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "grid items-center gap-4 px-4 py-3 text-[12.5px]",
                    "[grid-template-columns:1fr_auto_auto_auto]",
                    idx < 2
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
            </>
          ) : (
            <div className="flex justify-center px-4 py-3 text-center text-[12.5px] text-muted-foreground">
              No invoices yet — you're on the Free plan.
            </div>
          )}
        </div>
      </section>

      {/* Danger zone */}
      <section className={PANEL_CLASS}>
        <PanelHeader
          title="Danger zone"
          body="Pause or close your workspace. We keep your data on file for 30 days after closure."
        />
        <div className="flex flex-wrap gap-2.5">
          <BtnSecondary>Pause workspace</BtnSecondary>
          <BtnSecondary
            style={{
              color: "#a1302d",
              borderColor: "rgba(161,48,45,0.35)",
            }}
          >
            Close workspace
          </BtnSecondary>
        </div>
      </section>
    </div>
  );
}
