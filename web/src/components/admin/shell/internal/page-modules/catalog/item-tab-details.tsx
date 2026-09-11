"use client";

/**
 * item-tab-details — the editor's first tab: name, description, type,
 * category, duration and photos. Every field is a column on
 * `talent_offerings` except photos, which the workspace's items cannot hold
 * yet (`talent_offering_media` joins a talent profile); that control is
 * drawn disabled with its sentence (D-POS-46).
 */

import { useT } from "@/i18n/use-t";
import type { OfferingKind } from "@/lib/talent/offerings-types";
import type { TabProps } from "./CatalogItemEditor";
import { Field, INPUT, SectionHead } from "./catalog-ui";
import { PackageComposition } from "./item-tab-package";

export function DetailsTab(props: TabProps) {
  const { item, patch, saving, isDraft } = props;
  const t = useT();
  return (
    <>
      <SectionHead title={t("dashboard.catalog.details.title")} intro={t("dashboard.catalog.details.intro")} />
      <div className="grid grid-cols-2 gap-[14px]">
        <Field label={t("dashboard.catalog.details.name")} required className="col-span-2">
          <input
            key={`title-${item.id}`}
            type="text"
            defaultValue={item.title}
            disabled={saving}
            placeholder={t("dashboard.catalog.details.namePlaceholder")}
            data-testid="catalog-field-title"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== item.title) patch({ title: v });
            }}
            className={`${INPUT} font-semibold`}
          />
        </Field>
        <Field label={t("dashboard.catalog.details.description")} className="col-span-2">
          <textarea
            key={`desc-${item.id}`}
            defaultValue={item.description ?? ""}
            disabled={saving}
            rows={3}
            placeholder={t("dashboard.catalog.details.descriptionPlaceholder")}
            onBlur={(e) => {
              const v = e.target.value.trim() || null;
              if (v !== item.description) patch({ description: v });
            }}
            className={`${INPUT} h-auto resize-y py-[8px]`}
          />
        </Field>
        <Field label={t("dashboard.catalog.details.type")} hint={t("dashboard.catalog.details.typeHint")}>
          <select
            value={item.kind}
            disabled={saving}
            data-testid="catalog-field-kind"
            onChange={(e) => patch({ kind: e.target.value as OfferingKind })}
            className={INPUT}
          >
            <option value="product">{t("dashboard.catalog.type.product")}</option>
            <option value="service">{t("dashboard.catalog.type.service")}</option>
            <option value="package">{t("dashboard.catalog.type.package")}</option>
          </select>
        </Field>
        <Field label={t("dashboard.catalog.details.category")} hint={t("dashboard.catalog.details.categoryHint")}>
          <input
            key={`cat-${item.id}`}
            type="text"
            defaultValue={item.category ?? ""}
            disabled={saving}
            placeholder={t("dashboard.catalog.details.categoryPlaceholder")}
            data-testid="catalog-field-category"
            onBlur={(e) => {
              const v = e.target.value.trim() || null;
              if (v !== item.category) patch({ category: v });
            }}
            className={INPUT}
          />
        </Field>
        <Field label={t("dashboard.catalog.details.duration")} hint={t("dashboard.catalog.details.durationHint")}>
          <input
            key={`dur-${item.id}-${item.durationMinutes ?? "x"}`}
            type="number"
            min={0}
            defaultValue={item.durationMinutes ?? ""}
            disabled={saving}
            onBlur={(e) => {
              const n = Number(e.target.value);
              const v = Number.isFinite(n) && n > 0 ? Math.round(n) : null;
              if (v !== item.durationMinutes) patch({ durationMinutes: v });
            }}
            className={INPUT}
          />
        </Field>
        <Field label={t("dashboard.catalog.details.photos")} reason={t("dashboard.catalog.details.photosReason")}>
          <input type="file" disabled className={`${INPUT} py-[6px]`} data-testid="catalog-field-photos" />
        </Field>
      </div>
      {isDraft ? (
        <p className="m-0 font-admin-body text-[12px] text-admin-ink-muted">{t("dashboard.catalog.editor.draftHint")}</p>
      ) : null}
      {item.kind === "package" ? <PackageComposition {...props} /> : null}
    </>
  );
}
