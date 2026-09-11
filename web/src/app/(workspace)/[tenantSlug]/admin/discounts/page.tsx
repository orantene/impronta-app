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
import { DisabledButton, Eyebrow, Pill, Row, RowHead } from "./_ui";

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

const COLS = "grid-cols-[1.4fr_110px_1.2fr_160px_120px_70px]";

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
    <div className="flex w-full flex-col gap-4" data-testid="discounts-page">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="m-0 text-[22px]! font-semibold leading-[1.15] tracking-[-0.02em] text-admin-ink">{tr("dashboard.discounts.pageTitle")}</h1>
          <p className="m-0 mt-1 text-[13px] text-admin-ink-muted">{tr("dashboard.discounts.pageIntro")}</p>
        </div>
        {canWrite ? <DiscountForm currency={currency} /> : <p className="m-0 text-[12.5px] text-admin-ink-muted">{tr("dashboard.discounts.readOnly")}</p>}
      </header>

      <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-admin-ink-muted">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-admin-border bg-admin-card px-2.5 py-[3px] font-semibold text-admin-ink">
          {tr("dashboard.discounts.usedIn")} · 2
        </span>
        <span>
          <b className="font-semibold text-admin-ink">{tr("dashboard.discounts.usedPos")}</b> {tr("dashboard.discounts.usedPosParts")} &nbsp;·&nbsp;{" "}
          <b className="font-semibold text-admin-ink">{tr("dashboard.discounts.usedWeb")}</b> {tr("dashboard.discounts.usedWebParts")}
        </span>
      </div>

      {failed ? (
        <p role="alert" className="m-0 rounded-[12px] border border-admin-red/40 bg-admin-critical-soft px-3.5 py-2.5 text-[12.5px] text-admin-red">
          {tr("dashboard.discounts.unavailable")}
        </p>
      ) : (
        <div className="rounded-[14px] border border-admin-border bg-admin-card" role="table" aria-label={tr("dashboard.discounts.pageTitle")}>
          <RowHead cols={COLS}>
            <span>{tr("dashboard.discounts.colPromotion")}</span>
            <span>{tr("dashboard.discounts.colValue")}</span>
            <span>{tr("dashboard.discounts.colEligible")}</span>
            <span>{tr("dashboard.discounts.colStacking")}</span>
            <span>{tr("dashboard.discounts.colUses")}</span>
            <span>{tr("dashboard.discounts.colActive")}</span>
          </RowHead>
          {(rows ?? []).length === 0 ? (
            <p className="m-0 border-t border-admin-border-soft px-[18px] py-[22px] text-center text-[13px] text-admin-ink-muted">{tr("dashboard.discounts.empty")}</p>
          ) : (
            (rows ?? []).map((r) => {
              const used = uses.get(r.id) ?? 0;
              return (
                <Row key={r.id} cols={COLS} name={r.code}>
                  <span role="cell" className="min-w-0">
                    <span className="block truncate font-semibold text-admin-ink">{r.code}</span>
                    <span className="block text-[11.5px] text-admin-ink-muted">{r.label ?? tr("dashboard.discounts.kindCode")}</span>
                  </span>
                  <span role="cell" className="font-semibold tabular-nums">
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
                  <span role="cell">
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

      <div className="grid grid-cols-2 gap-[14px]">
        <section className="rounded-[14px] border border-admin-border bg-admin-card" data-testid="discounts-limits" title={limitsReason}>
          <div className="px-4 py-3">
            <h2 className="m-0 text-[14px]! font-semibold text-admin-ink">{tr("dashboard.discounts.limits.title")}</h2>
          </div>
          <div className="border-t border-admin-border-soft px-4 py-1">
            {roles.map((role) => (
              <div key={role} className="flex justify-between gap-3 border-b border-admin-border-soft py-1.5 text-[13px] last:border-b-0">
                <span className="text-admin-ink-muted">{tr(ROLE_KEY[role])}</span>
                <span className="text-admin-ink-dim">{tr("dashboard.discounts.limits.notSet")}</span>
              </div>
            ))}
          </div>
          <p className="m-0 border-t border-admin-border-soft px-4 py-2.5 text-[12px] text-admin-ink-muted">{tr("dashboard.discounts.limits.rule")}</p>
          <div className="border-t border-admin-border-soft px-4 py-2.5">
            <DisabledButton reason={limitsReason}>{tr("dashboard.discounts.limits.edit")}</DisabledButton>
          </div>
        </section>
        <section className="rounded-[14px] border border-admin-border bg-admin-card" data-testid="discounts-stacking">
          <div className="px-4 py-3">
            <h2 className="m-0 text-[14px]! font-semibold text-admin-ink">{tr("dashboard.discounts.stacking.title")}</h2>
            <p className="m-0 mt-0.5 text-[12px] text-admin-ink-muted">{tr("dashboard.discounts.stacking.intro")}</p>
          </div>
          <ol className="m-0 flex list-none flex-col gap-1.5 border-t border-admin-border-soft px-4 py-3 text-[13px]">
            <li className="flex items-center gap-2 text-admin-ink-dim" title={tr("dashboard.discounts.stacking.notWired")}>
              <Eyebrow>1</Eyebrow> {tr("dashboard.discounts.stacking.priceList")}
            </li>
            <li className="flex items-center gap-2 text-admin-ink">
              <Eyebrow>2</Eyebrow> {tr("dashboard.discounts.stacking.codes")} <Pill tone="green">{tr("dashboard.discounts.stacking.live")}</Pill>
            </li>
            <li className="flex items-center gap-2 text-admin-ink-dim" title={tr("dashboard.discounts.stacking.notWired")}>
              <Eyebrow>3</Eyebrow> {tr("dashboard.discounts.stacking.manual")}
            </li>
            <li className="flex items-center gap-2 text-admin-ink-dim" title={tr("dashboard.discounts.stacking.notWired")}>
              <Eyebrow>4</Eyebrow> {tr("dashboard.discounts.stacking.member")}
            </li>
          </ol>
          <p className="m-0 border-t border-admin-border-soft px-4 py-2.5 text-[12px] text-admin-ink-muted">{tr("dashboard.discounts.stacking.today")}</p>
        </section>
      </div>
    </div>
  );
}

const ROLE_KEY = {
  cashier: "dashboard.discounts.limits.cashier",
  server: "dashboard.discounts.limits.server",
  manager: "dashboard.discounts.limits.manager",
  owner: "dashboard.discounts.limits.owner",
} as const;
