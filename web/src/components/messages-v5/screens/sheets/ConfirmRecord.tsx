"use client";

/**
 * L8 (D-MSG-150, board D19 desktop 520 / M09 mobile full screen, D08 "Confirm
 * order" on the basket card): `ConfirmRecordSheet` registers "confirm" in
 * the sheet registry (`../sheet-registry.tsx`) - the ONE seam this lane
 * plugs into; the shell and `NextStep.tsx` are unchanged. Wraps, never
 * re-implements, S3's `messagingConfirmRecord`
 * (`lib/server-actions/messaging-confirm.ts`).
 *
 * Split like L4's `RenameInline`: `ConfirmRecordView` is the pure,
 * fully prop-driven presentational half (every render test targets it
 * directly - the six states the lane brief asks for); `ConfirmRecordSheet`
 * is the thin stateful wrapper that loads the offers, tracks the source
 * pick, and calls the writer.
 *
 * Principle 0 / D-MSG-150..154 (`lib/messages-v5/confirm-view.ts` has the
 * full seam notes): the source picker and the deposit gate are read from
 * `RecordChip` (S2) and `loadInquiryOffers` (S3, already exposed as the
 * server action `messagingLoadOffers`) - no new reader. The "Checked just
 * now" list names WHAT will be checked (people / resources & seats), not a
 * live ✓, because the availability readers are server-only
 * (`defaultReaders` in `lib/messaging/confirm.ts`, not exported); the real
 * check runs inside `messagingConfirmRecord` on click, and its `unavailable`
 * conflicts render verbatim (`ConfirmConflict.why`, already a full sentence).
 */

import { useEffect, useMemo, useState } from "react";

import type { ConfirmConflict } from "@/lib/messaging/confirm-plan";
import {
  checkedCategoriesFor,
  confirmSourceOptions,
  createdListFor,
  depositGate,
  overrideReasonValid,
  type ConfirmSourceOption,
  type DepositGate,
} from "@/lib/messages-v5/confirm-view";
import type { OfferRow } from "@/lib/messaging/sheets";
import { messagingConfirmRecord } from "@/lib/server-actions/messaging-confirm";
import { messagingLoadOffers } from "@/lib/server-actions/messaging-sheets";
import type { MessagingRefusal } from "@/lib/messaging/types";

import { Icon, Btn } from "../../kit/primitives";
import { OptionRow } from "../../kit/OptionRow";
import { AlertLine, OkLine, RefusalLine } from "../../kit/RefusalLine";
import { Sheet } from "../../kit/Sheet";
import { Skeleton } from "../../kit/Skeleton";
import type { KitCopy } from "../../kit/copy";
import type { ScreenVariant } from "../contracts";
import { type ActionSheetProps, type ShellSheetContext, registerActionSheet } from "../sheet-registry";

export type ConfirmRecordPhase = "idle" | "busy" | "conflict" | "already" | "done";

export type ConfirmRecordViewProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly copy: KitCopy;
  readonly variant: ScreenVariant;
  readonly loadingOptions: boolean;
  readonly options: readonly ConfirmSourceOption[];
  readonly selected: ConfirmSourceOption | null;
  readonly onSelect: (id: string) => void;
  readonly deposit: DepositGate;
  readonly overrideReason: string;
  readonly onOverrideChange: (value: string) => void;
  readonly phase: ConfirmRecordPhase;
  readonly conflicts: readonly ConfirmConflict[];
  readonly refusal: MessagingRefusal | null;
  readonly doneText: string | null;
  readonly onConfirm: () => void;
  readonly onSeeAlternatives: () => void;
  readonly onOpenRecord: () => void;
  readonly onCaptureIdentity: () => void;
};

function centsLabel(cents: number | null): string | null {
  if (cents == null) return null;
  return `$${(cents / 100).toFixed(2)}`;
}

