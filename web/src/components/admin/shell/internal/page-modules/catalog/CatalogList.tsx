"use client";

/**
 * CatalogList — W01_CatalogItems: the title and its sentence, `Import` and
 * `Create item`, the five segments (Items · Packages · Price lists ·
 * Promotions · Passes & cards), the four filter chips, then one card of rows
 * (Item · Type · Channels · Price · Availability · Preparation · Status · a
 * row menu, see `CatalogListRow`; the columns follow the card width) and the
 * `Used in` footer.
 *
 * Every row is the reader's; every column is a judgement from
 * `catalog-model`. Preparation is a dash: no column records a station or a
 * prep time (D-POS-46). Location is one chip disabled with its reason: one
 * catalog per workspace, no per-location rows (D-POS-45).
 */

import { useState } from "react";

import { useT } from "@/i18n/use-t";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { Icon } from "../../primitives";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import { listLocales } from "@/lib/talent/offering-missing-translation";
import { useAdminShell } from "../../state";
import { useTalentFieldLocales } from "@/components/locale-field/use-talent-field-locales";
import type { OfferingsEditor } from "@/components/talent/services/use-offerings-editor";
import { ActionButton, FilterChip, Outcome, ToggleChip, UsedIn } from "../appointments-classes-ui";
import { MenuImportPanel } from "../MenuImportPanel";
import {
  loadWorkspaceArchivedMenu,
  setWorkspaceMenuItemArchived,
} from "@/lib/talent/menu-offerings-actions";
import type { CatalogNav } from "./CatalogPage";
import { DEFAULT_FILTERS, filterItems, removeModeFor, type CatalogView, type ListFilters } from "./catalog-model";
import { CARD, ListHead, Note, PageHeading, SegmentLinks } from "./catalog-ui";
import { CatalogRow, TYPE_KEY } from "./CatalogListRow";
import { CELL_FROM_1080, CELL_FROM_680, CELL_FROM_900, LIST_COLS, LIST_CONTAINER } from "./catalog-list-columns";

