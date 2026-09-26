/**
 * L9: the client link thread, pure view (boards C01/C02). Business header,
 * the stream from the client's side, the cards with their actions, the
 * composer and the footer line. Everything that writes is a prop; the
 * stateful wrapper in `ClientThread.tsx` wires the server actions. Split
 * across two files (L7's pattern, D-MSG-146) so `tsx --test` can render this
 * one without `server-only` in scope.
 *
 * Mobile-first: the kit's `mobile` variant at 390; wider screens see the same
 * column centred at 560 (`.cx-col`).
 */

import type { MessagingRefusal, ThreadMessage } from "@/lib/messaging/types";
import {
  buildClientStream,
  clientOfferForMessage,
  dayLabelFor,
  formatClientDate,
  formatClientTime,
  offerCardMessageIds,
  readChange,
  readChoices,
  readConfirmation,
  readPaidPayment,
  readPayment,
  readTimes,
  type ClientCardKind,
  type ClientOfferSummary,
} from "@/lib/messages-v5/client-thread-view";

import { Card, CardLine } from "../kit/Card";
import { fill, type KitCopy } from "../kit/copy";
import { DaySeparator, MessageBubble, SystemLine } from "../kit/MessageBubble";
import { Avatar, Btn, Icon } from "../kit/primitives";
import { OkLine, RefusalLine } from "../kit/RefusalLine";
import { ChoicesCard, ClientChangeCard, ClientConfirmedCard, ClientDraftCard, ClientOfferCard, ClientPaymentCard, ClientTimesCard, type CardPhase } from "./ClientCards";
import type { ClientCopy } from "./copy";

export type ComposerPhase = "idle" | "sending" | "failed" | "sent";

/** `epoch` changes when a card's local form should reset (a change request was sent); the view keys the card on it. */
/** `nextFreeTimes` is only set when a time pick is refused as taken — engine times only, never invented. */
export type CardActivity = {
  readonly phase: CardPhase;
  readonly refusal?: MessagingRefusal | null;
  readonly epoch?: number;
  readonly nextFreeTimes?: readonly string[];
};

export type ClientThreadViewProps = {
  readonly copy: ClientCopy;
  readonly kit: KitCopy;
  readonly locale: string;
  readonly business: { readonly name: string; readonly handlerFirstName: string | null };
  readonly messages: readonly ThreadMessage[];
  readonly offers: readonly ClientOfferSummary[];
  readonly payCode: string | null;
  readonly now: Date;
  readonly loading?: boolean;
  /** Per-message activity (busy / refused / done) keyed by message id, or by offer id for offer cards. */
  readonly activity?: Readonly<Record<string, CardActivity>>;
  readonly composer: { readonly value: string; readonly phase: ComposerPhase };
  readonly onComposerChange?: (value: string) => void;
  readonly onSend?: () => void;
  readonly onRetry?: () => void;
  readonly onChoose?: (messageId: string, ids: readonly string[]) => void;
  readonly onPickTime?: (messageId: string, startsAt: string) => void;
  readonly onAcceptOffer?: (offer: ClientOfferSummary) => void;
  readonly onDeclineOffer?: (offer: ClientOfferSummary, reason: string) => void;
  readonly onChangeOffer?: (offer: ClientOfferSummary, text: string) => void;
  readonly onChangeRecord?: (recordKind: string, recordId: string, text: string) => void;
  readonly onPay?: (code: string) => void;
  /** Null hides the link; the current token thread has no reachable "save to email" writer (D-MSG-166), so the wrapper passes null and the line renders greyed. */
  readonly onSaveToEmail?: (() => void) | null;
  /** ISO expiry of THIS `/c/t/[token]` link (D-MSG-208c). */
  readonly threadTokenExpiresAt?: string | null;
};

