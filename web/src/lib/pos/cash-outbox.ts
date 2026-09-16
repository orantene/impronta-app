/**
 * Client-only cash outbox. The counter may queue only cash_collect commands
 * while offline (D-POS-11, D-122). Replay is `posOutboxApply`. Provider
 * commands are not_replayable — this helper never enqueues them.
 *
 * THE COMMAND SHAPE IS THE RPC'S, NOT THE CLIENT'S. `pos_outbox_apply` reads
 * `order_id` / `amount_cents` (venue.md §7; migration 20261231237000). The
 * first cut of this file queued `orderId` / `amountCents`, so every sync was
 * refused `invalid` and the item sat in localStorage forever (audit A4).
 * Rows written by that cut are normalised on read so they can still drain.
 */

export const POS_DEVICE_STORAGE_KEY = "tulala.pos.device";
export const POS_CASH_OUTBOX_KEY = "tulala.pos.cashOutbox";

export type PairedPosDevice = { deviceKey: string; deviceId: string };

/** Exactly what `pos_outbox_apply` reads. Snake_case on purpose. */
export type CashCollectCommand = {
  kind: "cash_collect";
  method: "cash";
  order_id: string;
  amount_cents: number;
};

export type CashOutboxItem = {
  operationKey: string;
  command: CashCollectCommand;
};

/**
 * Turn a stored row into the contract shape, or drop it.
 *
 * Accepts the legacy `{amountCents, orderId}` row so a till that queued cash
 * before the fix still drains after it. Anything without an order or a
 * positive amount is not a command the engine can honour and is not kept.
 */
export function normalizeCashOutboxItem(raw: unknown): CashOutboxItem | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as { operationKey?: unknown; command?: Record<string, unknown> | null };
  const command = row.command;
  if (typeof row.operationKey !== "string" || !command || typeof command !== "object") return null;
  if (command.kind !== "cash_collect") return null;
  if (typeof command.method === "string" && command.method !== "cash") return null;
  if ("provider" in command || "payment_intent" in command || "checkout_session" in command) return null;
  const orderId = command.order_id ?? command.orderId;
  const amountRaw = command.amount_cents ?? command.amountCents;
  const amount = typeof amountRaw === "number" ? Math.trunc(amountRaw) : Number(amountRaw);
  if (typeof orderId !== "string" || orderId.length === 0) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return {
    operationKey: row.operationKey,
    command: { kind: "cash_collect", method: "cash", order_id: orderId, amount_cents: amount },
  };
}

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
  const rows = readJson<unknown[]>(POS_CASH_OUTBOX_KEY, []);
  if (!Array.isArray(rows)) return [];
  const out: CashOutboxItem[] = [];
  for (const raw of rows) {
    const item = normalizeCashOutboxItem(raw);
    if (item) out.push(item);
  }
  return out;
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
    command: {
      kind: "cash_collect",
      method: "cash",
      order_id: input.orderId,
      amount_cents: Math.trunc(input.amountCents),
    },
  });
  return "queued";
}
