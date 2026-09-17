"use client";

/**
 * ContextPanel: the desktop right card (board D01). SummaryBlock at the top
 * (who, next, main, amount), then PanelSections for Client, Items (labelled
 * per business), Money, and three collapsed sections (Files, Team notes,
 * Follow-up).
 *
 * Pure over `ContextPanelProps` (`./contracts`): every write is
 * `props.onAction(kind, detail)`, routed by the shell. Section open/closed
 * state is local UI state, not data — nothing here reads or writes a table.
 */

import { useState } from "react";

import "../kit/tokens.css";
import { LineEditorRow } from "../kit/LineEditor";
import { PanelSection, SummaryBlock } from "../kit/Panel";
import { Btn } from "../kit/primitives";
import { EmptyState, Skeleton } from "../kit/Skeleton";

import { mainRecordChip, summaryFor, type MoneySummary } from "@/lib/messages-v5/context-view";

import type { ContextMoney, ContextPanelProps } from "./contracts";

/** `props.money` (contracts.ts, L3 extra) into the shape `summaryFor` expects. Shared with `DetailsSheet`. */
export function moneyOf(money: ContextMoney | null | undefined): MoneySummary | null {
  if (!money) return null;
  return {
    totalLabel: money.totalLabel,
    depositLabel: money.depositLabel ?? null,
    paidLabel: money.paidLabel,
    balanceLabel: money.balanceLabel,
    balanceDueCents: money.balanceDueCents,
    hasTotal: true,
  };
}

export function ContextPanel(props: ContextPanelProps) {
  const { essentials, chips, tasks, itemsLabel, loading, copy, onAction } = props;
  const [openClient, setOpenClient] = useState(true);
  const [openItems, setOpenItems] = useState(true);
  const [openMoney, setOpenMoney] = useState(true);
  const [openFiles, setOpenFiles] = useState(false);
  const [openNotes, setOpenNotes] = useState(false);
  const [openFollowUp, setOpenFollowUp] = useState(false);

  const money = moneyOf(props.money);
  const main = mainRecordChip(chips);

  return (
    <div className="msgv5" data-context-panel>
      {loading || !essentials ? (
        <SummaryBlock name="" identityLabel="" next="" main="" amount="" copy={copy} loading />
      ) : (
        <SummaryBlock {...summaryFor({ essentials, tasks, chips, copy, money })} copy={copy} />
      )}

      <PanelSection
        title={copy.panel.client.title}
        open={openClient}
        copy={copy}
        onToggle={() => setOpenClient((v) => !v)}
        action={{ label: copy.panel.open, onClick: () => onAction("open_client") }}
      >
        {essentials ? (
          <dl className="sum-grid" data-panel-client>
            <dt>{copy.idCapture.name}</dt>
            <dd>{essentials.customer.name || copy.state.noIdentity}</dd>
            <dt>{copy.idCapture.phone}</dt>
            <dd>{essentials.customer.phone ?? ""}</dd>
            <dt>{copy.idCapture.email}</dt>
            <dd>{essentials.customer.email ?? ""}</dd>
            {essentials.customer.source ? (
              <>
                <dt>{copy.panel.client.source}</dt>
                <dd>{essentials.customer.source}</dd>
              </>
            ) : null}
            {props.clientHistoryLabel ? <dd>{props.clientHistoryLabel}</dd> : null}
          </dl>
        ) : (
          <Skeleton rows={2} copy={copy} />
        )}
      </PanelSection>

      <PanelSection title={itemsLabel} open={openItems} copy={copy} onToggle={() => setOpenItems((v) => !v)} count={props.items ? props.items.length : null}>
        {props.itemsLoading ? (
          <Skeleton rows={2} copy={copy} />
        ) : props.items && props.items.length > 0 ? (
          props.items.map((line) => (
            <LineEditorRow
              key={line.id}
              name={line.name}
              sub={line.sub}
              units={line.units}
              price={line.price}
              proposedBy={line.proposedBy}
              proposedByName={line.proposedByName}
              confirmed={line.confirmed}
              priceSnapshot={line.priceSnapshot}
              readOnly
              copy={copy}
            />
          ))
        ) : (
          <EmptyState small title={copy.panel.itemsEmpty} />
        )}
        <Btn size="sm" icon="plus" onClick={() => onAction("add_items")} data-add-items>
          {copy.panel.addItem}
        </Btn>
      </PanelSection>

      <PanelSection title={copy.panel.money.title} open={openMoney} copy={copy} onToggle={() => setOpenMoney((v) => !v)}>
        {money ? (
          <dl className="sum-grid" data-panel-money>
            <dt>{copy.panel.money.total}</dt>
            <dd>{money.totalLabel}</dd>
            {money.depositLabel ? (
              <>
                <dt>{copy.panel.money.deposit}</dt>
                <dd>{money.depositLabel}</dd>
              </>
            ) : null}
            <dt>{copy.panel.money.paid}</dt>
            <dd>{money.paidLabel}</dd>
            <dt>{copy.panel.money.balance}</dt>
            <dd>{money.balanceLabel}</dd>
          </dl>
        ) : (
          <EmptyState small title={copy.panel.money.none} />
        )}
        <Btn size="sm" variant="primary" onClick={() => onAction("request_payment")} data-request-payment>
          {copy.panel.money.requestPayment}
        </Btn>
      </PanelSection>

      <PanelSection title={copy.panel.files.title} open={openFiles} count={props.filesCount ?? null} copy={copy} onToggle={() => setOpenFiles((v) => !v)}>
        <Btn size="sm" onClick={() => onAction("add_file")}>
          {copy.tray.file}
        </Btn>
      </PanelSection>

      <PanelSection title={copy.panel.notes.title} open={openNotes} count={props.notesCount ?? null} copy={copy} onToggle={() => setOpenNotes((v) => !v)}>
        <Btn size="sm" onClick={() => onAction("add_note")}>
          {copy.tray.thisConversation}
        </Btn>
      </PanelSection>

      <PanelSection title={copy.panel.followUp.title} open={openFollowUp} count={props.nextReminderLabel ?? null} copy={copy} onToggle={() => setOpenFollowUp((v) => !v)}>
        <div data-follow-up-line>{props.nextReminderLabel ? props.nextReminderLabel : copy.panel.followUp.none}</div>
        <Btn size="sm" onClick={() => onAction("remind")}>
          {copy.tray.reminder}
        </Btn>
      </PanelSection>

      {main ? (
        <Btn size="sm" variant="ghost" onClick={() => onAction("open_record", { recordId: main.recordId, kind: main.kind })} data-open-record>
          {copy.panel.open}
        </Btn>
      ) : null}
    </div>
  );
}
