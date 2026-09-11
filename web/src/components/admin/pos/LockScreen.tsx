"use client";

/**
 * LockScreen — `POSLock`: the whole till behind one card. The lock glyph,
 * `Who's on the register?`, `Drawer stays {name}'s until it's handed over`,
 * one tile per person who holds a register PIN, the PIN dots, the pad, and
 * the wrong-PIN line under it. The same card serves the cashier chip's
 * `Switch operator` (`POSChangeServer`, the till half), with its own title.
 *
 * Presentational: the device key, the session and every write live in
 * `counter-lock.tsx`. A person with no PIN is not a tile (they cannot
 * unlock); with nobody holding one the card says so and offers the only way
 * out, Settings › People.
 */

import { Lock } from "lucide-react";

import { interpolate } from "@/i18n/interpolate";
import { cn } from "@/lib/utils";
import { initialsOf } from "./CustomerSheet";
import { PosKeypad } from "./PosKeypad";
import { POS_PRIMARY_ACTION, POS_SECONDARY_ACTION } from "./pos-classes";
import type { PosPerson } from "./pos-types";

export type LockScreenCopy = {
  readonly title: string;
  readonly switchTitle: string;
  /** `Drawer stays {name}'s until it's handed over` */
  readonly drawerStays: string;
  readonly drawerNone: string;
  readonly noPins: string;
  readonly noPinsAction: string;
  readonly pinPrompt: string;
  readonly unlock: string;
  readonly switchAction: string;
  readonly unlocking: string;
  readonly cancelSwitch: string;
  readonly back: string;
  readonly role: Readonly<Record<string, string>>;
};

export type LockScreenProps = {
  readonly mode: "locked" | "switch";
  readonly people: readonly PosPerson[];
  readonly selectedId: string | null;
  readonly onSelect: (userId: string) => void;
  readonly pinLength: number;
  readonly onKey: (key: string) => void;
  /** Submits the typed PIN (4 to 6 digits); absent while fewer than four are typed. */
  readonly onSubmit?: () => void;
  /** The drawer's responsible, for the subtitle; null when no drawer is open. */
  readonly drawerOwnerName: string | null;
  /** The last refusal as a sentence, or null. */
  readonly status: string | null;
  readonly busy: boolean;
  readonly onCancelSwitch?: () => void;
  readonly peopleHref: string;
  readonly copy: LockScreenCopy;
};

export function LockScreen(props: LockScreenProps) {
  const { copy } = props;
  return (
    <div data-pos-lock-screen={props.mode} className="absolute inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-admin-surface p-6">
      <div role="dialog" aria-modal="true" aria-label={props.mode === "locked" ? copy.title : copy.switchTitle} className="flex w-full max-w-[640px] flex-col items-center rounded-[20px] bg-admin-card px-7 py-8 shadow-admin-hover">
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-[18px] bg-admin-brand-soft text-admin-brand">
          <Lock aria-hidden size={28} strokeWidth={1.75} />
        </span>
        <h2 className="m-0 mt-4 text-[24px] font-bold tracking-[-0.01em] text-admin-ink">{props.mode === "locked" ? copy.title : copy.switchTitle}</h2>
        <p className="m-0 mt-1.5 text-[15px] text-admin-ink-muted">
          {props.drawerOwnerName ? interpolate(copy.drawerStays, { name: props.drawerOwnerName }) : copy.drawerNone}
        </p>

        {props.people.length === 0 ? (
          <div className="mt-5 flex w-full flex-col items-center gap-3">
            <p role="status" data-pos-lock-no-pins className="m-0 rounded-[12px] bg-admin-surface-alt px-4 py-3 text-center text-[14px] text-admin-ink-muted">
              {copy.noPins}
            </p>
            <a href={props.peopleHref} className={POS_SECONDARY_ACTION}>
              {copy.noPinsAction}
            </a>
          </div>
        ) : (
          <div role="radiogroup" aria-label={copy.title} className="mt-5 grid w-full grid-cols-4 gap-2.5 max-[720px]:grid-cols-2">
            {props.people.map((person) => {
              const active = person.userId === props.selectedId;
              return (
                <button
                  key={person.userId}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  data-pos-lock-person={person.userId}
                  disabled={props.busy}
                  onClick={() => props.onSelect(person.userId)}
                  className={cn(
                    "flex min-h-[90px] flex-col items-center justify-center gap-1 rounded-[14px] border-[1.5px] px-2 py-3 transition-colors",
                    active ? "border-admin-brand bg-admin-brand-soft" : "border-admin-border bg-admin-card hover:bg-admin-surface-alt",
                  )}
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-admin-surface-alt text-[12px] font-bold text-admin-ink">
                    {initialsOf(person.name)}
                  </span>
                  <span className="text-[15px] font-semibold text-admin-ink">{person.name}</span>
                  <span className="text-[12.5px] text-admin-ink-muted">{copy.role[person.role] ?? person.role}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-5 flex items-center justify-center gap-3" aria-label={copy.pinPrompt}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              aria-hidden
              className={cn("h-3 w-3 rounded-full", i < props.pinLength ? "bg-admin-brand" : i < 4 ? "bg-admin-surface-alt ring-1 ring-admin-border" : "hidden")}
            />
          ))}
        </div>
        <PosKeypad className="mt-4 w-full max-w-[360px]" onKey={props.onKey} corner="blank" backLabel={copy.back} disabled={props.busy || props.people.length === 0} />
        <button type="button" data-pos-lock-submit className={cn(POS_PRIMARY_ACTION, "mt-3 w-full max-w-[360px]")} disabled={!props.onSubmit || props.busy} onClick={props.onSubmit}>
          {props.mode === "locked" ? copy.unlock : copy.switchAction}
        </button>
        <p role={props.status ? "alert" : "status"} data-pos-lock-status className={cn("m-0 mt-3 min-h-[20px] text-center text-[13.5px] font-semibold", props.status ? "text-admin-coral-deep" : "text-admin-ink-dim")}>
          {props.busy ? copy.unlocking : (props.status ?? "")}
        </p>
        {props.mode === "switch" && props.onCancelSwitch && (
          <button type="button" onClick={props.onCancelSwitch} className={cn(POS_SECONDARY_ACTION, "mt-3")}>
            {copy.cancelSwitch}
          </button>
        )}
      </div>
    </div>
  );
}
