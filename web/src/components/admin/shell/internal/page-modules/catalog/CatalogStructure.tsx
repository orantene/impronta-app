"use client";

/**
 * CatalogStructure — W07_MenuStructure: the title, the location switch and
 * `Save`, the `Used in` line, then three columns: `Counter · Favorites
 * (first screen)`, `Counter · Categories`, `Tables & QR · sections and
 * courses`.
 *
 * WIRED: Favorites is `is_featured` on the row (add from the picker, remove
 * from the row; each change writes through the editor hook and says so, so
 * `Save` is drawn disabled with that sentence). Categories are the rows'
 * own `category` text, counted; a category is renamed on the item, not
 * here. NOT WIRED: the location switch (one catalog per workspace, D-POS-45),
 * sections and courses for Tables and the QR ordering switch (no column,
 * D-POS-46).
 */

import { useState } from "react";

import { useT } from "@/i18n/use-t";
import { Icon } from "../../primitives";
import type { OfferingsEditor } from "@/components/talent/services/use-offerings-editor";
import { ActionButton, Outcome, Segmented, UsedIn } from "../appointments-classes-ui";
import type { CatalogNav } from "./CatalogPage";
import { categoryCounts } from "./catalog-model";
import { BUTTON_SMALL, CARD, INPUT, PageHeading, Switch } from "./catalog-ui";

const FAVORITES_CAP = 12;

