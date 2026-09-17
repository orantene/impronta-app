/**
 * W08_Promotions — `Promotions & discount limits`, as the board draws it:
 * the title and intro, `New promotion`, the `Used in` line, one table
 * (Promotion · Value · Eligible · Stacking · Uses · on/off), then two cards:
 * `Manual discount limits by role` and `Stacking order`.
 *
 * Server Component, canonical route (`/admin/discounts`), a child of the
 * Catalog destination. EVERY ROW IS `tenant_promo_codes`, read with its
 * redemption count from `tenant_promo_redemptions` (rows, never a counter).
 * The form and the on/off switch are the two client islands, over
 * `createTenantPromo` / `setTenantPromoActive`.
 *
 * WHAT THE ENGINE DOES TODAY, said on the page rather than implied: a sale
 * carries ONE code (`orders.promo_code_id`), so Stacking reads "One code per
 * sale" on every row and the stacking-order card names the one step that
 * runs. Manual discounts and comps have no writer (D-POS-22), so the limits
 * card reads "Not set" per role and `Edit limits` is disabled with the
 * sentence (D-POS-52).
 */

import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { resolveDefaultCurrencyForUI } from "@/lib/billing/currencies";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { logServerError } from "@/lib/server/safe-error";
import { DiscountForm, DiscountActiveSwitch } from "./discount-form";
import { DisabledButton, Pill, Row, RowHead, StepChip } from "./_ui";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

type PromoRow = {
  id: string;
  code: string;
  label: string | null;
  kind: string;
  value: number;
  currency: string | null;
  is_active: boolean;
  max_redemptions: number | null;
  per_customer_limit: number;
  ends_at: string | null;
  event_id: string | null;
};

// The board's table at 636px: Promotion · Value · Eligible · Stacking · Uses · the row's control.
const COLS = "grid-cols-[1.3fr_80px_1.1fr_1.1fr_60px_40px]";

