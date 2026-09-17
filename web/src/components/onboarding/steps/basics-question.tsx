"use client";

/**
 * "What do you do, and where?" (owner ruling 2026-09-17): neither is free
 * text. What you do is picked from the talent taxonomy or the business-type
 * catalogue (the engine the directory runs on), pre-selected from what the
 * AI read, with "Other" only as a last resort. Where is picked from the
 * platform's cities with Google behind them. Both are required; Next stays
 * off until both are set; there is no skip on this screen.
 */

import { useEffect, useRef, useState } from "react";

import type { ChipOption, TypeChipProposal } from "@/lib/onboarding/type-chip";
import type { Understanding } from "@/lib/onboarding/understanding";
import type { QuestionAnswer } from "@/lib/server-actions/onboarding-module";
import { searchOnboardingCities, searchOnboardingTypes, type OnboardingCity } from "@/lib/server-actions/onboarding-lookups";

import { PrimaryButton, Sub, Title } from "../ui";

type T = (key: string) => string;
type Locale = "en" | "es";

/** Search box with a dropdown; the value is what was picked, never what was typed. */
function Picker<Item>({
  id,
  label,
  placeholder,
  locale,
  selected,
  selectedLabel,
  search,
  itemLabel,
  itemSub,
  itemKey,
  onPick,
  onClear,
  changeLabel,
  noResultsLabel,
  testId,
  extra,
}: {
  id: string;
  label: string;
  placeholder: string;
  locale: Locale;
  selected: Item | null;
  selectedLabel: (item: Item) => string;
  search: (query: string) => Promise<Item[]>;
  itemLabel: (item: Item) => string;
  itemSub?: (item: Item) => string | null;
  itemKey: (item: Item) => string;
  onPick: (item: Item) => void;
  onClear: () => void;
  changeLabel: string;
  noResultsLabel: string;
  testId: string;
  /** Rendered under the list (the "Other" affordance). */
  extra?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (selected) return;
    const mine = ++seq.current;
    const handle = window.setTimeout(() => {
      setSearching(true);
      void search(query)
        .then((res) => {
          if (seq.current === mine) setItems(res);
        })
        .catch(() => {
          if (seq.current === mine) setItems([]);
        })
        .finally(() => {
          if (seq.current === mine) setSearching(false);
        });
    }, query ? 180 : 0);
    return () => window.clearTimeout(handle);
  }, [query, search, selected]);

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-[14px] px-3 py-2.5" style={{ background: "var(--tl-surface-raised)", border: "1px solid var(--tl-hairline)" }} data-testid={`${testId}-selected`}>
        <span className="min-w-0">
          <span className="block text-[0.6875rem] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--tl-muted)" }}>{label}</span>
          <span className="block truncate text-[1rem] font-medium" style={{ color: "var(--tl-ink)" }}>{selectedLabel(selected)}</span>
        </span>
        <button type="button" onClick={() => { onClear(); setQuery(""); setOpen(true); }} className="shrink-0 text-[0.8125rem] font-semibold underline underline-offset-2" style={{ color: "var(--tl-ink-soft)" }} data-testid={`${testId}-change`}>
          {changeLabel}
        </button>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--tl-muted)" }}>{label}</label>
      <input
        id={id}
        name={id}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="words"
        spellCheck={false}
        lang={locale}
        data-testid={testId}
        className="h-12 w-full rounded-[14px] px-3 text-[1rem] outline-none placeholder:text-[var(--tl-muted-soft)]"
        style={{ background: "var(--tl-surface-raised)", border: "1px solid var(--tl-hairline)", color: "var(--tl-ink)" }}
      />
      {open ? (
        <div className="mt-1 max-h-60 overflow-y-auto rounded-[14px]" style={{ background: "var(--tl-surface-raised)", border: "1px solid var(--tl-hairline)" }} data-testid={`${testId}-list`}>
          {items.length === 0 ? (
            <div className="px-3 py-2 text-[0.875rem]" style={{ color: "var(--tl-muted)" }}>{searching ? "…" : noResultsLabel}</div>
          ) : (
            items.map((item, i) => (
              <button
                key={`${itemKey(item)}#${i}`}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onPick(item); setOpen(false); }}
                className="flex w-full flex-col items-start px-3 py-2 text-left"
                style={{ borderBottom: "1px solid var(--tl-hairline)" }}
                data-testid={`${testId}-option`}
              >
                <span className="text-[0.9375rem] font-medium" style={{ color: "var(--tl-ink)" }}>{itemLabel(item)}</span>
                {itemSub?.(item) ? <span className="text-[0.75rem]" style={{ color: "var(--tl-muted)" }}>{itemSub(item)}</span> : null}
              </button>
            ))
          )}
          {extra}
        </div>
      ) : null}
    </div>
  );
}