export function CatalogStructure({ editor, nav }: { editor: OfferingsEditor; nav: CatalogNav }) {
  const t = useT();
  const [pick, setPick] = useState("");
  const favorites = editor.items.filter((o) => o.isFeatured);
  const candidates = editor.items.filter((o) => !o.isFeatured);
  const categories = categoryCounts(editor.items);
  const noSections = t("dashboard.catalog.structure.sectionsReason");

  return (
    <div className="flex flex-col gap-[16px]" data-testid="catalog-structure">
      <PageHeading
        title={t("dashboard.catalog.structure.title")}
        intro={t("dashboard.catalog.structure.intro")}
        actions={
          <>
            <Segmented
              label={t("dashboard.catalog.filter.location")}
              value="all"
              options={[{ id: "all", label: t("dashboard.catalog.structure.oneLocation"), reason: t("dashboard.catalog.filter.locationReason") }]}
              onChange={() => undefined}
            />
            <ActionButton tone="primary" reason={t("dashboard.catalog.structure.saveReason")} testId="catalog-structure-save">
              {t("dashboard.catalog.structure.save")}
            </ActionButton>
          </>
        }
      />
      <UsedIn
        count={2}
        label={t("dashboard.catalog.usedIn.label")}
        parts={[
          { where: t("dashboard.catalog.usedIn.pos"), what: t("dashboard.catalog.usedIn.itemPos") },
          { where: t("dashboard.catalog.usedIn.web"), what: t("dashboard.catalog.usedIn.structureWeb") },
        ]}
      />
      {editor.error ? (
        <Outcome kind="refused" testId="catalog-structure-refusal">
          {editor.error}
        </Outcome>
      ) : null}
      <div className="grid grid-cols-3 gap-[14px]">
        <div className={CARD} data-testid="catalog-favorites">
          <div className="flex items-center justify-between gap-[8px] px-[16px] py-[12px]">
            <span className="font-admin-body text-admin-13 font-semibold text-admin-ink">{t("dashboard.catalog.structure.favorites")}</span>
            <span className="font-admin-body text-[12px] text-admin-ink-muted">
              {t("dashboard.catalog.structure.nOfCap").replace("{n}", String(favorites.length)).replace("{cap}", String(FAVORITES_CAP))}
            </span>
          </div>
          {favorites.length === 0 ? (
            <p className="m-0 border-t border-admin-border-soft px-[16px] py-[10px] font-admin-body text-[12px] text-admin-ink-muted">{t("dashboard.catalog.structure.noFavorites")}</p>
          ) : null}
          {favorites.map((o) => (
            <div key={o.id} className="flex items-center gap-[8px] border-t border-admin-border-soft px-[16px] py-[9px] font-admin-body text-[12.5px] text-admin-ink" data-testid="catalog-favorite-row">
              <Icon name="star" size={12} stroke={1.75} color="var(--color-admin-amber)" />
              <span className="flex-1 truncate">{o.title || t("dashboard.catalog.untitled")}</span>
              <button
                type="button"
                aria-label={t("dashboard.catalog.structure.removeFavorite")}
                disabled={editor.saving}
                onClick={() => editor.patchItem(o.id, { isFeatured: false })}
                className="inline-flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-[6px] text-admin-ink-dim hover:bg-admin-surface-alt hover:text-admin-red disabled:cursor-not-allowed"
              >
                <Icon name="x" size={12} stroke={1.75} />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-[8px] border-t border-admin-border-soft px-[16px] py-[10px]">
            <select
              aria-label={t("dashboard.catalog.structure.addFavorite")}
              value={pick}
              disabled={editor.saving || candidates.length === 0 || favorites.length >= FAVORITES_CAP}
              onChange={(e) => setPick(e.target.value)}
              className={`${INPUT} h-[30px] flex-1`}
              data-testid="catalog-favorite-pick"
            >
              <option value="">{t("dashboard.catalog.structure.pickItem")}</option>
              {candidates.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title || t("dashboard.catalog.untitled")}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!pick || editor.saving || favorites.length >= FAVORITES_CAP}
              data-testid="catalog-favorite-add"
              onClick={() => {
                editor.patchItem(pick, { isFeatured: true });
                setPick("");
              }}
              className={BUTTON_SMALL}
            >
              <Icon name="plus" size={12} stroke={1.75} />
              {t("dashboard.catalog.structure.addFavorite")}
            </button>
          </div>
        </div>

        <div className={CARD} data-testid="catalog-categories">
          <div className="px-[16px] py-[12px] font-admin-body text-admin-13 font-semibold text-admin-ink">{t("dashboard.catalog.structure.categories")}</div>
          {categories.length === 0 ? (
            <p className="m-0 border-t border-admin-border-soft px-[16px] py-[10px] font-admin-body text-[12px] text-admin-ink-muted">{t("dashboard.catalog.list.empty")}</p>
          ) : null}
          {categories.map((c) => (
            <div key={c.category ?? "__none"} className="flex items-center justify-between gap-[8px] border-t border-admin-border-soft px-[16px] py-[9px] font-admin-body text-[12.5px]" data-testid="catalog-category-row">
              <span className={c.category ? "text-admin-ink" : "text-admin-ink-muted"}>{c.category ?? t("dashboard.catalog.structure.uncategorised")}</span>
              <span className="text-admin-ink-muted">{t("dashboard.catalog.structure.nItems").replace("{n}", String(c.count))}</span>
            </div>
          ))}
          <p className="m-0 border-t border-admin-border-soft px-[16px] py-[10px] font-admin-body text-[11.5px] text-admin-ink-dim">{t("dashboard.catalog.structure.categoriesHint")}</p>
        </div>

        <div className={CARD} data-testid="catalog-sections" title={noSections}>
          <div className="px-[16px] py-[12px] font-admin-body text-admin-13 font-semibold text-admin-ink">{t("dashboard.catalog.structure.sections")}</div>
          <p className="m-0 border-t border-admin-border-soft px-[16px] py-[10px] font-admin-body text-[12px] text-admin-ink-muted">{noSections}</p>
          <div className="flex items-center gap-[10px] border-t border-admin-border-soft px-[16px] py-[12px]">
            <Switch on={false} label={t("dashboard.catalog.structure.qrOrdering")} reason={noSections} testId="catalog-qr-switch" />
            <div className="min-w-0">
              <div className="font-admin-body text-[13px] font-semibold text-admin-ink">{t("dashboard.catalog.structure.qrOrdering")}</div>
              <div className="font-admin-body text-[12px] text-admin-ink-muted">{t("dashboard.catalog.structure.qrOrderingNote")}</div>
            </div>
          </div>
        </div>
      </div>
      <p className="m-0 font-admin-body text-[12px] text-admin-ink-muted">
        <a href={nav.href({ view: "items" })} className="text-admin-brand">
          {t("dashboard.catalog.structure.backToItems")}
        </a>
      </p>
    </div>
  );
}
