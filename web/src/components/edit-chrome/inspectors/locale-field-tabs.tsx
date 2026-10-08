"use client";

/**
 * WS5 — per-field locale tabs for the Content panel, on the shared
 * `LocaleTabsBadge` (PR 7): `[● ES | ● EN] [✦ AI]` above a localizable input.
 *
 *   - One tab per supported locale, DEFAULT (primary) first.
 *   - Dot: green = has text, red ring = missing, amber ring = outdated.
 *   - The active tab decides which locale the field edits: the DEFAULT tab edits
 *     the node's base prop; a SECONDARY tab edits `node.i18n[locale][prop]`.
 *   - Optional `ai`: translates the primary text into the active secondary (or
 *     the first gap) and hands it to `ai.commit`, the caller's `commitForLocale`,
 *     so it rides the same `patchBuilderNodeProps` autosave as a typed edit.
 *
 * Single-language tenant → the caller renders the plain field (no tabs).
 *
 * Presentation + active-tab state only; the parent owns the value lookups and
 * commits. The initial tab follows `activeContentLocale` (the top-bar pill).
 * Colours come from CHROME tokens (no hex literals in this file).
 */
import { type ReactNode } from "react";

import { LocaleTabsBadge, type LocaleTabsBadgeTheme } from "@/components/locale-field/LocaleTabsBadge";
import type { TalentTranslateField } from "@/components/locale-field/translate-action";
import { useAiTranslate } from "@/components/locale-field/use-ai-translate";
import { localeMetadata } from "@/i18n/config";
import { canAiTranslate, languageName, localeStatus, pickAiTarget } from "@/lib/i18n/locale-field-model";
import { CHROME } from "../kit/tokens";
import { useEditorLocale } from "../use-editor-locale";
import { selectEditingLocale, showsMissingTranslationHint } from "../editing-locale";

const THEME: LocaleTabsBadgeTheme = {
  tablist: "bg-black/[0.04]",
  tabActive: "bg-white text-stone-800 shadow-sm",
  tabIdle: "text-stone-500 hover:text-stone-700",
  dot: {
    filled: { style: { background: CHROME.green } },
    missing: { style: { boxShadow: `0 0 0 1.5px ${CHROME.rose}` } },
    outdated: { style: { boxShadow: `0 0 0 1.5px ${CHROME.amber}` } },
  },
  ai: "bg-violet-600/10 text-violet-700",
  aiDisabled: "opacity-50",
};

export interface LocaleFieldTabsAi {
  /** Primary-locale text (the translation source). */
  sourceText: string;
  /** Current text for a locale (empty when missing). */
  valueFor: (locale: string) => string;
  /** Commit a translated value for a locale (the caller's `commitForLocale`). */
  commit: (locale: string, text: string) => void | Promise<void>;
  field?: TalentTranslateField;
}

export interface LocaleFieldTabsProps {
  /** Tenant supported locales, DEFAULT first (from TenantLocaleSettings). */
  supportedLocales: readonly string[];
  /** The tenant default ("primary") locale — edits the node's base prop. */
  defaultLocale: string;
  /** The in-session active content locale (top-header toggle) — initial tab. */
  activeContentLocale: string;
  /** Does `locale` currently have a non-empty value for this field? (dot.) */
  hasValueForLocale: (locale: string) => boolean;
  /** Render the field body for the active tab's locale. */
  renderField: (locale: string, isDefault: boolean) => ReactNode;
  /** Optional accessible name for the tablist. */
  ariaLabel?: string;
  /** Optional AI translate button. */
  ai?: LocaleFieldTabsAi;
}

function localeLabel(code: string): string {
  return localeMetadata[code]?.label ?? code.toUpperCase();
}

export function LocaleFieldTabs({
  supportedLocales,
  defaultLocale,
  activeContentLocale,
  hasValueForLocale,
  renderField,
  ariaLabel,
  ai,
}: LocaleFieldTabsProps) {
  const { t, locale: uiLocale } = useEditorLocale();
  const inUi = (code: string) => languageName(code, uiLocale, uiLocale !== "es");
  const orderedLocales = [defaultLocale, ...supportedLocales.filter((l) => l !== defaultLocale)];
  // A stable boolean (not the recomputed array) so an unrelated re-render can't
  // reset a local tab click.
  // TUL-70 round 3: the tab IS the editing locale (one store, no local copy),
  // so picking a tab flips the canvas and the top-bar pill too, and flipping
  // the pill moves every field.
  const activeTab = orderedLocales.includes(activeContentLocale) ? activeContentLocale : defaultLocale;
  const setActiveTab = (code: string) => selectEditingLocale(code, defaultLocale, orderedLocales);

  const aiHook = useAiTranslate(ai?.field ?? "builder_text");
  const map: Record<string, string> = {};
  for (const code of orderedLocales) {
    map[code] = ai ? ai.valueFor(code) : hasValueForLocale(code) ? "x" : "";
  }
  const target = ai ? pickAiTarget(orderedLocales, defaultLocale, activeTab, map) : null;
  const aiEnabled =
    target !== null &&
    canAiTranslate({ source: ai?.sourceText, target: map[target], lastSource: aiHook.lastSource[target] });

  const runAi = async () => {
    if (!ai || !target) return;
    setActiveTab(target);
    const out = await aiHook.run({ from: defaultLocale, to: target, text: ai.sourceText });
    if (out !== null) await ai.commit(target, out);
  };

  const statusWord = (code: string) =>
    hasValueForLocale(code) ? t("translated") : t("missing");
  const aiTitle =
    aiHook.state === "unavailable"
      ? t("AI translation is not available on this plan.")
      : aiHook.state === "quota"
        ? t("AI limit reached. Try later or write it yourself.")
        : aiHook.state === "error"
          ? t("Translation failed. Try again.")
          : t("Translate to {lang} with AI").replace("{lang}", inUi(target ?? defaultLocale));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-end">
        <LocaleTabsBadge
          theme={THEME}
          tablistLabel={ariaLabel ?? t("Field language")}
          active={activeTab}
          onSelect={setActiveTab}
          tabs={orderedLocales.map((code) => ({
            code,
            status: localeStatus(hasValueForLocale(code) ? { [code]: "x" } : {}, code),
            ariaLabel: `${localeLabel(code)}, ${statusWord(code)}`,
            title:
              code === defaultLocale
                ? `${localeLabel(code)} · ${t("primary")}`
                : `${localeLabel(code)} · ${statusWord(code)}`,
          }))}
          ai={
            ai && target
              ? {
                  ariaLabel: t("Translate to {lang} with AI").replace("{lang}", inUi(target)),
                  title: aiTitle,
                  state:
                    aiHook.state === "loading"
                      ? "loading"
                      : aiHook.state === "success"
                        ? "success"
                        : aiHook.state === "error"
                          ? "error"
                          : aiHook.state === "unavailable" || aiHook.state === "quota" || !aiEnabled
                            ? "disabled"
                            : "enabled",
                  onClick: () => void runAi(),
                }
              : null
          }
        />
      </div>
      {showsMissingTranslationHint(activeTab, defaultLocale, hasValueForLocale(activeTab)) ? (
        <p className="m-0 text-[12px]" style={{ color: CHROME.muted }}>
          {t("No text in {lang} yet. The canvas shows the base text.").replace("{lang}", inUi(activeTab))}
        </p>
      ) : null}
      {renderField(activeTab, activeTab === defaultLocale)}
    </div>
  );
}
