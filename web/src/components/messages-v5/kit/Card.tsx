/**
 * Card: the category grammar every thread card follows (board D01 notes,
 * D08, D09). Colour bar by category on the left (desktop) or a short bar in
 * the header (mobile), a small uppercase CATEGORY label, a title, state pills
 * on the right, an optional "who" line, body, and a footer with one sentence
 * and at most one primary action.
 */

import type { ReactNode } from "react";

import type { CardKind } from "@/lib/messaging/types";

import type { KitCopy } from "./copy";
import { Icon, type IconName } from "./primitives";

export type CardCategory = "offer" | "pay" | "order" | "appt" | "ticket" | "table" | "change" | "id";

/** Engine `CardKind` → kit category (colour bar + label family). */
export function cardCategoryForKind(kind: CardKind): CardCategory {
  switch (kind) {
    case "offer_review":
    case "offer_state":
      return "offer";
    case "payment_request":
      return "pay";
    case "menu_options":
    case "item_config":
    case "basket":
    case "order_confirmation":
      return "order";
    case "service_card":
    case "professional_times":
    case "appointment_confirmation":
    case "reminder":
      return "appt";
    case "class_card":
    case "tickets_card":
      return "ticket";
    case "change_request":
    case "change_result":
      return "change";
    case "text":
    case "internal_note":
    default:
      return "id";
  }
}

export function cardCategoryLabel(kind: CardKind, copy: KitCopy): string {
  const c = copy.card.cat;
  switch (kind) {
    case "offer_review":
    case "offer_state":
      return c.offer;
    case "payment_request":
      return c.payment;
    case "menu_options":
    case "item_config":
      return c.choices;
    case "basket":
      return c.sharedDraft;
    case "order_confirmation":
      return c.order;
    case "service_card":
      return c.choices;
    case "professional_times":
      return c.times;
    case "appointment_confirmation":
      return c.appointment;
    case "class_card":
    case "tickets_card":
      return c.tickets;
    case "change_request":
    case "change_result":
      return c.change;
    case "reminder":
      return c.reminder;
    case "internal_note":
      return c.note;
    case "text":
    default:
      return c.message;
  }
}

const CATEGORY_ICON: Record<CardCategory, IconName> = {
  offer: "tag",
  pay: "card",
  order: "bag",
  appt: "cal",
  ticket: "ticket",
  table: "table",
  change: "refresh",
  id: "id",
};

export type CardProps = {
  readonly category: CardCategory;
  /** The uppercase category word (Offer, Payment, Shared draft, Times...). */
  readonly label: string;
  readonly title: ReactNode;
  readonly icon?: IconName;
  readonly pills?: ReactNode;
  readonly who?: ReactNode;
  readonly mine?: boolean;
  readonly busy?: boolean;
  readonly wide?: boolean;
  readonly variant?: "desktop" | "mobile";
  /** Footer sentence. */
  readonly foot?: ReactNode;
  /** Footer actions (at most one primary). */
  readonly actions?: ReactNode;
  readonly children?: ReactNode;
  readonly testId?: string;
};

export function Card({ category, label, title, icon, pills, who, mine, busy, wide, variant = "desktop", foot, actions, children, testId }: CardProps) {
  if (variant === "mobile") {
    return (
      <div className={`mx-card k-${category}${busy ? " busy" : ""}`} data-card={testId ?? category} aria-busy={busy || undefined}>
        <div className="ch">
          <span className="dot-k" aria-hidden="true" />
          <span className="cat">{label}</span>
          <b className="ttl">{title}</b>
          {pills}
        </div>
        <div className="cb">
          {who ? <div className="who">{who}</div> : null}
          {children}
        </div>
        {foot || actions ? (
          <div className="cf">
            {foot ? <span className="cf-t">{foot}</span> : null}
            {actions}
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div className={`card k-${category}${mine ? " me" : ""}${busy ? " busy" : ""}${wide ? " wide" : ""}`} data-card={testId ?? category} aria-busy={busy || undefined}>
      <div className="ch">
        <Icon name={icon ?? CATEGORY_ICON[category]} size={14} />
        <span className="cat">{label}</span>
        <span className="ttl">{title}</span>
        {pills}
      </div>
      <div className="cb">
        {who ? <div className="who">{who}</div> : null}
        {children}
      </div>
      {foot || actions ? (
        <div className="cf">
          {foot ? <span className="cf-t">{foot}</span> : null}
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export function CardLine({ label, amount, muted, flag }: { label: ReactNode; amount?: ReactNode; muted?: boolean; flag?: ReactNode }) {
  return (
    <div className={`li${muted ? " muted" : ""}`}>
      <span>
        {label}
        {flag}
      </span>
      <span>{amount ?? ""}</span>
    </div>
  );
}

export function CardTotal({ label, amount }: { label: ReactNode; amount: ReactNode }) {
  return (
    <div className="tot">
      <span>{label}</span>
      <span>{amount}</span>
    </div>
  );
}
