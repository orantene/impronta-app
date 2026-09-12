"use client";

/**
 * DevicesScreen + ConnectionScreen — M27 and M28.
 *
 * `POSDevices`: six device cards (card reader, receipt printer, kitchen
 * printer, scanner, customer display, cash drawer), each with a status pill
 * and an action, then `WHILE THE READER IS OFF` and `INTERNET`.
 *
 * `POSConnection`: the `No internet since …` card with `Try again`, `YOU
 * CAN`, `CARD READER`, and `WAITING TO SYNC`.
 *
 * EVERY STATUS IS A FACT THE CALLER READ. The card reader is
 * `reportTerminalAvailability` on the server; the scanner is the keyboard
 * wedge listener (always listening on the Sell screen); the customer display
 * is the beacon (`display-beacon.ts`); the internet is `navigator.onLine`.
 * The receipt printer, kitchen printer and cash drawer have no driver, so
 * their status is `Not set up` and their action is disabled with the
 * sentence. Nothing is queued offline (D-POS-5: online + cash-only degraded
 * mode), so `WAITING TO SYNC` says so instead of counting (D-POS-29).
 */

import { AlertTriangle, CreditCard, Eye, FileText, Flame, Scan, Wallet, type LucideProps } from "lucide-react";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";
import { DeviceRegistryPanel, OutboxSyncPanel } from "./device-registry-panel";
import { POS_EYEBROW, POS_OUTLINE_ACTION, POS_PILL, POS_PILL_CORAL, POS_PILL_GREEN, POS_PILL_RED, POS_PILL_SLATE, POS_SECONDARY_ACTION, POS_TOTAL_ROW } from "./pos-classes";

export type DeviceState = "ready" | "off" | "notSetUp" | "closed";

export type PosDeviceRow = {
  readonly id: "reader" | "receiptPrinter" | "kitchenPrinter" | "scanner" | "display" | "drawer";
  readonly title: string;
  readonly detail: string;
  readonly state: DeviceState;
  readonly action: string;
  /** Present when the action does something; absent draws it disabled with `reason`. */
  readonly onAction?: () => void;
  readonly reason?: string;
};

export type DevicesCopy = {
  readonly title: string;
  readonly subtitle: string;
  readonly ready: string;
  readonly off: string;
  readonly notSetUp: string;
  readonly closed: string;
  readonly whileOff: string;
  readonly cash: string;
  readonly links: string;
  readonly cardAtCounter: string;
  readonly refundsToCard: string;
  readonly yes: string;
  readonly no: string;
  readonly noUntil: string;
  readonly internet: string;
  readonly connection: string;
  readonly ok: string;
  readonly offline: string;
  readonly waitingToSync: string;
  readonly nothing: string;
  readonly internetNote: string;
};

const ICON: Record<PosDeviceRow["id"], ComponentType<LucideProps>> = {
  reader: CreditCard,
  receiptPrinter: FileText,
  kitchenPrinter: Flame,
  scanner: Scan,
  display: Eye,
  drawer: Wallet,
};

function StatePill({ state, copy }: { state: DeviceState; copy: DevicesCopy }) {
  const tone = state === "ready" ? POS_PILL_GREEN : state === "off" ? POS_PILL_RED : state === "closed" ? POS_PILL_SLATE : POS_PILL_CORAL;
  const label = state === "ready" ? copy.ready : state === "off" ? copy.off : state === "closed" ? copy.closed : copy.notSetUp;
  return <span className={cn(POS_PILL, tone, "px-3 py-1 text-[13px]")}>{label}</span>;
}

export function DevicesScreen({ devices, online, linksAvailable, copy }: { readonly devices: readonly PosDeviceRow[]; readonly online: boolean; readonly linksAvailable: boolean; readonly copy: DevicesCopy }) {
  const readerOff = devices.find((d) => d.id === "reader")?.state === "off";
  return (
    <div data-pos-devices className="grid min-h-0 flex-1 grid-cols-2 content-start gap-4 overflow-y-auto px-6 py-5">
      {devices.map((device) => {
        const Icon = ICON[device.id];
        return (
          <div
            key={device.id}
            data-pos-device={device.id}
            className={cn(
              "flex items-center gap-3.5 rounded-[16px] border-[1.5px] bg-admin-card px-4 py-4",
              device.state === "off" ? "border-admin-red/50" : "border-admin-border",
            )}
          >
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-admin-surface-alt text-admin-ink">
              <Icon aria-hidden size={22} strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-semibold text-admin-ink">{device.title}</span>
              <span className="block truncate text-[14px] text-admin-ink-muted">{device.detail}</span>
            </span>
            <StatePill state={device.state} copy={copy} />
            <button
              type="button"
              disabled={!device.onAction}
              title={device.reason}
              onClick={device.onAction}
              className={cn(device.state === "off" ? POS_OUTLINE_ACTION : POS_SECONDARY_ACTION, "h-11 px-4 text-[14px]")}
            >
              {device.action}
              {device.reason && <span className="sr-only">{device.reason}</span>}
            </button>
          </div>
        );
      })}
      <div className="rounded-[16px] border-[1.5px] border-admin-border bg-admin-card px-4 pb-2 pt-4">
        <p className={cn(POS_EYEBROW, "m-0 mb-1")}>{copy.whileOff}</p>
        {[
          [copy.cash, copy.yes],
          [copy.links, linksAvailable ? copy.yes : copy.no],
          [copy.cardAtCounter, readerOff ? copy.noUntil : copy.no],
          [copy.refundsToCard, copy.no],
        ].map(([label, value]) => (
          <div key={label} className={POS_TOTAL_ROW}>
            <span className="text-admin-ink-muted">{label}</span>
            <span className="font-semibold text-admin-ink">{value}</span>
          </div>
        ))}
      </div>
      <div className="rounded-[16px] border-[1.5px] border-admin-border bg-admin-card px-4 pb-3 pt-4">
        <p className={cn(POS_EYEBROW, "m-0 mb-1")}>{copy.internet}</p>
        <div className={POS_TOTAL_ROW}>
          <span className="text-admin-ink-muted">{copy.connection}</span>
          <span className={cn("font-semibold", online ? "text-admin-ink" : "text-admin-red")}>{online ? copy.ok : copy.offline}</span>
        </div>
        <div className={POS_TOTAL_ROW}>
          <span className="text-admin-ink-muted">{copy.waitingToSync}</span>
          <span className="font-semibold text-admin-ink">{copy.nothing}</span>
        </div>
        <p className="m-0 mt-3 text-[14px] leading-relaxed text-admin-ink-muted">{copy.internetNote}</p>
      </div>
      <DeviceRegistryPanel />
    </div>
  );
}

