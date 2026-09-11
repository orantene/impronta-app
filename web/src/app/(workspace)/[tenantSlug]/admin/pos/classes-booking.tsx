"use client";

/**
 * classes-booking.tsx — the New booking flow, boards A01 to A06, on the
 * Front desk's "Book" door: a step strip (Service · People & place · Time ·
 * Details · Review), the step's content on the left, THIS BOOKING on the
 * right with the one continue button, then the confirmed screen ("Booked
 * for …", the chips, WHERE THIS NOW LIVES, Done).
 *
 * ONE SERVICE, ITS PERSON, THE VENUE. The engine books one timed offering
 * with the person the offering names, at the workspace's venue, paid in
 * cash at the visit or now at the desk (`bookWalkInAppointment`, the same
 * write the Walk-in sheet runs). The boards' multi-service basket, chair
 * and room choice, intake forms, notes, per-booking reminders and a card
 * deposit at booking have no reader or writer here; each is drawn where the
 * board draws it, disabled with its one-sentence reason (D-POS-20).
 *
 * Presentational over `useWalkIn`: props in, callbacks out.
 */

import { useState } from "react";

import type { ClassesCopy } from "@/components/admin/pos/classes-copy";
import { formatOrderMoney } from "@/lib/orders/money-format";
import type { ClassesDay } from "@/lib/pos/classes/day";
import { addUtcDays } from "@/lib/scheduling/tz";
import { cn } from "@/lib/utils";

import { fill, formatClock, formatWhen } from "./classes-format";
import { ClassesNotice, type WalkInOutcome, type WalkInService, type WalkInSlots } from "./classes-panels";
import { POS_CARD, POS_EYEBROW, POS_FIELD, POS_HINT, POS_LABEL, PosAction, PosChip, PosFact, PosIcon, PosSegmented } from "./classes-ui";

type Step = "service" | "people" | "time" | "details" | "review";
const STEPS: readonly Step[] = ["service", "people", "time", "details", "review"];

function dayChip(ymd: string, offset: number, locale: string): { id: string; label: string } {
  const day = addUtcDays(ymd, offset) ?? ymd;
  let label = day;
  try {
    const parts = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", timeZone: "UTC" }).formatToParts(new Date(`${day}T12:00:00.000Z`));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    label = `${get("weekday").replace(/\.$/, "")} ${get("day")}`;
  } catch {
    // The raw day is still a label.
  }
  return { id: String(offset), label };
}

function minutesLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}` : `${m} min`;
}

export function BookingFlow({
  day,
  venueName,
  services,
  serviceId,
  onService,
  slotsDay,
  onDay,
  slots,
  slotIso,
  onSlot,
  name,
  email,
  phone,
  onName,
  onEmail,
  onPhone,
  outcome,
  timeZone,
  locale,
  currency,
  copy,
  busy,
  onBook,
  onCollect,
  onStartAgain,
  onClose,
}: {
  day: ClassesDay;
  venueName: string;
  services: readonly WalkInService[];
  serviceId: string;
  onService: (id: string) => void;
  slotsDay: number;
  onDay: (offset: number) => void;
  slots: WalkInSlots;
  slotIso: string;
  onSlot: (iso: string) => void;
  name: string;
  email: string;
  phone: string;
  onName: (v: string) => void;
  onEmail: (v: string) => void;
  onPhone: (v: string) => void;
  outcome: WalkInOutcome | null;
  timeZone: string;
  locale: string;
  currency: string;
  copy: ClassesCopy;
  busy: boolean;
  onBook: () => void;
  onCollect: () => void;
  onStartAgain: () => void;
  onClose: () => void;
}) {
  const k = copy.board.booking;
  const [step, setStep] = useState<Step>("service");
  const [query, setQuery] = useState("");
  const service = services.find((s) => s.offeringId === serviceId) ?? null;
  const shown = services.filter((s) => s.title.toLowerCase().includes(query.trim().toLowerCase()));
  const endIso = service && slotIso ? new Date(Date.parse(slotIso) + service.durationMinutes * 60_000).toISOString() : null;
  const stepIndex = STEPS.indexOf(step);
  const canContinue =
    step === "service" ? service !== null : step === "people" ? service !== null : step === "time" ? Boolean(slotIso) : step === "details" ? name.trim().length > 0 : true;

  if (outcome) {
    return <Confirmed outcome={outcome} service={service} slotIso={slotIso} name={name} venueName={venueName} timeZone={timeZone} locale={locale} copy={copy} busy={busy} onCollect={onCollect} onStartAgain={onStartAgain} onClose={onClose} />;
  }

  const next = () => {
    if (step === "review") {
      onBook();
      return;
    }
    setStep(STEPS[stepIndex + 1] ?? "review");
  };
  const continueLabel =
    step === "service"
      ? k.continuePeople
      : step === "people"
        ? k.findTimes
        : step === "time"
          ? slotIso
            ? fill(k.chooseTime, { time: formatClock(slotIso, timeZone, locale) })
            : k.chooseTimeNone
          : step === "details"
            ? k.reviewBooking
            : busy
              ? copy.walkin.booking
              : k.confirm;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-pos-classes-booking-flow={step}>
      {/* The step strip */}
      <ol className="m-0 flex h-[46px] shrink-0 list-none items-center gap-[10px] border-b border-admin-border bg-admin-card px-[22px] font-admin-body text-[14px] leading-[1.2]">
        {STEPS.map((id, i) => {
          const state = i < stepIndex ? "done" : i === stepIndex ? "current" : "todo";
          return (
            <li key={id} className="flex items-center gap-[10px]">
              {i > 0 ? <PosIcon name="chevron" size={12} className="-rotate-90 text-admin-ink-dim" /> : null}
              <button
                type="button"
                disabled={state === "todo"}
                className={cn("flex cursor-pointer items-center gap-[8px] disabled:cursor-default", state === "current" ? "font-semibold text-admin-ink" : "text-admin-ink-muted")}
                onClick={() => setStep(id)}
              >
                <span
                  className={cn(
                    "inline-flex h-[22px] w-[22px] items-center justify-center rounded-full text-[12px] font-bold",
                    state === "current" ? "bg-admin-brand text-white" : state === "done" ? "bg-admin-brand-soft text-admin-brand" : "bg-admin-surface-alt text-admin-ink-muted",
                  )}
                >
                  {state === "done" ? "✓" : i + 1}
                </span>
                {k.step[id]}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-h-0 flex-col gap-[14px] overflow-y-auto px-[22px] py-[18px]">
          {step === "service" ? (
            <>
              <label className="relative block">
                <span className="pointer-events-none absolute left-[16px] top-1/2 -translate-y-1/2 text-admin-ink-dim">
                  <PosIcon name="search" size={18} />
                </span>
                <input className={cn(POS_FIELD, "rounded-[14px] pl-[44px]")} placeholder={k.search} aria-label={k.search} value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
              {services.length === 0 ? <p className={cn("m-0", POS_HINT)}>{k.noServices}</p> : null}
              <ul className="m-0 flex list-none flex-col gap-[10px] p-0" role="radiogroup" aria-label={k.step.service}>
                {shown.map((s) => {
                  const on = s.offeringId === serviceId;
                  return (
                    <li key={s.offeringId}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={on}
                        data-pos-classes-booking-service={s.offeringId}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-[14px] rounded-[14px] border-[1.5px] px-[16px] py-[14px] text-left font-admin-body",
                          on ? "border-admin-brand bg-admin-brand-soft" : "border-admin-border bg-admin-card hover:border-admin-border-strong",
                        )}
                        onClick={() => onService(s.offeringId)}
                      >
                        <span className={cn("inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] border-[1.5px] text-[14px] font-bold", on ? "border-admin-brand bg-admin-brand text-white" : "border-admin-border-strong bg-admin-card text-transparent")}>✓</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[16px] font-semibold leading-[1.2] text-admin-ink">{s.title}</span>
                          <span className="block text-[14px] leading-[1.2] text-admin-ink-muted">{fill(k.serviceLine, { minutes: s.durationMinutes, name: s.personName })}</span>
                        </span>
                        <span className="text-[17px] font-bold tabular-nums leading-[1.2] text-admin-ink">{formatOrderMoney(s.amountCents, currency)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="rounded-[14px] bg-admin-indigo-soft px-[16px] py-[12px] font-admin-body text-[14px] leading-[1.45] text-admin-indigo">{k.oneServiceNote}</div>
            </>
          ) : null}

          {step === "people" && service ? (
            <>
              <span className={POS_EYEBROW}>{k.professional}</span>
              <div className="flex w-[300px] items-start gap-[12px] rounded-[14px] border-[1.5px] border-admin-brand bg-admin-brand-soft px-[16px] py-[14px] font-admin-body">
                <span className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full bg-admin-card text-[13px] font-bold text-admin-brand">{initials(service.personName)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold leading-[1.2] text-admin-ink">{service.personName}</span>
                  <span className="mt-[6px] block">
                    <PosChip tone="brand" size="sm">
                      {k.guaranteed}
                    </PosChip>
                  </span>
                </span>
              </div>
              <span className={POS_HINT}>{k.professionalHint}</span>
              <span className={POS_EYEBROW}>{k.where}</span>
              <div className="flex w-[300px] items-center gap-[12px] rounded-[14px] border-[1.5px] border-admin-brand bg-admin-brand-soft px-[16px] py-[14px] font-admin-body">
                <PosIcon name="pin" size={18} className="text-admin-brand" />
                <span className="text-[16px] font-semibold leading-[1.2] text-admin-ink">{venueName}</span>
              </div>
              <span className={POS_HINT}>{k.whereHint}</span>
              <span className={POS_EYEBROW}>{k.needed}</span>
              <div className={cn(POS_CARD, "px-[16px] py-[6px]")}>
                <PosFact label={k.neededPeople}>{fill(k.neededPeopleValue, { name: service.personName })}</PosFact>
                <PosFact label={k.neededRooms} muted>
                  {k.neededRoomsValue}
                </PosFact>
                <PosFact label={k.neededBuffers} muted>
                  {k.neededBuffersValue}
                </PosFact>
              </div>
            </>
          ) : null}

          {step === "time" && service ? (
            <>
              <PosSegmented<string>
                label={k.days}
                value={String(slotsDay - day.dayOffset)}
                onChange={(id) => onDay(day.dayOffset + Number(id))}
                size="lg"
                options={[0, 1, 2, 3, 4].map((n) => dayChip(day.ymd, n, locale))}
              />
              {slots.status === "loading" ? <p className="m-0 font-admin-body text-[14px] text-admin-ink-muted">{copy.walkin.loadingTimes}</p> : null}
              {slots.status === "empty" ? <ClassesNotice kind="refused">{slots.sentence}</ClassesNotice> : null}
              {slots.status === "ready" ? (
                <div className="grid grid-cols-4 gap-[10px]" data-pos-classes-booking-slots>
                  {slots.starts.map((iso) => {
                    const on = slotIso === iso;
                    const ends = new Date(Date.parse(iso) + service.durationMinutes * 60_000).toISOString();
                    return (
                      <button
                        key={iso}
                        type="button"
                        aria-pressed={on}
                        data-pos-classes-slot={iso}
                        className={cn("cursor-pointer rounded-[12px] border-[1.5px] p-[12px] text-left font-admin-body", on ? "border-admin-brand bg-admin-brand-soft" : "border-admin-border bg-admin-card hover:border-admin-border-strong")}
                        onClick={() => onSlot(iso)}
                      >
                        <span className="block text-[17px] font-bold tabular-nums leading-[1.2] text-admin-ink">{formatClock(iso, timeZone, locale)}</span>
                        <span className="block text-[13px] leading-[1.2] text-admin-ink-muted">{formatClock(iso, timeZone, locale)}–{formatClock(ends, timeZone, locale)}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </>
          ) : null}

          {step === "details" ? (
            <>
              <div className="grid grid-cols-2 gap-[14px]">
                <label className="flex flex-col gap-[6px]">
                  <span className={POS_LABEL}>{k.customer}</span>
                  <input className={POS_FIELD} placeholder={copy.walkin.name} aria-label={copy.walkin.name} value={name} onChange={(e) => onName(e.target.value)} autoComplete="off" data-pos-classes-name />
                </label>
                <div className="flex flex-col gap-[6px]">
                  <span className={POS_LABEL}>{k.whoIsItFor}</span>
                  <div className={cn(POS_FIELD, "flex items-center bg-admin-surface-alt text-admin-ink-muted")}>{k.whoIsItForValue}</div>
                </div>
                <input className={POS_FIELD} type="email" placeholder={copy.walkin.email} aria-label={copy.walkin.email} value={email} onChange={(e) => onEmail(e.target.value)} autoComplete="off" data-pos-classes-email />
                <input className={POS_FIELD} type="tel" placeholder={copy.walkin.phone} aria-label={copy.walkin.phone} value={phone} onChange={(e) => onPhone(e.target.value)} autoComplete="off" />
              </div>
              <span className={POS_HINT}>{copy.board.sheet.customerHint}</span>
              <span className={POS_EYEBROW}>{k.notes}</span>
              <textarea className={cn(POS_FIELD, "h-[72px] cursor-not-allowed resize-none py-[12px] opacity-60")} disabled title={k.notesOff} aria-label={k.notes} />
              <span className={POS_HINT}>{k.notesOff}</span>
              <span className={POS_EYEBROW}>{k.reminders}</span>
              <span className={POS_HINT}>{k.remindersOff}</span>
            </>
          ) : null}

          {step === "review" && service ? (
            <>
              <span className={POS_EYEBROW}>{k.reviewLines}</span>
              <div className={cn(POS_CARD, "overflow-hidden")}>
                <div className="flex items-center gap-[12px] px-[16px] py-[13px] font-admin-body">
                  <span className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[10px] bg-admin-surface-alt text-[15px] font-bold text-admin-ink">1</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-semibold leading-[1.2] text-admin-ink">{service.title}</span>
                    <span className="mt-[2px] block text-[14.5px] leading-[1.2] text-admin-ink-muted">{service.personName}</span>
                  </span>
                  <span className="text-[16.5px] font-bold tabular-nums text-admin-ink">{formatOrderMoney(service.amountCents, currency)}</span>
                </div>
              </div>
              <div className={cn(POS_CARD, "px-[16px] py-[6px]")}>
                <PosFact label={k.reviewWhen}>{slotIso ? `${formatWhen(slotIso, timeZone, locale)}${endIso ? `–${formatClock(endIso, timeZone, locale)}` : ""}` : "—"}</PosFact>
                <PosFact label={k.reviewWith}>{service.personName}</PosFact>
                <PosFact label={k.customer}>{name.trim() || copy.today.nobody}</PosFact>
                <PosFact label={k.reviewPay}>{k.reviewPayValue}</PosFact>
              </div>
              <div className="rounded-[14px] bg-admin-indigo-soft px-[16px] py-[12px] font-admin-body text-[14px] leading-[1.45] text-admin-indigo">{fill(k.reviewNote, { name: service.personName })}</div>
            </>
          ) : null}
        </div>

        {/* THIS BOOKING */}
        <div className="flex min-h-0 flex-col gap-[12px] border-l border-admin-border bg-admin-surface p-[18px]">
          <span className={POS_EYEBROW}>{k.thisBooking}</span>
          {service ? (
            <div className={cn(POS_CARD, "overflow-hidden")}>
              <div className="flex items-center gap-[12px] px-[16px] py-[13px] font-admin-body">
                <span className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[10px] bg-admin-surface-alt text-[15px] font-bold text-admin-ink">1</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold leading-[1.2] text-admin-ink">{service.title}</span>
                  <span className="mt-[2px] block text-[14px] leading-[1.2] text-admin-ink-muted">{fill(k.serviceLine, { minutes: service.durationMinutes, name: service.personName })}</span>
                </span>
                <span className="text-[16.5px] font-bold tabular-nums text-admin-ink">{formatOrderMoney(service.amountCents, currency)}</span>
              </div>
              <div className="border-t border-admin-border-soft px-[16px] py-[6px]">
                <PosFact label={k.customerTime}>{minutesLabel(service.durationMinutes)}</PosFact>
                {slotIso ? <PosFact label={k.reviewWhen}>{formatWhen(slotIso, timeZone, locale)}</PosFact> : null}
                <PosFact label={k.total}>{formatOrderMoney(service.amountCents, currency)}</PosFact>
                <PosFact label={k.deposit} muted>
                  {k.depositNone}
                </PosFact>
              </div>
            </div>
          ) : (
            <p className={cn("m-0", POS_HINT)}>{k.nothingYet}</p>
          )}
          <div className="flex-1" />
          <div className="flex items-center gap-[10px]">
            {stepIndex > 0 ? (
              <PosAction onClick={() => setStep(STEPS[stepIndex - 1] ?? "service")} disabled={busy}>
                {k.back}
              </PosAction>
            ) : (
              <PosAction onClick={onClose} disabled={busy}>
                {copy.board.extra.cancel}
              </PosAction>
            )}
            <PosAction tone="primary" size="lg" className="flex-1" disabled={busy || !canContinue} onClick={next} testAttr={{ "data-pos-classes-booking-continue": step }}>
              {continueLabel}
            </PosAction>
          </div>
        </div>
      </div>
    </div>
  );
}

function Confirmed({
  outcome,
  service,
  slotIso,
  name,
  venueName,
  timeZone,
  locale,
  copy,
  busy,
  onCollect,
  onStartAgain,
  onClose,
}: {
  outcome: WalkInOutcome;
  service: WalkInService | null;
  slotIso: string;
  name: string;
  venueName: string;
  timeZone: string;
  locale: string;
  copy: ClassesCopy;
  busy: boolean;
  onCollect: () => void;
  onStartAgain: () => void;
  onClose: () => void;
}) {
  const k = copy.board.booking;
  const due = outcome.stage === "booked" ? outcome.outstandingCents : 0;
  const money = outcome.stage === "booked" ? formatOrderMoney(outcome.outstandingCents, outcome.currency) : null;
  const when = slotIso ? formatWhen(slotIso, timeZone, locale) : "";
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_400px]" data-pos-classes-booking-flow="confirmed">
      <div className="flex flex-col items-center justify-center gap-[14px] px-[22px] py-[18px] text-center">
        <span className="flex h-[64px] w-[64px] items-center justify-center rounded-full bg-admin-success-soft text-[28px] text-admin-green">✓</span>
        <ClassesNotice kind="done">{outcome.sentence}</ClassesNotice>
        <div className="font-admin-body text-[24px] font-bold leading-[1.2] text-admin-ink">{fill(k.bookedTitle, { when })}</div>
        <div className="font-admin-body text-[15px] leading-[1.2] text-admin-ink-muted">
          {fill(k.bookedLine, { name: service?.personName ?? "", venue: venueName, pay: due > 0 && money ? fill(k.payDue, { amount: money }) : k.payNothing })}
        </div>
        <div className="flex flex-wrap justify-center gap-[8px]">
          <PosChip tone="green" size="sm">
            {k.chipConfirmed}
          </PosChip>
          <PosChip tone={due > 0 ? "coral" : "slate"} size="sm">
            {due > 0 ? k.chipUnpaid : k.chipPaid}
          </PosChip>
        </div>
        <span className={POS_HINT}>{k.confirmationOff}</span>
        <div className="flex gap-[10px]">
          {due > 0 && outcome.stage === "booked" ? (
            <PosAction tone="primary" size="lg" disabled={busy} onClick={onCollect} testAttr={{ "data-pos-classes-collect": "collect" }}>
              {busy ? copy.walkin.collecting : fill(k.collectNow, { amount: money ?? "" })}
            </PosAction>
          ) : null}
          <PosAction tone={due > 0 ? "secondary" : "primary"} size="lg" onClick={onClose}>
            {k.done}
          </PosAction>
          <PosAction onClick={onStartAgain} size="lg">
            {k.another}
          </PosAction>
        </div>
      </div>
      <div className="flex min-h-0 flex-col gap-[12px] border-l border-admin-border bg-admin-surface p-[18px]">
        <span className={POS_EYEBROW}>{k.lives}</span>
        <div className={cn(POS_CARD, "px-[16px] py-[6px]")}>
          <PosFact label={k.livesCalendar}>{slotIso ? fill(k.livesCalendarValue, { time: formatClock(slotIso, timeZone, locale) }) : "—"}</PosFact>
          <PosFact label={k.livesSales}>{due > 0 && money ? fill(k.livesSalesValue, { amount: money }) : k.livesSalesNone}</PosFact>
          <PosFact label={k.livesCustomer}>{fill(k.livesCustomerValue, { name: name.trim() || copy.today.nobody })}</PosFact>
        </div>
      </div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : ""}`.toUpperCase() || "·";
}
