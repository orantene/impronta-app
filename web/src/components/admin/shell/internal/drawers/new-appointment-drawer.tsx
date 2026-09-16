"use client";

/**
 * NewAppointmentDrawer — board WS007 (Calendar › New appointment), the
 * drawer the Calendar's "New booking" and the Create menu open: service
 * first, one command. Customer · Participants · Services · Professional /
 * Location / Room · Compatible times, then REVIEW (the itinerary, the
 * totals) and Confirm.
 *
 * THE ENGINE'S ONE BOOKING. The same read and write the Front desk's Book
 * door runs: `classesServices` (the timed services that name a person, the
 * venue), `classesWalkInSlots` (the person's free times) and
 * `classesBookWalkIn` (`bookWalkInAppointment`, pay at the visit). Nothing
 * here is a second booking path.
 *
 * NOT WIRED, said on the control (D-POS-120): Time first, Search existing,
 * a second participant, add-ons, a second service, package credit, another
 * professional, mobile or virtual, a room or station, Save draft, Hold 15
 * min, a deposit at booking, an intake form. Each is drawn where the board
 * draws it, disabled with its one-sentence reason in three languages.
 *
 * Token classes only; inline styles are frozen under components/admin/shell.
 */

import { useEffect, useMemo, useState } from "react";

import { classesBookWalkIn, classesServices, classesWalkInSlots } from "@/app/(workspace)/[tenantSlug]/admin/pos/classes-actions";
import { useT } from "@/i18n/use-t";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { noSlotsKey, walkInRefusalKey } from "@/lib/pos/classes/refusals";
import type { WalkInService } from "@/lib/pos/classes/walkin";
import { addUtcDays, utcToZonedYmd } from "@/lib/scheduling/tz";
import { ActionButton, BUTTON_PRIMARY, CARD, FactRow, INPUT, Outcome, SectionLabel, Segmented } from "../page-modules/appointments-classes-ui";
import { DrawerShell, useAdminShell, useQueuedRouterRefresh } from "./drawer-shared";

const K = "dashboard.adminCalendar.newAppointment";
const R = "dashboard.pos.classes.refusal";

type Slots = { status: "idle" | "loading" } | { status: "ready"; starts: string[] } | { status: "empty"; text: string };

