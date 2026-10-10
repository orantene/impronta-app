"use client";

/**
 * Step 3 of 4: "Set up the essentials". Same screen for all three choices;
 * the content adapts (talent: her services; studio: the team's services and a
 * first provider; both: her services, team later). Prefilled from the words
 * or a trade pack, every line editable. Saved on `module_state.essentials`.
 */

import { useState } from "react";

import type { Essentials, PlaceMode } from "@/lib/onboarding/essentials";
import { currencyForCountry } from "@/lib/onboarding/essentials";
import type { FlowLocale } from "@/lib/onboarding/flow";
import { SETUP_COPY } from "@/lib/onboarding/setup-copy";
import { TIMEZONE_OPTIONS, defaultWeekFallback, finalizeSetup, needsTimezoneQuestion, setupIssues, type SetupIssue } from "@/lib/onboarding/setup";
import type { SetupPayload } from "@/lib/server-actions/onboarding-setup";

import { Notice, PrimaryButton } from "../ui";
import { SetupHours } from "./setup-hours";
import { SetupServices } from "./setup-services";

const field = { background: "var(--tl-surface-raised)", border: "1px solid var(--tl-hairline)", color: "var(--tl-ink)" } as const;

function Label({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--tl-muted)" }}>{children}</h3>;
}

