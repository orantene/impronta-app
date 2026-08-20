"use client";

import * as React from "react";
import { Calendar, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { useUpgradeModal } from "@/components/admin/site-control-center/upgrade-context";
import {
  formatTalentUsage,
  useAdminWorkspace,
} from "@/components/admin/workspace-context";
import { TIER_DOT, TIER_LABEL, TIER_RENEW_KEY } from "@/lib/admin/plan-tiers";

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
  const t = useT();
  const upgradeModal = useUpgradeModal();
  const workspace = useAdminWorkspace();

  const planKey = workspace?.plan ?? "free";
  const planLabel = TIER_LABEL[planKey] ?? "Free";
  const planDot = TIER_DOT[planKey] ?? TIER_DOT.free;
  const planUsage = workspace
    ? interpolate(t("dashboard.adminAccount.plan.usage"), {
        usage: formatTalentUsage(workspace, t),
      })
    : "—";
  const planRenew = t(TIER_RENEW_KEY[planKey] ?? TIER_RENEW_KEY.free!);

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
          {t("dashboard.adminAccount.plan.compare")}
        </BtnSecondary>
        <BtnPrimary onClick={() => upgradeModal.setOpen(true)}>
          {t("dashboard.adminAccount.plan.change")}
        </BtnPrimary>
      </div>
      <p className="text-[12px] text-muted-foreground">
        {t("dashboard.adminAccount.plan.note")}
      </p>
    </div>
  );
}

export function OrganizationDrawerBody() {
  const t = useT();
  const workspace = useAdminWorkspace();
  const orgName = workspace?.displayName ?? "";
  return (
    <div className="space-y-4">
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div>
          <label className={FORM_LABEL_CLASS}>
            {t("dashboard.adminAccount.org.nameLabel")}
          </label>
          <input
            key={orgName}
            className={FORM_INPUT_CLASS}
            defaultValue={orgName}
            placeholder={t("dashboard.adminAccount.org.namePlaceholder")}
          />
        </div>
        <div>
          <label className={FORM_LABEL_CLASS}>
            {t("dashboard.adminAccount.org.legalLabel")}
          </label>
          <input
            className={FORM_INPUT_CLASS}
            placeholder={t("dashboard.adminAccount.org.legalPlaceholder")}
          />
        </div>
        <div>
          <label className={FORM_LABEL_CLASS}>
            {t("dashboard.adminAccount.org.taxIdLabel")}
          </label>
          <input
            className={FORM_INPUT_CLASS}
            placeholder={t("dashboard.adminAccount.org.taxIdPlaceholder")}
          />
        </div>
        <div>
          <label className={FORM_LABEL_CLASS}>
            {t("dashboard.adminAccount.org.billingEmailLabel")}
          </label>
          <input
            className={FORM_INPUT_CLASS}
            type="email"
            placeholder="billing@your-agency.com"
          />
        </div>
        <div className="sm:col-span-2">
          <label className={FORM_LABEL_CLASS}>
            {t("dashboard.adminAccount.org.address1Label")}
          </label>
          <input
            className={FORM_INPUT_CLASS}
            placeholder={t("dashboard.adminAccount.org.address1Placeholder")}
          />
        </div>
        <div>
          <label className={FORM_LABEL_CLASS}>
            {t("dashboard.adminAccount.org.cityLabel")}
          </label>
          <input
            className={FORM_INPUT_CLASS}
            placeholder={t("dashboard.adminAccount.org.cityLabel")}
          />
        </div>
        <div>
          <label className={FORM_LABEL_CLASS}>
            {t("dashboard.adminAccount.org.regionLabel")}
          </label>
          <input
            className={FORM_INPUT_CLASS}
            placeholder={t("dashboard.adminAccount.org.regionLabel")}
          />
        </div>
        <div>
          <label className={FORM_LABEL_CLASS}>
            {t("dashboard.adminAccount.org.postalLabel")}
          </label>
          <input
            className={FORM_INPUT_CLASS}
            placeholder={t("dashboard.adminAccount.org.postalLabel")}
          />
        </div>
        <div>
          <label className={FORM_LABEL_CLASS}>
            {t("dashboard.adminAccount.org.countryLabel")}
          </label>
          <select className={FORM_INPUT_CLASS} defaultValue="">
            <option value="" disabled>
              {t("dashboard.adminAccount.org.countryPlaceholder")}
            </option>
            <option value="Mexico">
              {t("dashboard.adminAccount.org.countryMexico")}
            </option>
            <option value="United States">
              {t("dashboard.adminAccount.org.countryUnitedStates")}
            </option>
            <option value="Spain">
              {t("dashboard.adminAccount.org.countrySpain")}
            </option>
            <option value="Italy">
              {t("dashboard.adminAccount.org.countryItaly")}
            </option>
            <option value="United Kingdom">
              {t("dashboard.adminAccount.org.countryUnitedKingdom")}
            </option>
            <option value="Other">
              {t("dashboard.adminAccount.org.countryOther")}
            </option>
          </select>
        </div>
      </div>
      <div className="flex justify-end">
        <BtnPrimary>{t("dashboard.adminAccount.org.save")}</BtnPrimary>
      </div>
    </div>
  );
}

