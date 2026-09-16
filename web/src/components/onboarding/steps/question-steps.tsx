"use client";

/**
 * The follow-up questions, one screen each, chips first and typing last:
 * kind of business (type chip), your name, what people can book, two quick
 * things (hours preset + WhatsApp), and the link confirmation for imports.
 * Every question can be skipped when the site has an honest empty line for it.
 */

import { useState } from "react";

import type { MachineErrorCode } from "@/lib/onboarding/machine";
import { HOURS_PRESETS, type HoursPresetId, type ModuleQuestionId } from "@/lib/onboarding/module-questions";
import type { ChipOption, TypeChipProposal } from "@/lib/onboarding/type-chip";
import type { Understanding } from "@/lib/onboarding/understanding";
import type { QuestionAnswer } from "@/lib/server-actions/onboarding-module";

import { GhostLink, Notice, PrimaryButton, Sub, Title } from "../ui";

type T = (key: string) => string;

function Chip({ label, selected, onClick, testId }: { label: string; selected: boolean; onClick: () => void; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      data-testid={testId}
      className="rounded-full px-4 py-2 text-[0.875rem] font-medium transition-colors"
      style={{
        background: selected ? "var(--tl-forest)" : "var(--tl-surface-raised)",
        color: selected ? "var(--tl-forest-on)" : "var(--tl-ink)",
        border: `1px solid ${selected ? "var(--tl-forest)" : "var(--tl-hairline-strong)"}`,
      }}
    >
      {label}
    </button>
  );
}

function Field({ value, onChange, placeholder, testId, inputMode, onEnter }: { value: string; onChange: (v: string) => void; placeholder: string; testId: string; inputMode?: "text" | "tel"; onEnter?: () => void }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter" && onEnter) { e.preventDefault(); onEnter(); } }}
      placeholder={placeholder}
      inputMode={inputMode}
      data-testid={testId}
      className="h-12 w-full rounded-[14px] px-3 text-[1rem] outline-none placeholder:text-[var(--tl-muted-soft)]"
      style={{ background: "var(--tl-surface-raised)", border: "1px solid var(--tl-hairline)", color: "var(--tl-ink)" }}
    />
  );
}

export function QuestionStep({
  t,
  locale,
  questionId,
  index,
  total,
  understanding,
  chip,
  busy,
  error,
  onAnswer,
  onSkip,
}: {
  t: T;
  locale: "en" | "es";
  questionId: ModuleQuestionId;
  index: number;
  total: number;
  understanding: Understanding;
  chip: TypeChipProposal | null;
  busy: boolean;
  error: MachineErrorCode | null;
  onAnswer: (answer: QuestionAnswer) => void;
  onSkip: () => void;
}) {
  const counter = t("public.onboarding.questions.of").replace("{n}", String(index + 1)).replace("{total}", String(total));
  const errorText =
    error === "invalid_whatsapp" ? t("public.onboarding.questions.whatsappInvalid")
    : error === "save_failed" ? t("public.onboarding.errors.saveFailed")
    : error === "offline" ? t("public.onboarding.errors.offline")
    : null;
  return (
    <div data-testid={`onb-question-${questionId}`}>
      <p className="text-[0.75rem] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--tl-muted)" }}>{counter}</p>
      {questionId === "basics" ? (
        <BasicsQuestion t={t} busy={busy} onAnswer={onAnswer} />
      ) : questionId === "kind_of_business" ? (
        <KindQuestion t={t} locale={locale} talent={understanding.path === "talent"} chip={chip} busy={busy} onAnswer={onAnswer} />
      ) : questionId === "name" ? (
        <NameQuestion t={t} busy={busy} onAnswer={onAnswer} />
      ) : questionId === "services" ? (
        <ServicesQuestion t={t} busy={busy} initial={understanding.lines.find((l) => l.factKey === "work.services")?.value} onAnswer={onAnswer} />
      ) : questionId === "two_quick_things" ? (
        <TwoQuickThings t={t} busy={busy} understanding={understanding} onAnswer={onAnswer} />
      ) : questionId === "link_confirm" ? (
        <LinkConfirm t={t} busy={busy} name={understanding.lines.find((l) => l.id === "businessName")?.value ?? ""} onAnswer={onAnswer} />
      ) : null}
      {errorText ? <Notice tone="error" testId="onb-error">{errorText}</Notice> : null}
      <div className="mt-3 flex justify-center">
        <GhostLink onClick={onSkip} testId="onb-skip">{t("public.onboarding.questions.skip")}</GhostLink>
      </div>
    </div>
  );
}

