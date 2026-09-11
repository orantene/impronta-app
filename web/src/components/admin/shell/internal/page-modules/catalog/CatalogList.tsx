"use client";

/**
 * CatalogList — W01_CatalogItems: the title and its sentence, `Import` and
 * `Create item`, the five segments (Items · Packages · Price lists ·
 * Promotions · Passes & cards), the four filter chips, then one card of rows
 * (Item · Type · Channels · Price · Availability · Preparation · Status · a
 * row menu) and the `Used in` footer.
 *
 * Every row is the reader's; every column is a judgement from
 * `catalog-model`. Preparation is a dash: no column records a station or a
 * prep time (D-POS-46). Location is one chip disabled with its reason: one
 * catalog per workspace, no per-location rows (D-POS-45).
 */

import { useState, type ReactNode } from "react";
import Link from "next/link";

import { useT } from "@/i18n/use-t";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { Icon } from "../../primitives";
import { offeringPriceLabel, type TalentOffering } from "@/lib/talent/offerings-types";
import type { OfferingsEditor } from "@/components/talent/services/use-offerings-editor";
import { ActionButton, FilterChip, Outcome, StatePill, ToggleChip, UsedIn, type PillTone } from "../appointments-classes-ui";
import { MenuImportPanel } from "../MenuImportPanel";
import type { CatalogNav } from "./CatalogPage";
import {
  DEFAULT_FILTERS,
  filterItems,
  itemAvailability,
  itemChannels,
  itemStatus,
  itemType,
  type CatalogItemType,
  type CatalogStatus,
  type CatalogView,
  type ListFilters,
} from "./catalog-model";
import { CARD, ListHead, ListRow, Note, PageHeading, RowMenuButton, SegmentLinks } from "./catalog-ui";

const COLS = "grid-cols-[1.5fr_110px_1.3fr_90px_140px_110px_140px_30px]";

const TYPE_KEY: Record<CatalogItemType, string> = {
  product: "dashboard.catalog.type.product",
  service: "dashboard.catalog.type.service",
  package: "dashboard.catalog.type.package",
  custom: "dashboard.catalog.type.custom",
};

const STATUS_TONE: Record<CatalogStatus, PillTone> = { published: "green", draft: "coral", incomplete: "coral" };
const STATUS_KEY: Record<CatalogStatus, string> = {
  published: "dashboard.catalog.status.published",
  draft: "dashboard.catalog.status.draft",
  incomplete: "dashboard.catalog.status.incomplete",
};

