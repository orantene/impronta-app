"use client";

/**
 * CatalogCreateType — W02_CreateItemType: "What are you selling?", nine
 * cards in three columns, `Cancel` and `Continue · <Type>`.
 *
 * Four cards write to this catalog (Product, Service, Custom service by
 * quote, Package): Continue starts the draft and opens the editor on it.
 * Three are sold by another destination (a class is a series under
 * Appointments & Classes, a ticket-linked offering is composed under Events,
 * a space service is a Spaces unit): Continue is a door to that destination.
 * Two wait on a product decision (Pass or membership, Gift card): the card
 * is disabled with the sentence (D-POS-44).
 */

import { useState } from "react";

import { useT } from "@/i18n/use-t";
import { Icon } from "../../primitives";
import type { OfferingsEditor } from "@/components/talent/services/use-offerings-editor";
import { ActionButton } from "../appointments-classes-ui";
import { NEW_ITEM, type CatalogNav } from "./CatalogPage";
import { CREATE_TYPE_CARDS, type CreateTypeCard } from "./catalog-model";
import { PageHeading } from "./catalog-ui";

const CARD_KEY: Record<CreateTypeCard["id"], { title: string; note: string; sold: string }> = {
  product: { title: "dashboard.catalog.create.product.title", note: "dashboard.catalog.create.product.note", sold: "dashboard.catalog.create.product.sold" },
  service: { title: "dashboard.catalog.create.service.title", note: "dashboard.catalog.create.service.note", sold: "dashboard.catalog.create.service.sold" },
  class: { title: "dashboard.catalog.create.class.title", note: "dashboard.catalog.create.class.note", sold: "dashboard.catalog.create.class.sold" },
  ticket: { title: "dashboard.catalog.create.ticket.title", note: "dashboard.catalog.create.ticket.note", sold: "dashboard.catalog.create.ticket.sold" },
  space: { title: "dashboard.catalog.create.space.title", note: "dashboard.catalog.create.space.note", sold: "dashboard.catalog.create.space.sold" },
  custom: { title: "dashboard.catalog.create.custom.title", note: "dashboard.catalog.create.custom.note", sold: "dashboard.catalog.create.custom.sold" },
  package: { title: "dashboard.catalog.create.package.title", note: "dashboard.catalog.create.package.note", sold: "dashboard.catalog.create.package.sold" },
  pass: { title: "dashboard.catalog.create.pass.title", note: "dashboard.catalog.create.pass.note", sold: "dashboard.catalog.create.pass.sold" },
  gift: { title: "dashboard.catalog.create.gift.title", note: "dashboard.catalog.create.gift.note", sold: "dashboard.catalog.create.gift.sold" },
};

const CARD_ICON: Record<CreateTypeCard["id"], "archive" | "calendar" | "team" | "star" | "map-pin" | "pencil" | "layers" | "credit" | "sparkle"> = {
  product: "archive",
  service: "calendar",
  class: "team",
  ticket: "star",
  space: "map-pin",
  custom: "pencil",
  package: "layers",
  pass: "credit",
  gift: "sparkle",
};

export function CatalogCreateType({ editor, nav }: { editor: OfferingsEditor; nav: CatalogNav }) {
  const t = useT();
  const [picked, setPicked] = useState<CreateTypeCard["id"]>("product");
  const card = CREATE_TYPE_CARDS.find((c) => c.id === picked) ?? CREATE_TYPE_CARDS[0]!;
  const blocked = !card.seed && !card.destination;
  const continueLabel = `${t("dashboard.catalog.create.continue")} · ${t(CARD_KEY[card.id].title)}`;

  function proceed() {
    if (card.seed) {
      editor.startAdd(card.seed);
      nav.go({ item: NEW_ITEM });
    }
  }

  return (
    <div className="flex flex-col gap-[16px]" data-testid="catalog-create-type">
      <PageHeading title={t("dashboard.catalog.create.title")} intro={t("dashboard.catalog.create.intro")} />
      <div role="radiogroup" aria-label={t("dashboard.catalog.create.title")} className="grid grid-cols-3 gap-[12px]">
        {CREATE_TYPE_CARDS.map((c) => {
          const active = c.id === picked;
          const off = !c.seed && !c.destination;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={active}
              data-testid={`catalog-create-${c.id}`}
              data-not-wired={off ? "true" : undefined}
              title={off ? t("dashboard.catalog.passes.reason") : undefined}
              onClick={() => setPicked(c.id)}
              className={`flex cursor-pointer flex-col gap-[8px] rounded-[14px] border-[1.5px] p-[16px] text-left font-admin-body ${
                active ? "border-admin-brand bg-admin-brand-soft" : "border-admin-border bg-admin-card hover:border-admin-border-strong"
              } ${off ? "opacity-60" : ""}`}
            >
              <span className="inline-flex h-[36px] w-[36px] items-center justify-center rounded-[10px] bg-admin-surface-alt text-admin-ink">
                <Icon name={CARD_ICON[c.id]} size={18} stroke={1.75} />
              </span>
              <span className="text-[14px] font-semibold text-admin-ink">{t(CARD_KEY[c.id].title)}</span>
              <span className="flex-1 text-[12px] leading-[1.45] text-admin-ink-muted">{t(CARD_KEY[c.id].note)}</span>
              <span className="text-[11px] font-semibold text-admin-brand">{t(CARD_KEY[c.id].sold)}</span>
            </button>
          );
        })}
      </div>
      {blocked ? (
        <p role="status" data-testid="catalog-create-blocked" className="m-0 rounded-[10px] bg-admin-coral-soft px-[12px] py-[10px] font-admin-body text-[12.5px] text-admin-coral-deep">
          {t("dashboard.catalog.passes.reason")}
        </p>
      ) : card.destination ? (
        <p role="status" className="m-0 rounded-[10px] bg-admin-indigo-soft px-[12px] py-[10px] font-admin-body text-[12.5px] text-admin-indigo">
          {t("dashboard.catalog.create.elsewhere")}
        </p>
      ) : null}
      <div className="flex items-center gap-[8px]">
        <ActionButton onClick={() => nav.go({ view: "items" })} testId="catalog-create-cancel">
          {t("dashboard.catalog.create.cancel")}
        </ActionButton>
        <span className="flex-1" />
        {card.destination ? (
          <a href={`${nav.base}${card.destination.replace(/^\/admin/, "")}`} data-testid="catalog-create-continue" className="inline-flex h-[34px] items-center justify-center gap-[6px] whitespace-nowrap rounded-[9px] border border-admin-brand bg-admin-brand px-[14px] font-admin-body text-admin-13 font-semibold text-white no-underline hover:bg-admin-brand-deep">
            {continueLabel}
          </a>
        ) : (
          <ActionButton tone="primary" onClick={proceed} reason={blocked ? t("dashboard.catalog.passes.reason") : null} testId="catalog-create-continue">
            {continueLabel}
          </ActionButton>
        )}
      </div>
    </div>
  );
}
