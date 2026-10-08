"use client";

/**
 * TalentBiosLocaleEditor: the talent's own bio, one tab per TALENT language
 * (PR 7). Replaces the open-ended "+ Add language" / "×" chip strip for
 * talents: the languages are the ones set in Website settings > Languages, the
 * tabs carry status dots, and the AI button translates from the primary bio.
 * Saved through the drawer's normal Save (`bios` → field values, mirrored into
 * `bio_i18n` server side so the public site reads it).
 */
import { useMemo } from "react";

import { LocaleField } from "../../../primitives/locale-field";
import { useDashboardText } from "../../../dashboard-i18n";
import { orderLocales } from "@/lib/i18n/locale-field-model";
import type { LocaleBio, LocaleCode } from "../../../state";

const LIMIT = 280;
const TEXTAREA =
  "w-full resize-y rounded-[10px] border border-admin-border bg-admin-card px-3 py-2.5 font-admin-body text-[13px] text-admin-ink outline-none";
const CHIP =
  "rounded-full border border-dashed border-admin-border bg-transparent px-[11px] py-[5px] font-admin-body text-[11px] font-medium text-admin-ink-muted";

export function TalentBiosLocaleEditor({
  bios,
  talentLocales,
  onChange,
  onRegenerate,
  primaryLabel,
  disabled,
}: {
  bios: LocaleBio[];
  talentLocales: { primary: string; secondary: readonly string[] };
  onChange: (b: LocaleBio[]) => void;
  onRegenerate: () => void;
  primaryLabel?: string;
  disabled?: boolean;
}) {
  const copy = useDashboardText();
  const locales = orderLocales(talentLocales.primary, talentLocales.secondary);
  const map = useMemo(() => {
    const m: Record<string, string> = {};
    for (const b of bios) m[b.locale] = b.text;
    return m;
  }, [bios]);

  const setText = (locale: string, text: string) => {
    const has = bios.some((b) => b.locale === locale);
    onChange(
      has
        ? bios.map((b) => (b.locale === locale ? { ...b, text } : b))
        : [...bios, { locale: locale as LocaleCode, text }],
    );
  };

  return (
    <fieldset disabled={!!disabled} className={`m-0 border-0 p-0 ${disabled ? "opacity-65" : ""}`}>
      <LocaleField
        label={copy.t("Bio")}
        value={map}
        locales={locales}
        primary={talentLocales.primary}
        ai={{ field: "bio" }}
        maxLength={LIMIT}
        onChange={setText}
        renderInput={(a) => (
          <div className="flex flex-col gap-1.5">
            <textarea
              id={a.id}
              data-pshell-field="bio"
              value={a.value}
              placeholder={a.placeholder}
              readOnly={a.readOnly}
              rows={4}
              maxLength={LIMIT}
              onChange={(e) => a.onChange(e.target.value)}
              className={TEXTAREA}
            />
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={onRegenerate} disabled={!primaryLabel} className={CHIP}>
                  ↺ {primaryLabel ? `${copy.t("Regenerate from")} ${primaryLabel}` : copy.t("Pick a Talent Type to regenerate")}
                </button>
                <button
                  type="button"
                  className={CHIP}
                  title={copy.t("Paste a bio you already wrote elsewhere")}
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText();
                      if (text) a.onChange(text.slice(0, LIMIT));
                    } catch {
                      // Clipboard blocked: the talent can paste by hand.
                    }
                  }}
                >
                  {copy.t("Paste from clipboard")}
                </button>
              </div>
              <span className="font-admin-body text-[10.5px] text-admin-ink-dim">
                {a.value.length} / {LIMIT}
              </span>
            </div>
          </div>
        )}
      />
    </fieldset>
  );
}
