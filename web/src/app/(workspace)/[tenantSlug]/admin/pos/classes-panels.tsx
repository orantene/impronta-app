"use client";

/**
 * classes-panels.tsx — the Front desk's notice, its Waitlist screen, and the
 * Walk-in sheet (board B04: service, customer, NEXT FREE, pay, "Book · now"),
 * as presentational pieces: props in, callbacks out, no fetching. The wiring
 * (which command a tap runs, which sentence a refusal becomes) is in
 * `classes-client.tsx`; the Today screen is `classes-today.tsx` and one
 * session's check-in is `classes-checkin.tsx`.
 *
 * The sheet keeps the journey's hooks: `[data-pos-classes-service]` (the
 * service select), `[data-pos-classes-slots] button` with
 * `data-pos-classes-slot={iso}`, `[data-pos-classes-session-pick]`,
 * `[data-pos-classes-tier]`, `[data-pos-classes-name]`, `-email`, `-book`
 * and `-collect`, and the kind buttons "An appointment" / "A seat in a
 * session".
 *
 * PAY IS CASH AT THE END, OR NOW. The engine books the time first and takes
 * the money through the Counter's cash charge afterwards; a deposit at
 * booking is the website's path (Stripe), not the till's. The Pay control
 * says exactly that, in one select whose only option is the truth.
 */

import { useState } from "react";

import type { ClassesCopy } from "@/components/admin/pos/classes-copy";
import { formatOrderMoney } from "@/lib/orders/money-format";
import type { ClassesAppointment, ClassesSession, ClassesWaitlistEntry } from "@/lib/pos/classes/day";
import { PaymentLinkPanel, type PaymentLinkCopy, type PaymentLinkRow } from "@/components/admin/pos/PaymentLinkPanel";
import { createPaymentLink } from "@/lib/server-actions/pos-engine";

import { cn } from "@/lib/utils";

import { fill, formatClock, formatWhen } from "./classes-format";
import { seatsSentence } from "./classes-today";
import { POS_BTN_PRIMARY, POS_CARD, POS_FIELD, PosAction, PosPill, PosSegmented, PosSheet } from "./classes-ui";

/**
 * One sentence, one outcome. `data-pos-classes-notice` names the kind so a
 * browser journey can find THIS notice rather than the first live region on
 * the page (the same lesson `PosRefusalBanner` records).
 */
export function ClassesNotice({ kind, children }: { kind: "refused" | "done"; children: string }) {
  return (
    <div
      role={kind === "refused" ? "alert" : "status"}
      data-pos-classes-notice={kind}
      className={cn(
        "rounded-[12px] px-[16px] py-[12px] font-admin-body text-[14px] leading-[1.45]",
        kind === "refused" ? "bg-admin-critical-soft text-admin-red" : "bg-admin-success-soft text-admin-green",
      )}
    >
      <p className="m-0 flex-1">{children}</p>
    </div>
  );
}

/* ── Waitlist ──────────────────────────────────────────────────────────── */

