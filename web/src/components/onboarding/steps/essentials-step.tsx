"use client";

/**
 * "Add the essentials": one screen, every detail the site needs, prefilled
 * from the words. Replaces the question-per-screen sequence (2026-09-17).
 *
 * Business: category · services · location · hours · WhatsApp.
 * Talent:   what you do · your name · services · location.
 * Both:     the business set plus your name.
 *
 * Category and location are pickers over the taxonomy / catalogue and the
 * platform's cities (never free text by default); both are required. The
 * rest is optional here and can be finished in the builder.
 */

import { useState } from "react";

import { HOURS_PRESETS, type HoursPresetId } from "@/lib/onboarding/module-questions";
import type { ChipOption, TypeChipProposal } from "@/lib/onboarding/type-chip";
import type { Understanding } from "@/lib/onboarding/understanding";
import type { EssentialsAnswer } from "@/lib/server-actions/onboarding-module";
import { searchOnboardingCities, searchOnboardingTypes, type OnboardingCity } from "@/lib/server-actions/onboarding-lookups";

import { Notice, PrimaryButton, Sub, Title } from "../ui";
import { Picker } from "./picker";

type T = (key: string) => string;
type Locale = "en" | "es";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--tl-muted)" }}>{children}</span>;
}

const inputStyle = { background: "var(--tl-surface-raised)", border: "1px solid var(--tl-hairline)", color: "var(--tl-ink)" } as const;

function splitServices(value: string | null): string[] {
  if (!value) return [];
  return value.split(/\s*[·,]\s*/).map((s) => s.trim()).filter(Boolean).slice(0, 12);
}

