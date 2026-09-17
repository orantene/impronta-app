/**
 * OptionRow: selected / unselected with a filled radio or check (boards D04,
 * D07, D14, M03, M05). Desktop `opt`, mobile `mx-opt2`.
 */

import type { ReactNode } from "react";

import { Icon } from "./primitives";

export type OptionRowProps = {
  readonly selected: boolean;
  readonly title: string;
  readonly sub?: string | null;
  readonly amount?: string | null;
  readonly control?: "radio" | "check";
  readonly disabled?: boolean;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  readonly variant?: "desktop" | "mobile";
  readonly onSelect?: () => void;
};

export function OptionRow({ selected, title, sub, amount, control = "radio", disabled, leading, trailing, variant = "desktop", onSelect }: OptionRowProps) {
  const cls = `${variant === "mobile" ? "mx-opt2" : "opt"}${selected ? " on" : ""}${disabled ? " off" : ""}`;
  const mark = control === "check" ? <span className="chk" aria-hidden="true">{selected ? <Icon name="check" size={variant === "mobile" ? 14 : 12} /> : null}</span> : <span className="rad" aria-hidden="true" />;
  const body = (
    <>
      {leading}
      {control === "check" && variant === "mobile" ? null : mark}
      <span className="tx">
        <b>{title}</b>
        {sub ? <span>{sub}</span> : null}
      </span>
      {amount ? <span className="amt">{amount}</span> : null}
      {trailing}
      {control === "check" && variant === "mobile" ? mark : null}
    </>
  );
  if (!onSelect) {
    return (
      <div className={cls} data-option-row aria-selected={selected}>
        {body}
      </div>
    );
  }
  return (
    <button type="button" className={cls} role={control === "check" ? "checkbox" : "radio"} aria-checked={selected} disabled={disabled} onClick={onSelect} data-option-row>
      {body}
    </button>
  );
}
