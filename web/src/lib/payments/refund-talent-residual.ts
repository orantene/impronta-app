/**
 * A partial refund that is bigger than the platform + workspace buffer leaves a residual the
 * seller already received in a paid-out talent leg. The talent is never auto-clawed, so a
 * person has to recover it. Until now that was only a server log line (paid run #2, 2026-10-09:
 * "talent NOT auto-clawed; needs manual reconciliation" with nothing visible in the books).
 *
 * This stamps the refund row (`metadata.needs_attention`), the same shape the failed-refund stamp
 * uses, so Admin > Payments > Refunds shows it. Idempotent.
 */
import { logServerError } from "@/lib/server/safe-error";
import { formatOrderMoney } from "@/lib/orders/money-format";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = { from: (table: string) => any };

export const TALENT_RESIDUAL_ATTENTION = "talent_residual" as const;

export function talentResidualNote(residualCents: number, currency: string): string {
  return `Talent leg already paid out; recover ${formatOrderMoney(residualCents, currency)} manually.`;
}

export function isTalentResidualAttention(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  return (metadata as Record<string, unknown>).needs_attention === TALENT_RESIDUAL_ATTENTION;
}

/** The residual as data, so each locale renders its own sentence (the stored note is English-only). */
export function talentResidualAmount(metadata: unknown): number | null {
  if (!isTalentResidualAttention(metadata)) return null;
  const c = Number((metadata as Record<string, unknown>).talent_residual_cents);
  return Number.isFinite(c) && c > 0 ? c : null;
}

/** Stamp the partial-refund row with the amount a person must recover from the talent. */
export async function flagTalentResidual(
  admin: Admin,
  input: {
    parentTransactionId: string;
    refundId: string | null;
    refundAmountCents: number;
    residualCents: number;
    nowIso?: string;
  },
): Promise<{ ok: boolean }> {
  if (!(input.residualCents > 0)) return { ok: true };
  const q = admin.from("booking_transactions").select("id, metadata, currency");
  const { data, error } = await (input.refundId
    ? q.eq("provider_refund_id", input.refundId)
    : q.eq("refund_of_transaction_id", input.parentTransactionId).eq("gross_amount_cents", input.refundAmountCents).eq("status", "refunded")
  ).maybeSingle();
  if (error || !data) {
    logServerError("payments.refundTalentResidual.lookup", error ?? new Error(`no refund row for txn ${input.parentTransactionId} refund ${input.refundId ?? "(no-id)"}`));
    return { ok: false };
  }
  const row = data as { id: string; metadata?: unknown; currency?: string | null };
  const currency = (row.currency ?? "").trim().toUpperCase();
  if (!currency) {
    logServerError("payments.refundTalentResidual.currency", new Error(`refund row ${row.id} has no currency; residual not stamped`));
    return { ok: false };
  }
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  if (meta.needs_attention === TALENT_RESIDUAL_ATTENTION) return { ok: true };
  const { error: updErr } = await admin
    .from("booking_transactions")
    .update({
      metadata: {
        ...meta,
        needs_attention: TALENT_RESIDUAL_ATTENTION,
        needs_attention_note: talentResidualNote(input.residualCents, currency),
        needs_attention_at: input.nowIso ?? new Date().toISOString(),
        talent_residual_cents: input.residualCents,
      },
    })
    .eq("id", row.id);
  if (updErr) {
    logServerError("payments.refundTalentResidual.flag", updErr);
    return { ok: false };
  }
  return { ok: true };
}