export function CatalogList({ editor, nav }: { editor: OfferingsEditor; nav: CatalogNav }) {
  const t = useT();
  const locale = useDashboardLocale();
  const [filters, setFilters] = useState<ListFilters>(DEFAULT_FILTERS);
  const [importOpen, setImportOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const packagesView = nav.view === "packages";
  const scoped = packagesView ? editor.items.filter((o) => o.kind === "package") : editor.items;
  const rows = filterItems(scoped, packagesView ? { ...filters, type: "all" } : filters);

  const segments: ReadonlyArray<{ id: CatalogView | "promotions"; label: string; href: string; active: boolean }> = [
    { id: "items", label: t("dashboard.catalog.segment.items"), href: nav.href({ view: "items" }), active: nav.view === "items" },
    { id: "packages", label: t("dashboard.catalog.segment.packages"), href: nav.href({ view: "packages" }), active: nav.view === "packages" },
    { id: "price-lists", label: t("dashboard.catalog.segment.priceLists"), href: nav.href({ view: "price-lists" }), active: nav.view === "price-lists" },
    { id: "promotions", label: t("dashboard.catalog.segment.promotions"), href: `${nav.base}/discounts`, active: false },
    { id: "passes", label: t("dashboard.catalog.segment.passes"), href: nav.href({ view: "passes" }), active: nav.view === "passes" },
  ];

  return (
    <div className="flex flex-col gap-[16px]" data-testid="catalog-list">
      <PageHeading
        title={t("dashboard.catalog.list.title")}
        intro={t("dashboard.catalog.list.intro")}
        actions={
          <>
            <ActionButton onClick={() => setImportOpen((v) => !v)} testId="catalog-import">
              {t("dashboard.catalog.list.import")}
            </ActionButton>
            <ActionButton tone="primary" onClick={() => nav.go({ create: true })} testId="catalog-create-item">
              <Icon name="plus" size={14} stroke={1.75} />
              {t("dashboard.catalog.list.createItem")}
            </ActionButton>
          </>
        }
      />

      <MenuImportPanel tenantId={editor.workspaceTenantId} open={importOpen} onClose={() => setImportOpen(false)} />

      <div className="flex flex-wrap items-center gap-[8px] max-[720px]:flex-col max-[720px]:items-stretch">
        <SegmentLinks label={t("dashboard.catalog.segment.label")} items={segments} />
        <span className="flex-1" />
        <div className="hidden max-[720px]:contents">
        <FilterChip
          label={t("dashboard.catalog.filter.type")}
          value={packagesView ? "package" : filters.type}
          reason={packagesView ? t("dashboard.catalog.filter.typeFixedByView") : null}
          options={[
            { id: "all", label: t("dashboard.catalog.filter.all") },
            { id: "product", label: t(TYPE_KEY.product) },
            { id: "service", label: t(TYPE_KEY.service) },
            { id: "package", label: t(TYPE_KEY.package) },
            { id: "custom", label: t(TYPE_KEY.custom) },
          ]}
          onChange={(id) => setFilters((f) => ({ ...f, type: id as ListFilters["type"] }))}
        />
        <FilterChip
          label={t("dashboard.catalog.filter.location")}
          value="all"
          reason={t("dashboard.catalog.filter.locationReason")}
          options={[{ id: "all", label: t("dashboard.catalog.filter.all") }]}
          onChange={() => undefined}
        />
        <FilterChip
          label={t("dashboard.catalog.filter.channel")}
          value={filters.channel}
          options={[
            { id: "any", label: t("dashboard.catalog.filter.any") },
            { id: "website", label: t("dashboard.catalog.channel.website") },
            { id: "pos", label: t("dashboard.catalog.channel.posCounter") },
          ]}
          onChange={(id) => setFilters((f) => ({ ...f, channel: id as ListFilters["channel"] }))}
        />
        <ToggleChip
          label={t("dashboard.catalog.filter.incompleteOnly")}
          on={filters.incompleteOnly}
          onChange={(on) => setFilters((f) => ({ ...f, incompleteOnly: on }))}
        />
        </div>
      </div>
      {/* MW21: full editing lives on the desktop; the phone changes availability, price and essentials. */}
      <div className="hidden max-[720px]:block">
        <Note>{t("dashboard.catalog.list.phoneScope")}</Note>
      </div>

      {editor.error ? (
        <Outcome kind="refused" testId="catalog-refusal">
          {editor.error}
        </Outcome>
      ) : null}

      <div className={`${CARD} overflow-visible`}>
        <ListHead cols={COLS}>
          <span>{t("dashboard.catalog.col.item")}</span>
          <span>{t("dashboard.catalog.col.type")}</span>
          <span>{t("dashboard.catalog.col.channels")}</span>
          <span>{t("dashboard.catalog.col.price")}</span>
          <span>{t("dashboard.catalog.col.availability")}</span>
          <span>{t("dashboard.catalog.col.preparation")}</span>
          <span>{t("dashboard.catalog.col.status")}</span>
          <span />
        </ListHead>
        {rows.length === 0 ? (
          <p className="m-0 border-t border-admin-border-soft px-[18px] py-[22px] text-center font-admin-body text-admin-13 text-admin-ink-muted" data-testid="catalog-empty">
            {editor.items.length === 0 ? t("dashboard.catalog.list.empty") : t("dashboard.catalog.list.noMatch")}
          </p>
        ) : (
          rows.map((o, idx) => (
            <CatalogRow
              key={o.id}
              item={o}
              index={idx}
              count={rows.length}
              locale={locale}
              nav={nav}
              editor={editor}
              menuOpen={menuFor === o.id}
              onMenu={() => setMenuFor((cur) => (cur === o.id ? null : o.id))}
              onMenuClose={() => setMenuFor(null)}
            />
          ))
        )}
      </div>

      <UsedIn
        count={2}
        label={t("dashboard.catalog.usedIn.label")}
        parts={[
          { where: t("dashboard.catalog.usedIn.pos"), what: t("dashboard.catalog.usedIn.posParts") },
          { where: t("dashboard.catalog.usedIn.web"), what: t("dashboard.catalog.usedIn.webParts") },
        ]}
      />
      <div className="-mt-[8px] font-admin-body text-[11.5px] text-admin-ink-dim">{t("dashboard.catalog.usedIn.rule")}</div>

      <div className="min-h-[16px] font-admin-body text-[11px]">
        {editor.saving ? <span className="text-admin-ink-muted">{t("dashboard.catalog.saving")}</span> : null}
        {editor.savedOk && !editor.saving ? <span className="text-admin-green">{t("dashboard.catalog.saved")}</span> : null}
      </div>
    </div>
  );
}

function CatalogRow({
  item: o,
  index,
  count,
  locale,
  nav,
  editor,
  menuOpen,
  onMenu,
  onMenuClose,
}: {
  item: TalentOffering;
  index: number;
  count: number;
  locale: string;
  nav: CatalogNav;
  editor: OfferingsEditor;
  menuOpen: boolean;
  onMenu: () => void;
  onMenuClose: () => void;
}) {
  const t = useT();
  const type = itemType(o);
  const channels = itemChannels(o);
  const avail = itemAvailability(o);
  const { status } = itemStatus(o);
  const live = o.status === "published";
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
      className="hidden items-center gap-[10px] border-t border-admin-border-soft px-[14px] py-[12px] no-underline max-[720px]:flex"
      data-testid="catalog-row-phone"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-admin-body text-[14.5px] font-semibold text-admin-ink">{o.title || t("dashboard.catalog.untitled")}</span>
        <span className="mt-[2px] block truncate font-admin-body text-admin-12h text-admin-ink-muted">
          {t(TYPE_KEY[type])} · {offeringPriceLabel(o, locale)} · {availability}
          {channels.includes("pos") ? ` · ${t("dashboard.catalog.channel.posCounter")}` : ""}
          {channels.includes("website") ? ` · ${t("dashboard.catalog.channel.website")}` : ""}
        </span>
      </span>
      <StatePill tone={STATUS_TONE[status]} state={status}>
        {t(STATUS_KEY[status])}
      </StatePill>
    </Link>
    <ListRow cols={COLS} testId="catalog-row" className="relative max-[720px]:hidden">
      <Link href={nav.href({ item: o.id })} className="min-w-0 truncate font-semibold text-admin-ink no-underline hover:underline" data-testid="catalog-row-title">
        {o.title || t("dashboard.catalog.untitled")}
      </Link>
      <span>
        <span className="inline-flex whitespace-nowrap rounded-full bg-admin-surface-alt px-[8px] py-[2px] font-admin-body text-[11px] font-semibold text-admin-ink">
          {t(TYPE_KEY[type])}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-[4px]">
        {channels.length === 0 ? <span className="text-admin-ink-dim">{t("dashboard.catalog.channel.none")}</span> : null}
        {channels.includes("website") ? <StatePill tone="slate">{t("dashboard.catalog.channel.website")}</StatePill> : null}
        {channels.includes("pos") ? (
          <span className="inline-flex whitespace-nowrap rounded-full bg-admin-brand-soft px-[8px] py-[2px] font-admin-body text-[11px] font-semibold text-admin-brand">
            {t("dashboard.catalog.channel.posCounter")}
          </span>
        ) : null}
      </span>
      <span className="font-semibold tabular-nums">{offeringPriceLabel(o, locale)}</span>
      <span className="text-admin-ink-muted">{availability}</span>
      <span className="text-admin-ink-muted" title={t("dashboard.catalog.preparation.reason")}>
        {t("dashboard.catalog.dash")}
      </span>
      <span>
        <StatePill tone={STATUS_TONE[status]} state={status} testId="catalog-row-status">
          {t(STATUS_KEY[status])}
        </StatePill>
      </span>
      <span className="relative">
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
            <MenuItem danger onClick={() => { editor.removeItem(o.id); onMenuClose(); }}>
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
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
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