export type ConnectionCopy = {
  readonly title: string;
  readonly subtitle: string;
  readonly offlineTitle: string;
  readonly offlineDetail: string;
  readonly onlineTitle: string;
  readonly onlineDetail: string;
  readonly tryAgain: string;
  readonly youCan: string;
  readonly sellCash: string;
  readonly catalog: string;
  readonly holdResume: string;
  readonly takeCard: string;
  readonly lastPlaces: string;
  readonly refund: string;
  readonly yes: string;
  readonly no: string;
  readonly noNeedsConnection: string;
  readonly cardReader: string;
  readonly readerConnected: string;
  readonly readerOff: string;
  readonly readerNote: string;
  readonly waitingToSync: string;
  readonly nothingQueued: string;
  readonly syncNow: string;
};

export function ConnectionScreen({ online, readerReady, onTryAgain, copy }: { readonly online: boolean; readonly readerReady: boolean; readonly onTryAgain: () => void; readonly copy: ConnectionCopy }) {
  const rows: Array<[string, string]> = [
    [copy.sellCash, online ? copy.yes : copy.noNeedsConnection],
    [copy.catalog, copy.yes],
    [copy.holdResume, online ? copy.yes : copy.noNeedsConnection],
    [copy.takeCard, copy.no],
    [copy.lastPlaces, online ? copy.yes : copy.noNeedsConnection],
    [copy.refund, copy.no],
  ];
  return (
    <div data-pos-connection className="grid min-h-0 flex-1 grid-cols-2 content-start gap-4 overflow-y-auto px-6 py-5">
      <div className="rounded-[16px] border-[1.5px] border-admin-border bg-admin-card px-4 py-4">
        <div className="flex items-start gap-3.5">
          <span className={cn("inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full", online ? "bg-admin-success-soft text-admin-success" : "bg-admin-critical-soft text-admin-red")}>
            <AlertTriangle aria-hidden size={20} strokeWidth={1.75} />
          </span>
          <span>
            <span className="block text-[17px] font-semibold text-admin-ink">{online ? copy.onlineTitle : copy.offlineTitle}</span>
            <span className="block text-[14px] text-admin-ink-muted">{online ? copy.onlineDetail : copy.offlineDetail}</span>
          </span>
        </div>
        <button type="button" onClick={onTryAgain} className={cn(POS_OUTLINE_ACTION, "mt-4 w-full")}>
          {copy.tryAgain}
        </button>
      </div>
      <div className="rounded-[16px] border-[1.5px] border-admin-border bg-admin-card px-4 py-4">
        <p className={cn(POS_EYEBROW, "m-0 mb-2")}>{copy.cardReader}</p>
        <span className={cn(POS_PILL, readerReady ? POS_PILL_GREEN : POS_PILL_RED, "px-3 py-1 text-[13px]")}>
          {readerReady ? copy.readerConnected : copy.readerOff}
        </span>
        <p className="m-0 mt-3 text-[14px] leading-relaxed text-admin-ink-muted">{copy.readerNote}</p>
      </div>
      <div className="rounded-[16px] border-[1.5px] border-admin-border bg-admin-card px-4 pb-2 pt-4">
        <p className={cn(POS_EYEBROW, "m-0 mb-1")}>{copy.youCan}</p>
        {rows.map(([label, value]) => (
          <div key={label} className={POS_TOTAL_ROW}>
            <span className="text-admin-ink-muted">{label}</span>
            <span className="text-right font-semibold text-admin-ink">{value}</span>
          </div>
        ))}
      </div>
      <div className="rounded-[16px] border-[1.5px] border-admin-border bg-admin-card px-4 py-4">
        <p className={cn(POS_EYEBROW, "m-0 mb-2")}>{copy.waitingToSync}</p>
        <OutboxSyncPanel />
      </div>
    </div>
  );
}