export function WaitlistPanel({
  sessions,
  timeZone,
  locale,
  copy,
  busy,
  joinFor,
  joinName,
  joinEmail,
  onJoinNameChange,
  onJoinEmailChange,
  onOpenJoin,
  onSubmitJoin,
  onPromote,
  onAccept,
  onDecline,
}: {
  sessions: readonly ClassesSession[];
  timeZone: string;
  locale: string;
  copy: ClassesCopy;
  busy: boolean;
  joinFor: string | null;
  joinName: string;
  joinEmail: string;
  onJoinNameChange: (v: string) => void;
  onJoinEmailChange: (v: string) => void;
  onOpenJoin: (session: ClassesSession) => void;
  onSubmitJoin: (session: ClassesSession) => void;
  onPromote: (session: ClassesSession, entry: ClassesWaitlistEntry) => void;
  onAccept: (session: ClassesSession, entry: ClassesWaitlistEntry) => void;
  onDecline: (session: ClassesSession, entry: ClassesWaitlistEntry) => void;
}) {
  const listed = sessions.filter((s) => s.waitlist.length > 0 || (s.seats.kind === "counted" && s.seats.remaining <= 0));
  if (listed.length === 0) {
    return <p className="m-0 p-[20px] font-admin-body text-[15px] text-admin-ink-muted">{copy.waitlist.empty}</p>;
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-[12px] overflow-y-auto p-[20px]">
      {listed.map((session) => (
        <li key={session.id} data-pos-classes-queue={session.id} className={cn(POS_CARD, "flex flex-col gap-[12px] p-[16px]")}>
          <div className="flex flex-wrap items-start justify-between gap-[10px]">
            <div>
              <p className="m-0 font-admin-body text-[20px] font-semibold text-admin-ink">
                {session.title} · {formatClock(session.startsAt, timeZone, locale)}
              </p>
              <p className="m-0 font-admin-body text-[14px] text-admin-ink-muted">{seatsSentence(session, copy)}</p>
            </div>
          </div>
          {session.waitlist.length === 0 ? (
            <p className="m-0 font-admin-body text-[14px] text-admin-ink-muted">{copy.waitlist.empty}</p>
          ) : (
            <ul className="m-0 list-none divide-y divide-admin-border-soft p-0">
              {session.waitlist.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-[10px] py-[10px]" data-pos-classes-entry={entry.id} data-pos-classes-entry-state={entry.state}>
                  <div className="min-w-0 font-admin-body">
                    <p className="m-0 text-[16px] font-semibold text-admin-ink">
                      <span className="text-admin-ink-muted">{fill(copy.waitlist.position, { n: entry.position })} </span>
                      {entry.customerName}
                      {session.nextInLineId === entry.id ? (
                        <PosPill tone="green" className="ml-[8px]">
                          {copy.waitlist.nextInLine}
                        </PosPill>
                      ) : null}
                    </p>
                    <p className="m-0 text-[13px] text-admin-ink-muted">
                      {copy.waitlist.state[entry.state]}
                      {entry.state === "offered" && entry.offerExpiresAt ? ` · ${fill(copy.waitlist.offerUntil, { when: formatWhen(entry.offerExpiresAt, timeZone, locale) })}` : ""}
                    </p>
                  </div>
                  {entry.state === "waiting" || entry.state === "expired" ? (
                    <PosAction tone="primary" disabled={busy} className="min-w-[10rem]" onClick={() => onPromote(session, entry)}>
                      {busy ? copy.waitlist.promoting : copy.waitlist.promote}
                    </PosAction>
                  ) : null}
                  {entry.state === "offered" ? (
                    <span className="flex flex-wrap gap-[8px]">
                      <PosAction tone="primary" disabled={busy} className="min-w-[10rem]" onClick={() => onAccept(session, entry)}>
                        {busy ? copy.waitlist.accepting : copy.waitlist.accept}
                      </PosAction>
                      <PosAction disabled={busy} onClick={() => onDecline(session, entry)} testAttr={{ "data-pos-classes-decline": entry.id }}>
                        {copy.waitlist.decline}
                      </PosAction>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {joinFor === session.id ? (
            <form
              className="flex flex-col gap-[10px] border-t border-admin-border-soft pt-[12px]"
              onSubmit={(event) => {
                event.preventDefault();
                onSubmitJoin(session);
              }}
            >
              <p className="m-0 font-admin-body text-[15px] font-semibold text-admin-ink">{copy.waitlist.join.heading}</p>
              <label className="flex flex-col gap-[4px] font-admin-body text-[13px] text-admin-ink-muted">
                <span>{copy.waitlist.join.name}</span>
                <input className={POS_FIELD} value={joinName} onChange={(e) => onJoinNameChange(e.target.value)} data-pos-classes-join-name />
              </label>
              <label className="flex flex-col gap-[4px] font-admin-body text-[13px] text-admin-ink-muted">
                <span>{copy.waitlist.join.email}</span>
                <input className={POS_FIELD} type="email" value={joinEmail} onChange={(e) => onJoinEmailChange(e.target.value)} />
              </label>
              <button type="submit" disabled={busy} className={cn(POS_BTN_PRIMARY, "h-[52px] disabled:opacity-60")}>
                {busy ? copy.waitlist.join.submitting : copy.waitlist.join.submit}
              </button>
            </form>
          ) : (
            <PosAction disabled={busy} onClick={() => onOpenJoin(session)}>
              + {copy.board.checkin.addToWaitlist}
            </PosAction>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ── Walk-in (B04) ─────────────────────────────────────────────────────── */

export type WalkInKind = "appointment" | "seat";

export type WalkInService = {
  readonly offeringId: string;
  readonly title: string;
  readonly amountCents: number;
  readonly durationMinutes: number;
  readonly personName: string;
  readonly allowPayInPerson: boolean;
};

export type WalkInSlots = { status: "idle" } | { status: "loading" } | { status: "ready"; starts: string[] } | { status: "empty"; sentence: string };

/** What the walk-in has become so far, after "Book it". */
export type WalkInOutcome = { stage: "booked"; sentence: string; outstandingCents: number; currency: string } | { stage: "collected"; sentence: string };

export function WalkInSheet({
  intent,
  kind,
  onKindChange,
  services,
  sessions,
  serviceId,
  onServiceChange,
  slots,
  slotIso,
  onSlotChange,
  sessionId,
  onSessionChange,
  tierId,
  onTierChange,
  name,
  email,
  phone,
  onNameChange,
  onEmailChange,
  onPhoneChange,
  timeZone,
  locale,
  currency,
  copy,
  busy,
  outcome,
  onBook,
  onCollect,
  onStartAgain,
  onClose,
}: {
  /** "walkin" (B04, the next free times) or "book" (a new booking, same form). */
  intent: "walkin" | "book";
  kind: WalkInKind;
  onKindChange: (kind: WalkInKind) => void;
  services: readonly WalkInService[];
  sessions: readonly ClassesSession[];
  serviceId: string;
  onServiceChange: (id: string) => void;
  slots: WalkInSlots;
  slotIso: string;
  onSlotChange: (iso: string) => void;
  sessionId: string;
  onSessionChange: (id: string) => void;
  tierId: string;
  onTierChange: (id: string) => void;
  name: string;
  email: string;
  phone: string;
  onNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  timeZone: string;
  locale: string;
  currency: string;
  copy: ClassesCopy;
  busy: boolean;
  outcome: WalkInOutcome | null;
  onBook: () => void;
  onCollect: () => void;
  onStartAgain: () => void;
  onClose: () => void;
}) {
  const b = copy.board.sheet;
  const sellable = sessions.filter((s) => s.offeringId && !(s.seats.kind === "counted" && s.seats.remaining <= 0));
  const session = sellable.find((s) => s.id === sessionId) ?? null;
  const service = services.find((s) => s.offeringId === serviceId) ?? null;
  const tier = session && session.tiers.length > 1 ? session.tiers.find((t) => t.variantId === tierId) ?? null : (session?.tiers[0] ?? null);
  const price = kind === "appointment" ? service?.amountCents ?? null : tier?.amountCents ?? null;
  const detailsReady = name.trim().length > 0;
  const targetReady = kind === "appointment" ? Boolean(service && slotIso) : Boolean(session && (session.tiers.length <= 1 || tierId));

  const bookLabel =
    kind === "appointment" && service && slotIso
      ? fill(b.bookNow, { name: service.personName, time: formatClock(slotIso, timeZone, locale) })
      : copy.walkin.book;

  const footer = outcome ? (
    <>
      <PosAction onClick={onStartAgain} disabled={busy}>
        {copy.walkin.startAgain}
      </PosAction>
      {outcome.stage === "booked" && outcome.outstandingCents > 0 ? (
        <PosAction tone="primary" disabled={busy} className="h-[56px] text-[17px]" onClick={onCollect} testAttr={{ "data-pos-classes-collect": "collect" }}>
          {busy ? copy.walkin.collecting : fill(copy.walkin.collect, { amount: formatOrderMoney(outcome.outstandingCents, outcome.currency) })}
        </PosAction>
      ) : (
        <PosAction tone="primary" className="h-[56px] text-[17px]" onClick={onClose}>
          {b.close}
        </PosAction>
      )}
    </>
  ) : (
    <>
      <PosAction onClick={onClose} disabled={busy}>
        {copy.board.extra.cancel}
      </PosAction>
      <button type="submit" form="pos-classes-walkin" disabled={busy || !detailsReady || !targetReady} className={cn(POS_BTN_PRIMARY, "h-[56px] px-[22px] text-[17px] disabled:opacity-60")} data-pos-classes-book>
        {busy ? copy.walkin.booking : bookLabel}
      </button>
    </>
  );

  return (
    <PosSheet
      title={intent === "walkin" ? b.title : b.bookTitle}
      subtitle={intent === "walkin" ? b.subtitle : b.bookSubtitle}
      onClose={onClose}
      closeLabel={b.close}
      footer={footer}
      attrs={{ "data-pos-classes-walkin-sheet": intent }}
    >
      {outcome ? (
        <div className="flex flex-col gap-[12px]">
          <ClassesNotice kind="done">{outcome.sentence}</ClassesNotice>
          {outcome.stage === "booked" && outcome.outstandingCents <= 0 ? (
            <p className="m-0 font-admin-body text-[14px] text-admin-ink-muted">{copy.walkin.nothingToCollect}</p>
          ) : null}
        </div>
      ) : (
        <form
          id="pos-classes-walkin"
          className="flex flex-col gap-[16px]"
          onSubmit={(event) => {
            event.preventDefault();
            onBook();
          }}
        >
          <PosSegmented<WalkInKind>
            label={copy.walkin.heading}
            value={kind}
            onChange={onKindChange}
            size="lg"
            options={[
              { id: "appointment", label: copy.walkin.kindAppointment },
              { id: "seat", label: copy.walkin.kindSeat },
            ]}
          />

          {kind === "appointment" ? (
            <label className="flex flex-col gap-[6px] font-admin-body text-[14px] font-semibold text-admin-ink">
              <span>{copy.walkin.service}</span>
              {services.length === 0 ? (
                <span className="font-normal text-admin-ink-muted">{copy.walkin.noServices}</span>
              ) : (
                <select className={POS_FIELD} value={serviceId} onChange={(e) => onServiceChange(e.target.value)} data-pos-classes-service>
                  <option value="">{copy.walkin.service}</option>
                  {services.map((s) => (
                    <option key={s.offeringId} value={s.offeringId}>
                      {s.title} · {fill(b.withPerson, { name: s.personName, minutes: s.durationMinutes, amount: formatOrderMoney(s.amountCents, currency) })}
                    </option>
                  ))}
                </select>
              )}
            </label>
          ) : (
            <>
              <label className="flex flex-col gap-[6px] font-admin-body text-[14px] font-semibold text-admin-ink">
                <span>{copy.walkin.session}</span>
                {sellable.length === 0 ? (
                  <span className="font-normal text-admin-ink-muted">{copy.walkin.noSessions}</span>
                ) : (
                  <select className={POS_FIELD} value={sessionId} onChange={(e) => onSessionChange(e.target.value)} data-pos-classes-session-pick>
                    <option value="">{copy.walkin.session}</option>
                    {sellable.map((s) => (
                      <option key={s.id} value={s.id}>
                        {formatClock(s.startsAt, timeZone, locale)} · {s.title} · {seatsSentence(s, copy)}
                      </option>
                    ))}
                  </select>
                )}
              </label>
              {session && session.tiers.length > 1 ? (
                <label className="flex flex-col gap-[6px] font-admin-body text-[14px] font-semibold text-admin-ink">
                  <span>{copy.walkin.tier}</span>
                  <select className={POS_FIELD} value={tierId} onChange={(e) => onTierChange(e.target.value)} data-pos-classes-tier>
                    <option value="">{copy.walkin.tier}</option>
                    {session.tiers.map((t) => (
                      <option key={t.variantId} value={t.variantId}>
                        {t.label} · {formatOrderMoney(t.amountCents, currency)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </>
          )}

          <div className="flex flex-col gap-[6px] font-admin-body">
            <span className="text-[14px] font-semibold text-admin-ink">{b.customer}</span>
            <input className={POS_FIELD} placeholder={copy.walkin.name} aria-label={copy.walkin.name} value={name} onChange={(e) => onNameChange(e.target.value)} autoComplete="off" data-pos-classes-name />
            <div className="grid grid-cols-2 gap-[10px]">
              <input className={POS_FIELD} type="email" placeholder={copy.walkin.email} aria-label={copy.walkin.email} value={email} onChange={(e) => onEmailChange(e.target.value)} autoComplete="off" data-pos-classes-email />
              <input className={POS_FIELD} type="tel" placeholder={copy.walkin.phone} aria-label={copy.walkin.phone} value={phone} onChange={(e) => onPhoneChange(e.target.value)} autoComplete="off" />
            </div>
            <span className="text-[13px] text-admin-ink-muted">{b.customerHint}</span>
          </div>

          {kind === "appointment" && service ? (
            <div className="flex flex-col gap-[8px]">
              <span className="font-admin-body text-[12px] font-bold uppercase tracking-[0.08em] text-admin-ink-muted">{b.nextFree}</span>
              {service.amountCents > 0 && !service.allowPayInPerson ? <p className="m-0 font-admin-body text-[13px] text-admin-ink-muted">{copy.walkin.mustPayOnlineHint}</p> : null}
              {slots.status === "loading" ? <p className="m-0 font-admin-body text-[14px] text-admin-ink-muted">{copy.walkin.loadingTimes}</p> : null}
              {slots.status === "empty" ? <ClassesNotice kind="refused">{slots.sentence}</ClassesNotice> : null}
              {slots.status === "ready" ? (
                <div className="flex flex-col gap-[8px]" data-pos-classes-slots>
                  {slots.starts.map((iso, index) => {
                    const on = slotIso === iso;
                    const ends = new Date(Date.parse(iso) + service.durationMinutes * 60_000).toISOString();
                    return (
                      <button
                        key={iso}
                        type="button"
                        aria-pressed={on}
                        data-pos-classes-slot={iso}
                        className={cn(
                          "grid cursor-pointer grid-cols-[110px_1fr] items-center gap-[12px] rounded-[12px] border px-[14px] py-[12px] text-left font-admin-body",
                          on ? "border-admin-brand bg-admin-brand-soft" : "border-admin-border bg-admin-card hover:border-admin-border-strong",
                        )}
                        onClick={() => onSlotChange(iso)}
                      >
                        <span className="font-mono text-[18px] font-semibold text-admin-ink">
                          {index === 0 && intent === "walkin" ? `${formatClock(iso, timeZone, locale)}` : formatClock(iso, timeZone, locale)}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[15px] font-semibold text-admin-ink">{service.personName}</span>
                          <span className="block text-[13px] text-admin-ink-muted">
                            {formatClock(iso, timeZone, locale)}–{formatClock(ends, timeZone, locale)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          <label className="flex flex-col gap-[6px] font-admin-body text-[14px] font-semibold text-admin-ink">
            <span>{b.pay}</span>
            <select className={POS_FIELD} value="cash" onChange={() => undefined} aria-label={b.pay}>
              <option value="cash">{price === null || price <= 0 ? b.payNothing : fill(b.payAtEnd, { amount: formatOrderMoney(price, currency) })}</option>
            </select>
            <span className="font-normal text-[13px] text-admin-ink-muted">{b.payHint}</span>
          </label>
        </form>
      )}
    </PosSheet>
  );
}

/* ── Payment link (B01's `Send payment link`) ─────────────────────────── */

/**
 * The appointment's own sale, as a link the customer pays from their phone:
 * `createPaymentLink` reserves what is owed and mints `/pay/<code>`; the
 * panel shows, copies and sends it. Same panel as the counter's collect tab.
 */
export function AppointmentLinkSheet({
  row,
  workspaceName,
  provider,
  timeZone,
  locale,
  engineRefusal,
  copy,
  closeLabel,
  onClose,
}: {
  row: ClassesAppointment;
  workspaceName: string;
  provider: "stripe" | "mock";
  timeZone: string;
  locale: string;
  engineRefusal: Readonly<Record<string, string>>;
  copy: PaymentLinkCopy;
  closeLabel: string;
  onClose: () => void;
}) {
  const [created, setCreated] = useState<PaymentLinkRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const mint = () => {
    if (!row.orderId || busy) return;
    const orderId = row.orderId;
    const amountCents = row.outstandingCents;
    setBusy(true);
    setRefusal(null);
    void createPaymentLink({ orderId, amountCents, idempotencyKey: `paylink:${orderId}:${row.orderVersion ?? 0}:${amountCents}` })
      .then((r) => {
        if (r.ok) setCreated({ code: r.code, url: r.url, amountCents: r.amountCents, status: "open", expiresAt: formatWhen(r.expiresAt, timeZone, locale) });
        else setRefusal(engineRefusal[r.reason] ?? engineRefusal.unavailable ?? "");
      })
      .finally(() => setBusy(false));
  };
  return (
    <PosSheet title={copy.linkTitle} subtitle={`${row.customerName ?? ""} · ${row.title}`} onClose={onClose} closeLabel={closeLabel} footer={<PosAction onClick={onClose}>{closeLabel}</PosAction>} attrs={{ "data-pos-classes-link-sheet": row.id }}>
      <div className="flex flex-col gap-[12px] p-[16px]">
        <PaymentLinkPanel amountCents={row.outstandingCents} currency={row.currency} workspaceName={workspaceName} provider={provider} links={[]} created={created} busy={busy} onCreate={mint} copy={copy} />
        {refusal ? (
          <p role="alert" className="m-0 font-admin-body text-[14px] text-admin-red" data-pos-classes-link-refusal>
            {refusal}
          </p>
        ) : null}
      </div>
    </PosSheet>
  );
}
