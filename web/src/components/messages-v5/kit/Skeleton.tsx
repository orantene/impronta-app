/**
 * Skeleton (inbox rows while loading) and EmptyState (title, one sentence,
 * one action). Board D02: loading is a skeleton and empty is only ever empty;
 * failed says the data is safe and offers Retry.
 */

import type { ReactNode } from "react";

import type { KitCopy } from "./copy";
import { Btn, Icon, type IconName } from "./primitives";

export function Skeleton({ rows = 4, variant = "desktop", copy }: { rows?: number; variant?: "desktop" | "mobile"; copy: KitCopy }) {
  const cls = variant === "mobile" ? "mx-sk" : "sk-row";
  return (
    <div role="status" aria-live="polite" aria-label={copy.skeleton.loading} data-skeleton>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={cls} aria-hidden="true">
          <span className="sk av" />
          <span>
            <span className="sk w40" />
            <span className="sk w70" />
            <span className="sk w90" />
          </span>
          {variant === "mobile" ? null : <span className="sk w24" />}
        </div>
      ))}
    </div>
  );
}

export type EmptyStateProps = {
  readonly icon?: IconName;
  readonly title: string;
  readonly body?: ReactNode;
  readonly action?: { readonly label: string; readonly onClick: () => void; readonly primary?: boolean; readonly busy?: boolean };
  readonly small?: boolean;
  readonly variant?: "desktop" | "mobile";
};

export function EmptyState({ icon = "check", title, body, action, small, variant = "desktop" }: EmptyStateProps) {
  return (
    <div className={`empty${small ? " small" : ""}${variant === "mobile" ? " mx-empty" : ""}`} data-empty-state>
      {small ? null : (
        <span className="ill">
          <Icon name={icon} size={22} />
        </span>
      )}
      <b>{title}</b>
      {body ? <span>{body}</span> : null}
      {action ? (
        <Btn size="sm" variant={action.primary ? "primary" : "default"} busy={action.busy} onClick={action.onClick}>
          {action.label}
        </Btn>
      ) : null}
    </div>
  );
}
