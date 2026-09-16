"use client";

/**
 * classes-booking.tsx — the New booking flow, boards A01 to A06, on the
 * Front desk's "Book" door: a step strip (Service · People & place · Time ·
 * Details · Review), the step's content on the left, THIS BOOKING on the
 * right with the one continue button, then the review (A05) and the
 * confirmed screen (A06) in `classes-booking-review.tsx`.
 *
 * ONE SERVICE, ITS PERSON, THE VENUE. The engine books one timed offering
 * with the person the offering names, at the workspace's venue, paid in
 * cash at the visit or now at the desk (`bookWalkInAppointment`, the same
 * write the Walk-in sheet runs). The boards' multi-service basket, a second
 * professional, chair and room choice, intake forms, notes, per-booking
 * reminders and a card deposit at booking have no reader or writer here;
 * each is drawn where the board draws it, disabled with its one-sentence
 * reason (D-POS-119).
 *
 * THE RIGHT COLUMN FOLLOWS THE BOARD PER STEP: the line card on A01, the
 * Services / With / At / Total facts on A02, the itinerary on A03, the
 * date / person / total / deposit facts on A04.
 *
 * Presentational over `useWalkIn`: props in, callbacks out.
 */

import { useEffect, useState } from "react";

import type { ClassesCopy } from "@/components/admin/pos/classes-copy";
import { formatOrderMoney } from "@/lib/orders/money-format";
import type { ClassesDay } from "@/lib/pos/classes/day";
import { addUtcDays } from "@/lib/scheduling/tz";
import { cn } from "@/lib/utils";

import { Confirmed, ReviewStep, BookingLine } from "./classes-booking-review";
import { fill, formatClock, formatWhen } from "./classes-format";
import { ClassesNotice, type WalkInOutcome, type WalkInService, type WalkInSlots } from "./classes-panels";
import { POS_CARD, POS_EYEBROW, POS_FIELD, POS_HINT, POS_LABEL, PosAction, PosFact, PosIcon, PosSegmented } from "./classes-ui";

type Step = "service" | "people" | "time" | "details" | "review";
const STEPS: readonly Step[] = ["service", "people", "time", "details", "review"];
type DayPart = "morning" | "afternoon" | "any";

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

/** "Thu 10 Sep", the venue day of an instant, for the itinerary heading. */
function dayLabel(iso: string, timeZone: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function hourInZone(iso: string, timeZone: string): number {
  try {
    const h = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone }).format(new Date(iso));
    return Number.parseInt(h, 10);
  } catch {
    return 12;
  }
}

function minutesLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}` : `${m} min`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : ""}`.toUpperCase() || "·";
}

const NOTE = "flex items-start gap-[10px] rounded-[12px] bg-admin-indigo-soft px-[14px] py-[12px] font-admin-body text-[14px] font-medium leading-[1.45] text-admin-indigo";

