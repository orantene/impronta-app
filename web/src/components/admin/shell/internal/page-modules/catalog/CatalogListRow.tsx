"use client";

/**
 * CatalogListRow — one Catalog item, drawn twice: the phone row (MW21, under
 * 720px of viewport) and the desktop grid row (W01). Split out of
 * CatalogList so the row renders in isolation (`CatalogListRow.render.test.tsx`).
 *
 * The desktop row's columns follow the LIST CARD's width (`catalog-list-columns`):
 * the item name always has a real track, and the columns the card cannot hold
 * drop out instead of squeezing the name to nothing (B2).
 */

import type { ReactNode } from "react";
import Link from "next/link";

import { useT } from "@/i18n/use-t";
import { offeringPriceLabel, type TalentOffering } from "@/lib/talent/offerings-types";
import { formatDashboardMoneyCents } from "@/lib/money/dashboard-money-format";
import type { OfferingsEditor } from "@/components/talent/services/use-offerings-editor";
import { StatePill, type PillTone } from "../appointments-classes-ui";
import { MissingTranslationChip } from "./MissingTranslationChip";
import { NeedsPriceChip } from "./NeedsPriceChip";
import type { CatalogNav } from "./CatalogPage";
import { itemAvailability, itemChannels, itemStatus, itemType, type CatalogItemType, type CatalogStatus } from "./catalog-model";
import { BlockPill, Chip, ListRow, RowMenuButton, type BlockTone } from "./catalog-ui";
import { CELL_FROM_1080, CELL_FROM_680, CELL_FROM_680_FLEX, CELL_FROM_900, LIST_COLS } from "./catalog-list-columns";

export const TYPE_KEY: Record<CatalogItemType, string> = {
  product: "dashboard.catalog.type.product",
  service: "dashboard.catalog.type.service",
  package: "dashboard.catalog.type.package",
  custom: "dashboard.catalog.type.custom",
};

const STATUS_TONE: Record<CatalogStatus, PillTone & BlockTone> = { published: "green", draft: "coral", incomplete: "coral" };
const STATUS_KEY: Record<CatalogStatus, string> = {
  published: "dashboard.catalog.status.published",
  draft: "dashboard.catalog.status.draft",
  incomplete: "dashboard.catalog.status.incomplete",
};

/** The editor actions a row's menu calls. */
export type CatalogRowEditor = Pick<OfferingsEditor, "patchItem" | "duplicate" | "move">;

