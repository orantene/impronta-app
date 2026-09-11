"use client";

/**
 * item-tab-channels — W06_ProductChannels: `Where it can be sold` (six
 * channel rows with a switch and a price override), then `Policies` as its
 * own tab, and the right column (`Visible on`).
 *
 * TWO SWITCHES ARE THE ENGINE'S: Website (`visibility`: `agency_only` is
 * "staff can sell it, the site does not show it") and POS · Counter
 * (`status`: the counter's `addLine` refuses anything not `published`).
 * Tables, Table QR, the talent profile and a private link have no flag on the
 * row, and a price override no column; each is drawn disabled with its
 * sentence (D-POS-50). Under Policies the identity rule (`requires_identity`
 * + its reason) and `require_account_to_book` are wired; returns, refund
 * policy, discountability and comps are not (D-POS-51).
 */

import { useT } from "@/i18n/use-t";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import {
  formatOfferingPrice,
  IDENTITY_REASONS,
  type IdentityReason,
  type TalentOffering,
} from "@/lib/talent/offerings-types";
import { FactRow } from "../appointments-classes-ui";
import type { TabProps } from "./CatalogItemEditor";
import { itemChannels } from "./catalog-model";
import { CARD, ChannelRow, Eyebrow, Field, INPUT, Note, SectionHead, Switch } from "./catalog-ui";

const IDENTITY_KEY: Record<IdentityReason, string> = {
  attendee_names: "dashboard.catalog.policies.identity.attendee_names",
  delivery: "dashboard.catalog.policies.identity.delivery",
  entitlement: "dashboard.catalog.policies.identity.entitlement",
};

export function ChannelsTab({ item, patch, saving }: TabProps) {
  const t = useT();
  const locale = useDashboardLocale();
  const price = item.amountCents == null ? t("dashboard.catalog.dash") : formatOfferingPrice(item.amountCents, item.currency, locale);
  const published = item.status === "published";
  const onWebsite = item.visibility !== "agency_only";
  const reason = t("dashboard.catalog.channels.reason");
  const overrideReason = t("dashboard.catalog.channels.overrideReason");
  const placement = item.isFeatured ? t("dashboard.catalog.channels.favorites") : item.category ?? t("dashboard.catalog.channels.allItems");

  return (
    <>
      <SectionHead title={t("dashboard.catalog.channels.title")} intro={t("dashboard.catalog.channels.intro")} />
      <div className={CARD} title={overrideReason} data-testid="catalog-channels">
        <ChannelRow
          name={t("dashboard.catalog.channels.website")}
          note={published ? t("dashboard.catalog.channels.websiteNote") : t("dashboard.catalog.channels.needsPublish")}
          on={onWebsite}
          reason={saving ? t("dashboard.catalog.saving") : null}
          onChange={(next) => patch({ visibility: next ? "public" : "agency_only" })}
          override={price}
          overrideLabel={t("dashboard.catalog.channels.priceOverride")}
          testId="catalog-channel-website"
        />
        <ChannelRow
          name={t("dashboard.catalog.channels.posCounter")}
          note={published ? placement : t("dashboard.catalog.channels.counterOff")}
          on={published}
          reason={saving ? t("dashboard.catalog.saving") : null}
          onChange={(next) => patch({ status: next ? "published" : "draft" })}
          override={price}
          overrideLabel={t("dashboard.catalog.channels.priceOverride")}
          testId="catalog-channel-pos"
        />
        <ChannelRow name={t("dashboard.catalog.channels.posTables")} note={t("dashboard.catalog.channels.posTablesNote")} on={false} reason={reason} override={t("dashboard.catalog.dash")} overrideLabel={t("dashboard.catalog.channels.priceOverride")} />
        <ChannelRow name={t("dashboard.catalog.channels.tableQr")} note={t("dashboard.catalog.channels.tableQrNote")} on={false} reason={reason} override={t("dashboard.catalog.dash")} overrideLabel={t("dashboard.catalog.channels.priceOverride")} />
        <ChannelRow name={t("dashboard.catalog.channels.profile")} note={t("dashboard.catalog.channels.profileNote")} on={false} reason={reason} override={t("dashboard.catalog.dash")} overrideLabel={t("dashboard.catalog.channels.priceOverride")} />
        <ChannelRow name={t("dashboard.catalog.channels.privateLink")} note={t("dashboard.catalog.channels.privateLinkNote")} on={false} reason={reason} override={t("dashboard.catalog.dash")} overrideLabel={t("dashboard.catalog.channels.priceOverride")} />
      </div>
      <p className="m-0 font-admin-body text-[12px] text-admin-ink-muted">{t("dashboard.catalog.channels.rule")}</p>
    </>
  );
}