export function EssentialsStep({
  t,
  locale,
  understanding,
  chip,
  busy,
  error,
  onSave,
}: {
  t: T;
  locale: Locale;
  understanding: Understanding;
  chip: TypeChipProposal | null;
  busy: boolean;
  error: string | null;
  onSave: (a: EssentialsAnswer) => void;
}) {
  const path = understanding.path;
  const business = path !== "talent";
  const kind = business ? "business" : "talent";
  const line = (id: string) => understanding.lines.find((l) => l.id === id) ?? null;
  const known = (id: string) => {
    const l = line(id);
    return l && l.status !== "missing" && l.value ? l.value : null;
  };

  const [type, setType] = useState<ChipOption | null>(chip?.proposed ?? null);
  const [other, setOther] = useState("");
  const knownWhat = known(business ? "kind" : "what");
  const knownCity = known("city");
  const [city, setCity] = useState<OnboardingCity | null>(knownCity ? { id: null, slug: "", name: { en: knownCity, es: knownCity }, countryIso2: "", subtitle: null } : null);
  const [name, setName] = useState(known(business ? "businessName" : "name") ?? "");
  const [services, setServices] = useState<string[]>(splitServices(known(business ? "offer" : "services")));
  const [serviceDraft, setServiceDraft] = useState("");
  const knownHours = known("hours");
  const presetFor = (value: string | null): HoursPresetId | null => {
    if (!value) return null;
    for (const [id, v] of Object.entries(HOURS_PRESETS)) if (v.en[0] === value || v.es[0] === value) return id as HoursPresetId;
    return null;
  };
  const [hoursPreset, setHoursPreset] = useState<HoursPresetId | null>(presetFor(knownHours));
  const [hoursCustom, setHoursCustom] = useState(knownHours && !presetFor(knownHours) ? knownHours : "");
  const [whatsapp, setWhatsapp] = useState(known("whatsapp") ?? "");

  const [typeCleared, setTypeCleared] = useState(false);
  const ready = (type !== null || other.trim().length >= 3 || (knownWhat !== null && !typeCleared)) && city !== null;

  // Pasted or fast-typed "yoga, pilates, retreats" becomes three chips, not one.
  const commitService = (raw: string) => {
    setServiceDraft("");
    const next = [...services];
    for (const part of raw.split(/[,;·]/)) {
      const v = part.trim();
      if (!v || next.length >= 12) continue;
      if (!next.some((s) => s.toLowerCase() === v.toLowerCase())) next.push(v);
    }
    if (next.length !== services.length) setServices(next);
  };
  const addService = () => commitService(serviceDraft);

  const submit = () => {
    if (!ready || busy || !city) return;
    onSave({
      type: type ? { kind, id: type.id, slug: type.slug, label: type.label[locale] } : other.trim().length >= 3 ? { kind, id: "", slug: "", label: other.trim() } : null,
      // The prefilled city (no slug, no id) is what the words gave: leave it unless changed.
      city: !city.slug && city.id === null && city.name.en === knownCity ? null : { id: city.id, slug: city.slug, name: city.name[locale] || city.name.en, countryIso2: city.countryIso2 },
      name: name.trim() || null,
      services: services.length ? services : null,
      hoursPreset: business ? hoursPreset : null,
      hoursCustom: business && !hoursPreset && hoursCustom.trim() ? [hoursCustom.trim()] : null,
      // The field shows +52 as a prefix, so a bare number is Mexican; a number typed with its own code keeps it.
      whatsapp: business && whatsapp.trim() ? (whatsapp.trim().startsWith("+") ? whatsapp.trim() : `+52 ${whatsapp.trim()}`) : null,
    });
  };

  // What the AI read shows as the selected value; "Change" opens the picker.
  const typeSelected: ChipOption | null = type ?? (knownWhat && !typeCleared ? { id: "", slug: "", label: { en: knownWhat, es: knownWhat } } : null);

  return (
    <div data-testid="onb-essentials">
      <Title>{t("public.onboarding.essentials.title")}</Title>
      <Sub>{t("public.onboarding.essentials.sub")}</Sub>
      <div className="mt-5 flex flex-col gap-4">
        <div>
          <Picker<ChipOption>
            id="onb-basics-what"
            label={business ? t("public.onboarding.essentials.category") : t("public.onboarding.essentials.whatYouDo")}
            placeholder={business ? t("public.onboarding.questions.basicsWhatBusinessHint") : t("public.onboarding.questions.basicsWhatTalentHint")}
            locale={locale}
            selected={typeSelected}
            selectedLabel={(o) => o.label[locale] || o.label.en}
            search={(q) => searchOnboardingTypes({ query: q, kind })}
            itemLabel={(o) => o.label[locale]}
            itemKey={(o) => o.id}
            onPick={(o) => { setType(o); setOther(""); setTypeCleared(false); }}
            onClear={() => { setType(null); setTypeCleared(true); }}
            changeLabel={t("public.onboarding.questions.change")}
            noResultsLabel={t("public.onboarding.questions.noMatch")}
            testId="onb-basics-what"
            extra={
              <div className="px-3 py-2" style={{ borderTop: "1px solid var(--tl-hairline)" }}>
                <label htmlFor="onb-basics-other" className="block text-[0.75rem]" style={{ color: "var(--tl-muted)" }}>{t("public.onboarding.questions.basicsOther")}</label>
                <input id="onb-basics-other" name="onb-basics-other" value={other} onChange={(e) => { setOther(e.target.value); setType(null); }} autoComplete="off" placeholder={t("public.onboarding.questions.basicsOtherHint")} data-testid="onb-basics-other" className="mt-1 h-10 w-full rounded-[10px] px-2 text-[0.9375rem] outline-none" style={{ background: "var(--tl-surface)", border: "1px solid var(--tl-hairline)", color: "var(--tl-ink)" }} />
              </div>
            }
          />
        </div>

        <div>
            <FieldLabel>{business ? t("public.onboarding.essentials.businessName") : t("public.onboarding.essentials.yourName")}</FieldLabel>
            <input value={name} onChange={(e) => setName(e.target.value)} name="onb-name" autoComplete="off" placeholder={business ? t("public.onboarding.essentials.businessNameHint") : t("public.onboarding.essentials.yourNameHint")} data-testid="onb-name-input" className="h-12 w-full rounded-[14px] px-3 text-[1rem] outline-none placeholder:text-[var(--tl-muted-soft)]" style={inputStyle} />
        </div>

        <div>
          <FieldLabel>{t("public.onboarding.essentials.services")}</FieldLabel>
          <form
            onSubmit={(e) => { e.preventDefault(); addService(); }}
            className="flex flex-wrap gap-1.5 rounded-[14px] px-2.5 py-2"
            style={inputStyle}
            data-testid="onb-services"
          >
            {services.map((s, i) => (
              <span key={`${s}#${i}`} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.8125rem] font-medium" style={{ background: "var(--tl-stone-soft)", color: "var(--tl-ink)" }} data-testid={`onb-service-chip-${i}`}>
                {s}
                <button type="button" aria-label={t("public.onboarding.essentials.remove")} onClick={() => setServices(services.filter((_, j) => j !== i))} className="ml-0.5 text-[0.75rem]" style={{ color: "var(--tl-muted)" }}>×</button>
              </span>
            ))}
            <input
              value={serviceDraft}
              onChange={(e) => { if (e.target.value.endsWith(",")) commitService(e.target.value.slice(0, -1)); else setServiceDraft(e.target.value); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitService(e.currentTarget.value); } }}
              onBlur={addService}
              enterKeyHint="done"
              name="onb-service"
              autoComplete="off"
              placeholder={services.length ? t("public.onboarding.essentials.addService") : t("public.onboarding.essentials.servicesHint")}
              data-testid="onb-service-input"
              className="h-8 min-w-[9rem] flex-1 bg-transparent text-[0.9375rem] outline-none placeholder:text-[var(--tl-muted-soft)]"
              style={{ color: "var(--tl-ink)" }}
            />
            <button type="submit" className="sr-only" tabIndex={-1} aria-hidden>+</button>
          </form>
        </div>

        <Picker<OnboardingCity>
          id="onb-basics-city"
          label={t("public.onboarding.essentials.location")}
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

        {business ? (
          <>
            <div>
              <FieldLabel>{t("public.onboarding.essentials.hours")}</FieldLabel>
              <div className="flex flex-wrap gap-1.5" data-testid="onb-hours">
                {(Object.keys(HOURS_PRESETS) as HoursPresetId[]).map((id) => (
                  <button key={id} type="button" onClick={() => { setHoursPreset(id); setHoursCustom(""); }} data-testid={`onb-hours-${id}`} className="rounded-full px-3 py-1.5 text-[0.8125rem] font-medium" style={{ background: hoursPreset === id ? "var(--tl-ink)" : "var(--tl-surface-raised)", color: hoursPreset === id ? "var(--tl-bone)" : "var(--tl-ink)", border: "1px solid var(--tl-hairline)" }}>
                    {HOURS_PRESETS[id][locale][0]}
                  </button>
                ))}
              </div>
              <input value={hoursCustom} onChange={(e) => { setHoursCustom(e.target.value); if (e.target.value) setHoursPreset(null); }} name="onb-hours-custom" autoComplete="off" placeholder={t("public.onboarding.essentials.hoursCustomHint")} data-testid="onb-hours-custom" className="mt-2 h-11 w-full rounded-[14px] px-3 text-[0.9375rem] outline-none placeholder:text-[var(--tl-muted-soft)]" style={inputStyle} />
            </div>
            <div>
              <FieldLabel>{t("public.onboarding.essentials.whatsapp")}</FieldLabel>
              <div className="flex items-center gap-2">
                <span className="grid h-12 shrink-0 place-items-center rounded-[14px] px-3 text-[0.9375rem] font-medium" style={inputStyle}>+52</span>
                <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} name="onb-whatsapp" inputMode="tel" autoComplete="off" placeholder="984 123 4567" data-testid="onb-whatsapp-input" className="h-12 w-full rounded-[14px] px-3 text-[1rem] outline-none placeholder:text-[var(--tl-muted-soft)]" style={inputStyle} />
              </div>
              <p className="mt-1 text-[0.75rem]" style={{ color: "var(--tl-muted)" }}>{t("public.onboarding.essentials.whatsappHint")}</p>
            </div>
          </>
        ) : null}
      </div>
      {error ? <Notice tone="error" testId="onb-error">{error}</Notice> : null}
      <div className="mt-6">
        <PrimaryButton onClick={submit} disabled={busy || !ready} testId="onb-next">{t("public.onboarding.essentials.continue")}</PrimaryButton>
      </div>
    </div>
  );
}