export function SetupStep({
  locale,
  setup,
  busy,
  saveFailed,
  onSave,
}: {
  locale: FlowLocale;
  setup: SetupPayload;
  busy: boolean;
  saveFailed: boolean;
  onSave: (essentials: Essentials) => void;
}) {
  const c = SETUP_COPY[locale];
  const { choice, country } = setup;
  const [e, setE] = useState<Essentials>({ ...setup.essentials, hours: setup.essentials.hours ?? defaultWeekFallback() });
  const [edited, setEdited] = useState(false);
  const [providerEmail, setProviderEmail] = useState(setup.essentials.firstProviderEmail ?? "");
  const [later, setLater] = useState(!setup.essentials.firstProviderEmail);
  const ownerProvides = e.ownerProvides !== false;
  const [tried, setTried] = useState(false);
  const currency = e.services[0]?.currency ?? currencyForCountry(country);
  const change = (p: Partial<Essentials>) => {
    setEdited(true);
    setE((cur) => ({ ...cur, ...p }));
  };
  const issues = setupIssues({ choice, essentials: e, country, providerEmailDraft: later ? "" : providerEmail });
  const show = (i: SetupIssue) => tried && issues.includes(i);
  const setPlace = (mode: PlaceMode) => change({ place: { mode, area: e.place?.area ?? null } });

  const submit = () => {
    setTried(true);
    if (issues.length > 0 || busy) return;
    onSave(finalizeSetup(e, later ? "" : providerEmail, edited));
  };

  return (
    <div data-testid="onb-setup">
      <h1 className="tl-display font-semibold leading-[1.08] tracking-[-0.03em]" style={{ color: "var(--tl-ink)", fontSize: 30 }}>{c.title[choice]}</h1>
      <p className="mt-2 text-[0.9375rem] leading-[1.5]" style={{ color: "var(--tl-ink-soft)" }}>{c.sub[choice]}</p>

      <section className="mt-6">
        <Label>{c.services[choice]}</Label>
        <p className="mb-2 text-[0.8125rem]" style={{ color: "var(--tl-ink-soft)" }}>{c.servicesHint}</p>
        <SetupServices copy={c} currency={currency} services={e.services} onChange={(services) => change({ services })} />
        {show("services") ? <Notice tone="error">{c.errors.services}</Notice> : null}
      </section>

      <section className="mt-6">
        <Label>{c.hours}</Label>
        <SetupHours copy={c} locale={locale} week={e.hours!} onChange={(hours) => change({ hours })} />
        {show("hours") ? <Notice tone="error">{c.errors.hours}</Notice> : null}
      </section>

      <section className="mt-6">
        <Label>{c.place}</Label>
        <div className="flex flex-col gap-2" role="radiogroup" aria-label={c.place}>
          {(["studio", "home", "client"] as const).map((m) => {
            const on = e.place?.mode === m;
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPlace(m)}
                data-testid={`onb-place-${m}`}
                className="min-h-12 rounded-[14px] px-4 text-left text-[0.9375rem] font-medium"
                style={{ background: on ? "var(--tl-forest)" : "var(--tl-surface-raised)", color: on ? "var(--tl-forest-on)" : "var(--tl-ink)", border: "1px solid var(--tl-hairline)" }}
              >
                {c.placeModes[m]}
              </button>
            );
          })}
        </div>
        {e.place ? (
          <label className="mt-3 block">
            <span className="mb-1 block text-[0.75rem] font-medium" style={{ color: "var(--tl-ink-soft)" }}>{c.area}</span>
            <input
              value={e.place.area ?? ""}
              onChange={(ev) => change({ place: { mode: e.place!.mode, area: ev.target.value.trim() ? ev.target.value : null } })}
              placeholder={c.areaHint}
              autoComplete="off"
              data-testid="onb-place-area"
              className="h-12 w-full rounded-[14px] px-3 text-[1rem] outline-none"
              style={field}
            />
          </label>
        ) : null}
        {e.place?.mode === "home" ? <p className="mt-2 text-[0.8125rem]" style={{ color: "var(--tl-ink-soft)" }} data-testid="onb-home-private">{c.homePrivate}</p> : null}
        {show("place") ? <Notice tone="error">{c.errors.place}</Notice> : null}
      </section>

      {needsTimezoneQuestion(country) ? (
        <section className="mt-6">
          <Label>{c.timezone}</Label>
          <select
            value={e.timezone ?? ""}
            onChange={(ev) => change({ timezone: ev.target.value || null })}
            aria-label={c.timezone}
            data-testid="onb-timezone"
            className="h-12 w-full rounded-[14px] px-3 text-[1rem] outline-none"
            style={field}
          >
            <option value="">{c.timezoneHint}</option>
            {TIMEZONE_OPTIONS.map((z) => <option key={z.id} value={z.id}>{z.label[locale]}</option>)}
          </select>
          {show("timezone") ? <Notice tone="error">{c.errors.timezone}</Notice> : null}
        </section>
      ) : null}

      {choice === "studio" ? (
        <section className="mt-6">
          <label className="flex min-h-11 items-center gap-2 text-[0.9375rem] font-medium" style={{ color: "var(--tl-ink)" }}>
            <input type="checkbox" checked={ownerProvides} onChange={(ev) => change({ ownerProvides: ev.target.checked })} className="size-5" data-testid="onb-owner-provides" />
            {c.ownerProvides}
          </label>
          <p className="mb-5 text-[0.8125rem]" style={{ color: "var(--tl-ink-soft)" }}>{c.ownerProvidesHint}</p>
          <Label>{c.provider}</Label>
          <p className="mb-2 text-[0.8125rem]" style={{ color: "var(--tl-ink-soft)" }}>{c.providerHint}</p>
          <input
            type="email"
            inputMode="email"
            value={providerEmail}
            disabled={later}
            onChange={(ev) => setProviderEmail(ev.target.value)}
            placeholder={c.providerEmail}
            autoComplete="off"
            data-testid="onb-provider-email"
            className="h-12 w-full rounded-[14px] px-3 text-[1rem] outline-none disabled:opacity-50"
            style={field}
          />
          <label className="mt-1 flex min-h-11 items-center gap-2 text-[0.875rem]" style={{ color: "var(--tl-ink-soft)" }}>
            <input type="checkbox" checked={later} onChange={(ev) => setLater(ev.target.checked)} className="size-5" data-testid="onb-provider-later" />
            {c.providerLater}
          </label>
          <p className="text-[0.8125rem]" style={{ color: "var(--tl-muted)" }}>{c.providerNote}</p>
          {show("providerEmail") ? <Notice tone="error">{c.errors.providerEmail}</Notice> : null}
        </section>
      ) : null}

      {saveFailed ? <Notice tone="error" testId="onb-error">{c.errors.save}</Notice> : null}
      <div className="sticky bottom-0 -mx-5 mt-6 px-5 pb-1 pt-3" style={{ background: "var(--tl-bone)" }}>
        <PrimaryButton onClick={submit} disabled={busy} testId="onb-setup-continue">{c.next}</PrimaryButton>
      </div>
    </div>
  );
}