function KindQuestion({ t, locale, talent, chip, busy, onAnswer }: { t: T; locale: "en" | "es"; talent: boolean; chip: TypeChipProposal | null; busy: boolean; onAnswer: (a: QuestionAnswer) => void }) {
  const options: ChipOption[] = chip ? [chip.proposed, ...chip.alternatives].filter((x): x is ChipOption => !!x) : [];
  const [selected, setSelected] = useState<ChipOption | null>(chip?.proposed ?? null);
  const [other, setOther] = useState("");
  const kind = talent ? "talent" : "business";
  const submit = () => {
    if (selected) onAnswer({ questionId: "kind_of_business", kind, id: selected.id, slug: selected.slug, label: selected.label[locale] });
    else if (other.trim()) onAnswer({ questionId: "kind_of_business", kind, id: "", slug: "", label: other.trim() });
  };
  return (
    <>
      <Title>{talent ? t("public.onboarding.questions.kindTalentTitle") : t("public.onboarding.questions.kindTitle")}</Title>
      <Sub>{talent ? t("public.onboarding.questions.kindTalentSub") : t("public.onboarding.questions.kindSub")}</Sub>
      <div className="mt-4 flex flex-wrap gap-2" data-testid="onb-kind-chips">
        {options.map((o) => (
          <Chip key={o.id} label={o.label[locale]} selected={selected?.id === o.id} onClick={() => { setSelected(o); setOther(""); }} testId={`onb-kind-${o.slug}`} />
        ))}
        <Chip label={t("public.onboarding.questions.kindOther")} selected={!selected && other.length > 0} onClick={() => setSelected(null)} testId="onb-kind-other" />
      </div>
      {!selected ? (
        <div className="mt-3">
          <Field value={other} onChange={setOther} placeholder={t("public.onboarding.questions.kindSearch")} testId="onb-kind-input" onEnter={submit} />
        </div>
      ) : null}
      <div className="mt-5">
        <PrimaryButton onClick={submit} disabled={busy || (!selected && !other.trim())} testId="onb-next">{t("public.onboarding.questions.next")}</PrimaryButton>
      </div>
    </>
  );
}

function BasicsQuestion({ t, busy, onAnswer }: { t: T; busy: boolean; onAnswer: (a: QuestionAnswer) => void }) {
  const [what, setWhat] = useState("");
  const [city, setCity] = useState("");
  const submit = () => { if (what.trim() || city.trim()) onAnswer({ questionId: "basics", what, city }); };
  return (
    <>
      <Title>{t("public.onboarding.questions.basicsTitle")}</Title>
      <Sub>{t("public.onboarding.questions.basicsSub")}</Sub>
      <div className="mt-4 flex flex-col gap-2">
        <Field value={what} onChange={setWhat} placeholder={t("public.onboarding.questions.basicsWhat")} testId="onb-basics-what" />
        <Field value={city} onChange={setCity} placeholder={t("public.onboarding.questions.basicsCity")} testId="onb-basics-city" onEnter={submit} />
      </div>
      <div className="mt-5">
        <PrimaryButton onClick={submit} disabled={busy || (!what.trim() && !city.trim())} testId="onb-next">{t("public.onboarding.questions.next")}</PrimaryButton>
      </div>
    </>
  );
}

function NameQuestion({ t, busy, onAnswer }: { t: T; busy: boolean; onAnswer: (a: QuestionAnswer) => void }) {
  const [name, setName] = useState("");
  const submit = () => { if (name.trim()) onAnswer({ questionId: "name", name }); };
  return (
    <>
      <Title>{t("public.onboarding.questions.nameTitle")}</Title>
      <Sub>{t("public.onboarding.questions.nameSub")}</Sub>
      <div className="mt-4">
        <Field value={name} onChange={setName} placeholder={t("public.onboarding.questions.namePlaceholder")} testId="onb-name-input" onEnter={submit} />
      </div>
      <div className="mt-5">
        <PrimaryButton onClick={submit} disabled={busy || !name.trim()} testId="onb-next">{t("public.onboarding.questions.next")}</PrimaryButton>
      </div>
    </>
  );
}

function ServicesQuestion({ t, busy, initial, onAnswer }: { t: T; busy: boolean; initial?: string | null; onAnswer: (a: QuestionAnswer) => void }) {
  const [items, setItems] = useState<string[]>(() => (initial ? initial.split(" · ") : ["", ""]));
  const clean = items.map((s) => s.trim()).filter(Boolean);
  return (
    <>
      <Title>{t("public.onboarding.questions.servicesTitle")}</Title>
      <Sub>{t("public.onboarding.questions.servicesSub")}</Sub>
      <div className="mt-4 flex flex-col gap-2" data-testid="onb-services">
        {items.map((item, i) => (
          <Field key={i} value={item} onChange={(v) => setItems(items.map((x, j) => (j === i ? v : x)))} placeholder={t("public.onboarding.questions.servicesPlaceholder")} testId={`onb-service-${i}`} />
        ))}
        <GhostLink onClick={() => setItems([...items, ""])} testId="onb-service-add">{t("public.onboarding.questions.servicesAdd")}</GhostLink>
      </div>
      <div className="mt-5">
        <PrimaryButton onClick={() => onAnswer({ questionId: "services", services: clean })} disabled={busy || clean.length === 0} testId="onb-next">{t("public.onboarding.questions.next")}</PrimaryButton>
      </div>
    </>
  );
}

