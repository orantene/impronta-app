"use client";

/**
 * CatalogItemEditor — one item, as boards W03 to W06 draw it: the title with
 * its meta line, `Draft changes`, `Preview on POS` · `Save draft` ·
 * `Publish`, the `Used in` line, the seven tabs, the tab's body on the left
 * and the right column (340px) that changes with the tab.
 *
 * A SAVED ITEM WRITES ON BLUR through the shared editor hook (optimistic,
 * rolled back on refusal, the refusal a sentence under the header). A DRAFT
 * (`?item=new`) is held in the hook until `Save draft` or `Publish` inserts
 * it; the tabs that need an id (Options, Availability) say so.
 */

import type { ReactNode } from "react";

import { useT } from "@/i18n/use-t";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import type { OfferingsEditor } from "@/components/talent/services/use-offerings-editor";
import { formatOfferingPrice, type TalentOffering } from "@/lib/talent/offerings-types";
import { ActionButton, Outcome, StatePill, UsedIn } from "../appointments-classes-ui";
import type { CatalogNav } from "./CatalogPage";
import { ITEM_TABS, PUBLISH_BLOCKER_KEY, itemType, publishBlockers, type ItemTab } from "./catalog-model";
import { TabStrip } from "./catalog-ui";
import { DetailsTab } from "./item-tab-details";
import { PricingTab, PricingSide } from "./item-tab-pricing";
import { OptionsTab, OptionsSide } from "./item-tab-options";
import { AvailabilityTab, AvailabilitySide, FulfillmentTab } from "./item-tab-availability";
import { ChannelsTab, ChannelsSide, PoliciesTab } from "./item-tab-channels";

export type ItemPatch = (p: Partial<TalentOffering>) => void;

export type TabProps = {
  item: TalentOffering;
  patch: ItemPatch;
  editor: OfferingsEditor;
  tenantId: string;
  isDraft: boolean;
  saving: boolean;
};

const TAB_KEY: Record<ItemTab, string> = {
  details: "dashboard.catalog.tab.details",
  pricing: "dashboard.catalog.tab.pricing",
  options: "dashboard.catalog.tab.options",
  availability: "dashboard.catalog.tab.availability",
  fulfillment: "dashboard.catalog.tab.fulfillment",
  channels: "dashboard.catalog.tab.channels",
  policies: "dashboard.catalog.tab.policies",
};

const TYPE_KEY = {
  product: "dashboard.catalog.type.product",
  service: "dashboard.catalog.type.service",
  package: "dashboard.catalog.type.package",
  custom: "dashboard.catalog.type.custom",
} as const;