export function BasicsQuestion({
  t,
  locale,
  understanding,
  chip,
  busy,
  onAnswer,
}: {
  t: T;
  locale: Locale;
  understanding: Understanding;
  chip: TypeChipProposal | null;
  busy: boolean;
  onAnswer: (a: QuestionAnswer) => void;
}) {
  const talent = understanding.path === "talent";
  const kind = talent ? "talent" : "business";
  // What the AI read, as the starting selection: the person confirms or changes it.
  const [type, setType] = useState<ChipOption | null>(chip?.proposed ?? null);
  const [other, setOther] = useState<string>("");
  const knownCity = understanding.lines.find((l) => l.id === "city" && l.status !== "missing")?.value ?? null;
  const [city, setCity] = useState<OnboardingCity | null>(
    knownCity ? { id: null, slug: "", name: { en: knownCity, es: knownCity }, countryIso2: "", subtitle: null } : null,
  );
  const ready = (type !== null || other.trim().length >= 3) && city !== null;

  const submit = () => {
    if (!ready || !city) return;
    onAnswer({
      questionId: "basics",
      type: type ? { kind, id: type.id, slug: type.slug, label: type.label[locale] } : { kind, id: "", slug: "", label: other.trim() },
      city: { id: city.id, slug: city.slug, name: city.name[locale] || city.name.en, countryIso2: city.countryIso2 },
    });
  };

  return (
    <>
      <Title>{t("public.onboarding.questions.basicsTitle")}</Title>
      <Sub>{t("public.onboarding.questions.basicsSub")}</Sub>
      <div className="mt-4 flex flex-col gap-3">
        <Picker<ChipOption>
          id="onb-basics-what"
          label={t("public.onboarding.questions.basicsWhat")}
          placeholder={talent ? t("public.onboarding.questions.basicsWhatTalentHint") : t("public.onboarding.questions.basicsWhatBusinessHint")}
          locale={locale}
          selected={type}
          selectedLabel={(o) => o.label[locale]}
          search={(q) => searchOnboardingTypes({ query: q, kind })}
          itemLabel={(o) => o.label[locale]}
          itemKey={(o) => o.id}
          onPick={(o) => { setType(o); setOther(""); }}
          onClear={() => setType(null)}
          changeLabel={t("public.onboarding.questions.change")}
          noResultsLabel={t("public.onboarding.questions.noMatch")}
          testId="onb-basics-what"
          extra={
            <div className="px-3 py-2" style={{ borderTop: "1px solid var(--tl-hairline)" }}>
              <label htmlFor="onb-basics-other" className="block text-[0.75rem]" style={{ color: "var(--tl-muted)" }}>{t("public.onboarding.questions.basicsOther")}</label>
              <input
                id="onb-basics-other"
                name="onb-basics-other"
                value={other}
                onChange={(e) => { setOther(e.target.value); setType(null); }}
                onMouseDown={(e) => e.stopPropagation()}
                autoComplete="off"
                placeholder={t("public.onboarding.questions.basicsOtherHint")}
                data-testid="onb-basics-other"
                className="mt-1 h-10 w-full rounded-[10px] px-2 text-[0.9375rem] outline-none"
                style={{ background: "var(--tl-surface)", border: "1px solid var(--tl-hairline)", color: "var(--tl-ink)" }}
              />
            </div>
          }
        />
        {other.trim().length >= 3 && !type ? (
          <p className="text-[0.8125rem]" style={{ color: "var(--tl-ink-soft)" }} data-testid="onb-basics-other-note">{t("public.onboarding.questions.basicsOtherNote")}</p>
        ) : null}
        <Picker<OnboardingCity>
          id="onb-basics-city"
          label={t("public.onboarding.questions.basicsCity")}
          placeholder={t("public.onboarding.questions.basicsCityHint")}
          locale={locale}
          selected={city}
          selectedLabel={(c) => c.name[locale] || c.name.en}
          search={(q) => searchOnboardingCities({ query: q })}
          itemLabel={(c) => c.name[locale] || c.name.en}
          itemSub={(c) => c.subtitle}
          itemKey={(c) => `${c.slug}:${c.countryIso2}`}
          onPick={(c) => setCity(c)}
          onClear={() => setCity(null)}
          changeLabel={t("public.onboarding.questions.change")}
          noResultsLabel={t("public.onboarding.questions.noCity")}
          testId="onb-basics-city"
        />
      </div>
      <div className="mt-5">
        <PrimaryButton onClick={submit} disabled={busy || !ready} testId="onb-next">{t("public.onboarding.questions.next")}</PrimaryButton>
      </div>
    </>
  );
}