/** Pure, prop-driven. Every branch below is one of the lane's six states. */
export function ConfirmRecordView(props: ConfirmRecordViewProps) {
  const { open, onClose, copy, variant, loadingOptions, options, selected, onSelect, deposit, overrideReason, onOverrideChange, phase, conflicts, refusal, doneText, onConfirm, onSeeAlternatives, onOpenRecord, onCaptureIdentity } = props;
  const c = copy.confirm;
  const title = selected?.source === "draft" ? c.titleOrder : c.titleBooking;
  const primaryLabel = phase === "busy" ? c.confirming : selected?.source === "draft" ? c.primaryOrder : c.primaryBooking;
  const overrideOk = overrideReasonValid(overrideReason);
  const confirmDisabled = !selected || phase === "busy" || phase === "conflict" || (deposit.needsOverride && !overrideOk);

  let body;
  if (phase === "done" && doneText) {
    body = <OkLine text={doneText} variant={variant} />;
  } else if (phase === "already") {
    body = (
      <>
        <OkLine text={c.alreadyConfirmed} variant={variant} />
        <Btn size="sm" onClick={onOpenRecord} data-confirm-open-record>
          {c.openRecord}
        </Btn>
      </>
    );
  } else if (phase === "conflict") {
    body = (
      <div data-confirm-conflicts>
        {conflicts.map((conflict, i) => (
          <div key={`${conflict.code}:${conflict.line}:${i}`} className={variant === "mobile" ? "mx-hist-row" : "hist-row"} data-confirm-conflict={conflict.code}>
            <Icon name="alert" size={variant === "mobile" ? 14 : 13} />
            <span className="tx">{conflict.why}</span>
          </div>
        ))}
        <AlertLine text={c.notCreated} action={{ label: c.seeAlternatives, onClick: onSeeAlternatives }} variant={variant} />
      </div>
    );
  } else {
    body = (
      <>
        {loadingOptions ? (
          <Skeleton rows={2} variant={variant} copy={copy} />
        ) : options.length === 0 ? (
          <p data-confirm-empty>{c.sourceEmpty}</p>
        ) : (
          <div data-confirm-sources>
            {options.map((option) => {
              const total = centsLabel(option.totalCents);
              return (
                <OptionRow
                  key={option.id}
                  selected={selected?.id === option.id}
                  title={option.source === "draft" ? c.sourceDraft : c.sourceOffer.replace("{version}", String(option.version ?? 1))}
                  sub={option.source === "draft" ? option.label : null}
                  amount={total}
                  variant={variant}
                  onSelect={() => onSelect(option.id)}
                />
              );
            })}
          </div>
        )}

        {selected ? (
          <section className="pn-sec" data-confirm-checked>
            <h4>{c.checkedTitle}</h4>
            {checkedCategoriesFor(selected.source).map((category) => (
              <div key={category} className={variant === "mobile" ? "mx-hist-row" : "hist-row"} data-confirm-checked-row={category}>
                <Icon name="clock" size={variant === "mobile" ? 14 : 13} />
                <span className="tx">{category === "people" ? c.checkedPeople : c.checkedResources}</span>
                <span className="t">{c.willCheck}</span>
              </div>
            ))}
          </section>
        ) : null}

        {selected ? (
          <section className="pn-sec" data-confirm-created>
            <h4>{c.createdTitle}</h4>
            {createdListFor(selected.source, true).map((key) => (
              <div key={key} className={variant === "mobile" ? "mx-hist-row" : "hist-row"} data-confirm-created-row={key}>
                <Icon name="check" size={variant === "mobile" ? 14 : 13} />
                <span className="tx">
                  {
                    {
                      project: c.createdProject,
                      assignments: c.createdAssignments,
                      calendar_blocks: c.createdCalendarBlocks,
                      balance_reminder: c.createdBalanceReminder,
                      client_confirmation: c.createdClientConfirmation,
                      order: c.createdOrder,
                      kitchen_ticket: c.createdKitchenTicket,
                      receipt: c.createdReceipt,
                    }[key]
                  }
                </span>
              </div>
            ))}
          </section>
        ) : null}

        {deposit.needsOverride ? (
          <div data-confirm-deposit-gate>
            <AlertLine text={c.depositBlocked} variant={variant} />
            <div className="fld">
              <label htmlFor="msgv5-confirm-override">{c.overrideLabel}</label>
              <textarea
                id="msgv5-confirm-override"
                className="in"
                rows={2}
                placeholder={c.overridePlaceholder}
                value={overrideReason}
                onChange={(e) => onOverrideChange(e.target.value)}
                data-confirm-override-input
              />
              <span className="help">{c.overrideHint}</span>
            </div>
          </div>
        ) : null}

        {refusal ? (
          <RefusalLine
            code={refusal}
            copy={copy}
            variant={variant}
            action={refusal === "identity_unconfirmed" ? { label: copy.idCapture.capture, onClick: onCaptureIdentity } : null}
          />
        ) : null}
      </>
    );
  }

  return (
    <Sheet
      open={open}
      title={title}
      copy={copy}
      onClose={onClose}
      variant={variant === "mobile" ? "mobile-full" : "desktop"}
      width={520}
      hint={phase === "idle" ? c.footerHint : undefined}
      footer={
        phase === "idle" || phase === "busy" ? (
          <Btn variant="primary" size="lg" fill busy={phase === "busy"} disabled={confirmDisabled} onClick={onConfirm} data-confirm-primary>
            {primaryLabel}
          </Btn>
        ) : null
      }
      labelledBy="msgv5-confirm-title"
    >
      <div className="msgv5" data-confirm-sheet data-confirm-phase={phase}>
        {body}
      </div>
    </Sheet>
  );
}