export function ClientThreadView(p: ClientThreadViewProps) {
  const { copy, kit, locale, business, now } = p;
  const name = business.name;
  const items = buildClientStream(p.messages);
  const offerCards = offerCardMessageIds(p.messages);
  const act = (key: string): CardActivity => p.activity?.[key] ?? { phase: "idle" };

  return (
    <div className="msgv5 cx-page" data-client-thread>
      <div className="cx-col">
        <header className="cx-top" data-client-header>
          <Avatar name={name || "?"} size="lg" />
          <div className="tx">
            <b>{name}</b>
            <span>{business.handlerFirstName ? fill(copy.header.handling, { name: business.handlerFirstName }) : copy.header.handlingTeam}</span>
          </div>
        </header>

        <main className="cx-st" data-client-stream>
          {p.loading ? (
            <div className="cx-empty" data-client-loading>
              <b>{copy.stream.loading}</b>
            </div>
          ) : items.length === 0 ? (
            <div className="cx-empty" data-client-empty>
              <b>{copy.stream.emptyTitle}</b>
              {fill(copy.stream.emptyBody, { business: name })}
            </div>
          ) : (
            items.map((it) => {
              if (it.kind === "day") return <DaySeparator key={it.key} label={dayLabelFor(it.date, copy.stream, now, locale)} variant="mobile" />;
              if (it.kind === "message") {
                const meta = `${it.mine ? copy.stream.you : name} · ${formatClientTime(it.message.createdAt, locale)}`;
                return <MessageBubble key={it.key} message={it.message} mine={it.mine} copy={kit} meta={meta} position={it.position} variant="mobile" />;
              }
              if (it.kind === "system") return <SystemLine key={it.key} text={it.message.body || copy.generic.message} variant="mobile" />;
              const offerId = typeof it.message.payload?.offer_id === "string" ? it.message.payload.offer_id : typeof it.message.payload?.offerId === "string" ? it.message.payload.offerId : null;
              const recordId = typeof it.message.payload?.recordId === "string" ? it.message.payload.recordId : null;
              const epoch = act(it.message.id).epoch ?? (offerId ? act(offerId).epoch : null) ?? (recordId ? act(recordId).epoch : null) ?? 0;
              return <div key={`${it.key}:${epoch}`}>{renderCard(p, it.message, it.cardKind, act, offerCards)}</div>;
            })
          )}
        </main>

        <ClientComposer copy={copy} business={name} value={p.composer.value} phase={p.composer.phase} onChange={p.onComposerChange} onSend={p.onSend} onRetry={p.onRetry} />
        <div className="mx-cmp" data-client-footer>
          <div className="cx-foot">
            {copy.footer.secure} ·{" "}
            <button type="button" onClick={p.onSaveToEmail ?? undefined} disabled={!p.onSaveToEmail} title={p.onSaveToEmail ? undefined : copy.footer.saveToEmailSoon} data-client-action="save_to_email">
              {copy.footer.saveToEmail}
            </button>
            {p.threadTokenExpiresAt ? (
              <div data-client-link-expiry>
                {fill(copy.footer.expires, { date: formatClientDate(p.threadTokenExpiresAt, locale) })}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function renderCard(p: ClientThreadViewProps, message: ThreadMessage, kind: ClientCardKind, act: (key: string) => CardActivity, offerCards: ReadonlySet<string>) {
  const { copy, kit, locale, business, now } = p;
  const name = business.name;
  const payload = message.payload;
  switch (kind) {
    case "menu_options":
    case "service_card":
    case "class_card":
    case "tickets_card": {
      const a = act(message.id);
      return <ChoicesCard view={readChoices(kind, payload)} copy={copy} kit={kit} business={name} locale={locale} phase={a.phase} refusal={a.refusal} onSend={p.onChoose ? (ids) => p.onChoose?.(message.id, ids) : undefined} />;
    }
    case "professional_times": {
      const a = act(message.id);
      return <ClientTimesCard view={readTimes(payload)} copy={copy} kit={kit} business={name} locale={locale} now={now} phase={a.phase} refusal={a.refusal} nextFreeTimes={a.nextFreeTimes} onPick={p.onPickTime ? (startsAt) => p.onPickTime?.(message.id, startsAt) : undefined} onAsk={p.onComposerChange} />;
    }
    case "offer_event":
    case "offer_review":
    case "offer_state": {
      const offer = clientOfferForMessage(payload, p.offers);
      // Only the last "sent" event per offer draws the live offer; every other offer row reads as one line.
      if (!offer || !offerCards.has(message.id)) {
        return <SystemLine key={message.id} text={message.body || copy.generic.message} variant="mobile" />;
      }
      const a = act(offer.id);
      return <ClientOfferCard offer={offer} copy={copy} kit={kit} business={name} locale={locale} now={now} phase={a.phase} refusal={a.refusal} payCode={p.payCode} onAccept={p.onAcceptOffer} onDecline={p.onDeclineOffer} onChange={p.onChangeOffer} onPay={p.onPay} />;
    }
    case "payment_request":
      return <ClientPaymentCard view={readPayment(payload)} copy={copy} business={name} locale={locale} now={now} onPay={p.onPay} />;
    case "payment_paid":
      return <ClientPaymentCard view={readPaidPayment(payload)} copy={copy} business={name} locale={locale} now={now} />;
    case "order_confirmation":
    case "appointment_confirmation": {
      const view = readConfirmation(payload);
      const a = act(view.recordId ?? message.id);
      return <ClientConfirmedCard view={view} kind={kind} copy={copy} business={name} locale={locale} phase={a.phase} onChange={p.onChangeRecord && view.recordId ? (text) => p.onChangeRecord?.(view.recordKind ?? kind, view.recordId as string, text) : undefined} />;
    }
    case "change_request":
    case "change_result":
      return <ClientChangeCard view={readChange(kind, payload, message.body)} copy={copy} business={name} />;
    case "basket": {
      const lines = Array.isArray(payload?.lines) ? (payload?.lines as Array<Record<string, unknown>>) : [];
      return <ClientDraftCard lines={lines.map((l) => ({ label: String(l.label ?? ""), units: typeof l.units === "number" ? l.units : 1, unitCents: typeof l.unitCents === "number" ? l.unitCents : 0 }))} currency={typeof payload?.currency === "string" ? payload.currency : "USD"} copy={copy} business={name} />;
    }
    default:
      return (
        <Card category="id" label={copy.generic.message} title={message.body || copy.generic.message} variant="mobile" testId="client-generic">
          <CardLine muted label={message.body} />
        </Card>
      );
  }
}

export function ClientComposer({ copy, business, value, phase, onChange, onSend, onRetry }: { readonly copy: ClientCopy; readonly business: string; readonly value: string; readonly phase: ComposerPhase; readonly onChange?: (v: string) => void; readonly onSend?: () => void; readonly onRetry?: () => void }) {
  const sending = phase === "sending";
  const canSend = value.trim().length > 0 && !sending;
  return (
    <div className="mx-cmp" data-client-composer data-phase={phase}>
      {phase === "failed" ? (
        <div className="mx-line err" role="alert" data-composer-failed>
          <Icon name="alert" size={14} />
          <span>{copy.composer.failed}</span>
          <Btn size="sm" onClick={onRetry}>{copy.composer.retry}</Btn>
        </div>
      ) : null}
      {phase === "sent" ? <OkLine text={copy.composer.sent} variant="mobile" /> : null}
      <div className="box">
        <textarea
          className="in"
          rows={1}
          value={value}
          placeholder={fill(copy.composer.placeholder, { business })}
          aria-label={fill(copy.composer.placeholder, { business })}
          disabled={sending}
          onChange={(e) => onChange?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && canSend) {
              e.preventDefault();
              onSend?.();
            }
          }}
        />
        <button type="button" className={`send${canSend ? "" : " off"}`} disabled={!canSend} aria-label={sending ? copy.composer.sending : copy.composer.send} aria-busy={sending || undefined} onClick={onSend} data-client-action="send_message">
          <Icon name="send" size={16} />
        </button>
      </div>
    </div>
  );
}

/** Exported for the wrapper: a refusal the whole thread shows (expired link). */
export function ClientRefusal({ code, kit }: { readonly code: MessagingRefusal; readonly kit: KitCopy }) {
  return (
    <div className="msgv5 cx-page">
      <div className="cx-col">
        <div className="cx-st">
          <RefusalLine code={code} copy={kit} variant="mobile" />
        </div>
      </div>
    </div>
  );
}
