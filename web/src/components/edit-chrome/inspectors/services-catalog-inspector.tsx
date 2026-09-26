"use client";

/**
 * Services catalog inspector — Content / Behavior / Advanced sections.
 * Layout controls live on the Layout tab (see layout-panel AdvancedNodeLayoutEditor).
 * Style overrides live on the Style tab; useWebsiteTheme gates whether they apply.
 */

import { useMemo, useState, type ReactNode } from "react";
import type { BuilderServicesCatalogNode } from "@/lib/site-admin/builder-node";
import { ineligibleSelectedOfferingIds } from "@/lib/site-admin/builder-node/services-catalog-selection";
import { KIT } from "./kit/tokens";
import { InspectorLabelWithInfo } from "./kit";
import {
  ServicesCatalogOfferingsLoadNotice,
  ServicesCatalogSearchField,
  filterOfferingsByQuery,
  useServicesCatalogEligibleOfferings,
} from "./services-catalog-offerings-picker";

function Section({
  title,
  info,
  children,
}: {
  title: string;
  info?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className={KIT.blockHeading}>
        {info ? <InspectorLabelWithInfo label={title} info={info} /> : title}
      </h3>
      {children}
    </section>
  );
}

const STYLE_PRESETS: Array<{
  id: string;
  label: string;
  patch: Record<string, unknown>;
}> = [
  {
    id: "clean",
    label: "Clean",
    patch: {
      layout: "rows",
      categoryNav: "pills",
      density: "comfortable",
      photoRadius: "soft",
      rowCtaVariant: "outline",
      useWebsiteTheme: true,
    },
  },
  {
    id: "editorial",
    label: "Editorial",
    patch: {
      layout: "editorial",
      categoryNav: "sections",
      density: "comfortable",
      photoRadius: "soft",
      rowCtaVariant: "outline",
      columns: 2,
    },
  },
  {
    id: "compact",
    label: "Compact",
    patch: {
      layout: "compact_list",
      categoryNav: "tabs",
      density: "compact",
      showPhoto: false,
      rowCtaVariant: "outline",
    },
  },
  {
    id: "image_led",
    label: "Image-led",
    patch: {
      layout: "cards",
      categoryNav: "pills",
      density: "comfortable",
      photoRadius: "soft",
      showPhoto: true,
      columns: 2,
    },
  },
];

