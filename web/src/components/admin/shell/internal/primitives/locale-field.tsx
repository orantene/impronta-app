"use client";

/**
 * LocaleField: one translatable dashboard input (PR 7, talent languages).
 *
 *   [Label] …………………… [● ES | ● EN] [✦ AI]
 *   [ input for the active tab                ]
 *
 * - Tabs: primary first. Dot green = has text, red ring = missing, amber ring =
 *   outdated (the primary changed after the translation, tracked from mount).
 * - A click on a tab switches THIS field only. Editing a secondary shows the
 *   primary text as the native placeholder; the value is never pre-filled.
 * - AI (only with a secondary): translates the primary text into the active
 *   secondary (or the first gap), activates that tab, and hands the text back
 *   through `onChange` as a normal draft edit. The screen's Save persists it.
 * - One language: a plain input, no badge, no AI.
 *
 * Token classes only (inline styles are frozen under components/admin/shell).
 */
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";

import { LocaleTabsBadge, type LocaleTabsBadgeTheme } from "@/components/locale-field/LocaleTabsBadge";
import type { TalentTranslateField } from "@/components/locale-field/translate-action";
import { useAiTranslate } from "@/components/locale-field/use-ai-translate";
import { useActiveContentLocale } from "@/lib/i18n/active-content-locale-store";
import {
  canAiTranslate,
  ghostPlaceholder,
  languageName,
  localeStatus,
  outdatedLocales,
  pickAiTarget,
} from "@/lib/i18n/locale-field-model";
import type { LocalizedMap } from "@/lib/i18n/resolve-localized";
import { useDashboardText } from "../dashboard-i18n";
import { TextArea, TextInput } from "./forms";

export const DASHBOARD_LOCALE_BADGE_THEME: LocaleTabsBadgeTheme = {
  tablist: "border border-admin-border-soft bg-admin-surface-alt",
  tabActive: "bg-admin-card text-admin-ink shadow-admin-hover",
  tabIdle: "text-admin-ink-muted hover:text-admin-ink",
  dot: {
    filled: { className: "bg-admin-success" },
    missing: { className: "border-[1.5px] border-admin-critical bg-transparent" },
    outdated: { className: "border-[1.5px] border-admin-amber bg-transparent" },
  },
  ai: "border border-admin-royal-soft bg-admin-royal-soft text-admin-royal",
  aiDisabled: "opacity-50",
};

export type LocaleFieldInputArgs = {
  id: string;
  locale: string;
  value: string;
  placeholder: string;
  readOnly: boolean;
  onChange: (next: string) => void;
};

export type LocaleFieldProps = {
  label: string;
  value: LocalizedMap;
  /** Talent languages, primary first. */
  locales: readonly string[];
  primary: string;
  /** Initial tab; defaults to the active content locale, else primary. */
  activeLocale?: string;
  onChange: (locale: string, value: string) => void;
  /** Override the mount-tracked outdated set. */
  outdated?: readonly string[];
  ai?: { field: TalentTranslateField } | null;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  size?: "md" | "xs";
  placeholder?: string;
  hint?: string;
  required?: boolean;
  hideLabel?: boolean;
  renderInput?: (args: LocaleFieldInputArgs) => ReactNode;
};

