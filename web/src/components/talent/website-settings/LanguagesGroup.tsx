"use client";

/**
 * Website settings > Languages (PR 7). Preset first: one primary radio pair,
 * then "Also offer your site in" checkboxes. Nothing is written until the
 * screen's Save; the screen owns the confirm for a primary change. Removing a
 * saved secondary asks first (translations are kept, not deleted).
 */
import { useEffect, useState } from "react";

import { StatusPill } from "@/components/admin/shell/internal/primitives/chips";
import { languageName } from "@/lib/i18n/locale-field-model";
import { loadTranslationCoverage } from "@/lib/talent/translation-coverage-actions";
import { COMING_SOON_LOCALES, LIVE_SITE_LOCALES, toggleSecondary, withPrimary, type LanguagesDraft } from "./languages-model";
import { ChoiceCard, SettingsCard } from "./primitives";

type T = (s: string) => string;

const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);

/** "Español only" / "Español and English": the home row summary. */
export function languagesSummary(t: T, d: LanguagesDraft): string {
  const own = (c: string) => languageName(c, c, true);
  if (d.secondary.length === 0) return fill(t("{lang} only"), { lang: own(d.primary) });
  return fill(t("{primary} and {secondary}"), {
    primary: own(d.primary),
    secondary: d.secondary.map(own).join(", "),
  });
}

/** A bottom sheet with one confirm and one cancel (never stacked). */
export function ConfirmSheet({
  title,
  body,
  confirm,
  cancel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirm: string;
  cancel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button type="button" aria-label={cancel} onClick={onCancel} className="absolute inset-0 bg-black/40" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-md rounded-t-2xl bg-admin-card px-5 pb-6 pt-5 font-admin-body shadow-xl"
      >
        <h2 className="text-[17px] font-semibold text-admin-ink">{title}</h2>
        <p className="mt-1 text-[14px] text-admin-ink-muted">{body}</p>
        <div className="mt-4 grid gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-[44px] rounded-lg bg-[var(--tc-action)] text-[14px] font-semibold text-white hover:bg-[var(--tc-action-hover)]"
          >
            {confirm}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] rounded-lg border border-admin-border-soft bg-admin-card text-[14px] font-semibold text-admin-ink"
          >
            {cancel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Coverage({ t, code, uiLocale }: { t: T; code: string; uiLocale: string }) {
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void loadTranslationCoverage(code).then((res) => {
      if (!live || !res.ok) return;
      setLine(
        fill(t("{n} of {total} fields translated to {lang}"), {
          n: res.translated,
          total: res.total,
          lang: languageName(code, uiLocale, !uiLocale.startsWith("es")),
        }),
      );
    });
    return () => {
      live = false;
    };
  }, [code, t, uiLocale]);
  if (!line) return null;
  return (
    <p className="ml-7 mt-0.5 text-[12.5px] text-admin-ink-muted">
      {line}. {t("Use the AI button next to each field.")}
    </p>
  );
}

export function LanguagesGroup({
  t,
  uiLocale,
  draft,
  saved,
  suggested,
  setDraft,
}: {
  t: T;
  uiLocale: string;
  draft: LanguagesDraft;
  saved: LanguagesDraft;
  /** Nothing stored yet and the primary was preselected from the location. */
  suggested: boolean;
  setDraft: (next: LanguagesDraft) => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const inUi = (c: string) => languageName(c, uiLocale, !uiLocale.startsWith("es"));
  // Live site languages read in their own name; the rest (fr, pt, de: coming
  // soon) are named in the dashboard language so an es dashboard never shows
  // "French".
  const own = (c: string) =>
    (LIVE_SITE_LOCALES as readonly string[]).includes(c) ? languageName(c, c, true) : languageName(c, uiLocale, true);

  return (
    <>
      <SettingsCard title={t("Your language")}>
        <p className="mb-3 text-[12.5px] text-admin-ink-muted">
          {t("Your dashboard, your site's default and its search listing.")}
        </p>
        <div role="radiogroup" aria-label={t("Your language")} className="grid gap-2">
          {LIVE_SITE_LOCALES.map((code) => (
            <ChoiceCard
              key={code}
              checked={draft.primary === code}
              title={own(code)}
              detail={suggested && draft.primary === code ? t("Suggested from your location.") : undefined}
              onSelect={() => setDraft(withPrimary(draft, code))}
            />
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title={t("Also offer your site in")}>
        <ul className="grid gap-1">
          {LIVE_SITE_LOCALES.filter((c) => c !== draft.primary).map((code) => {
            const on = draft.secondary.includes(code);
            return (
              <li key={code}>
                <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => {
                      if (!e.target.checked && saved.secondary.includes(code)) setConfirmRemove(code);
                      else setDraft(toggleSecondary(draft, code, e.target.checked));
                    }}
                    className="size-4 accent-emerald-900"
                  />
                  <span className="text-[14px] font-semibold text-admin-ink">{own(code)}</span>
                </label>
                {on ? <Coverage t={t} code={code} uiLocale={uiLocale} /> : null}
              </li>
            );
          })}
          {COMING_SOON_LOCALES.map((code) => (
            <li key={code} className="flex min-h-[44px] items-center gap-3 opacity-60">
              <input type="checkbox" disabled aria-disabled className="size-4" aria-label={own(code)} />
              <span className="text-[14px] font-semibold text-admin-ink">{own(code)}</span>
              <StatusPill tone="dim" size="sm" label={t("Coming soon")} />
            </li>
          ))}
        </ul>
      </SettingsCard>

      {confirmRemove ? (
        <ConfirmSheet
          title={fill(t("Hide {lang} from your site?"), { lang: inUi(confirmRemove) })}
          body={t("Translations are kept, not deleted.")}
          confirm={t("Hide it")}
          cancel={t("Keep editing")}
          onConfirm={() => {
            setDraft(toggleSecondary(draft, confirmRemove, false));
            setConfirmRemove(null);
          }}
          onCancel={() => setConfirmRemove(null)}
        />
      ) : null}
    </>
  );
}
