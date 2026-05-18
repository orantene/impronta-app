"use client";

import { useCallback, useRef, useState } from "react";
import { PresentationPanel } from "../shared/PresentationPanel";
import { VariantPicker } from "../shared/VariantPicker";
import { LinkPicker } from "../shared/LinkPicker";
import { RichEditor } from "@/components/edit-chrome/rich-editor";
import {
  searchTenantTalent,
  type TenantTalentPick,
} from "../../edit-mode/talent-picker-action";
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
    hint: "Uniform card grid — dense, scannable.",
  },
  {
    value: "carousel",
    label: "Carousel",
    hint: "Horizontal rail with scroll affordance — editorial.",
  },
];

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const INPUT =
  "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";

export function FeaturedTalentEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<FeaturedTalentV1>) {
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
    emptyStateText: initial.emptyStateText ?? "",
    footerCta: initial.footerCta,
    presentation: initial.presentation,
  };
  const patch = (p: Partial<FeaturedTalentV1>) => onChange({ ...value, ...p });
  // Field-visibility toggles default to ON (undefined = shown), matching the
  // render layer. A toggle stores `false` to hide; clearing returns to ON.
  const fieldOn = (k: keyof FeaturedTalentV1) =>
    (value[k] as boolean | undefined) !== false;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>Eyebrow</span>
          <input
            className={INPUT}
            maxLength={60}
            value={value.eyebrow ?? ""}
            onChange={(e) => patch({ eyebrow: e.target.value })}
          />
        </label>
        <div className={FIELD}>
          <span className={LABEL}>Headline</span>
          <RichEditor
            value={value.headline ?? ""}
            onChange={(next) => patch({ headline: next })}
            variant="single"
            tenantId={tenantId}
            ariaLabel="Headline"
          />
        </div>
      </div>

      <div className={FIELD}>
        <span className={LABEL}>Copy</span>
        <RichEditor
          value={value.copy ?? ""}
          onChange={(next) => patch({ copy: next })}
          variant="multi"
          tenantId={tenantId}
          ariaLabel="Copy"
        />
      </div>

      <VariantPicker
        name="featured_talent.variant"
        legend="Layout"
        sectionKey="featured_talent"
        options={LAYOUT_VARIANTS}
        value={value.variant}
        onChange={(next) => patch({ variant: next })}
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className={FIELD}>
          <span className={LABEL}>Source mode</span>
          <select
            className={INPUT}
            value={value.sourceMode}
            onChange={(e) =>
              patch({
                sourceMode: e.target.value as FeaturedTalentV1["sourceMode"],
              })
            }
          >
            <option value="auto_featured_flag">Auto — featured flag</option>
            <option value="auto_recent">Auto — most recent</option>
            <option value="auto_by_service">Auto — by service</option>
            <option value="auto_by_destination">Auto — by destination</option>
            <option value="manual_pick">Manual pick</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Limit</span>
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
          <span className={LABEL}>Columns (desktop)</span>
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
          <span className={LABEL}>Service slug</span>
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
          <span className={LABEL}>Destination slug</span>
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
          <span className={LABEL}>Pick talent</span>
          <TalentPicker
            selected={value.manualProfileCodes ?? []}
            onChange={(codes) =>
              patch({ manualProfileCodes: codes.slice(0, 15) })
            }
          />
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">
              Advanced — paste profile codes
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
          <span className={LABEL}>Footer CTA label</span>
          <input
            className={INPUT}
            value={value.footerCta?.label ?? ""}
            onChange={(e) =>
              patch({
                footerCta: e.target.value
                  ? {
                      label: e.target.value,
                      href: value.footerCta?.href ?? "/directory",
                    }
                  : undefined,
              })
            }
          />
        </label>
        <div className={FIELD}>
          <span className={LABEL}>Footer CTA href</span>
          <LinkPicker
            value={value.footerCta?.href ?? ""}
            onChange={(next) =>
              patch({
                footerCta: value.footerCta
                  ? { ...value.footerCta, href: next }
                  : next
                    ? { label: "Explore the collective", href: next }
                    : undefined,
              })
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>Card variant</span>
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
            <option value="editorial">Editorial</option>
            <option value="compact">Compact</option>
            <option value="minimal">Minimal</option>
            <option value="profile">Profile</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Empty-state text</span>
          <input
            className={INPUT}
            placeholder="No talent to show yet."
            value={value.emptyStateText ?? ""}
            onChange={(e) => patch({ emptyStateText: e.target.value })}
          />
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <span className={LABEL}>Card fields</span>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
          {(
            [
              ["showName", "Name"],
              ["showPrimaryType", "Primary type"],
              ["showCity", "City"],
              ["showBadge", "Featured badge"],
              ["showSecondaryType", "Secondary type *"],
              ["showLanguages", "Languages *"],
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
              {label}
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
            Parent category *
          </label>
        </div>
        <p className="text-[11px] text-muted-foreground">
          * Secondary type, languages, availability and parent-category are
          not on the cache-trimmed card payload yet — these toggles persist
          but render only after the documented DTO extension.
        </p>
      </fieldset>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>Request CTA label</span>
          <input
            className={INPUT}
            placeholder="Request"
            value={value.requestCta?.label ?? ""}
            onChange={(e) =>
              patch({
                requestCta: e.target.value
                  ? {
                      label: e.target.value,
                      href: value.requestCta?.href ?? "/inquiry/new",
                    }
                  : undefined,
              })
            }
          />
        </label>
        <div className={FIELD}>
          <span className={LABEL}>Request CTA href</span>
          <LinkPicker
            value={value.requestCta?.href ?? ""}
            onChange={(next) =>
              patch({
                requestCta: value.requestCta
                  ? { ...value.requestCta, href: next }
                  : next
                    ? { label: "Request", href: next }
                    : undefined,
              })
            }
          />
        </div>
      </div>

      <PresentationPanel
        value={value.presentation}
        onChange={(next) => patch({ presentation: next })}
      />
    </div>
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
      setErr("Could not search talent.");
    } finally {
      setLoading(false);
    }
  }, []);

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
                aria-label={`Remove ${code}`}
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
        placeholder="Search roster by name, code or city…"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
      />
      {loading ? (
        <p className="text-xs text-muted-foreground">Searching…</p>
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
                    {picked ? "Added" : "Add"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : query.trim().length > 0 ? (
        <p className="text-xs text-muted-foreground">No matches on roster.</p>
      ) : null}
    </div>
  );
}