export function PaymentDrawerBody({ hasPaidInvoices }: { hasPaidInvoices: boolean }) {
  const t = useT();
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
                {t("dashboard.adminAccount.payment.cardOnFile")}
              </div>
              <div className="text-[12px] text-muted-foreground">
                {t("dashboard.adminAccount.payment.cardExpiry")}
              </div>
            </>
          ) : (
            <>
              <div className="text-[13px] font-semibold text-foreground">
                {t("dashboard.adminAccount.payment.noneTitle")}
              </div>
              <div className="text-[12px] text-muted-foreground">
                {t("dashboard.adminAccount.payment.noneBody")}
              </div>
            </>
          )}
        </div>
      </div>
      <div className="flex justify-end">
        <BtnSecondary>
          {hasPaidInvoices
            ? t("dashboard.adminAccount.payment.replace")
            : t("dashboard.adminAccount.payment.add")}
        </BtnSecondary>
      </div>
      <p className="text-[12px] text-muted-foreground">
        {t("dashboard.adminAccount.payment.stripeNote")}
      </p>
    </div>
  );
}

export function DangerZoneDrawerBody() {
  const t = useT();
  return (
    <div className="space-y-4">
      <p className="text-[12.5px] text-muted-foreground">
        {t("dashboard.adminAccount.danger.intro")}
      </p>
      <div className="space-y-2.5 rounded-[10px] border border-[rgba(24,24,27,0.1)] bg-white p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-foreground">
              {t("dashboard.adminAccount.danger.pauseTitle")}
            </div>
            <div className="text-[11.5px] text-muted-foreground">
              {t("dashboard.adminAccount.danger.pauseDesc")}
            </div>
          </div>
          <BtnSecondary>{t("dashboard.adminAccount.danger.pauseAction")}</BtnSecondary>
        </div>
        <div className="border-t border-[rgba(24,24,27,0.08)] pt-2.5" />
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-foreground">
              {t("dashboard.adminAccount.danger.closeTitle")}
            </div>
            <div className="text-[11.5px] text-muted-foreground">
              {t("dashboard.adminAccount.danger.closeDesc")}
            </div>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-[12.5px] font-semibold transition-colors"
            style={{ color: "#a1302d", borderColor: "rgba(161,48,45,0.35)" }}
          >
            {t("dashboard.adminAccount.danger.closeAction")}
          </button>
        </div>
      </div>
      <p className="text-[11.5px] text-muted-foreground">
        {t("dashboard.adminAccount.danger.footnote")}
      </p>
    </div>
  );
}

export function InvoicesDrawerBody({ hasPaidInvoices, planKey, planLabel }: {
  hasPaidInvoices: boolean;
  planKey: string;
  planLabel: string;
}) {
  const t = useT();
  if (!hasPaidInvoices) {
    return (
      <div className="rounded-[12px] border border-[rgba(24,24,27,0.1)] bg-white px-4 py-8 text-center">
        <p className="text-[13px] text-muted-foreground">
          {t("dashboard.adminAccount.invoices.emptyFree")}
        </p>
      </div>
    );
  }
  const amount =
    planKey === "agency" ? "$79.00" :
    planKey === "studio" ? "$29.00" :
    "Custom";
  const desc = interpolate(t("dashboard.adminAccount.invoices.planRow"), {
    plan: planLabel,
  });
  const rows = [
    { desc, date: t("dashboard.adminAccount.invoices.sampleDate1"), amount },
    { desc, date: t("dashboard.adminAccount.invoices.sampleDate2"), amount },
    { desc, date: t("dashboard.adminAccount.invoices.sampleDate3"), amount },
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
