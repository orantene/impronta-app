import "server-only";

/**
 * The only reader of `agencies.settings.pos.approval`.
 */

import { logServerError } from "@/lib/server/safe-error";
import type { Admin } from "./sale-rows";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function customAmountLimitCentsFromSettings(settings: unknown): number {
  if (!isPlainRecord(settings)) return 0;
  const pos = isPlainRecord(settings.pos) ? settings.pos : null;
  const approval = pos && isPlainRecord(pos.approval) ? pos.approval : null;
  const raw = approval?.custom_amount_limit_cents;
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) return raw;
  if (typeof raw === "string" && /^\d+$/.test(raw)) return Number(raw);
  return 0;
}

export async function readCustomAmountLimitCents(
  admin: Admin,
  tenantId: string,
): Promise<{ ok: true; limitCents: number } | { ok: false; reason: "unavailable" }> {
  const { data, error } = await admin.from("agencies").select("settings").eq("id", tenantId).maybeSingle();
  if (error) {
    logServerError("pos.approval-settings.read", error);
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, limitCents: customAmountLimitCentsFromSettings((data as { settings?: unknown } | null)?.settings) };
}
