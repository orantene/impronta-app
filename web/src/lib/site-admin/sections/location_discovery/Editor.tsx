"use client";

import { PresentationPanel } from "../shared/PresentationPanel";
import { LinkKindPicker } from "../shared/LinkKindPicker";
import { useSectionT } from "../shared/section-editor-i18n";
import { KIT } from "@/components/edit-chrome/inspectors/kit";
import type { SectionEditorProps } from "../types";
import type { LocationDiscoveryV1, LocationDiscoveryItem } from "./schema";

const FIELD = KIT.field;
const LABEL = KIT.label;
const INPUT = KIT.input;

export function LocationDiscoveryEditor({
  initial,
  onChange,
}: SectionEditorProps<LocationDiscoveryV1>) {
  const t = useSectionT();
  const value: LocationDiscoveryV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "Local faces, international reach",
    subheadline: initial.subheadline ?? "",
    source: initial.source ?? "manual",
    items: initial.items ?? [],
    maxItems: initial.maxItems ?? 8,
    showCount: initial.showCount,
    showMap: initial.showMap,
    ctaLabel: initial.ctaLabel ?? "",
    ctaHref: initial.ctaHref,
    layout: initial.layout ?? "grid",
    emptyStateText: initial.emptyStateText ?? "",
    presentation: initial.presentation,
  };
  const patch = (p: Partial<LocationDiscoveryV1>) =>
    onChange({ ...value, ...p });

  const items = value.items ?? [];
  const setItem = (i: number, p: Partial<LocationDiscoveryItem>) =>
    patch({
      items: items.map((it, idx) => (idx === i ? { ...it, ...p } : it)),
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className={FIELD}>
          <span className={LABEL}>{t("Eyebrow")}</span>
          <input
            className={INPUT}
            value={value.eyebrow ?? ""}
            onChange={(e) => patch({ eyebrow: e.target.value })}
          />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>{t("Heading")}</span>
          <input
            className={INPUT}
            value={value.headline ?? ""}
            onChange={(e) => patch({ headline: e.target.value })}
          />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>{t("Subheading")}</span>
          <input
            className={INPUT}
            value={value.subheadline ?? ""}
            onChange={(e) => patch({ subheadline: e.target.value })}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className={FIELD}>
          <span className={LABEL}>{t("Source")}</span>
          <select
            className={INPUT}
            value={value.source}
            onChange={(e) =>
              patch({
                source: e.target.value as LocationDiscoveryV1["source"],
              })
            }
          >
            <option value="manual">{t("Manual locations")}</option>
            <option value="roster_cities">
              {t("Roster cities (tenant-derived)")}
            </option>
            <option value="service_areas">
              {t("Service areas (follow-on)")}
            </option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>{t("Max items")}</span>
          <input
            className={INPUT}
            type="number"
            min={1}
            max={24}
            value={value.maxItems}
            onChange={(e) =>
              patch({
                maxItems: Math.max(
                  1,
                  Math.min(24, Number(e.target.value) || 8),
                ),
              })
            }
          />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>{t("Layout")}</span>
          <select
            className={INPUT}
            value={value.layout}
            onChange={(e) =>
              patch({
                layout: e.target.value as LocationDiscoveryV1["layout"],
              })
            }
          >
            <option value="grid">{t("Grid")}</option>
            <option value="list">{t("List")}</option>
            <option value="compact">{t("Compact")}</option>
          </select>
        </label>
      </div>

      {value.source === "service_areas" ? (
        <p className="text-[11px] text-stone-500">
          {t(
            "Service-area derivation is a documented follow-on; the manual list below renders as the safe interim. Roster-cities mode is tenant-scoped and live now.",
          )}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.showCount === true}
            onChange={(e) => patch({ showCount: e.target.checked })}
          />
          {t("Show talent counts")}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.showMap === true}
            onChange={(e) => patch({ showMap: e.target.checked })}
          />
          {t("Show market map")}
        </label>
      </div>

      {value.source === "manual" ? (
        <div className="flex flex-col gap-2">
          <span className={LABEL}>{t("Manual locations")}</span>
          {items.map((it, i) => (
            <div
              key={i}
              className="grid grid-cols-1 gap-2 rounded-lg border border-[#e5e0d5] bg-[#faf9f6] p-2 md:grid-cols-2"
            >
              <input
                className={INPUT}
                placeholder={t("City / market label")}
                value={it.label}
                onChange={(e) => setItem(i, { label: e.target.value })}
              />
              <input
                className={INPUT}
                placeholder={t("Region (optional)")}
                value={it.region ?? ""}
                onChange={(e) => setItem(i, { region: e.target.value })}
              />
              <LinkKindPicker
                value={it.href}
                onChange={(next) => setItem(i, { href: next })}
              />
              <input
                className={INPUT}
                type="number"
                min={0}
                placeholder={t("Count (optional)")}
                value={typeof it.count === "number" ? it.count : ""}
                onChange={(e) =>
                  setItem(i, {
                    count:
                      e.target.value === ""
                        ? undefined
                        : Math.max(0, Number(e.target.value) || 0),
                  })
                }
              />
              <label className={FIELD}>
                <span className={LABEL}>{t("Market status")}</span>
                <select
                  className={INPUT}
                  value={it.status ?? "active"}
                  onChange={(e) =>
                    setItem(i, {
                      status: e.target
                        .value as LocationDiscoveryItem["status"],
                    })
                  }
                >
                  <option value="active">{t("Active")}</option>
                  <option value="coming_soon">{t("Coming soon")}</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={it.featured === true}
                  onChange={(e) =>
                    setItem(i, { featured: e.target.checked })
                  }
                />
                {t("Featured market")}
              </label>
              <button
                type="button"
                className="text-xs text-destructive md:col-span-2"
                onClick={() =>
                  patch({ items: items.filter((_, idx) => idx !== i) })
                }
              >
                {t("Remove location")}
              </button>
            </div>
          ))}
          <button
            type="button"
            className={`${KIT.ghostButton} self-start`}
            onClick={() =>
              patch({
                items: [...items, { label: "New city" }].slice(0, 24),
              })
            }
          >
            {t("+ Add location")}
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>{t("Section CTA label")}</span>
          <input
            className={INPUT}
            value={value.ctaLabel ?? ""}
            onChange={(e) => patch({ ctaLabel: e.target.value })}
          />
        </label>
        <div className={FIELD}>
          <span className={LABEL}>{t("Section CTA href")}</span>
          <LinkKindPicker
            value={value.ctaHref}
            onChange={(next) => patch({ ctaHref: next })}
          />
        </div>
      </div>

      <label className={FIELD}>
        <span className={LABEL}>{t("Empty-state text")}</span>
        <input
          className={INPUT}
          placeholder={t("No locations to show yet.")}
          value={value.emptyStateText ?? ""}
          onChange={(e) => patch({ emptyStateText: e.target.value })}
        />
      </label>

      <PresentationPanel
        value={value.presentation}
        onChange={(next) => patch({ presentation: next })}
      />
    </div>
  );
}
