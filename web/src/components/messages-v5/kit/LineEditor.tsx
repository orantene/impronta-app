"use client";

/**
 * LineEditor row (boards D06, D17, M05): avatar or icon, name, sub, units,
 * price, more. Flags from S5: proposed by client / staff, confirmed, price
 * snapshot (catalogue price moved since the line was added), edited,
 * removed (kept in history, restorable), unavailable (busy that day).
 */

import type { KitCopy } from "./copy";
import { fill } from "./copy";
import { Avatar, Icon, Pill, type IconName } from "./primitives";

export type LineEditorFlags = {
  readonly proposedBy?: "client" | "staff" | null;
  readonly proposedByName?: string | null;
  readonly confirmed?: boolean;
  /** The price the line was added at when it differs from the current one. */
  readonly priceSnapshot?: string | null;
  readonly edited?: boolean;
  readonly removed?: { readonly by: string } | null;
  readonly unavailable?: { readonly date: string } | null;
};

export type LineEditorRowProps = LineEditorFlags & {
  readonly avatarName?: string | null;
  readonly icon?: IconName;
  readonly name: string;
  readonly sub?: string | null;
  readonly units: string;
  readonly price: string;
  readonly copy: KitCopy;
  readonly readOnly?: boolean;
  readonly busy?: boolean;
  readonly variant?: "desktop" | "mobile";
  readonly onUnits?: (value: string) => void;
  readonly onPrice?: (value: string) => void;
  readonly onMore?: () => void;
  readonly onRestore?: () => void;
  readonly rowId?: string;
};

export function LineEditorRow(props: LineEditorRowProps) {
  const { avatarName, icon, name, sub, units, price, copy, readOnly, busy, variant = "desktop", onUnits, onPrice, onMore, onRestore, rowId, proposedBy, proposedByName, confirmed, priceSnapshot, edited, removed, unavailable } = props;
  const mobile = variant === "mobile";
  const cls = `${mobile ? "mx-line-ed" : "line-ed"}${removed ? " removed" : ""}${unavailable ? " unavailable" : ""}`;
  const dead = !!removed || !!unavailable;
  const ro = readOnly || dead || busy;
  const id = rowId ?? `msgv5-line-${name.replace(/\W+/g, "-").toLowerCase()}`;
  const flags = (
    <>
      {proposedBy === "client" ? <span className="lineflag client">{fill(copy.line.clientChose, { name: proposedByName ?? "" }).trim()}</span> : null}
      {proposedBy === "staff" ? <span className="lineflag">{proposedByName ? fill(copy.line.staffAdded, { name: proposedByName }) : copy.line.youAdded}</span> : null}
      {confirmed ? <span className="lineflag ok">{copy.line.confirmed}</span> : null}
      {priceSnapshot ? <span className="lineflag warn">{fill(copy.line.priceSnapshot, { price: priceSnapshot })}</span> : null}
      {edited ? <span className="lineflag">{copy.line.edited}</span> : null}
      {unavailable ? <Pill tone="lost">{fill(copy.line.busyOn, { date: unavailable.date })}</Pill> : null}
    </>
  );
  const subText = removed ? fill(copy.line.removed, { name: removed.by }) : unavailable ? copy.line.unavailable : sub;
  return (
    <div className={cls} data-line-row={id} aria-busy={busy || undefined}>
      {icon ? <Avatar name={null} size="sm" icon={icon} /> : <Avatar name={avatarName ?? null} size="sm" />}
      <div className="nm">
        <b>
          {name}
          {flags}
        </b>
        {subText ? <span>{subText}</span> : null}
      </div>
      <label className="sr" htmlFor={`${id}-units`}>
        {copy.line.units}
      </label>
      <input id={`${id}-units`} className={`in${ro ? " ro" : ""}`} value={dead ? "" : units} readOnly={ro} disabled={dead} inputMode="numeric" onChange={(e) => onUnits?.(e.target.value)} />
      <label className="sr" htmlFor={`${id}-price`}>
        {copy.line.price}
      </label>
      <input id={`${id}-price`} className={`in${ro ? " ro" : ""}`} value={dead ? "" : price} readOnly={ro} disabled={dead} inputMode="decimal" onChange={(e) => onPrice?.(e.target.value)} />
      {removed ? (
        <button type="button" className="more" onClick={onRestore} aria-label={copy.line.restore}>
          <Icon name="refresh" size={14} />
        </button>
      ) : unavailable ? (
        <span className="more" aria-hidden="true">
          <Icon name="ban" size={14} />
        </span>
      ) : (
        <button type="button" className="more" onClick={onMore} aria-label={copy.line.more} disabled={readOnly}>
          <Icon name="more" size={14} />
        </button>
      )}
    </div>
  );
}
