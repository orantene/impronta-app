"use client";

/**
 * SummaryBlock (who, next, main, amount: the persistent top of the context
 * card, board D01) and PanelSection (open / closed with a count, board D01,
 * M04). Mobile PanelSection is the `mx-sec` accordion.
 */

import type { ReactNode } from "react";

import type { KitCopy } from "./copy";
import { Avatar, Btn, Icon } from "./primitives";

export type SummaryBlockProps = {
  readonly name: string;
  readonly isVisitor?: boolean;
  readonly identityLabel: string;
  readonly phone?: string | null;
  readonly next: string;
  readonly main: string;
  readonly amount: string;
  readonly copy: KitCopy;
  readonly loading?: boolean;
};

export function SummaryBlock({ name, isVisitor, identityLabel, phone, next, main, amount, copy, loading }: SummaryBlockProps) {
  return (
    <div className="summary" data-summary aria-busy={loading || undefined}>
      <div className="stop">
        <Avatar name={isVisitor ? null : name} />
        <div>
          <b>{name}</b>
          <span>{[identityLabel, phone].filter(Boolean).join(" · ")}</span>
        </div>
      </div>
      {loading ? (
        <div>
          <span className="sk w70" />
          <span className="sk w40" />
        </div>
      ) : (
        <dl className="sum-grid">
          <dt>{copy.summary.next}</dt>
          <dd>
            <b>{next}</b>
          </dd>
          <dt>{copy.summary.main}</dt>
          <dd>{main}</dd>
          <dt>{copy.summary.amount}</dt>
          <dd>{amount}</dd>
        </dl>
      )}
    </div>
  );
}

export type PanelSectionProps = {
  readonly title: string;
  readonly open: boolean;
  readonly count?: string | number | null;
  readonly copy: KitCopy;
  readonly action?: { readonly label: string; readonly onClick: () => void } | null;
  readonly variant?: "desktop" | "mobile";
  readonly onToggle?: () => void;
  readonly children?: ReactNode;
};

export function PanelSection({ title, open, count, copy, action, variant = "desktop", onToggle, children }: PanelSectionProps) {
  if (variant === "mobile") {
    return (
      <section className={`mx-sec${open ? "" : " closed"}`} data-panel-section={title}>
        <button type="button" className="h" onClick={onToggle} aria-expanded={open}>
          <b>{count !== null && count !== undefined && !open ? `${title} · ${count}` : title}</b>
          <Icon name="chev" size={18} className="chev" />
        </button>
        {open ? <div className="bd">{children}</div> : null}
      </section>
    );
  }
  if (!open) {
    return (
      <section className="pn-sec closed" data-panel-section={title}>
        <h4>
          <button type="button" className="tg" onClick={onToggle} aria-expanded={false} aria-label={`${copy.panel.expand}: ${title}`}>
            {title}
            {count !== null && count !== undefined ? <span className="cnt">{count}</span> : null}
            <Icon name="chev" size={13} className="chev" />
          </button>
        </h4>
      </section>
    );
  }
  return (
    <section className="pn-sec" data-panel-section={title}>
      <h4>
        {onToggle ? (
          <button type="button" className="tg" onClick={onToggle} aria-expanded aria-label={`${copy.panel.collapse}: ${title}`}>
            {title}
          </button>
        ) : (
          title
        )}
        {action ? (
          <Btn size="xs" onClick={action.onClick}>
            {action.label}
          </Btn>
        ) : null}
      </h4>
      {children}
    </section>
  );
}
