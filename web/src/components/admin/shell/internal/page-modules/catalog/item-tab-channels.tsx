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
import { Icon } from "../../primitives";
import type { TabProps } from "./CatalogItemEditor";
import { itemChannels } from "./catalog-model";
import { CARD, ChannelRow, Eyebrow, Field, INPUT, Note, SectionHead, SELECT, SelectShell, Switch } from "./catalog-ui";

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
      {/* W06 draws the four policy selects under the channels; the Policies tab holds the wired switches as well. The rule sentence is the right column's note. */}
      <SectionHead title={t("dashboard.catalog.policies.title")} />
      <PolicyFields />
    </>
  );
}

/** The board's four policy selects (Returns · Refund policy · Discounts · Comp allowed), each disabled with the one sentence (D-POS-51). */
function PolicyFields() {
  const t = useT();
  const reason = t("dashboard.catalog.policies.reason");
  return (
    <div className="grid grid-cols-4 gap-[16px]" data-testid="catalog-policy-fields">
      <Field label={t("dashboard.catalog.policies.returns")} reason={reason}>
        <SelectShell><select disabled className={SELECT}>
          <option>{t("dashboard.catalog.dash")}</option>
        </select></SelectShell>
      </Field>
      <Field label={t("dashboard.catalog.policies.refundPolicy")} reason={reason} quiet>
        <SelectShell><select disabled className={SELECT}>
          <option>{t("dashboard.catalog.dash")}</option>
        </select></SelectShell>
      </Field>
      <Field label={t("dashboard.catalog.policies.discounts")} reason={reason} quiet>
        <SelectShell><select disabled className={SELECT}>
          <option>{t("dashboard.catalog.policies.discountable")}</option>
        </select></SelectShell>
      </Field>
      <Field label={t("dashboard.catalog.policies.comp")} reason={reason} quiet>
        <SelectShell><select disabled className={SELECT}>
          <option>{t("dashboard.catalog.dash")}</option>
        </select></SelectShell>
      </Field>
    </div>
  );
}

export function PoliciesTab({ item, patch, saving }: TabProps) {
  const t = useT();
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
          <SelectShell><select
            value={item.identityReason ?? "attendee_names"}
            disabled={saving || !item.requiresIdentity}
            data-testid="catalog-field-identity-reason"
            onChange={(e) => patch({ identityReason: e.target.value as IdentityReason })}
            className={SELECT}
          >
            {IDENTITY_REASONS.map((r) => (
              <option key={r} value={r}>
                {t(IDENTITY_KEY[r])}
              </option>
            ))}
          </select></SelectShell>
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
      </div>
      <PolicyFields />
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
      {/* The board's four white cards, one per surface, a check where the item shows. */}
      <div className="flex flex-col gap-[8px]" data-testid="catalog-side-visible">
        <VisibleCard on={channels.includes("pos")} name={t("dashboard.catalog.side.counterTile")} value={channels.includes("pos") ? placement : hidden} />
        <VisibleCard on={false} name={t("dashboard.catalog.side.tablesMenu")} value={t("dashboard.catalog.dash")} reason={t("dashboard.catalog.channels.reason")} />
        <VisibleCard on={false} name={t("dashboard.catalog.channels.tableQr")} value={t("dashboard.catalog.dash")} reason={t("dashboard.catalog.channels.reason")} />
        <VisibleCard
          on={channels.includes("website")}
          name={t("dashboard.catalog.channels.website")}
          value={channels.includes("website") ? `${t("dashboard.catalog.side.menu")} › ${item.category ?? t("dashboard.catalog.channels.allItems")}` : hidden}
        />
      </div>
      <Note>{t("dashboard.catalog.side.channelOffNote")}</Note>
    </>
  );
}

function VisibleCard({ on, name, value, reason }: { on: boolean; name: string; value: string; reason?: string }) {
  return (
    <div className={`${CARD} flex h-[32px] items-center gap-[8px] px-[12px] font-admin-body leading-[1.2]`} title={reason} data-state={on ? "on" : "off"}>
      <span className={`inline-flex w-[14px] shrink-0 items-center justify-center ${on ? "text-admin-green" : "text-admin-ink-dim"}`} aria-hidden>
        {on ? <Icon name="check" size={13} stroke={2.25} /> : <span className="block h-[1.5px] w-[9px] bg-current" />}
      </span>
      <span className={`min-w-0 flex-1 truncate text-[13px] font-semibold ${on ? "text-admin-ink" : "text-admin-ink-muted"}`}>{name}</span>
      <span className="shrink-0 text-[12px] text-admin-ink-muted">{value}</span>
    </div>
  );
}
