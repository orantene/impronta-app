"use client";

import { useEffect, useState, useTransition } from "react";

import type { SectionEditorProps } from "../types";
import type { DirectoryV1 } from "./schema";
import { fashionDirectoryPreset } from "./presets";
import { normalizeDirectoryProps } from "./normalize";
import {
  readDirectoryLiveCatalogSnapshot,
  setDirectoryFilterOptionSearchVisible,
  setDirectoryTopBarFacetKey,
  setDirectoryFieldSidebarVisibility,
  setDirectorySidebarItemOrder,
  type DirectoryLiveCatalogSnapshot,
} from "@/lib/site-admin/server/directory-catalogs";
import { DirectorySidebarItemOrderEditor } from "./DirectorySidebarItemOrderEditor";
import { KIT } from "@/components/edit-chrome/inspectors/kit";

/**
 * The 7-tab control drawer (plan §4). Every section-payload knob the
 * product owner asked for: per-instance label + scope (the "Our Chefs"
 * pattern), feature-first / hide talent, template + card pickers, full
 * per-element show/hide incl. hide-name, filters/sidebar, AI copy,
 * empty/SEO, one-click presets. Variations not yet live are present but
 * disabled in the pickers (canonical-first; no schema churn later).
 *
 * Field primitives are module-scope (stable identity — no re-created
 * components per render). Live tenant-catalog wiring is Phase 2b; the
 * payload already carries the intent.
 */

// Aligned to the shared inspector KIT (2026-05-29 drawer-unification pass)
// so the directory control drawer reads identically to every other section
// inspector. The drawer is builder chrome (warm); the directory *surface*
// keeps its own cool tokens — the one intentional cool-faint preview block
// below is left untouched.
const INPUT = KIT.input;
const LABEL = KIT.label;
const HELP = KIT.hint;

type Opt = { value: string; label: string; disabled?: boolean };

function FieldText({
  label,
  value,
  placeholder,
  area,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  area?: boolean;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <div className="space-y-1">
      <label className={LABEL}>{label}</label>
      {area ? (
        <textarea
          className={INPUT}
          rows={2}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      ) : (
        <input
          className={INPUT}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      )}
    </div>
  );
}

function FieldNumber({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <label className={LABEL}>{label}</label>
      <input
        type="number"
        className={INPUT}
        min={min}
        max={max}
        value={value}
        onChange={(e) =>
          onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))
        }
      />
    </div>
  );
}

function FieldToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 text-sm text-foreground">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

function FieldSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Opt[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className={LABEL}>{label}</label>
      <select
        className={INPUT}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function FieldTags({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string[];
  placeholder?: string;
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="space-y-1">
      <label className={LABEL}>{label}</label>
      <input
        className={INPUT}
        placeholder={placeholder ?? "comma-separated"}
        value={value.join(", ")}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
      />
    </div>
  );
}

/**
 * Per-field visibility toggle list, sourced from the saved `item_order`
 * (which is the live sidebar's facet sequence). Each row toggles the
 * `field_visibility_overrides` entry for that facet. Missing entry =
 * visible; `false` = hidden. The leading `__filter_search__` pseudo-key
 * has its own dedicated toggle above and is filtered out here.
 */
function LiveFieldVisibilityList({
  overrides,
  itemOrder,
  onToggle,
}: {
  overrides: Record<string, boolean>;
  itemOrder: string[];
  onToggle: (fieldKey: string, visible: boolean) => void;
}) {
  const facetKeys = itemOrder.filter((k) => k !== "__filter_search__");
  if (facetKeys.length === 0) {
    return (
      <p className={HELP}>
        No facet fields in the live catalog yet. Add directory facets in the
        field definitions admin first.
      </p>
    );
  }
  return (
    <div className="space-y-1 pt-1">
      <div className={LABEL}>Hide individual facets (live)</div>
      <div className="rounded-md border border-border/40">
        {facetKeys.map((k) => {
          const visible = overrides[k] !== false;
          return (
            <div
              key={k}
              className="flex items-center justify-between gap-3 border-b border-border/30 px-2.5 py-1.5 text-sm text-foreground last:border-b-0"
            >
              <span className="font-mono text-[12px]">{k}</span>
              <label className="inline-flex items-center gap-1.5 text-[11px] text-[var(--impronta-muted)]">
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={(e) => onToggle(k, e.target.checked)}
                />
                visible
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const TABS = [
  "Source",
  "Template",
  "Card",
  "Filters",
  "AI",
  "Empty/SEO",
  "Presets",
] as const;
type Tab = (typeof TABS)[number];

/**
 * A4 — Operator-friendly tab labels. Internal `Tab` keys stay the same
 * (used for state + URL stability); only the visible chip text changes.
 * The goal: a non-engineer marketer can open this drawer and orient
 * themselves immediately.
 */
const TAB_LABELS: Record<Tab, string> = {
  Source: "Who's in this directory",
  Template: "Layout",
  Card: "How talent appears",
  Filters: "How visitors narrow",
  AI: "AI search behavior",
  "Empty/SEO": "Edge cases",
  Presets: "Starter kits",
};

export function DirectoryEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<DirectoryV1>) {
  const [tab, setTab] = useState<Tab>("Source");
  const p = normalizeDirectoryProps(initial);
  const set = <K extends keyof DirectoryV1>(key: K, value: DirectoryV1[K]) =>
    onChange({ ...p, [key]: value });

  // ── Live tenant catalog (Phase 2b) ──────────────────────────────────
  // The Filters tab toggles knobs that live in `directory_sidebar_layout`
  // (tenant-scoped) and `field_definitions` (tenant-local override). The
  // section payload above ALSO carries similar booleans for the
  // section's local intent — but the rendered storefront reads the live
  // catalog. We load it once per drawer open and apply optimistic
  // updates against it.
  const [liveCatalog, setLiveCatalog] =
    useState<DirectoryLiveCatalogSnapshot | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [_isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    setLiveError(null);
    readDirectoryLiveCatalogSnapshot()
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setLiveCatalog(res.data);
        } else {
          setLiveError(res.error);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLiveError(err instanceof Error ? err.message : "Couldn't read live catalog.");
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  /** Optimistic-then-revert helper for live catalog writes. */
  const writeLive = (
    next: DirectoryLiveCatalogSnapshot,
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
  ) => {
    const previous = liveCatalog;
    setLiveCatalog(next);
    setLiveError(null);
    startTransition(() => {
      action()
        .then((res) => {
          if (!res.ok) {
            setLiveCatalog(previous);
            setLiveError(res.error);
          }
        })
        .catch((err: unknown) => {
          setLiveCatalog(previous);
          setLiveError(err instanceof Error ? err.message : "Save failed.");
        });
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border-b border-border pb-2">
        {TABS.map((tb) => (
          <button
            key={tb}
            type="button"
            onClick={() => setTab(tb)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] transition-colors ${
              tab === tb
                ? "bg-foreground/10 text-foreground"
                : "text-[var(--impronta-muted)] hover:text-foreground"
            }`}
          >
            {TAB_LABELS[tb]}
          </button>
        ))}
      </div>

      {tab === "Source" ? (
        <div className="space-y-4">
          <FieldSelect
            label="What you call them"
            value={p.entityLabel}
            onChange={(v) => set("entityLabel", v as DirectoryV1["entityLabel"])}
            options={[
              { value: "talent", label: "Talent" },
              { value: "people", label: "People" },
              { value: "members", label: "Members" },
              { value: "professionals", label: "Professionals" },
              { value: "providers", label: "Providers" },
              { value: "team", label: "Team" },
            ]}
          />
          <FieldSelect
            label="Who appears"
            value={p.scope}
            onChange={(v) => set("scope", v as DirectoryV1["scope"])}
            options={[
              { value: "all", label: "Everyone (all public talent)" },
              { value: "by_talent_type", label: "By talent type" },
              { value: "by_tag", label: "By tag" },
              { value: "manual", label: "Hand-picked" },
            ]}
          />
          {p.scope === "by_talent_type" ? (
            <FieldTags
              label="Talent type keys"
              value={p.talentTypeKeys}
              placeholder="chef, model, host"
              onChange={(v) => set("talentTypeKeys", v)}
            />
          ) : null}
          {p.scope === "by_tag" ? (
            <FieldTags
              label="Tag keys"
              value={p.tagKeys}
              onChange={(v) => set("tagKeys", v)}
            />
          ) : null}
          {p.scope === "manual" ? (
            <FieldTags
              label="Hand-pick talent (by profile code)"
              value={p.manualProfileCodes}
              placeholder="TAL-00014, TAL-00017"
              onChange={(v) => set("manualProfileCodes", v)}
            />
          ) : null}
          <FieldTags
            label="Feature first (pin to top, in order)"
            value={p.pinnedProfileCodes}
            placeholder="TAL-00014, TAL-00017"
            onChange={(v) => set("pinnedProfileCodes", v)}
          />
          <FieldTags
            label="Hide these talent"
            value={p.excludedProfileCodes}
            placeholder="TAL-00021"
            onChange={(v) => set("excludedProfileCodes", v)}
          />
          <FieldToggle
            label="Require a photo"
            checked={p.requirePhoto}
            onChange={(v) => set("requirePhoto", v)}
          />
          <FieldToggle
            label="Hide unavailable talent"
            checked={p.excludeUnavailable}
            onChange={(v) => set("excludeUnavailable", v)}
          />
          <FieldSelect
            label="Minimum trust tier"
            value={p.minTrustTier}
            onChange={(v) => set("minTrustTier", v as DirectoryV1["minTrustTier"])}
            options={[
              { value: "any", label: "Any" },
              { value: "basic", label: "Basic+" },
              { value: "verified", label: "Verified+" },
              { value: "silver", label: "Silver+" },
              { value: "gold", label: "Gold only" },
            ]}
          />
          <FieldSelect
            label="Default sort"
            value={p.defaultSort}
            onChange={(v) => set("defaultSort", v as DirectoryV1["defaultSort"])}
            options={[
              { value: "recommended", label: "Recommended" },
              { value: "newest", label: "Newest" },
              { value: "az", label: "A–Z" },
              { value: "availability", label: "Availability" },
              { value: "curated", label: "Curated (manual order)" },
            ]}
          />
          <FieldSelect
            label="Pagination"
            value={p.pagination}
            onChange={(v) => set("pagination", v as DirectoryV1["pagination"])}
            options={[
              { value: "infinite", label: "Infinite scroll" },
              { value: "load_more", label: "Load more button" },
              { value: "paged", label: "Numbered pages" },
            ]}
          />
          <FieldNumber
            label="Per page"
            value={p.pageSize}
            min={6}
            max={60}
            onChange={(v) => set("pageSize", v)}
          />
        </div>
      ) : null}

      {tab === "Template" ? (
        <div className="space-y-4">
          <FieldSelect
            label="Layout template"
            value={p.template}
            onChange={(v) => set("template", v as DirectoryV1["template"])}
            options={[
              { value: "atelier", label: "Atelier — editorial gallery" },
              { value: "studio", label: "Studio — coming soon", disabled: true },
              { value: "roster", label: "Roster — coming soon", disabled: true },
              { value: "practice", label: "Practice — coming soon", disabled: true },
              { value: "field", label: "Field — coming soon", disabled: true },
              { value: "showcase", label: "Showcase — coming soon", disabled: true },
              { value: "mosaic", label: "Mosaic — coming soon", disabled: true },
              { value: "map_first", label: "Map-first — coming soon", disabled: true },
            ]}
          />
          <FieldToggle
            label="Show heading block"
            checked={p.showHeading}
            onChange={(v) => set("showHeading", v)}
          />
          <FieldText
            label="Eyebrow"
            value={p.eyebrow ?? ""}
            placeholder="Roster"
            onChange={(v) => set("eyebrow", v)}
          />
          <FieldText
            label="Page label"
            value={p.headline ?? ""}
            placeholder="People · Models · Our Chefs"
            onChange={(v) => set("headline", v)}
          />
          <FieldText
            label="Intro copy"
            value={p.copy ?? ""}
            area
            onChange={(v) => set("copy", v)}
          />
          <FieldSelect
            label="Heading alignment"
            value={p.headerAlign}
            onChange={(v) => set("headerAlign", v as DirectoryV1["headerAlign"])}
            options={[
              { value: "center", label: "Center" },
              { value: "left", label: "Left" },
              { value: "split", label: "Split" },
            ]}
          />
          <div className="grid grid-cols-3 gap-2">
            <FieldNumber
              label="Cols ▭"
              value={p.columnsDesktop}
              min={1}
              max={6}
              onChange={(v) => set("columnsDesktop", v)}
            />
            <FieldNumber
              label="Cols ▢"
              value={p.columnsTablet}
              min={1}
              max={4}
              onChange={(v) => set("columnsTablet", v)}
            />
            <FieldNumber
              label="Cols ▯"
              value={p.columnsMobile}
              min={1}
              max={2}
              onChange={(v) => set("columnsMobile", v)}
            />
          </div>
          <FieldSelect
            label="Density"
            value={p.density}
            onChange={(v) => set("density", v as DirectoryV1["density"])}
            options={[
              { value: "comfortable", label: "Comfortable" },
              { value: "compact", label: "Compact" },
            ]}
          />
          <FieldSelect
            label="Container width"
            value={p.containerWidth}
            onChange={(v) =>
              set("containerWidth", v as DirectoryV1["containerWidth"])
            }
            options={[
              { value: "boxed", label: "Boxed" },
              { value: "full", label: "Full-bleed" },
            ]}
          />
          <FieldSelect
            label="Background"
            value={p.background}
            onChange={(v) => set("background", v as DirectoryV1["background"])}
            options={[
              { value: "cool_ground", label: "Cool ground" },
              { value: "plain", label: "Plain" },
              { value: "subtle", label: "Subtle" },
            ]}
          />
        </div>
      ) : null}

      {tab === "Card" ? (
        <div className="space-y-3">
          <FieldSelect
            label="Card style"
            value={p.cardStyle}
            onChange={(v) => set("cardStyle", v as DirectoryV1["cardStyle"])}
            options={[
              { value: "portrait", label: "Portrait (editorial)" },
              { value: "editorial", label: "Editorial (display name)" },
              { value: "portfolio", label: "Portfolio — coming soon", disabled: true },
              { value: "profile", label: "Profile — coming soon", disabled: true },
              { value: "stat", label: "Stat — coming soon", disabled: true },
              { value: "service", label: "Service — coming soon", disabled: true },
              { value: "minimal", label: "Minimal — coming soon", disabled: true },
            ]}
          />
          <FieldSelect
            label="Image aspect"
            value={p.cardAspect}
            onChange={(v) => set("cardAspect", v as DirectoryV1["cardAspect"])}
            options={[
              { value: "4:5", label: "4:5 portrait" },
              { value: "1:1", label: "1:1 square" },
              { value: "3:4", label: "3:4" },
              { value: "16:9", label: "16:9" },
            ]}
          />
          <FieldToggle
            label="Show name"
            checked={p.showName}
            onChange={(v) => set("showName", v)}
          />
          {!p.showName ? (
            <FieldSelect
              label="When name is hidden, show…"
              value={p.nameFallback}
              onChange={(v) =>
                set("nameFallback", v as DirectoryV1["nameFallback"])
              }
              options={[
                { value: "first_name", label: "First name only" },
                { value: "code", label: "Profile code" },
                { value: "role", label: "Role" },
                { value: "hidden", label: "Nothing" },
              ]}
            />
          ) : null}
          <FieldToggle
            label="Show talent type"
            checked={p.showTalentType}
            onChange={(v) => set("showTalentType", v)}
          />
          <FieldToggle
            label="Show location"
            checked={p.showLocation}
            onChange={(v) => set("showLocation", v)}
          />
          <FieldToggle
            label="Show attributes"
            checked={p.showAttributes}
            onChange={(v) => set("showAttributes", v)}
          />
          <FieldToggle
            label="Show rating"
            checked={p.showRating}
            onChange={(v) => set("showRating", v)}
          />
          <FieldToggle
            label="Show price-from"
            checked={p.showPriceFrom}
            onChange={(v) => set("showPriceFrom", v)}
          />
          <FieldToggle
            label="Show availability"
            checked={p.showAvailability}
            onChange={(v) => set("showAvailability", v)}
          />
          <FieldToggle
            label="Show ownership badge"
            checked={p.showBadges}
            onChange={(v) => set("showBadges", v)}
          />
          <FieldToggle
            label="Show save control"
            checked={p.showSave}
            onChange={(v) => set("showSave", v)}
          />
          <FieldToggle
            label="Show add-to-inquiry"
            checked={p.showAddToInquiry}
            onChange={(v) => set("showAddToInquiry", v)}
          />
          <FieldSelect
            label="Hover behavior"
            value={p.hoverBehavior}
            onChange={(v) =>
              set("hoverBehavior", v as DirectoryV1["hoverBehavior"])
            }
            options={[
              { value: "reveal_traits", label: "Reveal traits" },
              { value: "zoom", label: "Image zoom" },
              { value: "swap", label: "Swap image" },
              { value: "none", label: "None" },
            ]}
          />
          <FieldNumber
            label="Max field lines"
            value={p.maxFieldLines}
            min={1}
            max={6}
            onChange={(v) => set("maxFieldLines", v)}
          />
        </div>
      ) : null}

      {tab === "Filters" ? (
        <div className="space-y-3">
          <FieldToggle
            label="Show filter sidebar"
            checked={p.sidebarShow}
            onChange={(v) => set("sidebarShow", v)}
          />
          <FieldSelect
            label="Sidebar position"
            value={p.sidebarPosition}
            onChange={(v) =>
              set("sidebarPosition", v as DirectoryV1["sidebarPosition"])
            }
            options={[
              { value: "left", label: "Left" },
              { value: "right", label: "Right" },
            ]}
          />
          <FieldToggle
            label="Sticky sidebar"
            checked={p.sidebarSticky}
            onChange={(v) => set("sidebarSticky", v)}
          />
          <FieldToggle
            label="Sidebar starts collapsed"
            checked={p.sidebarDefaultCollapsed}
            onChange={(v) => set("sidebarDefaultCollapsed", v)}
          />
          <p className={HELP}>
            Visitors expand only the filters they care about — keeps the page
            scannable when there are many facets.
          </p>
          <FieldToggle
            label="Show filter search box"
            checked={p.filterSearchBox}
            onChange={(v) => set("filterSearchBox", v)}
          />
          <FieldSelect
            label="Pill bar above results"
            value={p.topBarMode}
            onChange={(v) => set("topBarMode", v as DirectoryV1["topBarMode"])}
            options={[
              { value: "talent_type", label: "Talent-type pills" },
              { value: "none", label: "None" },
              { value: "field", label: "A field facet" },
            ]}
          />
          <p className={HELP}>
            Shows the top-5 most-populated facets as quick-tap pills with a
            &quot;More&quot; disclosure for the rest.
          </p>
          {p.topBarMode === "field" ? (
            <FieldText
              label="Which field powers the pill bar"
              value={p.topBarFieldKey ?? ""}
              onChange={(v) => set("topBarFieldKey", v)}
            />
          ) : null}
          <FieldToggle
            label="Show sort control"
            checked={p.sortControlShow}
            onChange={(v) => set("sortControlShow", v)}
          />
          <FieldToggle
            label="Show result count"
            checked={p.showResultCount}
            onChange={(v) => set("showResultCount", v)}
          />
          <FieldToggle
            label="Show active-filter chips"
            checked={p.showActiveChips}
            onChange={(v) => set("showActiveChips", v)}
          />
          <FieldSelect
            label="Mobile filter style"
            value={p.mobileFilterStyle}
            onChange={(v) =>
              set("mobileFilterStyle", v as DirectoryV1["mobileFilterStyle"])
            }
            options={[
              { value: "sheet", label: "Bottom sheet" },
              { value: "drawer", label: "Side drawer" },
              { value: "inline", label: "Inline" },
            ]}
          />
          {/* ── Live tenant catalog (Phase 2b) ─────────────────────── */}
          <div className="mt-2 space-y-2 rounded-md border border-border/60 bg-[var(--impronta-cool-faint,transparent)] p-3">
            <div className="flex items-baseline justify-between gap-3">
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground">
                Live storefront sidebar
              </h4>
              <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--impronta-muted)]">
                Tenant catalog
              </span>
            </div>
            <p className={HELP}>
              These toggles write directly to your tenant&apos;s live filter
              catalog. They take effect after the directory page&apos;s next
              publish (or its cache TTL).
            </p>

            {liveError ? (
              <p className="text-[11px] text-rose-600">
                Couldn&apos;t reach catalog: {liveError}
              </p>
            ) : null}

            {liveCatalog ? (
              <>
                <FieldToggle
                  label="Show filter search box (live)"
                  checked={liveCatalog.sidebar.filterOptionSearchVisible}
                  onChange={(v) => {
                    const next: DirectoryLiveCatalogSnapshot = {
                      sidebar: {
                        ...liveCatalog.sidebar,
                        filterOptionSearchVisible: v,
                      },
                    };
                    writeLive(next, () => setDirectoryFilterOptionSearchVisible(v));
                  }}
                />
                <FieldSelect
                  label="Top facet bar (live)"
                  value={
                    liveCatalog.sidebar.topBarFacetKey === null
                      ? "__none__"
                      : liveCatalog.sidebar.topBarFacetKey
                  }
                  onChange={(v) => {
                    const key = v === "__none__" ? null : v;
                    const next: DirectoryLiveCatalogSnapshot = {
                      sidebar: { ...liveCatalog.sidebar, topBarFacetKey: key },
                    };
                    writeLive(next, () => setDirectoryTopBarFacetKey(key));
                  }}
                  options={[
                    { value: "__none__", label: "None" },
                    { value: "talent_type", label: "Talent type" },
                  ]}
                />
                {(() => {
                  const visibleFacetCount = liveCatalog.sidebar.itemOrder
                    .filter((k) => k !== "__filter_search__")
                    .filter(
                      (k) =>
                        liveCatalog.sidebar.fieldVisibilityOverrides[k] !== false,
                    ).length;
                  return visibleFacetCount > 8 ? (
                    <p className="rounded-md border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-[11px] leading-relaxed text-amber-400/90">
                      {visibleFacetCount} filters will show to visitors — consider hiding low-signal ones so the sidebar stays scannable.
                    </p>
                  ) : null;
                })()}
                <LiveFieldVisibilityList
                  overrides={liveCatalog.sidebar.fieldVisibilityOverrides}
                  itemOrder={liveCatalog.sidebar.itemOrder}
                  onToggle={(fieldKey, visible) => {
                    const nextOverrides = { ...liveCatalog.sidebar.fieldVisibilityOverrides };
                    if (visible) {
                      delete nextOverrides[fieldKey];
                    } else {
                      nextOverrides[fieldKey] = false;
                    }
                    const next: DirectoryLiveCatalogSnapshot = {
                      sidebar: {
                        ...liveCatalog.sidebar,
                        fieldVisibilityOverrides: nextOverrides,
                      },
                    };
                    writeLive(next, () =>
                      setDirectoryFieldSidebarVisibility(fieldKey, visible),
                    );
                  }}
                />
                <DirectorySidebarItemOrderEditor
                  itemOrder={liveCatalog.sidebar.itemOrder}
                  onReorder={(nextOrder) => {
                    const next: DirectoryLiveCatalogSnapshot = {
                      sidebar: {
                        ...liveCatalog.sidebar,
                        itemOrder: nextOrder,
                      },
                    };
                    writeLive(next, () =>
                      setDirectorySidebarItemOrder(nextOrder),
                    );
                  }}
                />
              </>
            ) : (
              <p className={HELP}>Loading live catalog…</p>
            )}
          </div>
        </div>
      ) : null}

      {tab === "AI" ? (
        <div className="space-y-4">
          <FieldSelect
            label="AI search"
            value={p.aiMode}
            onChange={(v) => set("aiMode", v as DirectoryV1["aiMode"])}
            options={[
              { value: "hero_band", label: "Hero band (above results)" },
              { value: "inline_strip", label: "Inline strip" },
              { value: "floating", label: "Floating" },
              { value: "off", label: "Off" },
            ]}
          />
          {p.aiMode !== "off" ? (
            <>
              <FieldSelect
                label="Placement"
                value={p.aiPlacement}
                onChange={(v) =>
                  set("aiPlacement", v as DirectoryV1["aiPlacement"])
                }
                options={[
                  { value: "above_center", label: "Above · center" },
                  { value: "above_left", label: "Above · left" },
                  { value: "in_sidebar", label: "In sidebar" },
                  { value: "replace_heading", label: "Replace heading" },
                ]}
              />
              <FieldText
                label="AI title"
                value={p.aiTitle ?? ""}
                onChange={(v) => set("aiTitle", v)}
              />
              <FieldText
                label="AI body"
                value={p.aiBody ?? ""}
                area
                onChange={(v) => set("aiBody", v)}
              />
              <FieldText
                label="Search placeholder"
                value={p.aiPlaceholder ?? ""}
                onChange={(v) => set("aiPlaceholder", v)}
              />
              <FieldTags
                label="Example prompts"
                value={p.aiExamplePrompts}
                placeholder="prompt one, prompt two"
                onChange={(v) => set("aiExamplePrompts", v)}
              />
              <FieldSelect
                label="Behavior"
                value={p.aiBehavior}
                onChange={(v) =>
                  set("aiBehavior", v as DirectoryV1["aiBehavior"])
                }
                options={[
                  { value: "interpret", label: "Interpret → set filters" },
                  { value: "rerank", label: "AI re-rank overlay" },
                ]}
              />
            </>
          ) : null}
        </div>
      ) : null}

      {tab === "Empty/SEO" ? (
        <div className="space-y-4">
          <FieldText
            label="Empty-state title"
            value={p.emptyStateTitle ?? ""}
            onChange={(v) => set("emptyStateTitle", v)}
          />
          <FieldText
            label="Empty-state text"
            value={p.emptyStateText ?? ""}
            area
            onChange={(v) => set("emptyStateText", v)}
          />
          <FieldText
            label="Empty-state CTA label"
            value={p.emptyStateCtaLabel ?? ""}
            onChange={(v) => set("emptyStateCtaLabel", v)}
          />
          <FieldText
            label="Empty-state CTA href"
            value={p.emptyStateCtaHref ?? ""}
            onChange={(v) => set("emptyStateCtaHref", v)}
          />
          <FieldToggle
            label="Emit structured data (SEO)"
            checked={p.structuredData}
            onChange={(v) => set("structuredData", v)}
          />
        </div>
      ) : null}

      {tab === "Presets" ? (
        <div className="space-y-3">
          <p className={HELP}>
            One-click starting points. Sets sensible defaults — every knob
            stays editable afterward.
          </p>
          <button
            type="button"
            onClick={() => onChange({ ...fashionDirectoryPreset })}
            className="w-full rounded-md border border-border px-3 py-2 text-left text-sm text-foreground transition-colors hover:border-foreground/30"
          >
            <span className="font-medium">Fashion / Model Agency</span>
            <span className={`mt-0.5 block ${HELP}`}>
              Atelier · Portrait · photo-required · AI hero band
            </span>
          </button>
          <p className={HELP}>
            Professional Practice · Home Services · Sports Roster · Creative
            Studio · Boutique Spotlight arrive with the variation system.
          </p>
        </div>
      ) : null}
    </div>
  );
}
