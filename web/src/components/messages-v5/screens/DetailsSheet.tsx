"use client";

/**
 * DetailsSheet (mobile, board M04): one scrollable 92% kit `Sheet`. Summary,
 * shortcut buttons (Revise offer / Request payment / Add item), then
 * expandable sections Client, Items, Money, Files, Notes and follow-up. No
 * tabs — everything scrolls in one column, matching the mockup.
 */

import { useState } from "react";

import "../kit/tokens.css";
import { LineEditorRow } from "../kit/LineEditor";
import { PanelSection, SummaryBlock } from "../kit/Panel";
import { Btn } from "../kit/primitives";
import { Sheet } from "../kit/Sheet";
import { EmptyState, Skeleton } from "../kit/Skeleton";

import { mainRecordChip, summaryFor } from "@/lib/messages-v5/context-view";

import { moneyOf } from "./ContextPanel";
import type { DetailsSheetProps } from "./contracts";

export function DetailsSheet(props: DetailsSheetProps) {
  const { open, onClose, essentials, chips, tasks, itemsLabel, loading, copy, onAction } = props;
  const [openClient, setOpenClient] = useState(true);
  const [openItems, setOpenItems] = useState(true);
  const [openMoney, setOpenMoney] = useState(false);
  const [openFiles, setOpenFiles] = useState(false);
  const [openNotes, setOpenNotes] = useState(false);
  const [openFollowUp, setOpenFollowUp] = useState(false);

  const money = moneyOf(props.money);
  const main = mainRecordChip(chips);

  return (
    <Sheet open={open} title={essentials?.name || copy.state.noIdentity} copy={copy} onClose={onClose} variant="mobile-h92" tight>
      <div className="msgv5" data-details-sheet>
        {loading || !essentials ? (
          <SummaryBlock name="" identityLabel="" next="" main="" amount="" copy={copy} loading />
        ) : (
          <SummaryBlock {...summaryFor({ essentials, tasks, chips, copy, money })} copy={copy} />
        )}

        <div className="mx-next" data-details-shortcuts>
          <Btn size="xl" variant="secondary" onClick={() => onAction("revise_offer")} data-shortcut="revise_offer">
            {copy.tray.offer}
          </Btn>
          <Btn size="xl" variant="primary" onClick={() => onAction("request_payment")} data-shortcut="request_payment">
            {copy.panel.money.requestPayment}
          </Btn>
          <Btn size="xl" variant="secondary" onClick={() => onAction("add_items")} data-shortcut="add_items">
            {copy.panel.addItem}
          </Btn>
        </div>

        <PanelSection title={copy.panel.client.title} open={openClient} copy={copy} variant="mobile" onToggle={() => setOpenClient((v) => !v)}>
          {essentials ? (
            <dl className="sum-grid" data-panel-client>
              <dt>{copy.idCapture.name}</dt>
              <dd>{essentials.customer.name || copy.state.noIdentity}</dd>
              <dt>{copy.idCapture.phone}</dt>
              <dd>{essentials.customer.phone ?? ""}</dd>
              <dt>{copy.idCapture.email}</dt>
              <dd>{essentials.customer.email ?? ""}</dd>
              {props.clientHistoryLabel ? <dd>{props.clientHistoryLabel}</dd> : null}
            </dl>
          ) : (
            <Skeleton rows={2} variant="mobile" copy={copy} />
          )}
          <Btn size="sm" onClick={() => onAction("open_client")} data-open-client>
            {copy.panel.open}
          </Btn>
        </PanelSection>

        <PanelSection title={itemsLabel} open={openItems} copy={copy} variant="mobile" count={props.items ? props.items.length : null} onToggle={() => setOpenItems((v) => !v)}>
          {props.itemsLoading ? (
            <Skeleton rows={2} variant="mobile" copy={copy} />
          ) : props.items && props.items.length > 0 ? (
            props.items.map((line) => (
              <LineEditorRow
                key={line.id}
                variant="mobile"
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
            <EmptyState small variant="mobile" title={copy.panel.itemsEmpty} />
          )}
        </PanelSection>

        <PanelSection title={copy.panel.money.title} open={openMoney} copy={copy} variant="mobile" onToggle={() => setOpenMoney((v) => !v)}>
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
            <EmptyState small variant="mobile" title={copy.panel.money.none} />
          )}
        </PanelSection>

        <PanelSection title={copy.panel.files.title} open={openFiles} copy={copy} variant="mobile" count={props.filesCount ?? null} onToggle={() => setOpenFiles((v) => !v)}>
          <Btn size="sm" onClick={() => onAction("add_file")}>
            {copy.tray.file}
          </Btn>
        </PanelSection>

        <PanelSection title={copy.panel.notes.title} open={openNotes} copy={copy} variant="mobile" count={props.notesCount ?? null} onToggle={() => setOpenNotes((v) => !v)}>
          <Btn size="sm" onClick={() => onAction("add_note")}>
            {copy.tray.thisConversation}
          </Btn>
        </PanelSection>

        <PanelSection title={copy.panel.followUp.title} open={openFollowUp} count={props.nextReminderLabel ?? null} copy={copy} variant="mobile" onToggle={() => setOpenFollowUp((v) => !v)}>
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
    </Sheet>
  );
}