export function LocaleField({
  label,
  value,
  locales,
  primary,
  activeLocale,
  onChange,
  outdated,
  ai,
  multiline,
  rows,
  maxLength,
  size = "md",
  placeholder = "",
  hint,
  required,
  hideLabel,
  renderInput,
}: LocaleFieldProps) {
  const copy = useDashboardText();
  const uiLocale = copy.locale;
  const inputId = useId();
  const store = useActiveContentLocale();
  const multi = locales.length > 1;

  // The store only speaks for this field once it was seeded for these
  // languages (its default is this primary); before that, open on primary.
  const storeLocale =
    store.defaultLocale === primary && locales.includes(store.locale) ? store.locale : null;
  const seed = activeLocale && locales.includes(activeLocale) ? activeLocale : (storeLocale ?? primary);
  const [tab, setTab] = useState(seed);
  // Follow the top-bar / builder locale when it changes; a local click wins
  // until then.
  useEffect(() => {
    if (storeLocale) setTab(storeLocale);
  }, [storeLocale]);
  const current = locales.includes(tab) ? tab : primary;

  const [initial] = useState<LocalizedMap>(value);
  const stale = useMemo(
    () => outdated ?? outdatedLocales(initial, value, primary, locales),
    [outdated, initial, value, primary, locales],
  );

  const aiHook = useAiTranslate(ai?.field ?? "builder_text");
  const [live, setLive] = useState("");

  const name = (code: string) => languageName(code, uiLocale, !copy.isSpanish);
  const fill = (tpl: string, vars: Record<string, string>) =>
    Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), copy.t(tpl));

  const text = (code: string) => (typeof value[code] === "string" ? (value[code] as string) : "");
  const input: LocaleFieldInputArgs = {
    id: inputId,
    locale: current,
    value: text(current),
    placeholder: multi ? ghostPlaceholder(value, current, primary, placeholder) : placeholder,
    readOnly: aiHook.state === "loading",
    onChange: (next) => onChange(current, next),
  };

  const aiTarget = multi && ai ? pickAiTarget(locales, primary, current, value, stale) : null;
  const runAi = async () => {
    if (!aiTarget) return;
    setTab(aiTarget);
    setLive("");
    const out = await aiHook.run({ from: primary, to: aiTarget, text: text(primary) });
    if (out !== null) {
      onChange(aiTarget, out);
      setLive(fill("Translated to {lang}. Review it before saving.", { lang: name(aiTarget) }));
    }
  };

  const aiEnabled =
    aiTarget !== null &&
    canAiTranslate({
      source: text(primary),
      target: text(aiTarget),
      lastSource: aiHook.lastSource[aiTarget],
      outdated: stale.includes(aiTarget),
    });
  const aiTitle =
    aiHook.state === "unavailable"
      ? copy.t("AI translation is not available on this plan.")
      : aiHook.state === "quota"
        ? copy.t("AI limit reached. Try later or write it yourself.")
        : aiHook.state === "error"
          ? copy.t("Translation failed. Try again.")
          : fill("Translate to {lang} with AI", { lang: name(aiTarget ?? primary) });

  const statusWord = (code: string) => {
    const s = localeStatus(value, code, stale);
    return s === "filled" ? copy.t("translated") : s === "missing" ? copy.t("missing") : copy.t("needs review");
  };

  const field = renderInput ? (
    renderInput(input)
  ) : multiline ? (
    <TextArea
      id={inputId}
      ariaLabel={hideLabel ? label : undefined}
      value={input.value}
      placeholder={input.placeholder}
      readOnly={input.readOnly}
      maxLength={maxLength}
      rows={rows}
      onChange={(e) => input.onChange(e.target.value)}
    />
  ) : (
    <TextInput
      id={inputId}
      ariaLabel={hideLabel ? label : undefined}
      value={input.value}
      placeholder={input.placeholder}
      readOnly={input.readOnly}
      maxLength={maxLength}
      onChange={(e) => input.onChange(e.target.value)}
    />
  );

  const badge = multi ? (
    <LocaleTabsBadge
      size={size}
      theme={DASHBOARD_LOCALE_BADGE_THEME}
      controlsId={inputId}
      tablistLabel={fill("{label} language", { label })}
      active={current}
      onSelect={setTab}
      tabs={locales.map((code) => {
        const status = localeStatus(value, code, stale);
        return {
          code,
          status,
          ariaLabel: `${name(code)}, ${statusWord(code)}`,
          title:
            code === primary
              ? `${languageName(code, code, true)} · ${copy.t("primary")}`
              : status === "outdated"
                ? fill("The {lang} text changed after this translation. Review it or press AI.", {
                    lang: name(primary),
                  })
                : `${languageName(code, code, true)} · ${statusWord(code)}`,
        };
      })}
      ai={
        ai && aiTarget
          ? {
              ariaLabel: fill("Translate to {lang} with AI", { lang: name(aiTarget) }),
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
  ) : null;

  if (size === "xs") {
    return (
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {badge ? <div className="flex justify-end">{badge}</div> : null}
        {field}
        <span className="sr-only" aria-live="polite">
          {live}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!hideLabel ? (
          <label
            htmlFor={inputId}
            className="font-admin-body text-[12px] font-medium tracking-[0.1px] text-admin-ink"
          >
            {label}
            {required ? <span className="ml-[3px] font-semibold text-admin-critical">*</span> : null}
          </label>
        ) : (
          <span />
        )}
        {badge}
      </div>
      {field}
      {hint ? <span className="font-admin-body text-[11.5px] text-admin-ink-muted">{hint}</span> : null}
      <span className="sr-only" aria-live="polite">
        {live}
      </span>
    </div>
  );
}
