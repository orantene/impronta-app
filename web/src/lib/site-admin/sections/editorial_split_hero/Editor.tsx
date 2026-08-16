"use client";

import { useCallback, useRef, useState } from "react";
import { PresentationPanel } from "../shared/PresentationPanel";
import { LinkKindPicker } from "../shared/LinkKindPicker";
import { MediaPicker } from "../shared/MediaPicker";
import { useSectionT } from "../shared/section-editor-i18n";
import { coerceLegacyHref } from "../../links/link-ref";
import {
  searchTenantTalent,
  type TenantTalentPick,
} from "../../edit-mode/talent-picker-action";
import type { SectionEditorProps } from "../types";
import type { EditorialSplitHeroV1 } from "./schema";
import { KIT } from "@/components/edit-chrome/inspectors/kit";

const FIELD = KIT.field;
const LABEL = KIT.label;
const INPUT = KIT.input;
type DiscoveryForm = NonNullable<EditorialSplitHeroV1["discoveryForm"]>;
type DiscoveryOption = NonNullable<DiscoveryForm["categories"]>[number];
type DiscoveryListKey = "categories" | "markets";
type MediaStackCaption = NonNullable<EditorialSplitHeroV1["mediaStackCaptions"]>[number];
type SelectedStackTalent = TenantTalentPick & { cardImageUrl: string };

const DEFAULT_DISCOVERY_FORM: DiscoveryForm = {
  enabled: false,
  actionHref: "/directory",
  categoryLabel: "Talent type",
  marketLabel: "Market",
  submitLabel: "Explore",
  categories: [],
  markets: [],
};