export function CatalogItemEditor({
  editor,
  item,
  nav,
  tenantId,
  isDraft = false,
}: {
  editor: OfferingsEditor;
  item: TalentOffering;
  nav: CatalogNav;
  tenantId: string;
  isDraft?: boolean;
}) {
  const t = useT();
  const locale = useDashboardLocale();
  const patch: ItemPatch = isDraft
    ? (p) => editor.setDraft((d) => (d ? { ...d, ...p } : d))
    : (p) => editor.patchItem(item.id, p);

  const blockers = publishBlockers(item).map((code) => t(PUBLISH_BLOCKER_KEY[code]));
  const canPublish = blockers.length === 0;

  async function persist(status: TalentOffering["status"]) {
    if (isDraft) {
      // The hook validates and inserts the draft it holds, with the status
      // applied on top so the insert carries it.
      const saved = await editor.saveDraft({ status });
      if (saved) {
        nav.go({ item: saved.id, tab: nav.tab });
        editor.setDraft(null);
      }
      return;
    }
    editor.patchItem(item.id, { status });
  }

  const meta = [
    t(TYPE_KEY[itemType(item)]),
    item.category ?? null,
    isDraft ? t("dashboard.catalog.editor.unsaved") : `ID ${item.id.slice(0, 8)}`,
    item.status === "published" ? t("dashboard.catalog.status.published") : t("dashboard.catalog.status.draft"),
  ]
    .filter(Boolean)
    .join(" · ");

  const tabs = ITEM_TABS.map((id) => ({
    id,
    label: t(TAB_KEY[id]),
    href: nav.href({ item: isDraft ? "new" : item.id, tab: id }),
    active: nav.tab === id,
  }));

  const tabProps: TabProps = { item, patch, editor, tenantId, isDraft, saving: editor.saving };
  const price = item.amountCents == null ? t("dashboard.catalog.dash") : formatOfferingPrice(item.amountCents, item.currency, locale);

  let body: ReactNode;
  let side: ReactNode;
  switch (nav.tab) {
    case "pricing":
      body = <PricingTab {...tabProps} />;
      side = <PricingSide item={item} price={price} blockers={blockers} />;
      break;
    case "options":
      body = <OptionsTab {...tabProps} />;
      side = <OptionsSide item={item} />;
      break;
    case "availability":
      body = <AvailabilityTab {...tabProps} />;
      side = <AvailabilitySide item={item} />;
      break;
    case "fulfillment":
      body = <FulfillmentTab {...tabProps} />;
      side = <AvailabilitySide item={item} />;
      break;
    case "channels":
      body = <ChannelsTab {...tabProps} />;
      side = <ChannelsSide item={item} />;
      break;
    case "policies":
      body = <PoliciesTab {...tabProps} />;
      side = <ChannelsSide item={item} />;
      break;
    case "details":
    default:
      body = <DetailsTab {...tabProps} />;
      side = <PricingSide item={item} price={price} blockers={blockers} />;
  }

  return (
    <div className="-mx-[28px] -mt-[24px] grid min-w-0 grid-cols-[minmax(0,1fr)_340px]" data-testid="catalog-item-editor">
      <div className="flex min-w-0 flex-col">
        <div className="flex flex-col gap-[12px] px-[28px] pt-[18px]">
          <header className="flex items-center justify-between gap-[12px]">
            <div className="min-w-0">
              <h1 className="m-0 truncate font-admin-body text-[22px]! font-semibold leading-[1.15] tracking-[-0.02em] text-admin-ink" data-testid="catalog-item-title">
                {item.title || t("dashboard.catalog.untitled")}
              </h1>
              <p className="m-0 mt-[4px] font-admin-body text-admin-13 text-admin-ink-muted">{meta}</p>
            </div>
            <div className="flex shrink-0 items-center gap-[8px]">
              {item.status !== "published" ? <StatePill tone="coral">{t("dashboard.catalog.editor.draftChanges")}</StatePill> : null}
              <ActionButton reason={t("dashboard.catalog.editor.previewReason")} testId="catalog-preview-pos">
                {t("dashboard.catalog.editor.previewPos")}
              </ActionButton>
              <ActionButton onClick={() => void persist("draft")} disabled={editor.saving} testId="catalog-save-draft">
                {t("dashboard.catalog.editor.saveDraft")}
              </ActionButton>
              <ActionButton
                tone="primary"
                onClick={() => void persist("published")}
                disabled={editor.saving || !canPublish}
                reason={canPublish ? null : blockers[0]}
                testId="catalog-publish"
              >
                {t("dashboard.catalog.editor.publish")}
              </ActionButton>
            </div>
          </header>
          {editor.error ? (
            <Outcome kind="refused" testId="catalog-editor-refusal">
              {editor.error}
            </Outcome>
          ) : null}
          <UsedIn
            count={2}
            label={t("dashboard.catalog.usedIn.label")}
            parts={[
              { where: t("dashboard.catalog.usedIn.pos"), what: t("dashboard.catalog.usedIn.itemPos") },
              { where: t("dashboard.catalog.usedIn.web"), what: t("dashboard.catalog.usedIn.itemWeb") },
            ]}
          />
          <TabStrip label={t("dashboard.catalog.tab.label")} tabs={tabs} />
        </div>
        <div className="flex flex-col gap-[16px] px-[28px] py-[18px]">{body}</div>
        <div className="min-h-[16px] px-[28px] pb-[12px] font-admin-body text-[11px]">
          {editor.saving ? <span className="text-admin-ink-muted">{t("dashboard.catalog.saving")}</span> : null}
          {editor.savedOk && !editor.saving ? <span className="text-admin-green">{t("dashboard.catalog.saved")}</span> : null}
        </div>
      </div>
      <aside className="flex min-w-0 flex-col gap-[12px] border-l border-admin-border bg-admin-surface p-[18px]" data-testid="catalog-item-side">
        {side}
      </aside>
    </div>
  );
}