export function PoliciesTab({ item, patch, saving }: TabProps) {
  const t = useT();
  const reason = t("dashboard.catalog.policies.reason");
  return (
    <>
      <SectionHead title={t("dashboard.catalog.policies.title")} intro={t("dashboard.catalog.policies.intro")} />
      <div className="grid grid-cols-2 gap-[14px]" data-testid="catalog-policies">
        <div className="flex items-center gap-[10px] rounded-[12px] border border-admin-border bg-admin-card px-[14px] py-[12px]">
          <Switch
            on={item.requiresIdentity}
            label={t("dashboard.catalog.policies.needsName")}
            reason={saving ? t("dashboard.catalog.saving") : null}
            onChange={(next) =>
              patch(next ? { requiresIdentity: true, identityReason: item.identityReason ?? "attendee_names" } : { requiresIdentity: false, identityReason: null })
            }
            testId="catalog-field-identity"
          />
          <div className="min-w-0 flex-1">
            <div className="font-admin-body text-[13px] font-semibold text-admin-ink">{t("dashboard.catalog.policies.needsName")}</div>
            <div className="font-admin-body text-[12px] text-admin-ink-muted">{t("dashboard.catalog.policies.needsNameNote")}</div>
          </div>
        </div>
        <Field label={t("dashboard.catalog.policies.why")} hint={item.requiresIdentity ? null : t("dashboard.catalog.policies.whyHint")}>
          <select
            value={item.identityReason ?? "attendee_names"}
            disabled={saving || !item.requiresIdentity}
            data-testid="catalog-field-identity-reason"
            onChange={(e) => patch({ identityReason: e.target.value as IdentityReason })}
            className={INPUT}
          >
            {IDENTITY_REASONS.map((r) => (
              <option key={r} value={r}>
                {t(IDENTITY_KEY[r])}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex items-center gap-[10px] rounded-[12px] border border-admin-border bg-admin-card px-[14px] py-[12px]">
          <Switch
            on={item.requireAccountToBook}
            label={t("dashboard.catalog.policies.requireAccount")}
            reason={saving ? t("dashboard.catalog.saving") : null}
            onChange={(next) => patch({ requireAccountToBook: next })}
            testId="catalog-field-require-account"
          />
          <div className="min-w-0 flex-1">
            <div className="font-admin-body text-[13px] font-semibold text-admin-ink">{t("dashboard.catalog.policies.requireAccount")}</div>
            <div className="font-admin-body text-[12px] text-admin-ink-muted">{t("dashboard.catalog.policies.requireAccountNote")}</div>
          </div>
        </div>
        <div className="flex items-center gap-[10px] rounded-[12px] border border-admin-border bg-admin-card px-[14px] py-[12px]">
          <Switch
            on={item.allowPayInPerson}
            label={t("dashboard.catalog.policies.payInPerson")}
            reason={saving ? t("dashboard.catalog.saving") : null}
            onChange={(next) => patch({ allowPayInPerson: next })}
            testId="catalog-field-pay-in-person"
          />
          <div className="min-w-0 flex-1">
            <div className="font-admin-body text-[13px] font-semibold text-admin-ink">{t("dashboard.catalog.policies.payInPerson")}</div>
            <div className="font-admin-body text-[12px] text-admin-ink-muted">{t("dashboard.catalog.policies.payInPersonNote")}</div>
          </div>
        </div>
        <Field label={t("dashboard.catalog.policies.returns")} reason={reason}>
          <select disabled className={INPUT}>
            <option>{t("dashboard.catalog.dash")}</option>
          </select>
        </Field>
        <Field label={t("dashboard.catalog.policies.refundPolicy")} reason={reason}>
          <select disabled className={INPUT}>
            <option>{t("dashboard.catalog.dash")}</option>
          </select>
        </Field>
        <Field label={t("dashboard.catalog.policies.discounts")} reason={reason}>
          <select disabled className={INPUT}>
            <option>{t("dashboard.catalog.policies.discountable")}</option>
          </select>
        </Field>
        <Field label={t("dashboard.catalog.policies.comp")} reason={reason}>
          <select disabled className={INPUT}>
            <option>{t("dashboard.catalog.dash")}</option>
          </select>
        </Field>
      </div>
    </>
  );
}

export function ChannelsSide({ item }: { item: TalentOffering }) {
  const t = useT();
  const channels = itemChannels(item);
  const placement = item.isFeatured ? t("dashboard.catalog.channels.favorites") : item.category ?? t("dashboard.catalog.channels.allItems");
  const hidden = t("dashboard.catalog.side.hidden");
  return (
    <>
      <Eyebrow>{t("dashboard.catalog.side.visibleOn")}</Eyebrow>
      <div className={`${CARD} px-[16px] py-[8px]`} data-testid="catalog-side-visible">
        <FactRow label={t("dashboard.catalog.side.counterTile")} muted={!channels.includes("pos")}>
          {channels.includes("pos") ? placement : hidden}
        </FactRow>
        <FactRow label={t("dashboard.catalog.side.tablesMenu")} muted>
          {t("dashboard.catalog.dash")}
        </FactRow>
        <FactRow label={t("dashboard.catalog.channels.tableQr")} muted>
          {t("dashboard.catalog.dash")}
        </FactRow>
        <FactRow label={t("dashboard.catalog.channels.website")} muted={!channels.includes("website")}>
          {channels.includes("website") ? `${t("dashboard.catalog.side.menu")} › ${item.category ?? t("dashboard.catalog.channels.allItems")}` : hidden}
        </FactRow>
      </div>
      <Note>{t("dashboard.catalog.side.channelOffNote")}</Note>
    </>
  );
}