export default async function DiscountsPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();
  const canView = await userHasCapability("view_dashboard", scope.tenantId);
  if (!canView) notFound();
  const canWrite = await userHasCapability("manage_billing", scope.tenantId);

  const locale = await getRequestLocale();
  const tr = await createTranslator(locale);
  const admin = createServiceRoleClient();
  const currency = resolveDefaultCurrencyForUI(null);

  let rows: PromoRow[] | null = null;
  let uses = new Map<string, number>();
  let usesUnknown = false;
  let failed = !admin;
  if (admin) {
    const { data, error } = await admin
      .from("tenant_promo_codes")
      .select("id, code, label, kind, value, currency, is_active, max_redemptions, per_customer_limit, ends_at, event_id")
      .eq("tenant_id", scope.tenantId)
      .order("created_at", { ascending: false });
    if (error) {
      logServerError("discounts.list", error);
      failed = true;
    } else {
      rows = (data ?? []) as PromoRow[];
      if (rows.length > 0) {
        const { data: red, error: redErr } = await admin
          .from("tenant_promo_redemptions")
          .select("promo_code_id")
          .in(
            "promo_code_id",
            rows.map((r) => r.id),
          );
        if (redErr) {
          logServerError("discounts.redemptions", redErr);
          // The codes are still the codes; only the count is unknown, and the
          // column says so per row rather than printing 0.
          usesUnknown = true;
        } else {
          uses = new Map();
          for (const r of (red ?? []) as { promo_code_id: string }[]) {
            uses.set(r.promo_code_id, (uses.get(r.promo_code_id) ?? 0) + 1);
          }
        }
      }
    }
  }

  const valueOf = (r: PromoRow) =>
    r.kind === "percent"
      ? `${r.value}%`
      : `-${formatOrderMoney(Number(r.value), r.currency ?? currency)}`;

  const roles = ["cashier", "server", "manager", "owner"] as const;
  const limitsReason = tr("dashboard.discounts.limits.reason");

  return (
    <div className="flex w-full flex-col gap-[14px] leading-[1.2]" data-testid="discounts-page">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="m-0 text-[26px]! font-semibold leading-[1.2] tracking-[-0.02em] text-admin-ink">{tr("dashboard.discounts.pageTitle")}</h1>
          <p className="m-0 mt-[3px] text-[13px] leading-[1.2] text-admin-ink-muted">{tr("dashboard.discounts.pageIntro")}</p>
        </div>
        {canWrite ? <DiscountForm currency={currency} /> : <p className="m-0 text-[12.5px] text-admin-ink-muted">{tr("dashboard.discounts.readOnly")}</p>}
      </header>

      <div className="flex flex-wrap items-center gap-2 text-[11.5px] leading-[1.2] text-admin-ink-muted">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-admin-border bg-admin-card px-2.5 py-[3px] font-semibold text-admin-ink">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-admin-brand)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M14 3h7v7" />
            <path d="M21 3l-9 9" />
            <path d="M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6" />
          </svg>
          {tr("dashboard.discounts.usedIn")} · 2
        </span>
        <span>
          <b className="font-semibold text-admin-ink">{tr("dashboard.discounts.usedPos")}</b> {tr("dashboard.discounts.usedPosParts")} &nbsp;·&nbsp;{" "}
          <b className="font-semibold text-admin-ink">{tr("dashboard.discounts.usedWeb")}</b> {tr("dashboard.discounts.usedWebParts")}
        </span>
      </div>

      {/* W08: the table on the left, the limits card (490px) beside it, the stacking order across the foot. */}
      <div className="grid grid-cols-[minmax(0,1fr)_490px] items-start gap-[16px]">
      {failed ? (
        <p role="alert" className="m-0 rounded-[12px] border border-admin-red/40 bg-admin-critical-soft px-3.5 py-2.5 text-[12.5px] text-admin-red">
          {tr("dashboard.discounts.unavailable")}
        </p>
      ) : (
        <div className="min-h-[280px] rounded-[14px] border border-admin-border bg-admin-card" role="table" aria-label={tr("dashboard.discounts.pageTitle")}>
          <RowHead cols={COLS}>
            <span>{tr("dashboard.discounts.colPromotion")}</span>
            <span>{tr("dashboard.discounts.colValue")}</span>
            <span>{tr("dashboard.discounts.colEligible")}</span>
            <span>{tr("dashboard.discounts.colStacking")}</span>
            <span>{tr("dashboard.discounts.colUses")}</span>
            <span className="sr-only">{tr("dashboard.discounts.colActive")}</span>
          </RowHead>
          {(rows ?? []).length === 0 ? (
            <p className="m-0 border-t border-admin-border-soft px-[18px] py-[22px] text-center text-[13px] text-admin-ink-muted">{tr("dashboard.discounts.empty")}</p>
          ) : (
            (rows ?? []).map((r) => {
              const used = uses.get(r.id) ?? 0;
              return (
                <Row key={r.id} cols={COLS} name={r.code}>
                  <span role="cell" className="min-w-0 font-semibold text-admin-ink [overflow-wrap:anywhere]">
                    {r.code} · {r.label ?? tr("dashboard.discounts.kindCode")}
                  </span>
                  <span role="cell" className="tabular-nums">
                    {valueOf(r)}
                  </span>
                  <span role="cell" className="text-admin-ink-muted">
                    {r.event_id ? tr("dashboard.discounts.eligibleEvent") : tr("dashboard.discounts.eligibleAll")}
                    {r.per_customer_limit > 0 ? ` · ${tr("dashboard.discounts.perCustomer").replace("{n}", String(r.per_customer_limit))}` : ""}
                  </span>
                  <span role="cell" className="text-admin-ink-muted">
                    {tr("dashboard.discounts.stackingOne")}
                  </span>
                  <span role="cell" className="tabular-nums text-admin-ink-muted">
                    {usesUnknown ? tr("dashboard.discounts.usesUnknown") : r.max_redemptions == null ? String(used) : `${used} / ${r.max_redemptions}`}
                  </span>
                  <span role="cell" className="flex justify-end">
                    {canWrite ? (
                      <DiscountActiveSwitch id={r.id} active={r.is_active} />
                    ) : (
                      <Pill tone={r.is_active ? "green" : "slate"}>{r.is_active ? tr("dashboard.discounts.on") : tr("dashboard.discounts.off")}</Pill>
                    )}
                  </span>
                </Row>
              );
            })
          )}
        </div>
      )}

        <section className="rounded-[14px] border border-admin-border bg-admin-card px-[16px] pb-[16px] pt-[14px]" data-testid="discounts-limits" title={limitsReason}>
          <h2 className="m-0 text-[14px]! font-semibold leading-[1.2] text-admin-ink">{tr("dashboard.discounts.limits.title")}</h2>
          <div className="mt-[6px]">
            {roles.map((role) => (
              <div key={role} className="flex h-[39px] items-center justify-between gap-3 border-b border-admin-border-soft text-[13px] leading-[1.2] last:border-b-0">
                <span className="text-admin-ink-muted">{tr(ROLE_KEY[role])}</span>
                <span className="font-semibold text-admin-ink-dim">{tr("dashboard.discounts.limits.notSet")}</span>
              </div>
            ))}
          </div>
          <p className="m-0 mt-[12px] text-[11.5px] leading-[1.3] text-admin-ink-muted">{tr("dashboard.discounts.limits.rule")}</p>
          <div className="mt-[12px]">
            <DisabledButton reason={limitsReason}>{tr("dashboard.discounts.limits.edit")}</DisabledButton>
          </div>
        </section>
      </div>

      <section className="rounded-[14px] border border-admin-border bg-admin-card px-[16px] py-[14px]" data-testid="discounts-stacking">
        <h2 className="m-0 text-[14px]! font-semibold leading-[1.2] text-admin-ink">{tr("dashboard.discounts.stacking.title")}</h2>
        <p className="m-0 mt-[4px] text-[12px] leading-[1.2] text-admin-ink-muted">{tr("dashboard.discounts.stacking.intro")}</p>
        <ol className="m-0 mt-[10px] flex list-none flex-wrap gap-[6px] p-0 text-[12px]">
          <StepChip n={1} reason={tr("dashboard.discounts.stacking.notWired")}>{tr("dashboard.discounts.stacking.priceList")}</StepChip>
          <StepChip n={2} live={tr("dashboard.discounts.stacking.live")}>{tr("dashboard.discounts.stacking.codes")}</StepChip>
          <StepChip n={3} reason={tr("dashboard.discounts.stacking.notWired")}>{tr("dashboard.discounts.stacking.manual")}</StepChip>
          <StepChip n={4} reason={tr("dashboard.discounts.stacking.notWired")}>{tr("dashboard.discounts.stacking.member")}</StepChip>
        </ol>
        <p className="m-0 mt-[10px] text-[11.5px] leading-[1.2] text-admin-ink-dim">{tr("dashboard.discounts.stacking.today")}</p>
      </section>
    </div>
  );
}

const ROLE_KEY = {
  cashier: "dashboard.discounts.limits.cashier",
  server: "dashboard.discounts.limits.server",
  manager: "dashboard.discounts.limits.manager",
  owner: "dashboard.discounts.limits.owner",
} as const;