function TwoQuickThings({ t, busy, understanding, onAnswer }: { t: T; busy: boolean; understanding: Understanding; onAnswer: (a: QuestionAnswer) => void }) {
  const hoursMissing = understanding.lines.some((l) => l.id === "hours" && l.status === "missing");
  const whatsappMissing = understanding.lines.some((l) => l.id === "whatsapp" && l.status === "missing");
  const [preset, setPreset] = useState<HoursPresetId | "custom" | null>(null);
  const [custom, setCustom] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const presets = Object.keys(HOURS_PRESETS) as HoursPresetId[];
  const submit = () =>
    onAnswer({
      questionId: "two_quick_things",
      hoursPreset: preset && preset !== "custom" ? preset : null,
      hoursCustom: preset === "custom" ? custom.split(/\n|,/).map((s) => s.trim()).filter(Boolean) : null,
      whatsapp: whatsapp.trim() || null,
    });
  const anything = (preset && preset !== "custom") || (preset === "custom" && custom.trim()) || whatsapp.trim();
  return (
    <>
      <Title>{t("public.onboarding.questions.twoTitle")}</Title>
      <Sub>{t("public.onboarding.questions.twoSub")}</Sub>
      {hoursMissing ? (
        <div className="mt-4">
          <p className="text-[0.75rem] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--tl-muted)" }}>{t("public.onboarding.questions.hoursLabel")}</p>
          <div className="mt-2 flex flex-wrap gap-2" data-testid="onb-hours-chips">
            {presets.map((p) => (
              <Chip key={p} label={t(`public.onboarding.questions.hours.${p}`)} selected={preset === p} onClick={() => setPreset(p)} testId={`onb-hours-${p}`} />
            ))}
            <Chip label={t("public.onboarding.questions.hoursCustom")} selected={preset === "custom"} onClick={() => setPreset("custom")} testId="onb-hours-custom" />
          </div>
          {preset === "custom" ? (
            <div className="mt-2">
              <Field value={custom} onChange={setCustom} placeholder={t("public.onboarding.questions.hoursCustomPlaceholder")} testId="onb-hours-input" />
            </div>
          ) : null}
        </div>
      ) : null}
      {whatsappMissing ? (
        <div className="mt-4">
          <p className="text-[0.75rem] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--tl-muted)" }}>{t("public.onboarding.questions.whatsappLabel")}</p>
          <div className="mt-2">
            <Field value={whatsapp} onChange={setWhatsapp} placeholder={t("public.onboarding.questions.whatsappPlaceholder")} testId="onb-whatsapp-input" inputMode="tel" onEnter={submit} />
          </div>
          <p className="mt-1 text-[0.75rem]" style={{ color: "var(--tl-muted)" }}>{t("public.onboarding.questions.whatsappHint")}</p>
        </div>
      ) : null}
      <div className="mt-5">
        <PrimaryButton onClick={submit} disabled={busy || !anything} testId="onb-next">{t("public.onboarding.questions.next")}</PrimaryButton>
      </div>
    </>
  );
}

function LinkConfirm({ t, busy, name, onAnswer }: { t: T; busy: boolean; name: string; onAnswer: (a: QuestionAnswer) => void }) {
  return (
    <>
      <Title>{t("public.onboarding.questions.linkConfirmTitle")}</Title>
      <Sub>{t("public.onboarding.questions.linkConfirmSub")}</Sub>
      <p className="mt-4 text-[1.125rem] font-semibold" style={{ color: "var(--tl-ink)" }}>{name}</p>
      <div className="mt-5 flex flex-col gap-2">
        <PrimaryButton onClick={() => onAnswer({ questionId: "link_confirm", confirmed: true })} disabled={busy} testId="onb-next">{t("public.onboarding.questions.linkConfirmYes")}</PrimaryButton>
      </div>
    </>
  );
}

/** Ordering helper for the counter: the questions after the fork. */
export function questionsAfterFork(followUps: ModuleQuestionId[]): ModuleQuestionId[] {
  return followUps.filter((q) => q !== "fork");
}
