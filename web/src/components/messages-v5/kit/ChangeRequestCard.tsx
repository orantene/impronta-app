/**
 * ChangeRequestCard (boards D09, D18, D20): change with impact first. The
 * original is never touched until the client confirms; `requested` is the
 * client's ask from the link, `preview` is staff's impact preview.
 */

import { Card, CardLine } from "./Card";
import type { KitCopy } from "./copy";
import { fill } from "./copy";
import { Btn, Pill } from "./primitives";

export type ChangeRequestMode = "preview" | "requested" | "applied" | "declined";
export type ChangeRequestAction = "cancel" | "send" | "draft";

export type ChangeRequestCardProps = {
  readonly title: string;
  readonly mode: ChangeRequestMode;
  readonly clientName: string;
  readonly rows: readonly { readonly label: string; readonly value: string; readonly muted?: boolean }[];
  readonly nextVersion?: number;
  readonly copy: KitCopy;
  readonly busy?: boolean;
  readonly variant?: "desktop" | "mobile";
  readonly onAction?: (action: ChangeRequestAction) => void;
};

export function ChangeRequestCard({ title, mode, clientName, rows, nextVersion = 3, copy, busy, variant = "desktop", onAction }: ChangeRequestCardProps) {
  const pill = mode === "preview" ? <Pill tone="due">{copy.change.preview}</Pill> : mode === "requested" ? <Pill tone="due">{copy.change.needsReply}</Pill> : mode === "applied" ? <Pill tone="done">{copy.change.applied}</Pill> : <Pill tone="lost">{copy.change.declined}</Pill>;
  const foot = mode === "preview" ? fill(copy.change.originalStays, { name: clientName }) : mode === "requested" ? fill(copy.change.acceptOpens, { version: nextVersion }) : null;
  const actions =
    onAction && mode === "preview" ? (
      <>
        <Btn size="sm" onClick={() => onAction("cancel")} data-change-action="cancel">
          {copy.change.cancel}
        </Btn>
        <Btn size="sm" variant="primary" busy={busy} onClick={() => onAction("send")} data-change-action="send">
          {busy ? copy.change.sending : fill(copy.change.sendTo, { name: clientName })}
        </Btn>
      </>
    ) : onAction && mode === "requested" ? (
      <Btn size="sm" variant="primary" busy={busy} onClick={() => onAction("draft")} data-change-action="draft">
        {fill(copy.change.draftNext, { version: nextVersion })}
      </Btn>
    ) : null;
  return (
    <Card category="change" label={copy.card.cat.change} title={title} pills={pill} who={mode === "requested" ? fill(copy.change.fromLink, { name: clientName }) : undefined} mine={mode === "preview"} busy={busy} variant={variant} testId="change" foot={foot} actions={actions}>
      {rows.map((r, i) => (
        <CardLine key={i} label={r.label} amount={r.value} muted={r.muted} />
      ))}
    </Card>
  );
}