export function CatalogRow({
  item: o,
  index,
  count,
  locale,
  primary,
  locales,
  nav,
  editor,
  menuOpen,
  onMenu,
  onMenuClose,
  onRemove,
  onArchive,
}: {
  item: TalentOffering;
  index: number;
  count: number;
  locale: string;
  primary: string;
  locales: string[];
  nav: Pick<CatalogNav, "href" | "go">;
  editor: CatalogRowEditor;
  menuOpen: boolean;
  onMenu: () => void;
  onMenuClose: () => void;
  onRemove: () => void;
  onArchive: () => void;
}) {
  const t = useT();
  // The owner's own provider services are listed here but are not workspace
  // rows: the workspace delete matches nothing for them. Edit them under Services.
  const providerOwned = o.ownerKind === "talent";
  const type = itemType(o);
  const channels = itemChannels(o);
  const avail = itemAvailability(o);
  const { status } = itemStatus(o);
  const live = o.status === "published";
  const name = o.title || t("dashboard.catalog.untitled");
  const price = offeringPriceLabel(o, locale, formatDashboardMoneyCents);
  const availability =
    avail.mode === "unlimited"
      ? t("dashboard.catalog.availability.unlimited")
      : avail.soldOut
        ? t("dashboard.catalog.availability.soldOut")
        : avail.left == null
          ? t("dashboard.catalog.availability.stockPool")
          : t("dashboard.catalog.availability.stockLeft").replace("{n}", String(avail.left));

  return (
    <>
    {/* MW21: the phone's row — the item, then type · price · availability · channels, the status as a pill. */}
    <Link
      href={nav.href({ item: o.id })}
      prefetch={false}
      className="hidden items-center gap-[10px] border-t border-admin-border-soft px-[14px] py-[12px] no-underline max-[720px]:flex"
      data-testid="catalog-row-phone"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-admin-body text-[14.5px] font-semibold text-admin-ink">{name}</span>
        <span className="mt-[2px] block truncate font-admin-body text-admin-12h text-admin-ink-muted">
          {t(TYPE_KEY[type])} · {price} · {availability}
          {channels.includes("pos") ? ` · ${t("dashboard.catalog.channel.posCounter")}` : ""}
          {channels.includes("website") ? ` · ${t("dashboard.catalog.channel.website")}` : ""}
        </span>
        <NeedsPriceChip item={o} t={t} className="mt-[3px] block" />
        <MissingTranslationChip item={o} primary={primary} locales={locales} uiLocale={locale} t={t} className="mt-[3px] block" />
      </span>
      <StatePill tone={STATUS_TONE[status]} state={status}>
        {t(STATUS_KEY[status])}
      </StatePill>
    </Link>
    <ListRow cols={LIST_COLS} testId="catalog-row" className="relative max-[720px]:hidden">
      <span className="flex min-w-0 items-center gap-[8px]" data-testid="catalog-row-item">
        <Link
          href={nav.href({ item: o.id })}
          prefetch={false}
          title={name}
          className="min-w-0 truncate font-semibold text-admin-ink no-underline hover:underline"
          data-testid="catalog-row-title"
        >
          {name}
        </Link>
        <NeedsPriceChip item={o} t={t} />
        <MissingTranslationChip item={o} primary={primary} locales={locales} uiLocale={locale} t={t} />
      </span>
      <span className={`min-w-0 ${CELL_FROM_680}`}>
        <BlockPill tone="slate">{t(TYPE_KEY[type])}</BlockPill>
      </span>
      <span className={`min-w-0 flex-wrap items-center gap-x-[6px] gap-y-[4px] overflow-hidden ${CELL_FROM_680_FLEX}`}>
        {channels.length === 0 ? <span className="text-admin-ink-dim">{t("dashboard.catalog.channel.none")}</span> : null}
        {channels.includes("website") ? <Chip>{t("dashboard.catalog.channel.website")}</Chip> : null}
        {channels.includes("pos") ? <Chip tone="brand">{t("dashboard.catalog.channel.posCounter")}</Chip> : null}
      </span>
      <span className="min-w-0 truncate font-semibold tabular-nums" title={price}>{price}</span>
      <span className={`min-w-0 truncate text-admin-ink-muted ${CELL_FROM_900}`} title={availability}>{availability}</span>
      <span className={`text-admin-ink-muted ${CELL_FROM_1080}`} title={t("dashboard.catalog.preparation.reason")}>
        {t("dashboard.catalog.dash")}
      </span>
      <BlockPill tone={STATUS_TONE[status]} state={status} testId="catalog-row-status">
        {t(STATUS_KEY[status])}
      </BlockPill>
      <span className="relative flex justify-end">
        <RowMenuButton label={t("dashboard.catalog.rowMenu.label")} onClick={onMenu} testId="catalog-row-menu" />
        {menuOpen ? (
          <div
            role="menu"
            className="absolute right-0 top-[28px] z-20 flex w-[200px] flex-col rounded-[10px] border border-admin-border bg-admin-card p-[4px] shadow-admin-hover"
            onMouseLeave={onMenuClose}
          >
            <MenuItem onClick={() => nav.go({ item: o.id })}>{t("dashboard.catalog.rowMenu.open")}</MenuItem>
            <MenuItem onClick={() => { editor.patchItem(o.id, { status: live ? "draft" : "published" }); onMenuClose(); }}>
              {live ? t("dashboard.catalog.rowMenu.unpublish") : t("dashboard.catalog.rowMenu.publish")}
            </MenuItem>
            <MenuItem onClick={() => { editor.duplicate(o); onMenuClose(); }}>{t("dashboard.catalog.rowMenu.duplicate")}</MenuItem>
            <MenuItem disabled={index === 0} onClick={() => { editor.move(o.id, -1); onMenuClose(); }}>
              {t("dashboard.catalog.rowMenu.moveUp")}
            </MenuItem>
            <MenuItem disabled={index >= count - 1} onClick={() => { editor.move(o.id, 1); onMenuClose(); }}>
              {t("dashboard.catalog.rowMenu.moveDown")}
            </MenuItem>
            <MenuItem
              disabled={providerOwned}
              title={providerOwned ? t("dashboard.catalog.rowMenu.providerOwnedReason") : undefined}
              onClick={() => { onArchive(); onMenuClose(); }}
            >
              {t("dashboard.catalog.rowMenu.archive")}
            </MenuItem>
            <MenuItem
              danger
              disabled={providerOwned}
              title={providerOwned ? t("dashboard.catalog.rowMenu.providerOwnedReason") : undefined}
              onClick={() => { onRemove(); onMenuClose(); }}
            >
              {t("dashboard.catalog.rowMenu.delete")}
            </MenuItem>
          </div>
        ) : null}
      </span>
    </ListRow>
    </>
  );
}

function MenuItem({
  children,
  onClick,
  disabled,
  danger,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-[7px] px-[10px] py-[7px] text-left font-admin-body text-[12.5px] hover:bg-admin-surface-alt disabled:cursor-not-allowed disabled:opacity-40 ${
        danger ? "text-admin-red" : "text-admin-ink"
      }`}
    >
      {children}
    </button>
  );
}