export function CatalogList({ editor, nav }: { editor: OfferingsEditor; nav: CatalogNav }) {
  const t = useT();
  const locale = useDashboardLocale();
  // The talent's languages come from the server-provided shell settings, not
  // the client store alone (the store is empty until the top bar seeds it).
  const { talentLocales } = useAdminShell();
  const store = useTalentFieldLocales();
  const { primary, locales } = listLocales(talentLocales, store);
  const [filters, setFilters] = useState<ListFilters>(DEFAULT_FILTERS);
  const [importOpen, setImportOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // Delete asks first; an item that was ever published offers Archive instead.
  const [confirmFor, setConfirmFor] = useState<TalentOffering | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [archived, setArchived] = useState<TalentOffering[] | null>(null);
  const [busy, setBusy] = useState(false);

  const archive = async (id: string) => {
    setBusy(true);
    const res = await setWorkspaceMenuItemArchived(editor.workspaceTenantId, id, true);
    setBusy(false);
    setConfirmFor(null);
    if (!res.ok) editor.setError(res.error ?? "Failed to archive.");
    else editor.reload();
  };
  const restore = async (id: string) => {
    setBusy(true);
    const res = await setWorkspaceMenuItemArchived(editor.workspaceTenantId, id, false);
    setBusy(false);
    if (!res.ok) editor.setError(res.error ?? "Failed to restore.");
    else editor.reload();
  };
  const toggleArchived = async (on: boolean) => {
    setArchivedOpen(on);
    if (!on) return;
    const res = await loadWorkspaceArchivedMenu(editor.workspaceTenantId);
    if (res.ok) setArchived(res.items);
    else editor.setError(res.error);
  };

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
    <div className="flex flex-col gap-[14px] leading-[1.2]" data-testid="catalog-list">
      <PageHeading
        title={t("dashboard.catalog.list.title")}
        intro={t("dashboard.catalog.list.intro")}
        actions={
          // MW21: the phone finds and adjusts; Import and Create item are the desktop's.
          <div className="contents max-[720px]:hidden">
            <ActionButton onClick={() => setImportOpen((v) => !v)} testId="catalog-import">
              {t("dashboard.catalog.list.import")}
            </ActionButton>
            <ActionButton tone="primary" onClick={() => nav.go({ create: true })} testId="catalog-create-item">
              <Icon name="plus" size={14} stroke={1.75} />
              {t("dashboard.catalog.list.createItem")}
            </ActionButton>
          </div>
        }
      />

      <MenuImportPanel tenantId={editor.workspaceTenantId} open={importOpen} onClose={() => setImportOpen(false)} />

      <div className="flex flex-wrap items-center gap-[8px] max-[720px]:flex-col max-[720px]:items-stretch">
        <SegmentLinks label={t("dashboard.catalog.segment.label")} items={segments} />
        <span className="flex-1" />
        {/* `contents` on the desktop keeps the chips on the strip's row (W01); MW21 draws only the segments on the phone. */}
        <div className="contents max-[720px]:hidden">
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
        <ToggleChip label={t("dashboard.catalog.filter.archived")} on={archivedOpen} onChange={(on) => void toggleArchived(on)} />
        </div>
      </div>
      {/* MW21: full editing lives on the desktop; the phone changes availability, price and essentials. */}
      <div className="hidden max-[720px]:order-last max-[720px]:block">
        <Note>{t("dashboard.catalog.list.phoneScope")}</Note>
      </div>

      {editor.error ? (
        <Outcome kind="refused" testId="catalog-refusal">
          {editor.error}
        </Outcome>
      ) : null}

      {confirmFor ? (
        <div role="alertdialog" aria-modal="false" aria-label={t("dashboard.catalog.confirm.deleteTitle")} className={`${CARD} flex flex-col gap-[8px] p-[14px]`} data-testid="catalog-remove-confirm">
          {removeModeFor(confirmFor) === "archive" ? (
            <>
              <p className="m-0 font-admin-body text-admin-13 font-semibold text-admin-ink">{t("dashboard.catalog.confirm.archiveTitle")}</p>
              <p className="m-0 font-admin-body text-admin-13 text-admin-ink-muted">
                {t("dashboard.catalog.confirm.archiveBody").replace("{name}", confirmFor.title || t("dashboard.catalog.untitled"))}
              </p>
            </>
          ) : (
            <>
              <p className="m-0 font-admin-body text-admin-13 font-semibold text-admin-ink">{t("dashboard.catalog.confirm.deleteTitle")}</p>
              <p className="m-0 font-admin-body text-admin-13 text-admin-ink-muted">
                {t("dashboard.catalog.confirm.deleteBody").replace("{name}", confirmFor.title || t("dashboard.catalog.untitled"))}
              </p>
            </>
          )}
          <div className="flex gap-[8px]">
            {removeModeFor(confirmFor) === "archive" ? (
              <ActionButton tone="primary" disabled={busy} onClick={() => void archive(confirmFor.id)} testId="catalog-confirm-archive">
                {t("dashboard.catalog.confirm.archive")}
              </ActionButton>
            ) : (
              <ActionButton tone="primary" disabled={busy} onClick={() => { editor.removeItem(confirmFor.id); setConfirmFor(null); }} testId="catalog-confirm-delete">
                {t("dashboard.catalog.confirm.delete")}
              </ActionButton>
            )}
            <ActionButton onClick={() => setConfirmFor(null)} testId="catalog-confirm-cancel">
              {t("dashboard.catalog.confirm.cancel")}
            </ActionButton>
          </div>
        </div>
      ) : null}

      {archivedOpen ? (
        <div className={`${CARD} flex flex-col gap-[6px] p-[14px]`} data-testid="catalog-archived">
          <p className="m-0 font-admin-body text-admin-13 font-semibold text-admin-ink">{t("dashboard.catalog.archived.title")}</p>
          {archived && archived.length === 0 ? (
            <p className="m-0 font-admin-body text-admin-13 text-admin-ink-muted">{t("dashboard.catalog.archived.empty")}</p>
          ) : null}
          {(archived ?? []).map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-[10px] border-t border-admin-border-soft py-[6px]">
              <span className="min-w-0 truncate font-admin-body text-admin-13 text-admin-ink">{a.title || t("dashboard.catalog.untitled")}</span>
              <ActionButton disabled={busy} onClick={() => void restore(a.id)} testId="catalog-restore">
                {t("dashboard.catalog.archived.restore")}
              </ActionButton>
            </div>
          ))}
          <p className="m-0 font-admin-body text-[11.5px] text-admin-ink-dim">{t("dashboard.catalog.archived.restoreNote")}</p>
        </div>
      ) : null}

      {/* B2: the card is a size container; the columns follow ITS width (catalog-list-columns). */}
      <div className={`${CARD} ${LIST_CONTAINER} overflow-visible`} data-testid="catalog-list-card">
        <ListHead cols={LIST_COLS}>
          <span className="min-w-0 truncate">{t("dashboard.catalog.col.item")}</span>
          <span className={`min-w-0 truncate ${CELL_FROM_680}`}>{t("dashboard.catalog.col.type")}</span>
          <span className={`min-w-0 truncate ${CELL_FROM_680}`}>{t("dashboard.catalog.col.channels")}</span>
          <span className="min-w-0 truncate">{t("dashboard.catalog.col.price")}</span>
          <span className={`min-w-0 truncate ${CELL_FROM_900}`}>{t("dashboard.catalog.col.availability")}</span>
          <span className={`min-w-0 truncate ${CELL_FROM_1080}`}>{t("dashboard.catalog.col.preparation")}</span>
          <span className="min-w-0 truncate">{t("dashboard.catalog.col.status")}</span>
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
              primary={primary}
              locales={locales}
              nav={nav}
              editor={editor}
              menuOpen={menuFor === o.id}
              onMenu={() => setMenuFor((cur) => (cur === o.id ? null : o.id))}
              onMenuClose={() => setMenuFor(null)}
              onRemove={() => setConfirmFor(o)}
              onArchive={() => void archive(o.id)}
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
      <div className="-mt-[4px] font-admin-body text-[11.5px] text-admin-ink-dim">{t("dashboard.catalog.usedIn.rule")}</div>

      <div className="min-h-[16px] font-admin-body text-[11px]">
        {editor.saving ? <span className="text-admin-ink-muted">{t("dashboard.catalog.saving")}</span> : null}
        {editor.savedOk && !editor.saving ? <span className="text-admin-green">{t("dashboard.catalog.saved")}</span> : null}
      </div>
    </div>
  );
}
