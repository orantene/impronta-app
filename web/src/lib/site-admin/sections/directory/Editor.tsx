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
import { useSectionT } from "../shared/section-editor-i18n";
import { KIT, PanelSaveChip } from "@/components/edit-chrome/inspectors/kit";
import { listCardKits } from "@/lib/site-admin/presets/card-kits";

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
  disabled,
  note,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  /** Honest disable for controls whose render path isn't wired yet. */
  disabled?: boolean;
  /** Small reason shown under the row (e.g. "Coming soon"). */
  note?: string;
}) {
  return (
    <div className={disabled ? "opacity-60" : undefined}>
      <label
        className={`flex items-center justify-between gap-3 py-1.5 text-sm text-foreground ${
          disabled ? "cursor-not-allowed" : ""
        }`}
      >
        <span>{label}</span>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
      </label>
      {note ? <p className={`${HELP} -mt-1`}>{note}</p> : null}
    </div>
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
  const t = useSectionT();
  return (
    <div className="space-y-1">
      <label className={LABEL}>{label}</label>
      <input
        className={INPUT}
        placeholder={placeholder ?? t("comma-separated")}
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
  const t = useSectionT();
  const facetKeys = itemOrder.filter((k) => k !== "__filter_search__");
  if (facetKeys.length === 0) {
    return (
      <p className={HELP}>
        {t(
          "No facet fields in the live catalog yet. Add directory facets in the field definitions admin first.",
        )}
      </p>
    );
  }
  return (
    <div className="space-y-1 pt-1">
      <div className={LABEL}>{t("Hide individual facets (live)")}</div>
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
                {t("visible")}
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
  const t = useSectionT();
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
  const [livePending, startTransition] = useTransition();

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
        setLiveError(
          err instanceof Error ? err.message : t("Couldn't read live catalog."),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, t]);

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
          setLiveError(err instanceof Error ? err.message : t("Save failed."));
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
            {t(TAB_LABELS[tb])}
          </button>
        ))}
      </div>

      {tab === "Source" ? (
        <div className="space-y-4">
          <FieldSelect
            label={t("What you call them")}
            value={p.entityLabel}
            onChange={(v) => set("entityLabel", v as DirectoryV1["entityLabel"])}
            options={[
              { value: "talent", label: t("Talent") },
              { value: "people", label: t("People") },
              { value: "members", label: t("Members") },
              { value: "professionals", label: t("Professionals") },
              { value: "providers", label: t("Providers") },
              { value: "team", label: t("Team") },
            ]}
          />
          <FieldSelect
            label={t("Who appears")}
            value={p.scope}
            onChange={(v) => set("scope", v as DirectoryV1["scope"])}
            options={[
              { value: "all", label: t("Everyone (all public talent)") },
              { value: "by_talent_type", label: t("By talent type") },
              { value: "by_tag", label: t("By tag") },
              { value: "manual", label: t("Hand-picked") },
            ]}
          />
          {p.scope === "by_talent_type" ? (
            <FieldTags
              label={t("Talent type keys")}
              value={p.talentTypeKeys}
              placeholder="chef, model, host"
              onChange={(v) => set("talentTypeKeys", v)}
            />
          ) : null}
          {p.scope === "by_tag" ? (
            <FieldTags
              label={t("Tag keys")}
              value={p.tagKeys}
              onChange={(v) => set("tagKeys", v)}
            />
          ) : null}
          {p.scope === "manual" ? (
            <FieldTags
              label={t("Hand-pick talent (by profile code)")}
              value={p.manualProfileCodes}
              placeholder="TAL-00014, TAL-00017"
              onChange={(v) => set("manualProfileCodes", v)}
            />
          ) : null}
          <FieldTags
            label={t("Feature first (pin to top, in order)")}
            value={p.pinnedProfileCodes}
            placeholder="TAL-00014, TAL-00017"
            onChange={(v) => set("pinnedProfileCodes", v)}
          />
          <FieldTags
            label={t("Hide these talent")}
            value={p.excludedProfileCodes}
            placeholder="TAL-00021"
            onChange={(v) => set("excludedProfileCodes", v)}
          />
          <FieldToggle
            label={t("Require a photo")}
            checked={p.requirePhoto}
            onChange={(v) => set("requirePhoto", v)}
          />
          <FieldToggle
            label={t("Hide unavailable talent")}
            checked={p.excludeUnavailable}
            onChange={(v) => set("excludeUnavailable", v)}
          />
          <FieldSelect
            label={t("Minimum trust tier")}
            value={p.minTrustTier}
            onChange={(v) => set("minTrustTier", v as DirectoryV1["minTrustTier"])}
            options={[
              { value: "any", label: t("Any") },
              { value: "basic", label: t("Basic+") },
              { value: "verified", label: t("Verified+") },
              { value: "silver", label: t("Silver+") },
              { value: "gold", label: t("Gold only") },
            ]}
          />
          <FieldSelect
            label={t("Default sort")}
            value={p.defaultSort}
            onChange={(v) => set("defaultSort", v as DirectoryV1["defaultSort"])}
            // Only shipped sorts are listed; unbuilt ones (az, availability,
            // curated) are omitted rather than shown as disabled "coming soon"
            // rows — dead options read as a broken product (matches #649). The
            // schema enum keeps them for back-compat / a saved older value.
            options={[
              { value: "recommended", label: t("Recommended") },
              { value: "newest", label: t("Newest") },
            ]}
          />
          <FieldSelect
            label={t("Pagination")}
            value={p.pagination}
            onChange={(v) => set("pagination", v as DirectoryV1["pagination"])}
            options={[
              { value: "infinite", label: t("Infinite scroll") },
              { value: "load_more", label: t("Load more button") },
              { value: "paged", label: t("Numbered pages") },
            ]}
          />
          <FieldNumber
            label={t("Per page")}
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
            label={t("Layout template")}
            value={p.template}
            onChange={(v) => set("template", v as DirectoryV1["template"])}
            // Only shipped templates are listed. Unbuilt layouts (studio,
            // roster, practice, field, showcase, mosaic, map_first) are NOT
            // shown as disabled "coming soon" rows — dead options read as a
            // broken product. They stay in the schema enum (DirectoryV1) so any
            // older saved value still validates; re-add a row here when built.
            options={[
              { value: "atelier", label: t("Atelier (editorial gallery)") },
            ]}
          />
          <FieldToggle
            label={t("Show heading block")}
            checked={p.showHeading}
            onChange={(v) => set("showHeading", v)}
          />
          <FieldText
            label={t("Eyebrow")}
            value={p.eyebrow ?? ""}
            placeholder={t("Roster")}
            onChange={(v) => set("eyebrow", v)}
          />
          <FieldText
            label={t("Page label")}
            value={p.headline ?? ""}
            placeholder={t("People · Models · Our Chefs")}
            onChange={(v) => set("headline", v)}
          />
          <FieldText
            label={t("Intro copy")}
            value={p.copy ?? ""}
            area
            onChange={(v) => set("copy", v)}
          />
          <FieldSelect
            label={t("Heading alignment")}
            value={p.headerAlign}
            onChange={(v) => set("headerAlign", v as DirectoryV1["headerAlign"])}
            options={[
              { value: "center", label: t("Center") },
              { value: "left", label: t("Left") },
              { value: "split", label: t("Split") },
            ]}
          />
          <div className="grid grid-cols-3 gap-2">
            <FieldNumber
              label={t("Cols ▭")}
              value={p.columnsDesktop}
              min={1}
              max={6}
              onChange={(v) => set("columnsDesktop", v)}
            />
            <FieldNumber
              label={t("Cols ▢")}
              value={p.columnsTablet}
              min={1}
              max={4}
              onChange={(v) => set("columnsTablet", v)}
            />
            <FieldNumber
              label={t("Cols ▯")}
              value={p.columnsMobile}
              min={1}
              max={2}
              onChange={(v) => set("columnsMobile", v)}
            />
          </div>
          <FieldSelect
            label={t("Density")}
            value={p.density ?? ""}
            onChange={(v) =>
              // "" = clear the per-section value so this section follows
              // the tenant-wide Card Design default.
              set("density", (v === "" ? undefined : v) as DirectoryV1["density"])
            }
            options={[
              { value: "", label: t("Follow Card Design default") },
              { value: "comfortable", label: t("Comfortable") },
              { value: "compact", label: t("Compact") },
            ]}
          />
          <FieldSelect
            label={t("Container width")}
            value={p.containerWidth}
            onChange={(v) =>
              set("containerWidth", v as DirectoryV1["containerWidth"])
            }
            options={[
              { value: "boxed", label: t("Boxed") },
              { value: "full", label: t("Full-bleed") },
            ]}
          />
          <FieldSelect
            label={t("Background")}
            value={p.background}
            onChange={(v) => set("background", v as DirectoryV1["background"])}
            options={[
              { value: "cool_ground", label: t("Cool ground") },
              { value: "plain", label: t("Plain") },
              { value: "subtle", label: t("Subtle") },
            ]}
          />
        </div>
      ) : null}

      {tab === "Card" ? (
        <div className="space-y-3">
          <FieldSelect
            label={t("Card kit (this directory only)")}
            value={p.cardKitOverride ?? "__inherit__"}
            onChange={(v) =>
              set(
                "cardKitOverride",
                v === "__inherit__" ? undefined : v,
              )
            }
            options={[
              { value: "__inherit__", label: t("Inherit workspace card design") },
              ...listCardKits().map((k) => ({
                value: k.slug,
                label: k.label,
              })),
            ]}
          />
          <p className={HELP}>
            {t(
              'Repaints just this directory\'s cards with a named look. Leave on "Inherit" to follow the workspace-wide card design set in Branding.',
            )}
          </p>
          <FieldSelect
            label={t("Card style")}
            value={p.cardStyle ?? ""}
            onChange={(v) =>
              // "" = clear the per-section value so this section follows
              // the tenant-wide Card Design default.
              set("cardStyle", (v === "" ? undefined : v) as DirectoryV1["cardStyle"])
            }
            // Only shipped card styles are listed; unbuilt ones (portfolio,
            // profile, stat, service, minimal) are omitted rather than shown as
            // disabled "coming soon" rows. Schema enum keeps them for back-compat.
            options={[
              { value: "", label: t("Follow Card Design default") },
              { value: "portrait", label: t("Portrait (editorial)") },
              { value: "editorial", label: t("Editorial (display name)") },
            ]}
          />
          <FieldSelect
            label={t("Image aspect")}
            value={p.cardAspect ?? ""}
            onChange={(v) =>
              // "" = clear the per-section value so this section follows
              // the tenant-wide Card Design default.
              set("cardAspect", (v === "" ? undefined : v) as DirectoryV1["cardAspect"])
            }
            options={[
              { value: "", label: t("Follow Card Design default") },
              { value: "4:5", label: t("4:5 portrait") },
              { value: "1:1", label: t("1:1 square") },
              { value: "3:4", label: "3:4" },
              { value: "16:9", label: "16:9" },
            ]}
          />
          <FieldToggle
            label={t("Show name")}
            checked={p.showName}
            onChange={(v) => set("showName", v)}
          />
          {!p.showName ? (
            <FieldSelect
              label={t("When name is hidden, show…")}
              value={p.nameFallback}
              onChange={(v) =>
                set("nameFallback", v as DirectoryV1["nameFallback"])
              }
              options={[
                { value: "first_name", label: t("First name only") },
                { value: "code", label: t("Profile code") },
                { value: "role", label: t("Role") },
                { value: "hidden", label: t("Nothing") },
              ]}
            />
          ) : null}
          <FieldToggle
            label={t("Show talent type")}
            checked={p.showTalentType}
            onChange={(v) => set("showTalentType", v)}
          />
          <FieldToggle
            label={t("Show location")}
            checked={p.showLocation}
            onChange={(v) => set("showLocation", v)}
          />
          <FieldToggle
            label={t("Show attributes")}
            checked={p.showAttributes}
            onChange={(v) => set("showAttributes", v)}
          />
          {/* Show rating is intentionally NOT listed (data not published to
              cards; a dead toggle reads as a broken product, #649). Price-from
              shipped with the offerings-backed "From $X" chip. */}
          <FieldToggle
            label={t("Show starting price")}
            checked={p.showPriceFrom}
            onChange={(v) => set("showPriceFrom", v)}
          />
          <FieldToggle
            label={t("Show availability")}
            checked={p.showAvailability}
            onChange={(v) => set("showAvailability", v)}
          />
          <FieldToggle
            label={t("Show ownership badge")}
            checked={p.showBadges}
            onChange={(v) => set("showBadges", v)}
          />
          <FieldToggle
            label={t("Show save control")}
            checked={p.showSave}
            onChange={(v) => set("showSave", v)}
          />
          <FieldToggle
            label={t("Show add-to-inquiry")}
            checked={p.showAddToInquiry}
            onChange={(v) => set("showAddToInquiry", v)}
          />
          <FieldToggle
            label={t("Show quick view (media peek)")}
            checked={p.showQuickView}
            onChange={(v) => set("showQuickView", v)}
          />
          <FieldSelect
            label={t("Card click opens")}
            value={p.cardClickAction}
            onChange={(v) =>
              set("cardClickAction", v as DirectoryV1["cardClickAction"])
            }
            options={[
              { value: "modal", label: t("Profile overlay (stay on page)") },
              { value: "page", label: t("Full profile page") },
            ]}
          />
          <FieldSelect
            label={t("Hover behavior")}
            value={p.hoverBehavior ?? ""}
            onChange={(v) =>
              // "" = clear the per-section value so this section follows
              // the tenant-wide Card Design default.
              set(
                "hoverBehavior",
                (v === "" ? undefined : v) as DirectoryV1["hoverBehavior"],
              )
            }
            options={[
              { value: "", label: t("Follow Card Design default") },
              { value: "reveal_traits", label: t("Reveal traits") },
              { value: "zoom", label: t("Image zoom") },
              { value: "swap", label: t("Swap image") },
              { value: "none", label: t("None") },
            ]}
          />
          <FieldNumber
            label={t("Max field lines")}
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
            label={t("Show filter sidebar")}
            checked={p.sidebarShow}
            onChange={(v) => set("sidebarShow", v)}
          />
          <FieldSelect
            label={t("Sidebar position")}
            value={p.sidebarPosition}
            onChange={(v) =>
              set("sidebarPosition", v as DirectoryV1["sidebarPosition"])
            }
            options={[
              { value: "left", label: t("Left") },
              { value: "right", label: t("Right") },
            ]}
          />
          <FieldToggle
            label={t("Sticky sidebar")}
            checked={p.sidebarSticky}
            note={t("Pins the filter sidebar while the results scroll.")}
            onChange={(v) => set("sidebarSticky", v)}
          />
          <FieldToggle
            label={t("Sidebar starts collapsed")}
            checked={p.sidebarDefaultCollapsed}
            onChange={(v) => set("sidebarDefaultCollapsed", v)}
          />
          <p className={HELP}>
            {t(
              "Visitors expand only the filters they care about, which keeps the page scannable when there are many facets.",
            )}
          </p>
          <FieldToggle
            label={t("Show filter search box")}
            checked={p.filterSearchBox}
            onChange={(v) => set("filterSearchBox", v)}
          />
          <FieldSelect
            label={t("Pill bar above results")}
            value={p.topBarMode}
            onChange={(v) => set("topBarMode", v as DirectoryV1["topBarMode"])}
            options={[
              { value: "talent_type", label: t("Talent-type pills") },
              { value: "none", label: t("None") },
              { value: "field", label: t("A field facet") },
            ]}
          />
          <p className={HELP}>
            {t(
              'Shows the top-5 most-populated facets as quick-tap pills with a "More" disclosure for the rest.',
            )}
          </p>
          {p.topBarMode === "field" ? (
            <FieldText
              label={t("Which field powers the pill bar")}
              value={p.topBarFieldKey ?? ""}
              onChange={(v) => set("topBarFieldKey", v)}
            />
          ) : null}
          <FieldToggle
            label={t("Show sort control")}
            checked={p.sortControlShow}
            onChange={(v) => set("sortControlShow", v)}
          />
          <FieldToggle
            label={t("Show result count")}
            checked={p.showResultCount}
            onChange={(v) => set("showResultCount", v)}
          />
          <FieldToggle
            label={t("Show active-filter chips")}
            checked={p.showActiveChips}
            onChange={(v) => set("showActiveChips", v)}
          />
          <FieldSelect
            label={t("Mobile filter style")}
            value={p.mobileFilterStyle}
            onChange={(v) =>
              set("mobileFilterStyle", v as DirectoryV1["mobileFilterStyle"])
            }
            options={[
              { value: "sheet", label: t("Bottom sheet") },
              { value: "drawer", label: t("Side drawer") },
              { value: "inline", label: t("Inline") },
            ]}
          />
          {/* ── Live tenant catalog (Phase 2b) ─────────────────────── */}
          <div className="mt-2 space-y-2 rounded-md border border-border/60 bg-[var(--impronta-cool-faint,transparent)] p-3">
            <div className="flex items-baseline justify-between gap-3">
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground">
                {t("Live storefront sidebar")}
              </h4>
              <div className="flex items-center gap-2">
                <PanelSaveChip
                  dirty={false}
                  saving={livePending}
                  error={liveError}
                />
                <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--impronta-muted)]">
                  {t("Tenant catalog")}
                </span>
              </div>
            </div>
            <p className={HELP}>
              {t(
                "These toggles write directly to your tenant's live filter catalog. They take effect after the directory page's next publish (or its cache TTL).",
              )}
            </p>

            {liveError ? (
              <p className="text-[11px] text-rose-600">
                {t("Couldn't reach catalog:")} {liveError}
              </p>
            ) : null}

            {liveCatalog ? (
              <>
                <FieldToggle
                  label={t("Show filter search box (live)")}
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
                  label={t("Top facet bar (live)")}
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
                    { value: "__none__", label: t("None") },
                    { value: "talent_type", label: t("Talent type") },
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
                    <p className="rounded-md border border-blue-500/30 bg-blue-500/[0.06] px-3 py-2 text-[11px] leading-relaxed text-blue-400/90">
                      {t(
                        "{count} filters will show to visitors. Consider hiding low-signal ones so the sidebar stays scannable.",
                      ).replace("{count}", String(visibleFacetCount))}
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
              <p className={HELP}>{t("Loading live catalog…")}</p>
            )}
          </div>
        </div>
      ) : null}

      {tab === "AI" ? (
        <div className="space-y-4">
          <FieldSelect
            label={t("AI search")}
            value={p.aiMode}
            onChange={(v) => set("aiMode", v as DirectoryV1["aiMode"])}
            options={[
              { value: "hero_band", label: t("Hero band (above results)") },
              { value: "inline_strip", label: t("Inline strip") },
              { value: "floating", label: t("Floating") },
              { value: "off", label: t("Off") },
            ]}
          />
          {p.aiMode !== "off" ? (
            <>
              <FieldSelect
                label={t("Placement")}
                value={p.aiPlacement}
                onChange={(v) =>
                  set("aiPlacement", v as DirectoryV1["aiPlacement"])
                }
                options={[
                  { value: "above_center", label: t("Above · center") },
                  { value: "above_left", label: t("Above · left") },
                  { value: "in_sidebar", label: t("In sidebar") },
                  { value: "replace_heading", label: t("Replace heading") },
                ]}
              />
              <FieldText
                label={t("AI title")}
                value={p.aiTitle ?? ""}
                onChange={(v) => set("aiTitle", v)}
              />
              <FieldText
                label={t("AI body")}
                value={p.aiBody ?? ""}
                area
                onChange={(v) => set("aiBody", v)}
              />
              <FieldText
                label={t("Search placeholder")}
                value={p.aiPlaceholder ?? ""}
                onChange={(v) => set("aiPlaceholder", v)}
              />
              <FieldTags
                label={t("Example prompts")}
                value={p.aiExamplePrompts}
                placeholder={t("prompt one, prompt two")}
                onChange={(v) => set("aiExamplePrompts", v)}
              />
              <FieldSelect
                label={t("Behavior")}
                value={p.aiBehavior}
                onChange={(v) =>
                  set("aiBehavior", v as DirectoryV1["aiBehavior"])
                }
                options={[
                  { value: "interpret", label: t("Interpret → set filters") },
                  { value: "rerank", label: t("AI re-rank overlay") },
                ]}
              />
            </>
          ) : null}
        </div>
      ) : null}

      {tab === "Empty/SEO" ? (
        <div className="space-y-4">
          <FieldText
            label={t("Empty-state title")}
            value={p.emptyStateTitle ?? ""}
            onChange={(v) => set("emptyStateTitle", v)}
          />
          <FieldText
            label={t("Empty-state text")}
            value={p.emptyStateText ?? ""}
            area
            onChange={(v) => set("emptyStateText", v)}
          />
          <FieldText
            label={t("Empty-state CTA label")}
            value={p.emptyStateCtaLabel ?? ""}
            onChange={(v) => set("emptyStateCtaLabel", v)}
          />
          <FieldText
            label={t("Empty-state CTA href")}
            value={p.emptyStateCtaHref ?? ""}
            onChange={(v) => set("emptyStateCtaHref", v)}
          />
          <FieldToggle
            label={t("Emit structured data (SEO)")}
            checked={p.structuredData}
            onChange={(v) => set("structuredData", v)}
          />
        </div>
      ) : null}

      {tab === "Presets" ? (
        <div className="space-y-3">
          <p className={HELP}>
            {t(
              "One-click starting points. Sets sensible defaults, and every knob stays editable afterward.",
            )}
          </p>
          <button
            type="button"
            onClick={() => onChange({ ...fashionDirectoryPreset })}
            className="w-full rounded-md border border-border px-3 py-2 text-left text-sm text-foreground transition-colors hover:border-foreground/30"
          >
            <span className="font-medium">{t("Fashion / Model Agency")}</span>
            <span className={`mt-0.5 block ${HELP}`}>
              {t("Atelier · Portrait · photo-required · AI hero band")}
            </span>
          </button>
          <p className={HELP}>
            {t(
              "Professional Practice · Home Services · Sports Roster · Creative Studio · Boutique Spotlight arrive with the variation system.",
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}
