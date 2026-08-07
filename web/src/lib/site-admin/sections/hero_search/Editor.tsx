"use client";

import { KIT } from "@/components/edit-chrome/inspectors/kit";
import { PresentationPanel } from "../shared/PresentationPanel";
import { LinkKindPicker } from "../shared/LinkKindPicker";
import { useSectionT } from "../shared/section-editor-i18n";
import { coerceLegacyHref } from "../../links/link-ref";
import type { LinkRef } from "../../links/link-ref";
import type { SectionEditorProps } from "../types";
import type { HeroSearchV1 } from "./schema";

const FIELD = KIT.field;
const LABEL = KIT.label;
const INPUT = KIT.input;

export function HeroSearchEditor({
  initial,
  onChange,
}: SectionEditorProps<HeroSearchV1>) {
  const t = useSectionT();
  const value: HeroSearchV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "Find the right talent",
    highlight: initial.highlight ?? "for your brief.",
    subheadline: initial.subheadline ?? "",
    search: initial.search ?? { enabled: true, mode: "directory-query" },
    primaryCta: initial.primaryCta,
    secondaryCta: initial.secondaryCta,
    chipsSource: initial.chipsSource ?? "manual",
    chips: initial.chips ?? [],
    statSource: initial.statSource ?? "manual",
    statItems: initial.statItems ?? [],
    statCountLabel: initial.statCountLabel ?? "",
    layout: initial.layout ?? "centered",
    presentation: initial.presentation,
  };
  const patch = (p: Partial<HeroSearchV1>) => onChange({ ...value, ...p });
  const search = value.search ?? { enabled: true, mode: "directory-query" };
  const patchSearch = (p: Partial<NonNullable<HeroSearchV1["search"]>>) =>
    patch({ search: { ...search, ...p } });

  const chips = value.chips ?? [];
  const setChip = (i: number, p: Partial<{ label: string; href: LinkRef }>) =>
    patch({
      chips: chips.map((c, idx) => (idx === i ? { ...c, ...p } : c)),
    });

  const cta = (
    key: "primaryCta" | "secondaryCta",
    label: string,
    labelFieldLabel: string,
    hrefFieldLabel: string,
  ) => (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      <label className={FIELD}>
        <span className={LABEL}>{labelFieldLabel}</span>
        <input
          className={INPUT}
          value={value[key]?.label ?? ""}
          onChange={(e) =>
            patch({
              [key]: e.target.value
                ? {
                    label: e.target.value,
                    href: value[key]?.href ?? coerceLegacyHref("/directory"),
                  }
                : undefined,
            } as Partial<HeroSearchV1>)
          }
        />
      </label>
      <div className={FIELD}>
        <span className={LABEL}>{hrefFieldLabel}</span>
        <LinkKindPicker
          value={value[key]?.href}
          onChange={(next) =>
            patch({
              [key]: value[key]
                ? { ...value[key]!, href: next }
                : { label: label, href: next },
            } as Partial<HeroSearchV1>)
          }
        />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>{t("Eyebrow")}</span>
          <input
            className={INPUT}
            value={value.eyebrow ?? ""}
            onChange={(e) => patch({ eyebrow: e.target.value })}
          />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>{t("Layout")}</span>
          <select
            className={INPUT}
            value={value.layout}
            onChange={(e) =>
              patch({ layout: e.target.value as HeroSearchV1["layout"] })
            }
          >
            <option value="centered">{t("Centered")}</option>
            <option value="split">{t("Split")}</option>
            <option value="minimal">{t("Minimal")}</option>
            <option value="editorial">{t("Editorial")}</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>{t("Headline")}</span>
          <input
            className={INPUT}
            value={value.headline ?? ""}
            onChange={(e) => patch({ headline: e.target.value })}
          />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>{t("Highlighted phrase")}</span>
          <input
            className={INPUT}
            value={value.highlight ?? ""}
            onChange={(e) => patch({ highlight: e.target.value })}
          />
        </label>
      </div>

      <label className={FIELD}>
        <span className={LABEL}>{t("Subheading")}</span>
        <input
          className={INPUT}
          value={value.subheadline ?? ""}
          onChange={(e) => patch({ subheadline: e.target.value })}
        />
      </label>

      <fieldset className="flex flex-col gap-2 rounded-lg border border-[#e5e0d5] p-2">
        <span className={LABEL}>{t("Search")}</span>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={search.enabled !== false}
            onChange={(e) => patchSearch({ enabled: e.target.checked })}
          />
          {t("Show search field")}
        </label>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <label className={FIELD}>
            <span className={LABEL}>{t("Mode")}</span>
            <select
              className={INPUT}
              value={search.mode ?? "directory-query"}
              onChange={(e) =>
                patchSearch({
                  mode: e.target.value as NonNullable<
                    HeroSearchV1["search"]
                  >["mode"],
                })
              }
            >
              <option value="directory-query">{t("Directory query")}</option>
              <option value="ai-interpret">
                {t("AI interpret (needs endpoint)")}
              </option>
              <option value="visual-only">{t("Visual only")}</option>
            </select>
          </label>
          <label className={FIELD}>
            <span className={LABEL}>{t("Placeholder")}</span>
            <input
              className={INPUT}
              value={search.placeholder ?? ""}
              onChange={(e) => patchSearch({ placeholder: e.target.value })}
            />
          </label>
          <label className={FIELD}>
            <span className={LABEL}>{t("Submit label")}</span>
            <input
              className={INPUT}
              value={search.submitLabel ?? ""}
              onChange={(e) => patchSearch({ submitLabel: e.target.value })}
            />
          </label>
        </div>
        <div className={FIELD}>
          <span className={LABEL}>
            {t("Action href (default: /directory)")}
          </span>
          <input
            className={INPUT}
            placeholder="/directory"
            value={search.actionHref ?? ""}
            onChange={(e) =>
              patchSearch({ actionHref: e.target.value || undefined })
            }
          />
        </div>
        {search.mode === "ai-interpret" ? (
          <p className="text-[11px] text-stone-500">
            {t(
              "AI mode only functions if the action href points to a real, tenant-safe interpret endpoint. Otherwise it behaves as a plain directory query. AI is never faked.",
            )}
          </p>
        ) : null}
      </fieldset>

      {cta(
        "primaryCta",
        "Primary CTA",
        t("Primary CTA label"),
        t("Primary CTA href"),
      )}
      {cta(
        "secondaryCta",
        "Secondary CTA",
        t("Secondary CTA label"),
        t("Secondary CTA href"),
      )}

      <fieldset className="flex flex-col gap-2">
        <span className={LABEL}>{t("Chips")}</span>
        <select
          className={`${INPUT} max-w-[260px]`}
          value={value.chipsSource}
          onChange={(e) =>
            patch({
              chipsSource: e.target.value as HeroSearchV1["chipsSource"],
            })
          }
        >
          <option value="manual">{t("Manual")}</option>
          <option value="service_areas">
            {t("Service areas (follow-on)")}
          </option>
          <option value="roster_cities">{t("Roster cities (follow-on)")}</option>
        </select>
        {value.chipsSource !== "manual" ? (
          <p className="text-[11px] text-stone-500">
            {t(
              "Roster-derived chip sources are a documented follow-on; the manual list below renders as the safe interim.",
            )}
          </p>
        ) : null}
        {chips.map((c, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <input
              className={INPUT}
              placeholder={t("Chip label")}
              value={c.label}
              onChange={(e) => setChip(i, { label: e.target.value })}
            />
            <LinkKindPicker
              value={c.href}
              onChange={(next) => setChip(i, { href: next })}
            />
          </div>
        ))}
        <button
          type="button"
          className={`${KIT.ghostButton} self-start`}
          onClick={() =>
            patch({ chips: [...chips, { label: "City" }].slice(0, 12) })
          }
        >
          {t("+ Add chip")}
        </button>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <span className={LABEL}>{t("Stat line")}</span>
        <select
          className={`${INPUT} max-w-[260px]`}
          value={value.statSource}
          onChange={(e) =>
            patch({
              statSource: e.target.value as HeroSearchV1["statSource"],
            })
          }
        >
          <option value="manual">{t("Manual items")}</option>
          <option value="tenant_talent_count">
            {t("Tenant talent count (derived)")}
          </option>
        </select>
        {value.statSource === "tenant_talent_count" ? (
          <input
            className={INPUT}
            placeholder={t("Count label, e.g. represented talent")}
            value={value.statCountLabel ?? ""}
            onChange={(e) => patch({ statCountLabel: e.target.value })}
          />
        ) : (
          <input
            className={INPUT}
            placeholder={t(
              "value|label, comma-separated, e.g. 120+|talent, 3|markets",
            )}
            value={(value.statItems ?? [])
              .map((s) => `${s.value}|${s.label}`)
              .join(", ")}
            onChange={(e) =>
              patch({
                statItems: e.target.value
                  .split(",")
                  .map((pair) => pair.split("|"))
                  .filter((p) => p[0]?.trim() && p[1]?.trim())
                  .slice(0, 4)
                  .map((p) => ({
                    value: p[0].trim(),
                    label: p[1].trim(),
                  })),
              })
            }
          />
        )}
      </fieldset>

      <PresentationPanel
        value={value.presentation}
        onChange={(next) => patch({ presentation: next })}
      />
    </div>
  );
}
