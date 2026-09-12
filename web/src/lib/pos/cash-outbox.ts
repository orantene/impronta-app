/**
 * Client-only cash outbox. The counter may queue only cash_collect commands
 * while offline (D-POS-11, D-122). Replay is `posOutboxApply`. Provider
 * commands are not_replayable — this helper never enqueues them.
 */

export const POS_DEVICE_STORAGE_KEY = "tulala.pos.device";
export const POS_CASH_OUTBOX_KEY = "tulala.pos.cashOutbox";

export type PairedPosDevice = { deviceKey: string; deviceId: string };

export type CashOutboxItem = {
  operationKey: string;
  command: { kind: "cash_collect"; amountCents: number; orderId?: string };
};

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function readPairedDevice(): PairedPosDevice | null {
  const row = readJson<PairedPosDevice | null>(POS_DEVICE_STORAGE_KEY, null);
  if (!row?.deviceKey || !row.deviceId) return null;
  return row;
}

export function writePairedDevice(row: PairedPosDevice): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(POS_DEVICE_STORAGE_KEY, JSON.stringify(row));
}

export function readCashOutbox(): CashOutboxItem[] {
  const rows = readJson<CashOutboxItem[]>(POS_CASH_OUTBOX_KEY, []);
  return Array.isArray(rows) ? rows.filter((row) => row?.command?.kind === "cash_collect") : [];
}

export function enqueueCashCollect(item: CashOutboxItem): void {
  if (item.command.kind !== "cash_collect") return;
  const current = readCashOutbox();
  if (current.some((row) => row.operationKey === item.operationKey)) return;
  if (typeof window === "undefined") return;
  window.localStorage.setItem(POS_CASH_OUTBOX_KEY, JSON.stringify([...current, item]));
}

export function writeCashOutbox(items: CashOutboxItem[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(POS_CASH_OUTBOX_KEY, JSON.stringify(items));
}

/** Queue cash when offline. Provider kinds never enter this helper. */
export function confirmCashOrEnqueue(input: {
  online: boolean;
  orderId: string;
  amountCents: number;
  operationKey: string;
}): "queued" | "online" {
  if (input.online) return "online";
  enqueueCashCollect({
    operationKey: input.operationKey,
    command: { kind: "cash_collect", amountCents: input.amountCents, orderId: input.orderId },
  });
  return "queued";
}