function ConfirmRecordSheet({ open, onClose, ctx, copy, variant }: ActionSheetProps) {
  const [offers, setOffers] = useState<OfferRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [phase, setPhase] = useState<ConfirmRecordPhase>("idle");
  const [conflicts, setConflicts] = useState<readonly ConfirmConflict[]>([]);
  const [refusal, setRefusal] = useState<MessagingRefusal | null>(null);
  const [doneText, setDoneText] = useState<string | null>(null);

  const inquiryId = ctx.row?.id ?? null;

  // Reset every time the sheet opens on a (possibly different) conversation.
  useEffect(() => {
    if (!open) return;
    setOffers(null);
    setSelectedId(null);
    setOverrideReason("");
    setPhase("idle");
    setConflicts([]);
    setRefusal(null);
    setDoneText(null);
    if (!inquiryId) {
      setOffers([]);
      return;
    }
    let cancelled = false;
    void messagingLoadOffers({ inquiryId }).then((result) => {
      if (cancelled) return;
      setOffers(result.ok ? result.offers : []);
    });
    return () => {
      cancelled = true;
    };
  }, [open, inquiryId]);

  const options = useMemo(() => confirmSourceOptions(ctx.chips, offers ?? []), [ctx.chips, offers]);

  // Default pick: prefer an accepted offer (D19's own confirm), else the shared draft (D08).
  useEffect(() => {
    if (!open) return;
    if (selectedId && options.some((o) => o.id === selectedId)) return;
    const preferred = options.find((o) => o.source === "offer") ?? options[0] ?? null;
    setSelectedId(preferred?.id ?? null);
  }, [open, options, selectedId]);

  const selected = options.find((o) => o.id === selectedId) ?? null;
  const deposit = depositGate(selected);

  async function confirm() {
    if (!selected || !inquiryId || phase === "busy") return;
    if (deposit.needsOverride && !overrideReasonValid(overrideReason)) return;
    setPhase("busy");
    setRefusal(null);
    setConflicts([]);
    const result = await messagingConfirmRecord({
      inquiryId,
      source: selected.source,
      offerId: selected.source === "offer" ? selected.id : null,
      orderId: selected.source === "draft" ? selected.id : null,
      expectedVersion: ctx.version,
      overrideReason: deposit.needsOverride ? overrideReason.trim() : null,
    });
    if (result.ok) {
      const text = result.kind === "order" ? copy.kit.confirm.doneOrder : copy.kit.confirm.doneBooking;
      setPhase("done");
      setDoneText(text);
      await ctx.reloadThread();
      await ctx.reloadInbox();
      ctx.notify({ kind: "ok", text });
      onClose();
      return;
    }
    if (result.reason === "unavailable" && result.conflicts) {
      setPhase("conflict");
      setConflicts(result.conflicts);
      return;
    }
    if (result.reason === "already") {
      setPhase("already");
      return;
    }
    setPhase("idle");
    setRefusal(result.reason);
    if (result.reason === "conflict") void ctx.reloadThread();
  }

  return (
    <ConfirmRecordView
      open={open}
      onClose={onClose}
      copy={copy.kit}
      variant={variant}
      loadingOptions={offers === null}
      options={options}
      selected={selected}
      onSelect={setSelectedId}
      deposit={deposit}
      overrideReason={overrideReason}
      onOverrideChange={setOverrideReason}
      phase={phase}
      conflicts={conflicts}
      refusal={refusal}
      doneText={doneText}
      onConfirm={() => void confirm()}
      onSeeAlternatives={() => ctx.dispatch("add_items")}
      onOpenRecord={() => ctx.dispatch("open_record")}
      onCaptureIdentity={() => {
        onClose();
        ctx.dispatch("capture_identity");
      }}
    />
  );
}

registerActionSheet("confirm", { Component: ConfirmRecordSheet, lane: "L8" });

/**
 * D08: the basket / order card mounts this to open the same sheet with the
 * shared draft preselected. It never opens its own sheet - the registry
 * mapping is one action id to one component, so a second "confirm" entry
 * would only overwrite the first. Because a mount that reaches for this
 * button lives on the ORDER card (no accepted-offer context on screen), the
 * sheet's own default-pick rule already lands on the draft: an offer is
 * preferred only when one exists on the conversation's `chips`.
 */
export function ConfirmOrderButton({ ctx, copy, size = "sm" }: { readonly ctx: ShellSheetContext; readonly copy: KitCopy; readonly size?: "sm" | "default" | "lg" }) {
  return (
    <Btn size={size} variant="primary" onClick={() => ctx.dispatch("confirm")} data-confirm-order-button>
      {copy.confirm.primaryOrder}
    </Btn>
  );
}
