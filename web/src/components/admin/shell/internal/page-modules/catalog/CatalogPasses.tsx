"use client";

/**
 * CatalogPasses — W09_Entitlements: `Passes, memberships & gift cards`, the
 * `Create` button, the `Used in` line, and the three cards (a pass, a
 * membership, a gift card) with their rows and `Edit`.
 *
 * NOTHING HERE WRITES. `entitlement_credits` exists as a ledger of credits
 * a customer holds, but no product creates one: which kinds are sold, how a
 * membership bills and what a gift card is a liability against are a
 * product decision the owner has not taken (the known blocker). Every
 * control is drawn disabled with that one sentence, and the three cards show
 * the board's ROWS as the questions that decision answers, with each value
 * "Not decided" (D-POS-44).
 */

import { useT } from "@/i18n/use-t";
import { Icon } from "../../primitives";
import { ActionButton, StatePill, UsedIn } from "../appointments-classes-ui";
import type { CatalogNav } from "./CatalogPage";
import { CARD, CardButton, PageHeading } from "./catalog-ui";

const ROW_KEY: Record<string, string> = {
  price: "dashboard.catalog.passes.row.price",
  credits: "dashboard.catalog.passes.row.credits",
  eligible: "dashboard.catalog.passes.row.eligible",
  activation: "dashboard.catalog.passes.row.activation",
  expiry: "dashboard.catalog.passes.row.expiry",
  consumed: "dashboard.catalog.passes.row.consumed",
  cancellation: "dashboard.catalog.passes.row.cancellation",
  transferable: "dashboard.catalog.passes.row.transferable",
  billing: "dashboard.catalog.passes.row.billing",
  gives: "dashboard.catalog.passes.row.gives",
  pause: "dashboard.catalog.passes.row.pause",
  cancel: "dashboard.catalog.passes.row.cancel",
  renewalFails: "dashboard.catalog.passes.row.renewalFails",
  eligibility: "dashboard.catalog.passes.row.eligibility",
  amounts: "dashboard.catalog.passes.row.amounts",
  valid: "dashboard.catalog.passes.row.valid",
  use: "dashboard.catalog.passes.row.use",
  partial: "dashboard.catalog.passes.row.partial",
  concurrent: "dashboard.catalog.passes.row.concurrent",
  reporting: "dashboard.catalog.passes.row.reporting",
};

const CARDS = [
  { id: "pass", title: "dashboard.catalog.passes.pass.title", kind: "dashboard.catalog.passes.pass.kind", rows: ["price", "credits", "eligible", "activation", "expiry", "consumed", "cancellation", "transferable"] },
  { id: "membership", title: "dashboard.catalog.passes.membership.title", kind: "dashboard.catalog.passes.membership.kind", rows: ["billing", "gives", "pause", "cancel", "renewalFails", "eligibility"] },
  { id: "gift", title: "dashboard.catalog.passes.gift.title", kind: "dashboard.catalog.passes.gift.kind", rows: ["amounts", "valid", "use", "partial", "concurrent", "reporting"] },
] as const;

export function CatalogPasses(_props: { nav: CatalogNav }) {
  const t = useT();
  const reason = t("dashboard.catalog.passes.reason");
  return (
    <div className="flex flex-col gap-[14px] leading-[1.2]" data-testid="catalog-passes">
      <PageHeading
        title={t("dashboard.catalog.passes.title")}
        intro={t("dashboard.catalog.passes.intro")}
        actions={
          <ActionButton tone="primary" reason={reason} testId="catalog-passes-create">
            <Icon name="plus" size={14} stroke={1.75} />
            {t("dashboard.catalog.passes.create")}
          </ActionButton>
        }
      />
      <UsedIn
        count={2}
        label={t("dashboard.catalog.usedIn.label")}
        parts={[
          { where: t("dashboard.catalog.usedIn.pos"), what: t("dashboard.catalog.passes.usedPos") },
          { where: t("dashboard.catalog.usedIn.web"), what: t("dashboard.catalog.passes.usedWeb") },
        ]}
        note={t("dashboard.catalog.passes.usedNote")}
      />
      {/* The board's three cards: the title and its kind on one line, 37px key/value rows, `Edit` across the foot. */}
      <div className="grid grid-cols-3 items-stretch gap-[16px]">
        {CARDS.map((c) => (
          <div key={c.id} className={`${CARD} flex flex-col px-[16px] pb-[16px] pt-[14px]`} data-testid={`catalog-passes-${c.id}`} title={reason}>
            <div className="flex items-center justify-between gap-[8px] pb-[6px]">
              <span className="font-admin-body text-[14px] font-semibold text-admin-ink">{t(c.title)}</span>
              <StatePill tone="indigo">{t(c.kind)}</StatePill>
            </div>
            <div>
              {c.rows.map((r) => (
                <div key={r} className="flex h-[37px] items-center justify-between gap-[12px] border-b border-admin-border-soft font-admin-body text-admin-13 leading-[1.2] last:border-b-0">
                  <span className="text-admin-ink-muted">{t(ROW_KEY[r] ?? r)}</span>
                  <span className="text-right font-semibold text-admin-ink-dim">{t("dashboard.catalog.passes.notDecided")}</span>
                </div>
              ))}
            </div>
            <div className="pt-[14px]">
              <CardButton reason={reason}>{t("dashboard.catalog.passes.edit")}</CardButton>
            </div>
          </div>
        ))}
      </div>
      <p role="status" data-testid="catalog-passes-reason" className="m-0 font-admin-body text-[12px] leading-[1.2] text-admin-ink-muted">
        {reason}
      </p>
    </div>
  );
}