export function BookingFlow({
  onStep,
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
  /** The step shown, for the header's title (A05 reads "New booking · review"). */
  onStep?: (step: Step) => void;
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
  const [part, setPart] = useState<DayPart>("any");
  useEffect(() => {
    onStep?.(step);
  }, [onStep, step]);
  const service = services.find((s) => s.offeringId === serviceId) ?? null;
  const shown = services.filter((s) => s.title.toLowerCase().includes(query.trim().toLowerCase()));
  const endIso = service && slotIso ? new Date(Date.parse(slotIso) + service.durationMinutes * 60_000).toISOString() : null;
  const stepIndex = STEPS.indexOf(step);
  const canContinue =
    step === "service" ? service !== null : step === "people" ? service !== null : step === "time" ? Boolean(slotIso) : step === "details" ? name.trim().length > 0 : true;
  const customer = name.trim() || k.theCustomer;
  const money = service ? formatOrderMoney(service.amountCents, currency) : "";

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

  const visibleStarts = slots.status === "ready" ? slots.starts.filter((iso) => (part === "any" ? true : part === "morning" ? hourInZone(iso, timeZone) < 12 : hourInZone(iso, timeZone) >= 12)) : [];

  const continueBar = (
    <div className="flex items-center gap-[10px]">
      {/* The board's one button; a done step in the strip is the way back. */}
      {stepIndex === 0 ? (
        <PosAction onClick={onClose} disabled={busy}>
          {copy.board.extra.cancel}
        </PosAction>
      ) : null}
      <PosAction tone="primary" size="lg" className="flex-1" disabled={busy || !canContinue} onClick={next} testAttr={{ "data-pos-classes-booking-continue": step }}>
        {continueLabel}
      </PosAction>
    </div>
  );

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

      {step === "review" && service ? (
        <ReviewStep service={service} currency={currency} copy={copy}>
          {continueBar}
        </ReviewStep>
      ) : (
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
                <div className={NOTE}>{k.oneServiceNote}</div>
              </>
            ) : null}

            {step === "people" && service ? (
              <>
                <span className={POS_EYEBROW}>{k.professional}</span>
                <div className="grid grid-cols-3 gap-[10px]" role="radiogroup" aria-label={k.professional}>
                  <div role="radio" aria-checked className="flex flex-col gap-[6px] rounded-[14px] border-[1.5px] border-admin-brand bg-admin-brand-soft p-[14px] font-admin-body">
                    <span className="flex items-center gap-[10px]">
                      <span className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full bg-admin-surface-alt text-[12px] font-bold text-admin-ink">{initials(service.personName)}</span>
                      <span className="text-[15px] font-semibold leading-[1.2] text-admin-ink">{service.personName}</span>
                    </span>
                    <span className="text-[13.5px] leading-[1.3] text-admin-ink-muted">{fill(k.personLine, { minutes: service.durationMinutes })}</span>
                    <span className="inline-flex self-start gap-[2px] rounded-[12px] bg-admin-surface-alt p-[4px]" role="group" aria-label={k.guaranteed}>
                      <span className="whitespace-nowrap rounded-[9px] bg-admin-card px-[12px] py-[8px] text-[14px] font-semibold text-admin-ink shadow-[0_1px_3px_rgba(0,0,0,0.08)]">{k.guaranteed}</span>
                      <span title={k.preferredOff} aria-disabled data-not-wired="true" className="cursor-not-allowed whitespace-nowrap rounded-[9px] px-[12px] py-[8px] text-[14px] font-semibold text-admin-ink-dim">
                        {k.preferred}
                      </span>
                    </span>
                  </div>
                </div>
                <span className={POS_HINT}>{k.professionalHint}</span>
                <span className={POS_EYEBROW}>{k.where}</span>
                <div className="grid grid-cols-2 gap-[10px]" role="radiogroup" aria-label={k.where}>
                  <div role="radio" aria-checked className="flex items-start gap-[12px] rounded-[12px] border-[1.5px] border-admin-brand bg-admin-brand-soft px-[16px] py-[14px] font-admin-body">
                    <span className="mt-[1px] inline-flex h-[22px] w-[22px] shrink-0 rounded-full border-[7px] border-admin-brand" />
                    <span className="min-w-0">
                      <span className="block text-[16px] font-semibold leading-[1.2] text-admin-ink">{venueName}</span>
                      <span className="mt-[3px] block text-[14px] leading-[1.4] text-admin-ink-muted">{k.whereHint}</span>
                    </span>
                  </div>
                </div>
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
                <div className="flex items-center gap-[10px]">
                  <PosSegmented<string>
                    label={k.days}
                    value={String(slotsDay - day.dayOffset)}
                    onChange={(id) => onDay(day.dayOffset + Number(id))}
                    size="lg"
                    options={[0, 1, 2, 3, 4].map((n) => dayChip(day.ymd, n, locale))}
                  />
                  <span className="flex-1" />
                  <PosSegmented<DayPart>
                    label={k.filterLabel}
                    value={part}
                    onChange={setPart}
                    options={[
                      { id: "morning", label: k.filterMorning },
                      { id: "afternoon", label: k.filterAfternoon },
                      { id: "any", label: k.filterAny },
                    ]}
                  />
                </div>
                {slots.status === "loading" ? <p className="m-0 font-admin-body text-[14px] text-admin-ink-muted">{copy.walkin.loadingTimes}</p> : null}
                {slots.status === "empty" ? <ClassesNotice kind="refused">{slots.sentence}</ClassesNotice> : null}
                {slots.status === "ready" ? (
                  <div className="grid grid-cols-4 gap-[10px]" data-pos-classes-booking-slots>
                    {visibleStarts.map((iso) => {
                      const on = slotIso === iso;
                      const ends = new Date(Date.parse(iso) + service.durationMinutes * 60_000).toISOString();
                      return (
                        <button
                          key={iso}
                          type="button"
                          aria-pressed={on}
                          data-pos-classes-slot={iso}
                          className={cn("flex cursor-pointer flex-col gap-[2px] rounded-[14px] border-[1.5px] p-[14px] text-left font-admin-body", on ? "border-admin-brand bg-admin-brand-soft" : "border-admin-border bg-admin-card hover:border-admin-border-strong")}
                          onClick={() => onSlot(iso)}
                        >
                          <span className="block text-[18px] font-bold tabular-nums leading-[1.2] text-admin-ink">{formatClock(iso, timeZone, locale)}</span>
                          <span className="block text-[13px] leading-[1.2] text-admin-ink-muted">{fill(k.slotEnds, { time: formatClock(ends, timeZone, locale) })}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                <div className={NOTE}>
                  <span className="mt-[2px] shrink-0">
                    <PosIcon name="person" size={16} />
                  </span>
                  <span>{fill(k.slotsNote, { name: service.personName })}</span>
                </div>
              </>
            ) : null}

            {step === "details" && service ? (
              <>
                <div className="grid grid-cols-2 gap-[12px]">
                  <label className="flex flex-col gap-[6px]">
                    <span className={POS_LABEL}>{k.customer}</span>
                    <input className={POS_FIELD} placeholder={copy.walkin.name} aria-label={copy.walkin.name} value={name} onChange={(e) => onName(e.target.value)} autoComplete="off" data-pos-classes-name />
                  </label>
                  <div className="flex flex-col gap-[6px]">
                    <span className={POS_LABEL}>{k.whoIsItFor}</span>
                    <div className={cn(POS_FIELD, "flex items-center bg-admin-surface-alt text-admin-ink-muted")}>{k.whoIsItForValue}</div>
                    <span className={POS_HINT}>{copy.board.sheet.customerHint}</span>
                  </div>
                  <input className={POS_FIELD} type="email" placeholder={copy.walkin.email} aria-label={copy.walkin.email} value={email} onChange={(e) => onEmail(e.target.value)} autoComplete="off" data-pos-classes-email />
                  <input className={POS_FIELD} type="tel" placeholder={copy.walkin.phone} aria-label={copy.walkin.phone} value={phone} onChange={(e) => onPhone(e.target.value)} autoComplete="off" />
                </div>
                <span className={POS_EYEBROW}>{k.intake}</span>
                <div className={cn(POS_CARD, "px-[16px] py-[12px] font-admin-body text-[15px] text-admin-ink-dim")}>{k.intakeOff}</div>
                <span className={POS_EYEBROW}>{k.notes}</span>
                <div className="grid grid-cols-2 gap-[12px]">
                  <label className="flex flex-col gap-[6px]">
                    <span className={POS_LABEL}>{fill(k.notesStaff, { name: service.personName })}</span>
                    <input className={cn(POS_FIELD, "cursor-not-allowed opacity-60")} disabled title={k.notesOff} />
                  </label>
                  <label className="flex flex-col gap-[6px]">
                    <span className={POS_LABEL}>{fill(k.notesCustomer, { name: customer })}</span>
                    <input className={cn(POS_FIELD, "cursor-not-allowed opacity-60")} disabled title={k.notesOff} />
                  </label>
                </div>
                <span className={POS_HINT}>{k.notesOff}</span>
                <span className={POS_EYEBROW}>{k.reminders}</span>
                <div className="flex flex-wrap items-center gap-[16px] font-admin-body text-[15px] text-admin-ink">
                  {[k.remindersSms, k.remindersEmail].map((label) => (
                    <label key={label} className="flex cursor-not-allowed items-center gap-[10px] opacity-60" title={k.remindersOff}>
                      <input type="checkbox" disabled className="h-[22px] w-[22px] rounded-[7px] border-[1.5px] border-admin-border-strong" />
                      {label}
                    </label>
                  ))}
                </div>
                <span className={POS_HINT}>{k.remindersOff}</span>
              </>
            ) : null}
          </div>

          {/* THIS BOOKING, drawn as the board draws it on each step. */}
          <div className="flex min-h-0 flex-col gap-[10px] border-l border-admin-border bg-admin-card p-[18px]">
            {!service ? (
              <>
                <span className={POS_EYEBROW}>{k.thisBooking}</span>
                <p className={cn("m-0", POS_HINT)}>{k.nothingYet}</p>
              </>
            ) : step === "time" ? (
              <>
                <span className={POS_EYEBROW}>{slotIso ? `${dayLabel(slotIso, timeZone, locale)} · ${formatClock(slotIso, timeZone, locale)}` : k.itineraryPick}</span>
                <div className={cn(POS_CARD, "px-[16px] py-[6px]")}>
                  <div className="flex items-center gap-[10px] border-t border-transparent py-[6px] font-admin-body">
                    <span className="w-[44px] text-[13px] tabular-nums text-admin-ink-muted">{slotIso ? formatClock(slotIso, timeZone, locale) : "—"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold leading-[1.2] text-admin-ink">{service.title}</span>
                      <span className="block text-[12.5px] leading-[1.3] text-admin-ink-dim">
                        {service.personName} · {venueName}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-[10px] border-t border-admin-border-soft py-[6px] font-admin-body">
                    <span className="w-[44px] text-[13px] tabular-nums text-admin-ink-muted">{endIso ? formatClock(endIso, timeZone, locale) : "—"}</span>
                    <span className="block text-[14px] font-semibold leading-[1.2] text-admin-ink">{fill(k.itineraryEnd, { name: service.personName })}</span>
                  </div>
                </div>
                <span className={POS_HINT}>{slotIso && endIso ? fill(k.seesNote, { name: customer, start: formatClock(slotIso, timeZone, locale), end: formatClock(endIso, timeZone, locale) }) : k.itineraryNone}</span>
              </>
            ) : step === "details" ? (
              <>
                <span className={POS_EYEBROW}>{k.thisBooking}</span>
                <div className={cn(POS_CARD, "px-[16px] py-[6px]")}>
                  <PosFact label={slotIso ? dayLabel(slotIso, timeZone, locale) : k.reviewWhen}>{slotIso && endIso ? `${formatClock(slotIso, timeZone, locale)}–${formatClock(endIso, timeZone, locale)}` : "—"}</PosFact>
                  <PosFact label={fill(k.guaranteedLine, { name: service.personName })}>{venueName}</PosFact>
                  <PosFact label={k.total}>{money}</PosFact>
                  <PosFact label={k.depositNow} muted>
                    {k.depositNone}
                  </PosFact>
                </div>
              </>
            ) : step === "people" ? (
              <>
                <span className={POS_EYEBROW}>{k.thisBooking}</span>
                <div className={cn(POS_CARD, "px-[16px] py-[6px]")}>
                  <PosFact label={k.step.service}>{service.title}</PosFact>
                  <PosFact label={k.reviewWith}>{fill(k.guaranteedLine, { name: service.personName })}</PosFact>
                  <PosFact label={k.at}>{venueName}</PosFact>
                  <PosFact label={k.total}>{money}</PosFact>
                </div>
              </>
            ) : (
              <>
                <span className={POS_EYEBROW}>{k.thisBooking}</span>
                <div className={cn(POS_CARD, "overflow-hidden")}>
                  <BookingLine service={service} currency={currency} line={fill(k.serviceLine, { minutes: service.durationMinutes, name: service.personName })} />
                  <div className="border-t border-admin-border-soft px-[16px] py-[6px]">
                    <PosFact label={k.customerTime}>{minutesLabel(service.durationMinutes)}</PosFact>
                    {slotIso ? <PosFact label={k.reviewWhen}>{formatWhen(slotIso, timeZone, locale)}</PosFact> : null}
                    <PosFact label={k.total}>{money}</PosFact>
                    <PosFact label={k.deposit} muted>
                      {k.depositNone}
                    </PosFact>
                  </div>
                </div>
              </>
            )}
            <div className="flex-1" />
            {continueBar}
          </div>
        </div>
      )}
    </div>
  );
}
