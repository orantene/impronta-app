import type { RecordChip } from "./types";

/** One `conversation_records` row as the S2 readers select it. */
export type ConversationRecordRow = {
  inquiry_id?: string;
  record_kind: RecordChip["kind"];
  record_id: string;
  payment_state?: string | null;
  fulfilment_state?: string | null;
  record_date?: string | null;
};

/**
 * S2: chips read their state from `conversation_records.payment_state` /
 * `fulfilment_state` / `record_date`, written by `messaging_sync_record_state`
 * on behalf of the POS writers. A row the writers have not synced yet still
 * carries nulls, which every consumer already treats as "unknown".
 */
export function toRecordChip(row: ConversationRecordRow): RecordChip {
  return {
    kind: row.record_kind,
    recordId: row.record_id,
    label: row.record_kind,
    paymentState: row.payment_state ?? null,
    fulfilmentState: row.fulfilment_state ?? null,
    recordDate: row.record_date ?? null,
  };
}
