"use client";

import { useCallback, useRef, useState } from "react";
import { PresentationPanel } from "../shared/PresentationPanel";
import { VariantPicker } from "../shared/VariantPicker";
import { LinkKindPicker } from "../shared/LinkKindPicker";
import { useSectionT } from "../shared/section-editor-i18n";
import { coerceLegacyHref } from "../../links/link-ref";
import { RichEditor } from "@/components/edit-chrome/rich-editor";
import {
  searchTenantTalent,
  type TenantTalentPick,
} from "../../edit-mode/talent-picker-action";
import { v11FeaturedTalentPreset } from "./presets";
import type { SectionEditorProps } from "../types";
import type { FeaturedTalentV1 } from "./schema";

const LAYOUT_VARIANTS: ReadonlyArray<{
  value: NonNullable<FeaturedTalentV1["variant"]>;
  label: string;
  hint: string;
}> = [
  {
    value: "grid",
    label: "Grid",
    hint: "Uniform card grid. Dense and scannable.",
  },
  {
    value: "carousel",
    label: "Carousel",
    hint: "Horizontal rail with scroll affordance. Editorial feel.",
  },
];

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const INPUT =
  "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";
const BUTTON_PRIMARY =
  "rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90";

export function FeaturedTalentEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<FeaturedTalentV1>) {
  const t = useSectionT();
  const value: FeaturedTalentV1 = {
    eyebrow: initial.eyebrow ?? "Featured collective",
    headline: initial.headline ?? "",
    copy: initial.copy ?? "",
    sourceMode: initial.sourceMode ?? "auto_featured_flag",
    manualProfileCodes: initial.manualProfileCodes ?? [],
    filterServiceSlug: initial.filterServiceSlug ?? "",
    filterDestinationSlug: initial.filterDestinationSlug ?? "",
    limit: initial.limit ?? 6,
    columnsDesktop: initial.columnsDesktop ?? 3,
    variant: initial.variant ?? "grid",
    layoutPreset: initial.layoutPreset,
    headerAlign: initial.headerAlign,
    cardChrome: initial.cardChrome,
    imageTreatment: initial.imageTreatment,
    showBookmarkIcon: initial.showBookmarkIcon,
    actionStyle: initial.actionStyle,
    cardVariant: initial.cardVariant,
    showName: initial.showName,
    showPrimaryType: initial.showPrimaryType,
    showSecondaryType: initial.showSecondaryType,
    showCity: initial.showCity,
    showLanguages: initial.showLanguages,
    showAvailability: initial.showAvailability,
    showBadge: initial.showBadge,
    parentCategoryDisplay: initial.parentCategoryDisplay,
    requestCta: initial.requestCta,
    itemCtas: initial.itemCtas,
    emptyStateText: initial.emptyStateText ?? "",
    footerCta: initial.footerCta,
    presentation: initial.presentation,
  };
  const patch = (p: Partial<FeaturedTalentV1>) => onChange({ ...value, ...p });
  // Field-visibility toggles default to ON (undefined = shown), matching the
  // render layer. A toggle stores `false` to hide; clearing returns to ON.
  const fieldOn = (k: keyof FeaturedTalentV1) =>
    (value[k] as boolean | undefined) !== false;
  const applyV11Preset = () =>
    onChange({
      ...value,
      ...v11FeaturedTalentPreset,
      presentation: { ...v11FeaturedTalentPreset.presentation },
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-violet-300/70 bg-violet-50 p-3 text-violet-950 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {t("V11 featured talent preset")}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-violet-800">
              {t(
                "Applies the prototype treatment: centered title, four-card noir grid, cinematic image grade, bookmark glyphs, outline actions, and an Explore Talent footer link.",
              )}
            </p>
          </div>
          <button type="button" className={BUTTON_PRIMARY} onClick={applyV11Preset}>
            {t("Apply full preset")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>{t("Eyebrow")}</span>
          <input
            className={INPUT}
            maxLength={60}
            value={value.eyebrow ?? ""}
            onChange={(e) => patch({ eyebrow: e.target.value })}
          />
        </label>
        <div className={FIELD}>
          <span className={LABEL}>{t("Headline")}</span>
          <RichEditor
            value={value.headline ?? ""}
            onChange={(next) => patch({ headline: next })}
            variant="single"
            tenantId={tenantId}
            ariaLabel={t("Headline")}
          />
        </div>
      </div>

      <div className={FIELD}>
        <span className={LABEL}>{t("Copy")}</span>
        <RichEditor
          value={value.copy ?? ""}
          onChange={(next) => patch({ copy: next })}
          variant="multi"
          tenantId={tenantId}
          ariaLabel={t("Copy")}
        />
      </div>

      <VariantPicker
        name="featured_talent.variant"
        legend={t("Layout")}
        sectionKey="featured_talent"
        options={LAYOUT_VARIANTS}
        value={value.variant}
        onChange={(next) => patch({ variant: next })}
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className={FIELD}>
          <span className={LABEL}>{t("Section preset")}</span>
          <select
            className={INPUT}
            value={value.layoutPreset ?? "standard"}
            onChange={(e) =>
              patch({
                layoutPreset: e.target
                  .value as FeaturedTalentV1["layoutPreset"],
              })
            }
          >
            <option value="standard">{t("Standard")}</option>
            <option value="v11-showcase">{t("V11 showcase")}</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>{t("Header alignment")}</span>
          <select
            className={INPUT}
            value={value.headerAlign ?? "split"}
            onChange={(e) =>
              patch({
                headerAlign: e.target
                  .value as FeaturedTalentV1["headerAlign"],
              })
            }
          >
            <option value="split">{t("Split")}</option>
            <option value="left">{t("Left")}</option>
            <option value="center">{t("Center")}</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>{t("Card chrome")}</span>
          <select
            className={INPUT}
            value={value.cardChrome ?? "standard"}
            onChange={(e) =>
              patch({
                cardChrome: e.target
                  .value as FeaturedTalentV1["cardChrome"],
              })
            }
          >
            <option value="standard">{t("Theme default")}</option>
            <option value="v11-noir">{t("V11 noir")}</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>{t("Image treatment")}</span>
          <select
            className={INPUT}
            value={value.imageTreatment ?? "natural"}
            onChange={(e) =>
              patch({
                imageTreatment: e.target
                  .value as FeaturedTalentV1["imageTreatment"],
              })
            }
          >
            <option value="natural">{t("Natural")}</option>
            <option value="cinematic">{t("Cinematic")}</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>{t("Action style")}</span>
          <select
            className={INPUT}
            value={value.actionStyle ?? "primary-duo"}
            onChange={(e) =>
              patch({
                actionStyle: e.target
                  .value as FeaturedTalentV1["actionStyle"],
              })
            }
          >
            <option value="primary-duo">{t("Primary request")}</option>
            <option value="outline-duo">{t("Outline duo")}</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className={FIELD}>
          <span className={LABEL}>{t("Source mode")}</span>
          <select
            className={INPUT}
            value={value.sourceMode}
            onChange={(e) =>
              patch({
                sourceMode: e.target.value as FeaturedTalentV1["sourceMode"],
              })
            }
          >
            <option value="auto_featured_flag">
              {t("Auto by featured flag")}
            </option>
            <option value="auto_recent">{t("Auto by most recent")}</option>
            <option value="auto_by_service">{t("Auto by service")}</option>
            <option value="auto_by_destination">
              {t("Auto by destination")}
            </option>
            <option value="manual_pick">{t("Manual pick")}</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>{t("Limit")}</span>
          <input
            className={INPUT}
            type="number"
            min={1}
            max={15}
            value={value.limit}
            onChange={(e) =>
              patch({
                limit: Math.max(1, Math.min(15, Number(e.target.value) || 6)),
              })
            }
          />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>{t("Columns (desktop)")}</span>
          <input
            className={INPUT}
            type="number"
            min={2}
            max={4}
            value={value.columnsDesktop}
            onChange={(e) =>
              patch({
                columnsDesktop: Math.max(2, Math.min(4, Number(e.target.value) || 3)),
              })
            }
          />
        </label>
      </div>

      {value.sourceMode === "auto_by_service" ? (
        <label className={FIELD}>
          <span className={LABEL}>{t("Service slug")}</span>
          <input
            className={INPUT}
            placeholder="bridal-makeup"
            value={value.filterServiceSlug ?? ""}
            onChange={(e) => patch({ filterServiceSlug: e.target.value })}
          />
        </label>
      ) : null}

      {value.sourceMode === "auto_by_destination" ? (
        <label className={FIELD}>
          <span className={LABEL}>{t("Destination slug")}</span>
          <input
            className={INPUT}
            placeholder="tulum"
            value={value.filterDestinationSlug ?? ""}
            onChange={(e) => patch({ filterDestinationSlug: e.target.value })}
          />
        </label>
      ) : null}

      {value.sourceMode === "manual_pick" ? (
        <div className="flex flex-col gap-2">
          <span className={LABEL}>{t("Pick talent")}</span>
          <TalentPicker
            selected={value.manualProfileCodes ?? []}
            onChange={(codes) =>
              patch({ manualProfileCodes: codes.slice(0, 15) })
            }
          />
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">
              {t("Advanced: paste profile codes")}
            </summary>
            <input
              className={`${INPUT} mt-1.5`}
              placeholder="aurelia-cruz, elena-marchetti, mateo-lange"
              value={(value.manualProfileCodes ?? []).join(", ")}
              onChange={(e) =>
                patch({
                  manualProfileCodes: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .slice(0, 15),
                })
              }
            />
          </details>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>{t("Footer CTA label")}</span>
          <input
            className={INPUT}
            value={value.footerCta?.label ?? ""}
            onChange={(e) =>
              patch({
                footerCta: e.target.value
                  ? {
                      label: e.target.value,
                      href: value.footerCta?.href ?? coerceLegacyHref("/directory"),
                    }
                  : undefined,
              })
            }
          />
        </label>
        <div className={FIELD}>
          <span className={LABEL}>{t("Footer CTA href")}</span>
          <LinkKindPicker
            value={value.footerCta?.href}
            onChange={(next) =>
              patch({
                footerCta: value.footerCta
                  ? { ...value.footerCta, href: next }
                  : { label: "Explore the collective", href: next },
              })
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>{t("Card variant")}</span>
          <select
            className={INPUT}
            value={value.cardVariant ?? "editorial"}
            onChange={(e) =>
              patch({
                cardVariant: e.target
                  .value as FeaturedTalentV1["cardVariant"],
              })
            }
          >
            <option value="editorial">{t("Editorial")}</option>
            <option value="compact">{t("Compact")}</option>
            <option value="minimal">{t("Minimal")}</option>
            <option value="profile">{t("Profile")}</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>{t("Empty-state text")}</span>
          <input
            className={INPUT}
            placeholder={t("No talent to show yet.")}
            value={value.emptyStateText ?? ""}
            onChange={(e) => patch({ emptyStateText: e.target.value })}
          />
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <span className={LABEL}>{t("Card fields")}</span>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
          {(
            [
              ["showName", "Name"],
              ["showPrimaryType", "Primary type"],
              ["showSecondaryType", "Secondary type"],
              ["showCity", "City"],
              ["showLanguages", "Languages"],
              ["showBadge", "Featured badge"],
              ["showAvailability", "Availability *"],
            ] as [keyof FeaturedTalentV1, string][]
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={fieldOn(key)}
                onChange={(e) =>
                  patch({ [key]: e.target.checked } as Partial<FeaturedTalentV1>)
                }
              />
              {t(label)}
            </label>
          ))}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={value.parentCategoryDisplay === true}
              onChange={(e) =>
                patch({ parentCategoryDisplay: e.target.checked })
              }
            />
            {t("Parent category *")}
          </label>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {t(
            "Secondary type and languages render real profile data when the source is a manual pick, service or destination. * Availability and parent-category have no reliable public source yet, so these toggles persist but never render fabricated data.",
          )}
        </p>
      </fieldset>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>{t("Request CTA label")}</span>
          <input
            className={INPUT}
            placeholder={t("Request")}
            value={value.requestCta?.label ?? ""}
            onChange={(e) =>
              patch({
                requestCta: e.target.value
                  ? {
                      label: e.target.value,
                      href: value.requestCta?.href ?? coerceLegacyHref("/inquiry/new"),
                    }
                  : undefined,
              })
            }
          />
        </label>
        <div className={FIELD}>
          <span className={LABEL}>{t("Request CTA href")}</span>
          <LinkKindPicker
            value={value.requestCta?.href}
            onChange={(next) =>
              patch({
                requestCta: value.requestCta
                  ? { ...value.requestCta, href: next }
                  : { label: "Request", href: next },
              })
            }
          />
        </div>
      </div>

      <ItemCtaOverrides
        rows={value.itemCtas ?? []}
        onChange={(itemCtas) => patch({ itemCtas })}
      />

      <PresentationPanel
        value={value.presentation}
        onChange={(next) => patch({ presentation: next })}
      />
    </div>
  );
}

function ItemCtaOverrides({
  rows,
  onChange,
}: {
  rows: NonNullable<FeaturedTalentV1["itemCtas"]>;
  onChange: (rows: NonNullable<FeaturedTalentV1["itemCtas"]>) => void;
}) {
  const t = useSectionT();
  const [draftCode, setDraftCode] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const addDraft = () => {
    const profileCode = draftCode.trim();
    const label = draftLabel.trim();
    if (!profileCode || !label) return;
    onChange([...rows, { profileCode, label }]);
    setDraftCode("");
    setDraftLabel("");
  };

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={LABEL}>{t("Per-card CTA override")}</legend>
      <p className="text-[11px] text-muted-foreground">
        {t(
          "Optional. Overrides the section Request label on one card so a mixed rail can say Reserve on a bookable person and Request on a model.",
        )}
      </p>
      {rows.map((row, index) => (
        <div key={`${row.profileCode}-${index}`} className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <span className="truncate px-2 py-1.5 text-sm">{row.profileCode}</span>
          <span className="truncate px-2 py-1.5 text-sm">{row.label}</span>
          <button
            type="button"
            className="text-xs text-muted-foreground underline"
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            {t("Remove")}
          </button>
        </div>
      ))}
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <input
          className={INPUT}
          placeholder={t("Profile code")}
          value={draftCode}
          onChange={(e) => setDraftCode(e.target.value)}
        />
        <input
          className={INPUT}
          placeholder={t("Reserve")}
          value={draftLabel}
          onChange={(e) => setDraftLabel(e.target.value)}
        />
        <button type="button" className="text-xs font-medium underline" onClick={addDraft}>
          {t("Add")}
        </button>
      </div>
    </fieldset>
  );
}

/**
 * Tenant-scoped visual talent picker. Calls the `searchTenantTalent` server
 * action (Decision-3) which self-scopes to the active workspace roster —
 * the editor never passes a tenant id, and the action never returns
 * cross-tenant or off-roster talent. Selection is stored as profile codes
 * (the shape `manual_pick` + the fetch layer already consume); raw paste
 * remains available via the "Advanced" disclosure above.
 */
function TalentPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (codes: string[]) => void;
}) {
  const t = useSectionT();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TenantTalentPick[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(async (q: string) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await searchTenantTalent({ query: q });
      if (res.ok) setResults(res.results);
      else setErr(res.error);
    } catch {
      setErr(t("Could not search talent."));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const onQuery = (q: string) => {
    setQuery(q);
    if (tRef.current) clearTimeout(tRef.current);
    tRef.current = setTimeout(() => void run(q), 250);
  };

  const add = (code: string) => {
    if (selected.includes(code) || selected.length >= 15) return;
    onChange([...selected, code]);
  };
  const remove = (code: string) =>
    onChange(selected.filter((c) => c !== code));

  return (
    <div className="flex flex-col gap-2">
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((code) => (
            <span
              key={code}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-xs"
            >
              {code}
              <button
                type="button"
                aria-label={t("Remove {name}").replace("{name}", code)}
                className="text-muted-foreground hover:text-foreground"
                onClick={() => remove(code)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <input
        className="w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm"
        placeholder={t("Search roster by name, code or city…")}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
      />
      {loading ? (
        <p className="text-xs text-muted-foreground">{t("Searching…")}</p>
      ) : err ? (
        <p className="text-xs text-destructive">{err}</p>
      ) : results.length > 0 ? (
        <ul className="max-h-56 overflow-auto rounded-md border border-border/60">
          {results.map((r) => {
            const picked = selected.includes(r.profileCode);
            return (
              <li key={r.talentProfileId}>
                <button
                  type="button"
                  disabled={picked || selected.length >= 15}
                  onClick={() => add(r.profileCode)}
                  className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50"
                >
                  <span className="truncate">
                    <b>{r.displayName}</b>{" "}
                    <span className="text-muted-foreground">
                      {r.primaryTypeLabel ?? r.profileCode}
                      {r.cityLabel ? ` · ${r.cityLabel}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {picked ? t("Added") : t("Add")}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : query.trim().length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("No matches on roster.")}
        </p>
      ) : null}
    </div>
  );
}
