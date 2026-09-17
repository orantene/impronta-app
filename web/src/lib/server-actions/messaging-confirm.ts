"use server";

/**
 * S3: `messagingConfirmRecord` (board D19, owner decision 4). A sibling of
 * `messaging-engine.ts`, which sits at the 800-line cap; same guard, same
 * refusal codes. The mechanics live in `@/lib/messaging/confirm`.
 */

import { z } from "zod";

import { confirmRecord, type ConfirmResult } from "@/lib/messaging/confirm";
import { messagingStaff } from "@/lib/messaging/staff-guard";

const uuid = z.string().uuid();

const schema = z
  .object({
    inquiryId: uuid,
    source: z.enum(["offer", "draft"]),
    offerId: uuid.nullish(),
    orderId: uuid.nullish(),
    expectedVersion: z.number().int().nonnegative(),
    // Length is judged by the writer: a short reason is `deposit_required`, not `invalid`.
    overrideReason: z.string().trim().max(500).nullish(),
  })
  .refine((v) => (v.source === "offer" ? !!v.offerId : !!v.orderId), { message: "source needs its id" });

export async function messagingConfirmRecord(input: {
  inquiryId: string;
  source: "offer" | "draft";
  offerId?: string | null;
  orderId?: string | null;
  expectedVersion: number;
  overrideReason?: string | null;
}): Promise<ConfirmResult> {
  const g = await messagingStaff();
  if (!g.ok) return g;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  return confirmRecord(
    { admin: g.admin, supabase: g.supabase, tenantId: g.tenantId, actorUserId: g.userId },
    {
      inquiryId: parsed.data.inquiryId,
      source: parsed.data.source,
      offerId: parsed.data.offerId ?? null,
      orderId: parsed.data.orderId ?? null,
      expectedVersion: parsed.data.expectedVersion,
      overrideReason: parsed.data.overrideReason ?? null,
    },
  );
}