function clock(iso: string, timeZone: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function when(iso: string, timeZone: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function dayChip(ymd: string, locale: string): string {
  try {
    const parts = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", timeZone: "UTC" }).formatToParts(new Date(`${ymd}T12:00:00.000Z`));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${get("weekday").replace(/\.$/, "")} ${get("day")}`;
  } catch {
    return ymd;
  }
}

const LINK = "cursor-pointer font-admin-body text-admin-13 font-semibold text-admin-brand underline-offset-2 hover:underline";
const LINK_OFF = "cursor-not-allowed font-admin-body text-admin-13 font-semibold text-admin-ink-dim";
const SELECT_OFF = `${INPUT} cursor-not-allowed opacity-50`;

export function NewAppointmentDrawer() {
  const t = useT();
  const locale = useDashboardLocale();
  const { closeDrawer, toast, adminBasePath } = useAdminShell();
  const queueRouterRefresh = useQueuedRouterRefresh();

  const [services, setServices] = useState<WalkInService[] | null>(null);
  const [venueName, setVenueName] = useState<string | null>(null);
  const [timeZone, setTimeZone] = useState("UTC");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [dayOffset, setDayOffset] = useState(0);
  const [slots, setSlots] = useState<Slots>({ status: "idle" });
  const [slotIso, setSlotIso] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ kind: "refused" | "done"; text: string } | null>(null);
  // Minted once when the drawer opens, so a double click replays the same booking.
  const [attemptKey] = useState(() => `appt-${crypto.randomUUID()}`);

  useEffect(() => {
    let alive = true;
    classesServices().then(
      (r) => {
        if (!alive) return;
        if (r.ok) {
          setServices(r.services);
          setVenueName(r.venueName);
          setTimeZone(r.timeZone);
        } else {
          setServices([]);
          setLoadError(t(`${R}.${walkInRefusalKey(r.reason)}`));
        }
      },
      () => {
        if (!alive) return;
        setServices([]);
        setLoadError(t(`${R}.${walkInRefusalKey("unavailable")}`));
      },
    );
    return () => {
      alive = false;
    };
  }, [t]);

  const service = useMemo(() => (services ?? []).find((s) => s.offeringId === serviceId) ?? null, [services, serviceId]);

  useEffect(() => {
    if (!serviceId) {
      setSlots({ status: "idle" });
      return;
    }
    let alive = true;
    setSlots({ status: "loading" });
    setSlotIso("");
    classesWalkInSlots({ offeringId: serviceId, dayOffset }).then(
      (r) => {
        if (!alive) return;
        if (!r.ok) {
          setSlots({ status: "empty", text: t(`${R}.${walkInRefusalKey(r.reason)}`) });
          return;
        }
        if (r.starts.length === 0) {
          setSlots({ status: "empty", text: r.emptyReason ? t(`${R}.${noSlotsKey(r.emptyReason)}`) : t(`${K}.noTimes`) });
          return;
        }
        setSlots({ status: "ready", starts: r.starts });
      },
      () => {
        if (alive) setSlots({ status: "empty", text: t(`${R}.${walkInRefusalKey("unavailable")}`) });
      },
    );
    return () => {
      alive = false;
    };
  }, [serviceId, dayOffset, t]);

  const todayYmd = utcToZonedYmd(new Date(), timeZone) ?? new Date().toISOString().slice(0, 10);
  const days = [0, 1, 2, 3, 4, 5, 6].map((n) => ({ id: String(n), label: dayChip(addUtcDays(todayYmd, n) ?? todayYmd, locale) }));
  const endIso = service && slotIso ? new Date(Date.parse(slotIso) + service.durationMinutes * 60_000).toISOString() : null;
  const money = service ? formatOrderMoney(service.amountCents, "USD") : "";

  const book = async () => {
    if (!service) return setOutcome({ kind: "refused", text: t(`${K}.needService`) });
    if (!slotIso) return setOutcome({ kind: "refused", text: t(`${K}.needTime`) });
    if (!name.trim()) return setOutcome({ kind: "refused", text: t(`${K}.needName`) });
    setBusy(true);
    setOutcome(null);
    try {
      const res = await classesBookWalkIn({ offeringId: service.offeringId, startsAt: slotIso, name: name.trim(), email: email.trim(), phone: phone.trim(), attemptKey });
      if (res.ok) {
        const text = interpolate(t(`${K}.booked`), { when: when(slotIso, timeZone, locale) });
        setOutcome({ kind: "done", text });
        toast(text);
        queueRouterRefresh();
        closeDrawer();
      } else {
        setOutcome({ kind: "refused", text: t(`${R}.${walkInRefusalKey(res.reason)}`) });
      }
    } catch {
      setOutcome({ kind: "refused", text: t(`${R}.${walkInRefusalKey("unavailable")}`) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <DrawerShell
      open
      onClose={closeDrawer}
      title={t(`${K}.title`)}
      description={t(`${K}.subtitle`)}
      defaultSize="half"
      toolbar={
        <Segmented<"service" | "time">
          label={t(`${K}.subtitle`)}
          value="service"
          onChange={() => undefined}
          options={[
            { id: "service", label: t(`${K}.serviceFirst`) },
            { id: "time", label: t(`${K}.timeFirst`), reason: t(`${K}.timeFirstOff`) },
          ]}
        />
      }
      footer={
        <div className="flex w-full flex-col gap-[8px]" data-testid="new-appointment-footer">
          <div className="grid grid-cols-2 gap-[8px]">
            <ActionButton reason={t(`${K}.saveDraftOff`)}>{t(`${K}.saveDraft`)}</ActionButton>
            <ActionButton reason={t(`${K}.holdOff`)}>{t(`${K}.hold`)}</ActionButton>
          </div>
          <button type="button" className={`${BUTTON_PRIMARY} h-[40px] w-full disabled:opacity-60`} disabled={busy || !service || !slotIso || !name.trim()} onClick={() => void book()} data-testid="new-appointment-confirm">
            {busy ? t(`${K}.confirmWorking`) : t(`${K}.confirm`)}
          </button>
          <p className="m-0 text-center font-admin-body text-[11.5px] leading-[1.4] text-admin-ink-dim">{interpolate(t(`${K}.footnote`), { name: service?.personName ?? t(`${K}.professional`) })}</p>
        </div>
      }
    >
      <div className="flex flex-col gap-[16px] font-admin-body leading-[1.2]" data-testid="new-appointment">
        {loadError ? <Outcome kind="refused">{loadError}</Outcome> : null}
        {outcome ? (
          <Outcome kind={outcome.kind} testId="new-appointment-message">
            {outcome.text}
          </Outcome>
        ) : null}

        {/* Customer */}
        <div className="flex flex-col gap-[8px]">
          <div className="text-admin-13 font-semibold text-admin-ink">
            {t(`${K}.customer`)} <span className="text-admin-coral">*</span>
          </div>
          <div className={`${CARD} grid grid-cols-[1fr_1fr] gap-[8px] p-[10px]`}>
            <input className={`${INPUT} col-span-2`} placeholder={t(`${K}.customerName`)} aria-label={t(`${K}.customerName`)} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" data-testid="new-appointment-name" />
            <input className={INPUT} type="email" placeholder={t(`${K}.customerEmail`)} aria-label={t(`${K}.customerEmail`)} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
            <input className={INPUT} type="tel" placeholder={t(`${K}.customerPhone`)} aria-label={t(`${K}.customerPhone`)} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
          </div>
          <div className="flex flex-wrap items-center gap-[10px]">
            <span className={LINK_OFF} title={t(`${K}.searchExistingOff`)} aria-disabled data-not-wired="true">
              {t(`${K}.searchExisting`)}
            </span>
            <span className="text-admin-ink-dim">·</span>
            <span className="font-admin-body text-admin-13 font-semibold text-admin-ink" title={t(`${K}.createCustomerHint`)}>
              {t(`${K}.createCustomer`)}
            </span>
            <span className="text-admin-ink-dim">·</span>
            <button
              type="button"
              className={LINK}
              title={t(`${K}.walkInHint`)}
              onClick={() => {
                setEmail("");
                setPhone("");
              }}
            >
              {t(`${K}.walkIn`)}
            </button>
          </div>
        </div>

        {/* Participants */}
        <div className="flex flex-col gap-[8px]">
          <div className="text-admin-13 font-semibold text-admin-ink">{t(`${K}.participants`)}</div>
          <div className="flex flex-wrap items-center gap-[8px]">
            <span className="inline-flex items-center gap-[8px] rounded-full border border-admin-border bg-admin-card py-[5px] pl-[12px] pr-[6px] text-admin-13 text-admin-ink">
              {name.trim() || t(`${K}.customer`)}
              <span className="rounded-full bg-admin-surface-alt px-[8px] py-[2px] text-admin-11 font-semibold text-admin-ink-muted">{t(`${K}.recipient`)}</span>
            </span>
            <ActionButton reason={t(`${K}.addParticipantOff`)}>+ {t(`${K}.addParticipant`)}</ActionButton>
          </div>
          <p className="m-0 text-admin-12h text-admin-ink-dim">{t(`${K}.addParticipantOff`)}</p>
        </div>

        {/* Services */}
        <div className="flex flex-col gap-[8px]">
          <div className="text-admin-13 font-semibold text-admin-ink">
            {t(`${K}.services`)} <span className="text-admin-coral">*</span>
          </div>
          {services === null ? (
            <p className="m-0 text-admin-13 text-admin-ink-muted">{t(`${K}.loadingTimes`)}</p>
          ) : services.length === 0 ? (
            <p className="m-0 text-admin-13 text-admin-ink-muted">{t(`${K}.noServices`)}</p>
          ) : (
            <div className={`${CARD} flex flex-col gap-[10px] px-[16px] py-[14px]`}>
              <div className="flex items-start gap-[12px]">
                <span className="mt-[6px] h-[8px] w-[8px] shrink-0 rounded-[2px] bg-admin-brand" />
                <div className="min-w-0 flex-1">
                  <select className={`${INPUT} cursor-pointer`} value={serviceId} onChange={(e) => setServiceId(e.target.value)} data-testid="new-appointment-service">
                    <option value="">{t(`${K}.pickService`)}</option>
                    {services.map((s) => (
                      <option key={s.offeringId} value={s.offeringId}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                  {service ? <div className="mt-[6px] text-admin-13 text-admin-ink-muted">{interpolate(t(`${K}.serviceLine`), { minutes: service.durationMinutes, name: service.personName })}</div> : null}
                </div>
                <span className="text-[15px] font-semibold tabular-nums text-admin-ink">{money}</span>
              </div>
              <div className="flex flex-wrap items-center gap-[6px]">
                <span className="cursor-not-allowed rounded-full bg-admin-surface-alt px-[10px] py-[3px] text-admin-11 font-semibold text-admin-ink-dim" title={t(`${K}.addOnOff`)} aria-disabled data-not-wired="true">
                  + {t(`${K}.addOn`)}
                </span>
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-[8px]">
            <ActionButton reason={t(`${K}.addServiceOff`)}>+ {t(`${K}.addService`)}</ActionButton>
            <a href={`${adminBasePath}/catalog`} className="inline-flex h-[34px] items-center gap-[6px] rounded-[9px] border border-admin-border bg-admin-card px-[14px] text-admin-13 font-semibold text-admin-ink hover:border-admin-border-strong">
              + {t(`${K}.createService`)}
            </a>
            <ActionButton reason={t(`${K}.usePackageOff`)}>{t(`${K}.usePackage`)}</ActionButton>
          </div>
        </div>

        {/* Professional · Location · Room */}
        <div className="grid grid-cols-3 gap-[10px]">
          <div className="flex min-w-0 flex-col gap-[6px]">
            <span className="text-admin-13 font-semibold text-admin-ink">{t(`${K}.professional`)}</span>
            <div className={SELECT_OFF} title={t(`${K}.professionalHint`)} aria-disabled data-not-wired="true">
              <span className="truncate leading-[34px]">{service ? interpolate(t(`${K}.professionalValue`), { name: service.personName }) : "—"}</span>
            </div>
            <span className="text-admin-11 text-admin-ink-dim">{t(`${K}.professionalHint`)}</span>
          </div>
          <div className="flex min-w-0 flex-col gap-[6px]">
            <span className="text-admin-13 font-semibold text-admin-ink">{t(`${K}.location`)}</span>
            <div className={SELECT_OFF} title={t(`${K}.locationHint`)} aria-disabled data-not-wired="true">
              <span className="truncate leading-[34px]">{venueName ?? "—"}</span>
            </div>
            <span className="text-admin-11 text-admin-ink-dim">{t(`${K}.locationHint`)}</span>
          </div>
          <div className="flex min-w-0 flex-col gap-[6px]">
            <span className="text-admin-13 font-semibold text-admin-ink">{t(`${K}.room`)}</span>
            <div className={SELECT_OFF} title={t(`${K}.roomOff`)} aria-disabled data-not-wired="true">
              <span className="truncate leading-[34px]">—</span>
            </div>
            <span className="text-admin-11 text-admin-ink-dim">{t(`${K}.roomOff`)}</span>
          </div>
        </div>

        {/* Compatible times */}
        <div className="flex flex-col gap-[8px]">
          <div className="text-admin-13 font-semibold text-admin-ink">{interpolate(t(`${K}.compatibleTimes`), { day: dayChip(addUtcDays(todayYmd, dayOffset) ?? todayYmd, locale) })}</div>
          <Segmented<string> label={t(`${K}.compatibleTimes`)} value={String(dayOffset)} onChange={(id) => setDayOffset(Number(id))} options={days} />
          {slots.status === "idle" ? <p className="m-0 text-admin-13 text-admin-ink-muted">{t(`${K}.needService`)}</p> : null}
          {slots.status === "loading" ? <p className="m-0 text-admin-13 text-admin-ink-muted">{t(`${K}.loadingTimes`)}</p> : null}
          {slots.status === "empty" ? <Outcome kind="note">{slots.text}</Outcome> : null}
          {slots.status === "ready" ? (
            <div className="flex flex-wrap items-center gap-[8px]" data-testid="new-appointment-slots">
              {slots.starts.map((iso) => {
                const on = iso === slotIso;
                return (
                  <button
                    key={iso}
                    type="button"
                    aria-pressed={on}
                    className={`h-[34px] cursor-pointer rounded-[9px] border px-[12px] font-mono text-admin-13 font-semibold ${on ? "border-admin-brand bg-admin-brand-soft text-admin-ink" : "border-admin-border bg-admin-card text-admin-ink hover:border-admin-border-strong"}`}
                    onClick={() => setSlotIso(iso)}
                  >
                    {clock(iso, timeZone, locale)}
                  </button>
                );
              })}
              <span className="text-admin-12h text-admin-ink-muted">{t(`${K}.whyOff`)}</span>
            </div>
          ) : null}
        </div>

        {/* Review */}
        <SectionLabel>{t(`${K}.review`)}</SectionLabel>
        <div className={`${CARD} px-[16px] py-[12px]`}>
          <div className="mb-[6px] text-admin-13 font-medium text-admin-ink">{slotIso && endIso ? interpolate(t(`${K}.itinerary`), { when: `${when(slotIso, timeZone, locale)}–${clock(endIso, timeZone, locale)}` }) : t(`${K}.itineraryPick`)}</div>
          <div className="flex items-start gap-[10px] border-t border-admin-border-soft py-[6px]">
            <span className="w-[44px] font-mono text-admin-12h text-admin-ink-muted">{slotIso ? clock(slotIso, timeZone, locale) : "—"}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-admin-13 font-semibold text-admin-ink">{service?.title ?? t(`${K}.pickService`)}</span>
              <span className="block text-admin-12h text-admin-ink-dim">{service ? interpolate(t(`${K}.itineraryStartLine`), { name: service.personName, venue: venueName ?? "" }) : ""}</span>
            </span>
          </div>
          <div className="flex items-start gap-[10px] border-t border-admin-border-soft py-[6px]">
            <span className="w-[44px] font-mono text-admin-12h text-admin-ink-muted">{endIso ? clock(endIso, timeZone, locale) : "—"}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-admin-13 font-semibold text-admin-ink">{t(`${K}.itineraryEnd`)}</span>
              <span className="block text-admin-12h text-admin-ink-dim">{service ? interpolate(t(`${K}.itineraryEndLine`), { name: service.personName }) : ""}</span>
            </span>
          </div>
          {slotIso && endIso ? <p className="m-0 mt-[6px] text-admin-12h text-admin-ink-dim">{interpolate(t(`${K}.customerSees`), { start: clock(slotIso, timeZone, locale), end: clock(endIso, timeZone, locale) })}</p> : null}
        </div>
        <div className={`${CARD} px-[16px] py-[12px]`}>
          {service ? <FactRow label={service.title}>{money}</FactRow> : null}
          <FactRow label={t(`${K}.total`)}>{money || "—"}</FactRow>
          <FactRow label={t(`${K}.depositPolicy`)} muted>
            {t(`${K}.depositNone`)}
          </FactRow>
          <FactRow label={t(`${K}.balance`)}>{money || "—"}</FactRow>
          <p className="m-0 mt-[8px] text-admin-12h text-admin-ink-dim">{t(`${K}.snapshotNote`)}</p>
        </div>
        <div className="rounded-[10px] bg-admin-surface-alt px-[12px] py-[10px] text-admin-12h leading-[1.45] text-admin-ink-muted">{t(`${K}.intakeWarn`)}</div>
      </div>
    </DrawerShell>
  );
}
