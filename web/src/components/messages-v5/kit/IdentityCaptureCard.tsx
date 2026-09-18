"use client";

/**
 * IdentityCaptureCard (board D04): capture inline, prefilled from the typed
 * phone, with a match against existing clients. Match, never merge: the
 * existing client is offered, "Create a new client" is explicit.
 */

import type { CustomerMatch, MessagingRefusal } from "@/lib/messaging/types";

import { Card } from "./Card";
import type { KitCopy } from "./copy";
import { fill } from "./copy";
import { OptionRow } from "./OptionRow";
import { Btn, Pill } from "./primitives";
import { RefusalLine } from "./RefusalLine";

export type IdentityCaptureState = "idle" | "matching" | "saving" | "done" | "refused";

export type IdentityCaptureCardProps = {
  readonly name: string;
  readonly phone: string;
  readonly email: string;
  readonly matches: readonly CustomerMatch[];
  /** A matched customerId, or "new". */
  readonly selected: string;
  readonly state: IdentityCaptureState;
  readonly refusal?: MessagingRefusal | null;
  readonly linkedName?: string | null;
  readonly copy: KitCopy;
  readonly variant?: "desktop" | "mobile";
  readonly onChange?: (field: "name" | "phone" | "email", value: string) => void;
  readonly onSelect?: (value: string) => void;
  readonly onSave?: () => void;
};

export function IdentityCaptureCard({ name, phone, email, matches, selected, state, refusal, linkedName, copy, variant = "desktop", onChange, onSelect, onSave }: IdentityCaptureCardProps) {
  const c = copy.idCapture;
  const busy = state === "saving" || state === "matching";
  const done = state === "done";
  const pill = done ? <Pill tone="done">{fill(c.linked, { name: linkedName ?? name })}</Pill> : state === "matching" ? <Pill tone="ch">{c.matching}</Pill> : <Pill tone="due">{c.neededBeforeHold}</Pill>;
  const idBase = `msgv5-id-${variant}`;
  return (
    <Card category="id" label={copy.card.cat.identity} title={c.capture} pills={pill} mine busy={busy} wide variant={variant} testId="identity" foot={done ? undefined : c.foot} actions={
      done || !onSave ? null : (
        <Btn size="sm" variant="primary" busy={busy} onClick={onSave} data-identity-save>
          {state === "saving" ? c.saving : c.save}
        </Btn>
      )
    }>
      {state === "refused" && refusal ? <RefusalLine code={refusal} copy={copy} variant={variant} /> : null}
      <div className="fld">
        <label htmlFor={`${idBase}-name`}>{c.name}</label>
        <input id={`${idBase}-name`} className="in" value={name} disabled={busy || done} onChange={(e) => onChange?.("name", e.target.value)} />
      </div>
      <div className="split">
        <div className="fld">
          <label htmlFor={`${idBase}-phone`}>{c.phone}</label>
          <input id={`${idBase}-phone`} className="in" value={phone} inputMode="tel" disabled={busy || done} onChange={(e) => onChange?.("phone", e.target.value)} />
        </div>
        <div className="fld">
          <label htmlFor={`${idBase}-email`}>
            {c.email} <span className="opt-l">{c.optional}</span>
          </label>
          <input id={`${idBase}-email`} className="in" value={email} inputMode="email" placeholder={c.emailPlaceholder} disabled={busy || done} onChange={(e) => onChange?.("email", e.target.value)} />
        </div>
      </div>
      {done ? null : (
        <>
          {matches.map((m) => (
            <OptionRow
              key={m.customerId ?? m.displayName ?? "match"}
              control="radio"
              selected={selected === m.customerId}
              title={fill(c.existing, { name: m.displayName ?? name })}
              sub={[m.level === "phone" ? c.samePhoneOnly : null, m.email ?? m.phoneE164].filter(Boolean).join(" · ")}
              trailing={m.level === "phone" ? <Pill tone="done">{c.match}</Pill> : null}
              disabled={busy}
              onSelect={onSelect && m.customerId ? () => onSelect(m.customerId as string) : undefined}
              variant={variant}
            />
          ))}
          <OptionRow control="radio" selected={selected === "new"} title={c.createNew} sub={c.createNewWhy} disabled={busy} onSelect={onSelect ? () => onSelect("new") : undefined} variant={variant} />
        </>
      )}
    </Card>
  );
}
