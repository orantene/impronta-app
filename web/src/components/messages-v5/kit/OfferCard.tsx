/**
 * OfferCard (board D01 `offerCard`, D06, M02 `mxOfferCard`): lines, total,
 * deposit line, version switcher, one action by state. No partial acceptance
 * (owner decision 2), so there is exactly one offer to accept per version.
 */

import { Card, CardLine, CardTotal } from "./Card";
import type { KitCopy } from "./copy";
import { fill } from "./copy";
import { Btn, Pill } from "./primitives";

export type OfferCardState = "draft" | "sent" | "viewed" | "accepted" | "declined" | "expired";
export type OfferCardAction = "revise" | "request_deposit" | "resend" | "send";

export type OfferLine = { readonly label: string; readonly amount: string; readonly muted?: boolean };

export type OfferCardProps = {
  readonly title: string;
  readonly state: OfferCardState;
  readonly version: number;
  readonly versions?: readonly number[];
  readonly forName: string;
  readonly affects?: string | null;
  readonly lines: readonly OfferLine[];
  readonly total: string;
  readonly depositLine?: { readonly pct: string; readonly amount: string } | null;
  readonly validUntil?: string | null;
  readonly viewedAt?: string | null;
  readonly copy: KitCopy;
  readonly busy?: boolean;
  readonly mine?: boolean;
  readonly variant?: "desktop" | "mobile";
  readonly onAction?: (action: OfferCardAction) => void;
  readonly onOpenVersion?: (version: number) => void;
};

export function OfferCard({ title, state, version, versions, forName, affects, lines, total, depositLine, validUntil, viewedAt, copy, busy, mine = true, variant = "desktop", onAction, onOpenVersion }: OfferCardProps) {
  const pill =
    state === "draft" ? (
      <Pill tone="ch">{copy.offer.draft}</Pill>
    ) : state === "sent" ? (
      <Pill tone="opp">{fill(copy.offer.sentV, { version })}</Pill>
    ) : state === "viewed" ? (
      <Pill tone="opp">{viewedAt ? fill(copy.offer.viewedAt, { time: viewedAt }) : copy.card.state.viewed}</Pill>
    ) : state === "accepted" ? (
      <Pill tone="won">{fill(copy.offer.acceptedV, { version })}</Pill>
    ) : state === "declined" ? (
      <Pill tone="lost">{copy.offer.declined}</Pill>
    ) : (
      <Pill tone="lost">{copy.offer.expired}</Pill>
    );

  const action: { key: OfferCardAction; label: string; primary: boolean } =
    state === "accepted"
      ? { key: "request_deposit", label: copy.offer.requestDeposit, primary: true }
      : state === "expired" || state === "declined"
        ? { key: "resend", label: copy.offer.resend, primary: false }
        : state === "draft"
          ? { key: "send", label: busy ? copy.offer.sending : copy.offer.send, primary: true }
          : { key: "revise", label: copy.offer.revise, primary: false };

  const vers = versions && versions.length > 1 ? (
    <span className="vers">
      {versions.map((v) => (
        <span key={v} className={v === version ? "on" : ""} onClick={onOpenVersion ? () => onOpenVersion(v) : undefined} role={onOpenVersion ? "button" : undefined}>
          v{v}
        </span>
      ))}
    </span>
  ) : null;

  const who = [fill(copy.offer.forClient, { name: forName }), affects ? fill(copy.offer.affects, { names: affects }) : null].filter(Boolean).join(" · ");

  return (
    <Card
      category="offer"
      label={copy.card.cat.offer}
      title={title}
      pills={pill}
      who={who}
      mine={mine}
      busy={busy}
      variant={variant}
      testId="offer"
      foot={
        <>
          {validUntil ? fill(copy.offer.validUntil, { date: validUntil }) : null}
          {validUntil && vers ? " · " : null}
          {vers}
        </>
      }
      actions={
        onAction ? (
          <Btn size="sm" variant={action.primary ? "primary" : "default"} busy={busy} onClick={() => onAction(action.key)} data-offer-action={action.key}>
            {action.label}
          </Btn>
        ) : null
      }
    >
      {lines.map((l, i) => (
        <CardLine key={i} label={l.label} amount={l.amount} muted={l.muted} />
      ))}
      <CardTotal label={copy.card.total} amount={total} />
      {depositLine ? <CardLine muted label={fill(copy.offer.depositLine, { pct: depositLine.pct })} amount={depositLine.amount} /> : null}
    </Card>
  );
}