export function ServicesCatalogContentInspector({
  node,
  commitPatch,
}: {
  node: BuilderServicesCatalogNode;
  commitPatch: (patch: Record<string, unknown>) => void | Promise<void>;
}) {
  const catalog = node.props;
  const selectionMode = catalog.selectionMode ?? "all";
  const selectedIds = catalog.selectedOfferingIds ?? [];
  const featuredIds = catalog.featuredOfferingIds ?? [];
  const { state, eligible } = useServicesCatalogEligibleOfferings();
  const [pickerQuery, setPickerQuery] = useState("");
  const [featuredQuery, setFeaturedQuery] = useState("");

  const ineligible = ineligibleSelectedOfferingIds(selectedIds, eligible);
  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          eligible
            .map((o) => o.category?.trim())
            .filter((c): c is string => Boolean(c)),
        ),
      ).sort(),
    [eligible],
  );

  const filteredForIds = useMemo(
    () => filterOfferingsByQuery(eligible, pickerQuery),
    [eligible, pickerQuery],
  );
  const filteredForFeatured = useMemo(
    () => filterOfferingsByQuery(eligible, featuredQuery),
    [eligible, featuredQuery],
  );

  return (
    <div className="flex flex-col gap-4" data-services-catalog-inspector="content">
      <Section
        title="Content"
        info="Section copy and which catalog items this widget shows. Prices and booking rules stay in Services - use Edit offering there."
      >
        <p className="text-xs text-black/55">
          Catalog edits (price, duration, extras) go live when you publish the offering. Website layout and
          style stay draft until you publish the page.
        </p>
        <a
          className="text-xs font-semibold text-black underline underline-offset-2"
          href="/talent/services"
          target="_blank"
          rel="noreferrer"
        >
          Open Services catalog editor
        </a>
        <div className={KIT.field}>
          <label className={KIT.label}>Eyebrow</label>
          <input
            className={KIT.input}
            value={catalog.eyebrow ?? ""}
            onChange={(e) => void commitPatch({ eyebrow: e.target.value })}
          />
        </div>
        <div className={KIT.field}>
          <label className={KIT.label}>Title</label>
          <input
            className={KIT.input}
            value={catalog.title ?? ""}
            onChange={(e) => void commitPatch({ title: e.target.value })}
          />
          <p className="text-xs text-black/50">Use {"{i}italic{/i}"} for the italic span.</p>
        </div>
        <div className={KIT.field}>
          <label className={KIT.label}>Intro</label>
          <input
            className={KIT.input}
            value={catalog.subtitle ?? ""}
            onChange={(e) => void commitPatch({ subtitle: e.target.value })}
          />
        </div>
        <div className={KIT.field}>
          <label className={KIT.label}>Offerings to show</label>
          <select
            className={KIT.input}
            value={selectionMode}
            onChange={(e) => void commitPatch({ selectionMode: e.target.value })}
          >
            <option value="all">All eligible offerings</option>
            <option value="categories">Selected categories</option>
            <option value="ids">Individually selected</option>
          </select>
        </div>
        <ServicesCatalogOfferingsLoadNotice state={state} />
        {selectionMode === "categories" ? (
          <div className={KIT.field}>
            <label className={KIT.label}>Categories</label>
            <div className="flex flex-col gap-1.5 max-h-40 overflow-auto rounded-md border border-black/10 p-2">
              {categories.length === 0 ? (
                <p className="text-xs text-black/50">No categories in the published catalog yet.</p>
              ) : (
                categories.map((name) => {
                  const checked = (catalog.selectedCategoryNames ?? []).includes(name);
                  const count = eligible.filter((o) => o.category?.trim() === name).length;
                  return (
                    <label key={name} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const cur = catalog.selectedCategoryNames ?? [];
                          const next = checked ? cur.filter((c) => c !== name) : [...cur, name];
                          void commitPatch({ selectedCategoryNames: next });
                        }}
                      />
                      <span className="truncate">
                        {name}
                        <span className="text-black/45"> ({count})</span>
                      </span>
                    </label>
                  );
                })
              )}
            </div>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={catalog.autoIncludeNew !== false}
                onChange={(e) => void commitPatch({ autoIncludeNew: e.target.checked })}
              />
              Automatically include new offerings in these categories
            </label>
          </div>
        ) : null}
        {selectionMode === "ids" ? (
          <div className={KIT.field}>
            <label className={KIT.label}>Offerings</label>
            <ServicesCatalogSearchField value={pickerQuery} onChange={setPickerQuery} />
            <div className="mt-1.5 flex flex-col gap-1.5 max-h-48 overflow-auto rounded-md border border-black/10 p-2">
              {eligible.length === 0 ? (
                <p className="text-xs text-black/50">
                  No eligible offerings yet.{" "}
                  <a className="underline font-semibold" href="/talent/services" target="_blank" rel="noreferrer">
                    Add your first offering
                  </a>
                  , then return here.
                </p>
              ) : filteredForIds.length === 0 ? (
                <p className="text-xs text-black/50">No offerings match this search.</p>
              ) : (
                filteredForIds.map((o) => {
                  const checked = selectedIds.includes(o.id);
                  return (
                    <label key={o.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? selectedIds.filter((id) => id !== o.id)
                            : [...selectedIds, o.id];
                          void commitPatch({ selectedOfferingIds: next, autoIncludeNew: false });
                        }}
                      />
                      <span className="truncate">
                        {o.title}
                        {o.category ? (
                          <span className="text-black/45"> · {o.category}</span>
                        ) : null}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
            <p className="text-xs text-black/50">
              Only selected offerings appear. New catalog items stay hidden until you add them.
            </p>
          </div>
        ) : null}
        {ineligible.length > 0 ? (
          <p
            className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900"
            data-services-catalog-ineligible-warning=""
          >
            {ineligible.length} selected offering{ineligible.length === 1 ? "" : "s"} no longer eligible
            (hidden, archived, or not approved). They will not appear publicly. Clear them from the
            selection or fix them in Services.
          </p>
        ) : null}

        <div className={KIT.field}>
          <label className={KIT.label}>Featured offerings</label>
          <ServicesCatalogSearchField
            value={featuredQuery}
            onChange={setFeaturedQuery}
            placeholder="Search to feature…"
          />
          <div className="mt-1.5 flex flex-col gap-1.5 max-h-36 overflow-auto rounded-md border border-black/10 p-2">
            {eligible.length === 0 ? (
              <p className="text-xs text-black/50">Publish offerings to feature one.</p>
            ) : filteredForFeatured.length === 0 ? (
              <p className="text-xs text-black/50">No offerings match this search.</p>
            ) : (
              filteredForFeatured.map((o) => {
                const checked = featuredIds.includes(o.id);
                return (
                  <label key={o.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = checked
                          ? featuredIds.filter((id) => id !== o.id)
                          : [...featuredIds, o.id];
                        void commitPatch({ featuredOfferingIds: next });
                      }}
                    />
                    <span className="truncate">{o.title}</span>
                  </label>
                );
              })
            )}
          </div>
          <p className="text-xs text-black/50">
            First featured item leads the Featured layout hero. Order follows the check order above.
          </p>
        </div>

        <div className={KIT.field}>
          <label className={KIT.label}>Presentation order</label>
          <select
            className={KIT.input}
            value={catalog.sort ?? "catalog"}
            onChange={(e) => void commitPatch({ sort: e.target.value })}
          >
            <option value="catalog">Catalog order</option>
            <option value="manual">Manual (selected ids order)</option>
          </select>
        </div>
        {catalog.sort === "manual" && selectionMode === "ids" ? (
          <p className="text-xs text-black/50">
            Manual order follows the order offerings were checked. Re-check to rebuild order.
          </p>
        ) : null}

        <p className="text-xs font-semibold text-black/70 pt-1">Visible fields</p>
        {(
          [
            ["showStats", "Show stats"],
            ["showPhoto", "Show photo"],
            ["showDescription", "Show description"],
            ["showCategory", "Show category"],
            ["showDuration", "Show duration"],
            ["showDelivery", "Show delivery / location"],
            ["showAvailability", "Show booking badge"],
            ["showPrice", "Show price"],
            ["showUsdEquivalent", "Show USD equivalent"],
            ["showBadges", "Show Instant / Deposit badges"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={catalog[key] !== false}
              onChange={(e) => void commitPatch({ [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}

        <div className={KIT.field}>
          <label className={KIT.label}>Button label override</label>
          <input
            className={KIT.input}
            value={catalog.ctaLabel ?? ""}
            placeholder="Leave blank for behavior-aware labels"
            onChange={(e) => void commitPatch({ ctaLabel: e.target.value })}
          />
          <p className="text-xs text-black/50">
            Blank = Select / Choose options / Request appointment / Request a quote from offering
            behavior. Never invents Buy package when purchase is unsupported in this sheet.
          </p>
        </div>
      </Section>

      <Section
        title="Behavior"
        info="How visitors open details and start booking. Chat Ask handoff is shared with the booking sheet."
      >
        <p className="text-xs text-black/55">
          Details open in the booking sheet (modal on desktop, bottom sheet on mobile). Inline expansion
          is not supported in this release - no dead control.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={catalog.showAskLink !== false}
            onChange={(e) => void commitPatch({ showAskLink: e.target.checked })}
          />
          Show Ask link in booking sheet
        </label>
        <div className={KIT.field}>
          <label className={KIT.label}>Sheet accent</label>
          <select
            className={KIT.input}
            value={catalog.bookingSheet?.accent ?? "ink"}
            onChange={(e) =>
              void commitPatch({
                bookingSheet: { ...(catalog.bookingSheet ?? {}), accent: e.target.value },
              })
            }
          >
            <option value="ink">Ink (mockup Continuar)</option>
            <option value="primary">Website primary</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={catalog.categoryShowAll === true}
            onChange={(e) => void commitPatch({ categoryShowAll: e.target.checked })}
          />
          Show All chip in category filter
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={catalog.categoryShowCounts === true}
            onChange={(e) => void commitPatch({ categoryShowCounts: e.target.checked })}
          />
          Show counts on category chips
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={catalog.enableCatalogSearch === true}
            onChange={(e) => void commitPatch({ enableCatalogSearch: e.target.checked })}
          />
          Enable visitor catalog search
        </label>
      </Section>

      <Section title="Advanced">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={catalog.useWebsiteTheme !== false}
            onChange={(e) => void commitPatch({ useWebsiteTheme: e.target.checked })}
          />
          Use website theme
        </label>
        <p className="text-xs text-black/50">
          On = inherit site colors and type. Off = Style tab overrides apply to this block.
        </p>
        <div className={KIT.field}>
          <label className={KIT.label}>Style preset</label>
          <div className="flex flex-wrap gap-1.5">
            {STYLE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="rounded-md border border-black/15 bg-white px-2.5 py-1 text-xs font-semibold"
                onClick={() => void commitPatch({ ...preset.patch, stylePreset: preset.id })}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        <div className={KIT.field}>
          <label className={KIT.label}>Empty message</label>
          <input
            className={KIT.input}
            value={catalog.emptyMessage ?? ""}
            onChange={(e) => void commitPatch({ emptyMessage: e.target.value })}
          />
        </div>
        <button
          type="button"
          className="rounded-md border border-black/15 bg-white px-3 py-1.5 text-xs font-semibold"
          onClick={() =>
            void commitPatch({
              layout: "rows",
              categoryNav: "pills",
              rowCtaVariant: "outline",
              photoRadius: "soft",
              durationFormat: "auto",
              mobileBar: "float",
              columns: undefined,
              density: "comfortable",
              stylePreset: undefined,
            })
          }
        >
          Reset layout settings
        </button>
        <button
          type="button"
          className="rounded-md border border-black/15 bg-white px-3 py-1.5 text-xs font-semibold"
          onClick={() => void commitPatch({ useWebsiteTheme: true, style: undefined })}
        >
          Reset to website theme
        </button>
      </Section>
    </div>
  );
}

export function ServicesCatalogLayoutInspector({
  node,
  onPatch,
}: {
  node: BuilderServicesCatalogNode;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const catalog = node.props;
  const layout = catalog.layout ?? "rows";
  const showColumns = layout === "cards" || layout === "grid" || layout === "editorial";
  const showPhotoCorners = layout !== "compact_list" && catalog.showPhoto !== false;
  return (
    <div className="flex flex-col gap-3" data-builder-node-layout-panel="services_catalog">
      <div className={KIT.field}>
        <label className={KIT.label}>Layout</label>
        <select
          className={KIT.input}
          value={layout}
          onChange={(e) => onPatch({ layout: e.target.value })}
        >
          <option value="rows">Service list</option>
          <option value="cards">Image cards</option>
          <option value="grid">Image grid</option>
          <option value="compact_list">Compact price menu</option>
          <option value="editorial">Editorial cards</option>
          <option value="featured">Featured offering</option>
        </select>
        <p className="text-xs text-black/50">
          Suggested from your catalog: photo-led → cards; many items without photos → compact list;
          beauty menu → service list. Always changeable. Featured puts the first featured offering in a
          hero row.
        </p>
      </div>
      <div className={KIT.field}>
        <label className={KIT.label}>Category navigation</label>
        <select
          className={KIT.input}
          value={catalog.categoryNav ?? "pills"}
          onChange={(e) => onPatch({ categoryNav: e.target.value })}
        >
          <option value="pills">Filter chips</option>
          <option value="tabs">Tabs (filter)</option>
          <option value="accordion">Accordions</option>
          <option value="jump_strip">Jump links + headings</option>
          <option value="sections">Section headings only</option>
          <option value="none">None</option>
        </select>
        <p className="text-xs text-black/50">
          Chips and tabs filter the list. Jump links scroll. Section headings group without a top strip.
        </p>
      </div>
      {showColumns ? (
        <div className={KIT.field}>
          <label className={KIT.label}>Columns</label>
          <select
            className={KIT.input}
            value={String(catalog.columns ?? (layout === "grid" ? 3 : 2))}
            onChange={(e) => onPatch({ columns: Number(e.target.value) })}
          >
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
        </div>
      ) : null}
      <div className={KIT.field}>
        <label className={KIT.label}>Density</label>
        <select
          className={KIT.input}
          value={catalog.density ?? "comfortable"}
          onChange={(e) => onPatch({ density: e.target.value })}
        >
          <option value="comfortable">Comfortable</option>
          <option value="compact">Compact</option>
        </select>
      </div>
      <div className={KIT.field}>
        <label className={KIT.label}>Row CTA style</label>
        <select
          className={KIT.input}
          value={catalog.rowCtaVariant ?? "outline"}
          onChange={(e) => onPatch({ rowCtaVariant: e.target.value })}
        >
          <option value="outline">Outline (mockup Seleccionar)</option>
          <option value="solid">Solid fill</option>
        </select>
      </div>
      {showPhotoCorners ? (
        <div className={KIT.field}>
          <label className={KIT.label}>Photo corners</label>
          <select
            className={KIT.input}
            value={catalog.photoRadius ?? "soft"}
            onChange={(e) => onPatch({ photoRadius: e.target.value })}
          >
            <option value="square">Square</option>
            <option value="soft">Soft</option>
            <option value="round">Round</option>
          </select>
        </div>
      ) : null}
      <div className={KIT.field}>
        <label className={KIT.label}>Duration format</label>
        <select
          className={KIT.input}
          value={catalog.durationFormat ?? "auto"}
          onChange={(e) => onPatch({ durationFormat: e.target.value })}
        >
          <option value="auto">Auto (2 h 15 min)</option>
          <option value="hours_minutes">Hours + minutes</option>
          <option value="minutes">Minutes only</option>
        </select>
      </div>
      <div className={KIT.field}>
        <label className={KIT.label}>Mobile selection bar</label>
        <select
          className={KIT.input}
          value={catalog.mobileBar ?? "float"}
          onChange={(e) => onPatch({ mobileBar: e.target.value })}
        >
          <option value="float">Floating card</option>
          <option value="dock">Full-bleed dock</option>
          <option value="hidden">Hidden</option>
        </select>
      </div>
    </div>
  );
}