export function EditorialSplitHeroEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<EditorialSplitHeroV1>) {
  const t = useSectionT();
  const value: EditorialSplitHeroV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "Discover premium talent across",
    highlight: initial.highlight ?? "destination cities.",
    body: initial.body ?? "",
    primaryCta: initial.primaryCta,
    secondaryCta: initial.secondaryCta,
    discoveryForm: initial.discoveryForm ?? DEFAULT_DISCOVERY_FORM,
    mediaMode: initial.mediaMode ?? "static",
    mediaUrl: initial.mediaUrl ?? "",
    mediaAlt: initial.mediaAlt ?? "",
    mediaRatio: initial.mediaRatio ?? "4/3",
    mediaStyle: initial.mediaStyle ?? "single",
    mediaStackTalentCodes: initial.mediaStackTalentCodes,
    mediaStackUrls: initial.mediaStackUrls,
    mediaStackCaptions: initial.mediaStackCaptions,
    overlayColor: initial.overlayColor ?? "",
    overlayOpacity: initial.overlayOpacity,
    overlayStrength: initial.overlayStrength ?? "none",
    mediaSide: initial.mediaSide ?? "right",
    mobileOrder: initial.mobileOrder ?? "text-first",
    presentation: initial.presentation,
  };
  const patch = (p: Partial<EditorialSplitHeroV1>) =>
    onChange({ ...value, ...p });
  const discovery = value.discoveryForm ?? DEFAULT_DISCOVERY_FORM;
  const patchDiscovery = (p: Partial<DiscoveryForm>) =>
    patch({ discoveryForm: { ...discovery, ...p } });
  const setDiscoveryOptions = (
    key: DiscoveryListKey,
    next: DiscoveryOption[],
  ) => patchDiscovery({ [key]: next } as Partial<DiscoveryForm>);
  const setDiscoveryOption = (
    key: DiscoveryListKey,
    index: number,
    next: Partial<DiscoveryOption>,
  ) => {
    const list = discovery[key] ?? [];
    setDiscoveryOptions(
      key,
      list.map((option, i) =>
        i === index ? { ...option, ...next } : option,
      ),
    );
  };
  const applyStackTalent = (next: SelectedStackTalent[]) => {
    patch({
      mediaMode: "static",
      mediaStyle: "card-stack",
      mediaAlt:
        next[0]?.displayName != null
          ? `${next[0].displayName}, Impronta talent`
          : value.mediaAlt,
      mediaStackTalentCodes: next.map((talent) => talent.profileCode),
      mediaStackUrls: next.map((talent) => talent.cardImageUrl),
      mediaStackCaptions: next.map((talent) => ({
        name: talent.displayName,
        sub: talent.primaryTypeLabel ?? talent.cityLabel ?? "Impronta talent",
      })),
    });
  };

  const cta = (
    key: "primaryCta" | "secondaryCta",
    /** Stays English: this is the persisted default CTA label, not UI copy. */
    label: string,
    labelFieldText: string,
    linkFieldText: string,
  ) => (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      <label className={FIELD}>
        <span className={LABEL}>{labelFieldText}</span>
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
            } as Partial<EditorialSplitHeroV1>)
          }
        />
      </label>
      <div className={FIELD}>
        <span className={LABEL}>{linkFieldText}</span>
        <LinkKindPicker
          value={value[key]?.href}
          onChange={(next) =>
            patch({
              [key]: value[key]
                ? { ...value[key]!, href: next }
                : { label, href: next },
            } as Partial<EditorialSplitHeroV1>)
          }
        />
      </div>
    </div>
  );
  const discoveryOptionList = (
    key: DiscoveryListKey,
    label: string,
    placeholder: string,
  ) => {
    const options = discovery[key] ?? [];

    return (
      <div className="flex flex-col gap-2">
        <span className={LABEL}>{label}</span>
        {options.map((option, index) => (
          <div
            key={index}
            className="grid grid-cols-1 gap-2 rounded-lg border border-[#e5e0d5] bg-[#faf9f6] p-2 md:grid-cols-[1fr_1fr_auto]"
          >
            <input
              className={INPUT}
              placeholder={placeholder}
              value={option.label}
              onChange={(e) =>
                setDiscoveryOption(key, index, { label: e.target.value })
              }
            />
            <input
              className={INPUT}
              placeholder={t("Query value")}
              value={option.value ?? ""}
              onChange={(e) =>
                setDiscoveryOption(key, index, {
                  value: e.target.value || undefined,
                })
              }
            />
            <label className="flex items-center gap-2 text-xs text-stone-500">
              <input
                type="checkbox"
                checked={option.disabled === true}
                onChange={(e) =>
                  setDiscoveryOption(key, index, {
                    disabled: e.target.checked,
                  })
                }
              />
              {t("Disabled")}
            </label>
            <button
              type="button"
              className="text-xs text-destructive md:col-span-3"
              onClick={() =>
                setDiscoveryOptions(
                  key,
                  options.filter((_, i) => i !== index),
                )
              }
            >
              {t("Remove option")}
            </button>
          </div>
        ))}
        <button
          type="button"
          className={`${KIT.ghostButton} self-start`}
          onClick={() =>
            setDiscoveryOptions(
              key,
              [...options, { label: "New option" }].slice(
                0,
                key === "categories" ? 10 : 12,
              ),
            )
          }
        >
          {t("+ Add option")}
        </button>
      </div>
    );
  };

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
          <span className={LABEL}>{t("Highlighted phrase")}</span>
          <input
            className={INPUT}
            value={value.highlight ?? ""}
            onChange={(e) => patch({ highlight: e.target.value })}
          />
        </label>
      </div>
      <label className={FIELD}>
        <span className={LABEL}>{t("Headline")}</span>
        <input
          className={INPUT}
          value={value.headline ?? ""}
          onChange={(e) => patch({ headline: e.target.value })}
        />
      </label>
      <label className={FIELD}>
        <span className={LABEL}>{t("Body")}</span>
        <textarea
          className={INPUT}
          rows={3}
          value={value.body ?? ""}
          onChange={(e) => patch({ body: e.target.value })}
        />
      </label>

      <div className="flex flex-col gap-3 rounded-lg border border-[#e5e0d5] bg-[#faf9f6] p-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={discovery.enabled === true}
            onChange={(e) => patchDiscovery({ enabled: e.target.checked })}
          />
          {t("Show discovery form")}
        </label>
        {discovery.enabled === true ? (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <label className={FIELD}>
                <span className={LABEL}>{t("Action href")}</span>
                <input
                  className={INPUT}
                  value={discovery.actionHref ?? ""}
                  onChange={(e) =>
                    patchDiscovery({ actionHref: e.target.value })
                  }
                />
              </label>
              <label className={FIELD}>
                <span className={LABEL}>{t("Category label")}</span>
                <input
                  className={INPUT}
                  value={discovery.categoryLabel ?? ""}
                  onChange={(e) =>
                    patchDiscovery({ categoryLabel: e.target.value })
                  }
                />
              </label>
              <label className={FIELD}>
                <span className={LABEL}>{t("Market label")}</span>
                <input
                  className={INPUT}
                  value={discovery.marketLabel ?? ""}
                  onChange={(e) =>
                    patchDiscovery({ marketLabel: e.target.value })
                  }
                />
              </label>
              <label className={FIELD}>
                <span className={LABEL}>{t("Button label")}</span>
                <input
                  className={INPUT}
                  value={discovery.submitLabel ?? ""}
                  onChange={(e) =>
                    patchDiscovery({ submitLabel: e.target.value })
                  }
                />
              </label>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {discoveryOptionList(
                "categories",
                t("Category options"),
                t("Talent type"),
              )}
              {discoveryOptionList(
                "markets",
                t("Market options"),
                t("Market"),
              )}
            </div>
          </>
        ) : null}
      </div>

      {cta(
        "primaryCta",
        "Primary CTA",
        t("Primary CTA label"),
        t("Primary CTA link"),
      )}
      {cta(
        "secondaryCta",
        "Secondary CTA",
        t("Secondary CTA label"),
        t("Secondary CTA link"),
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <label className={FIELD}>
          <span className={LABEL}>{t("Media mode")}</span>
          <select
            className={INPUT}
            value={value.mediaMode}
            onChange={(e) =>
              patch({
                mediaMode: e.target
                  .value as EditorialSplitHeroV1["mediaMode"],
              })
            }
          >
            <option value="static">{t("Static media")}</option>
            <option value="selected">{t("Selected talent (follow-on)")}</option>
            <option value="dynamic">{t("Dynamic talent (follow-on)")}</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>{t("Media style")}</span>
          <select
            className={INPUT}
            value={value.mediaStyle}
            onChange={(e) =>
              patch({
                mediaStyle: e.target
                  .value as EditorialSplitHeroV1["mediaStyle"],
              })
            }
          >
            <option value="single">{t("Single frame")}</option>
            <option value="card-stack">{t("3 talent cards")}</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>{t("Media side (desktop)")}</span>
          <select
            className={INPUT}
            value={value.mediaSide}
            onChange={(e) =>
              patch({
                mediaSide: e.target
                  .value as EditorialSplitHeroV1["mediaSide"],
              })
            }
          >
            <option value="right">{t("Right")}</option>
            <option value="left">{t("Left")}</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>{t("Mobile order")}</span>
          <select
            className={INPUT}
            value={value.mobileOrder}
            onChange={(e) =>
              patch({
                mobileOrder: e.target
                  .value as EditorialSplitHeroV1["mobileOrder"],
              })
            }
          >
            <option value="text-first">{t("Text first")}</option>
            <option value="media-first">{t("Media first")}</option>
          </select>
        </label>
      </div>

      {value.mediaMode !== "static" ? (
        <p className="text-[11px] text-stone-500">
          {t(
            "Selected/dynamic talent media is a documented follow-on (couples to the cache-trimmed featured DTO). Static media renders meanwhile.",
          )}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className={FIELD}>
            <span className={LABEL}>{t("Media URL")}</span>
            {/* D9 fix: this field was a bare URL textbox — editorial_split_hero
                has a fully hand-written Editor (not ZodSchemaForm-driven), so
                the zod-introspect.ts NAME_HINTS allow-list can never reach it
                regardless of field name. Wire the shared MediaPicker directly. */}
            <div className="flex items-center gap-2">
              <input
                className={`${INPUT} flex-1`}
                placeholder="https://…"
                value={value.mediaUrl ?? ""}
                onChange={(e) => patch({ mediaUrl: e.target.value })}
              />
              {tenantId ? (
                <MediaPicker
                  tenantId={tenantId}
                  label={t("Browse library")}
                  onPick={(url) => patch({ mediaUrl: url })}
                />
              ) : null}
            </div>
          </label>
          <label className={FIELD}>
            <span className={LABEL}>{t("Media alt text")}</span>
            <input
              className={INPUT}
              value={value.mediaAlt ?? ""}
              onChange={(e) => patch({ mediaAlt: e.target.value })}
            />
          </label>
        </div>
      )}

      {value.mediaMode === "static" && value.mediaStyle === "card-stack" ? (
        <TalentStackPicker
          selectedCodes={value.mediaStackTalentCodes ?? []}
          selectedUrls={value.mediaStackUrls ?? []}
          selectedCaptions={value.mediaStackCaptions ?? []}
          onChange={applyStackTalent}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className={FIELD}>
          <span className={LABEL}>{t("Media ratio")}</span>
          <select
            className={INPUT}
            value={value.mediaRatio}
            onChange={(e) =>
              patch({
                mediaRatio: e.target
                  .value as EditorialSplitHeroV1["mediaRatio"],
              })
            }
          >
            <option value="4/3">4 / 3</option>
            <option value="3/4">3 / 4</option>
            <option value="1/1">1 / 1</option>
            <option value="16/9">16 / 9</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>{t("Overlay strength")}</span>
          <select
            className={INPUT}
            value={value.overlayStrength}
            onChange={(e) =>
              patch({
                overlayStrength: e.target
                  .value as EditorialSplitHeroV1["overlayStrength"],
              })
            }
          >
            <option value="none">{t("None")}</option>
            <option value="soft">{t("Soft")}</option>
            <option value="medium">{t("Medium")}</option>
            <option value="strong">{t("Strong")}</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>{t("Overlay opacity (0–1, optional)")}</span>
          <input
            className={INPUT}
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={value.overlayOpacity ?? ""}
            onChange={(e) =>
              patch({
                overlayOpacity:
                  e.target.value === ""
                    ? undefined
                    : Math.max(0, Math.min(1, Number(e.target.value))),
              })
            }
          />
        </label>
      </div>

      <PresentationPanel
        value={value.presentation}
        onChange={(next) => patch({ presentation: next })}
      />
    </div>
  );
}

const STACK_SLOT_LABELS = ["Main middle card", "Left support card", "Right support card"];

function TalentStackPicker({
  selectedCodes,
  selectedUrls,
  selectedCaptions,
  onChange,
}: {
  selectedCodes: string[];
  selectedUrls: string[];
  selectedCaptions: MediaStackCaption[];
  onChange: (next: SelectedStackTalent[]) => void;
}) {
  const t = useSectionT();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TenantTalentPick[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = selectedUrls.reduce<SelectedStackTalent[]>(
    (items, url, index) => {
      if (!url) return items;
      const caption = selectedCaptions[index];
      const code = selectedCodes[index] ?? `card-${index + 1}`;
      items.push({
        talentProfileId: code,
        profileCode: code,
        displayName: caption?.name ?? code,
        primaryTypeLabel: caption?.sub ?? null,
        cityLabel: null,
        cardImageUrl: url,
      });
      return items;
    },
    [],
  );

  const run = useCallback(async (q: string) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await searchTenantTalent({ query: q });
      if (res.ok) {
        setResults(res.results);
      } else {
        setErr(res.error);
      }
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

  const update = (next: SelectedStackTalent[]) => {
    onChange(next.slice(0, 3));
  };
  const add = (talent: TenantTalentPick) => {
    if (selected.some((item) => item.profileCode === talent.profileCode)) return;
    if (selected.length >= 3) return;
    if (!talent.cardImageUrl) {
      setErr(t("This talent does not have approved public media yet."));
      return;
    }
    update([...selected, { ...talent, cardImageUrl: talent.cardImageUrl }]);
  };
  const remove = (profileCode: string) => {
    update(selected.filter((talent) => talent.profileCode !== profileCode));
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= selected.length) return;
    const next = [...selected];
    const [talent] = next.splice(from, 1);
    if (!talent) return;
    next.splice(to, 0, talent);
    update(next);
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[#e5e0d5] bg-[#faf9f6] p-3">
      <div>
        <span className={LABEL}>{t("Card-stack talent")}</span>
        <p className="mt-1 text-[11px] leading-relaxed text-stone-500">
          {t(
            "Pick up to three roster talent. The first slot is the large middle card shown on the homepage.",
          )}
        </p>
      </div>

      {selected.length > 0 ? (
        <div className="flex flex-col gap-2">
          {selected.map((talent, index) => (
            <div
              key={`${talent.profileCode}-${index}`}
              className="grid grid-cols-[42px_1fr_auto] items-center gap-2 rounded-lg border border-[#e5e0d5] bg-[#faf9f6] p-2"
            >
              <span
                aria-hidden
                className="h-10 w-10 rounded-md bg-muted bg-cover bg-center"
                style={{ backgroundImage: `url(${talent.cardImageUrl})` }}
              />
              <span className="min-w-0">
                <span className="block text-[10px] uppercase tracking-wide text-stone-500">
                  {t(STACK_SLOT_LABELS[index] ?? "Support card")}
                </span>
                <b className="block truncate text-sm">{talent.displayName}</b>
                <span className="block truncate text-xs text-stone-500">
                  {talent.profileCode}
                </span>
              </span>
              <span className="flex gap-1">
                <button
                  type="button"
                  className={`${KIT.ghostButton} disabled:opacity-35`}
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                >
                  {t("Up")}
                </button>
                <button
                  type="button"
                  className={`${KIT.ghostButton} disabled:opacity-35`}
                  disabled={index === selected.length - 1}
                  onClick={() => move(index, index + 1)}
                >
                  {t("Down")}
                </button>
                <button
                  type="button"
                  className={`${KIT.ghostButton} text-destructive`}
                  onClick={() => remove(talent.profileCode)}
                >
                  {t("Remove")}
                </button>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <input
        className={INPUT}
        placeholder={t("Search roster by name or profile code...")}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
      />
      {loading ? (
        <p className="text-xs text-stone-500">{t("Searching...")}</p>
      ) : err ? (
        <p className="text-xs text-destructive">{err}</p>
      ) : results.length > 0 ? (
        <ul className="max-h-56 overflow-auto rounded-lg border border-[#e5e0d5]">
          {results.map((talent) => {
            const picked = selected.some(
              (item) => item.profileCode === talent.profileCode,
            );
            const canAdd =
              !picked && selected.length < 3 && talent.cardImageUrl != null;
            return (
              <li key={talent.talentProfileId}>
                <button
                  type="button"
                  disabled={!canAdd}
                  onClick={() => add(talent)}
                  className="grid w-full grid-cols-[36px_1fr_auto] items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50"
                >
                  <span
                    aria-hidden
                    className="h-9 w-9 rounded-md bg-muted bg-cover bg-center"
                    style={
                      talent.cardImageUrl
                        ? { backgroundImage: `url(${talent.cardImageUrl})` }
                        : undefined
                    }
                  />
                  <span className="min-w-0 truncate">
                    <b>{talent.displayName}</b>{" "}
                    <span className="text-stone-500">
                      {talent.primaryTypeLabel ?? talent.profileCode}
                      {talent.cityLabel ? ` · ${talent.cityLabel}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-stone-500">
                    {picked
                      ? t("Added")
                      : talent.cardImageUrl
                        ? t("Add")
                        : t("No media")}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : query.trim().length > 0 ? (
        <p className="text-xs text-stone-500">{t("No matches on roster.")}</p>
      ) : null}
    </div>
  );
}
