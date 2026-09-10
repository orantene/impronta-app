"use server";

/**
 * projects-actions.ts — the Projects mode's server actions.
 *
 * ONE COLLECTION PATH. `projectsCollect` goes through `startCollection` in
 * `lib/pos/collection.ts`, the same engine the counter's Charge uses, so the
 * money, its reservation under the row lock, its idempotency, the cash drawer
 * stamp and every refusal (someone else collected first, the amount changed,
 * a product that needs a name) are the real ones. Nothing here records a
 * transaction of its own.
 *
 * THE GATE IS RE-CHECKED ON THE SERVER. The screen hides Collect while a
 * deliverable or an agreement version is waiting on the client, but a stale
 * tab can still post. The action reloads the project through the reader and
 * runs the same `collectVerdict` before it touches the engine, and refuses
 * with the mode's own reason so the sentence the operator reads is about the
 * agreement, not about a payment.
 */

import { z } from "zod";
import { headers } from "next/headers";

import { ensureCustomer } from "@/lib/customers/ensure-customer";
import { mintAdmissionsForPaidOrder } from "@/lib/events/mint-on-paid";
import { startCollection, type StartCollectionResult } from "@/lib/pos/collection";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { userHasCapability } from "@/lib/access";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import {
  collectVerdict,
  normaliseReceiptCode,
  type CollectRefusal,
} from "./projects-mode-model";
import {
  ensureReceiptCode,
  findReceiptByCode,
  loadProjectForMode,
  type ReceiptLookup,
} from "./projects-mode-loader";

const uuid = z.string().uuid();

async function staff() {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false as const, error: guard.error };
  const allowed = await userHasCapability("booking.payment.request", guard.tenantId);
  if (!allowed) return { ok: false as const, error: "not_allowed" };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, error: "unavailable" };
  return {
    ok: true as const,
    tenantId: guard.tenantId,
    userId: guard.user.id,
    tenantSlug: guard.tenantSlug,
    admin,
  };
}

/** The mode's own refusals, distinct from the engine's so each gets its own sentence. */
export type ProjectsCollectRefusal =
  | { ok: false; kind: "mode"; reason: CollectRefusal | "project_gone" | "order_changed" }
  | { ok: false; kind: "action"; error: string }
  | { ok: false; kind: "engine"; reason: Extract<StartCollectionResult, { ok: false }>["reason"]; outstandingCents?: number };

export type ProjectsCollectResult =
  | {
      ok: true;
      method: "cash";
      orderId: string;
      amountCents: number;
      tenderedCents: number;
      changeCents: number;
      outstandingAfterCents: number;
      receiptCode: string | null;
    }
  | { ok: true; method: "online_card"; orderId: string; checkoutUrl: string }
  | ProjectsCollectRefusal;

export async function projectsCollect(input: {
  projectId: string;
  orderId: string;
  method: "cash" | "online_card";
  amountCents: number;
  tenderedCents?: number;
  email?: string;
  phone?: string;
  displayName?: string;
  idempotencyKey: string;
  expectedVersion: number;
}): Promise<ProjectsCollectResult> {
  const g = await staff();
  if (!g.ok) return { ok: false, kind: "action", error: g.error };
  const parsed = z
    .object({
      projectId: uuid,
      orderId: uuid,
      method: z.enum(["cash", "online_card"]),
      amountCents: z.number().int().positive(),
      tenderedCents: z.number().int().nonnegative().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      displayName: z.string().optional(),
      idempotencyKey: z.string().min(8).max(80),
      expectedVersion: z.number().int().positive(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, kind: "action", error: "invalid" };

  // The gate, on the server, against the reader's current rows.
  const detail = await loadProjectForMode(g.tenantId, parsed.data.projectId);
  if (!detail.ok) {
    return detail.reason === "unavailable"
      ? { ok: false, kind: "action", error: "unavailable" }
      : { ok: false, kind: "mode", reason: "project_gone" };
  }
  const verdict = collectVerdict(detail.project);
  if (!verdict.ok) return { ok: false, kind: "mode", reason: verdict.reason };
  if (verdict.orderId !== parsed.data.orderId) {
    // The screen was looking at a different order than the one now owed:
    // the balance moved under it. Same sentence as the engine's `amount`.
    return { ok: false, kind: "mode", reason: "order_changed" };
  }
  if (parsed.data.amountCents > verdict.outstandingCents) {
    return { ok: false, kind: "mode", reason: "order_changed" };
  }

  // A receipt the client can open by its code, minted on the first
  // collection if the order was born without one. Idempotent.
  const receiptCode = await ensureReceiptCode(g.admin, {
    tenantId: g.tenantId,
    orderId: parsed.data.orderId,
  });

  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const proto = hdrs.get("x-forwarded-proto") === "http" ? "http" : "https";
  const base = host ? `${proto}://${host}` : "";
  const path = `/${g.tenantSlug}/admin/pos`;
  const back = `${base}${path}?mode=projects&project=${parsed.data.projectId}`;

  const result = await startCollection(
    g.admin,
    {
      tenantId: g.tenantId,
      orderId: parsed.data.orderId,
      actorUserId: g.userId,
      method: parsed.data.method,
      contact: {
        email: parsed.data.email,
        phone: parsed.data.phone,
        displayName: parsed.data.displayName,
      },
      successUrl: `${back}&collected=1`,
      cancelUrl: back,
      amountCents: parsed.data.amountCents,
      tenderedCents: parsed.data.tenderedCents,
      idempotencyKey: parsed.data.idempotencyKey,
      expectedVersion: parsed.data.expectedVersion,
    },
    {
      ensureCustomer: (c) => ensureCustomer(c, { admin: g.admin }),
      onOrderPaid: (ctx) => mintAdmissionsForPaidOrder(g.admin, ctx).then(() => undefined),
    },
  );
  if (!result.ok) {
    return {
      ok: false,
      kind: "engine",
      reason: result.reason,
      ...(result.outstandingCents !== undefined ? { outstandingCents: result.outstandingCents } : {}),
    };
  }
  if (result.method === "online_card") {
    return { ok: true, method: "online_card", orderId: result.orderId, checkoutUrl: result.checkoutUrl };
  }
  return {
    ok: true,
    method: "cash",
    orderId: result.orderId,
    amountCents: result.amountCents,
    tenderedCents: result.tenderedCents,
    changeCents: result.changeCents,
    outstandingAfterCents: result.outstandingAfterCents,
    receiptCode,
  };
}

export type ProjectsReceiptResult =
  | ReceiptLookup
  | { ok: false; reason: "invalid_code" | "not_allowed" };

/** A receipt by its public code, inside this workspace. */
export async function projectsFindReceipt(rawCode: string): Promise<ProjectsReceiptResult> {
  const g = await staff();
  if (!g.ok) {
    return g.error === "not_allowed"
      ? { ok: false, reason: "not_allowed" }
      : { ok: false, reason: "unavailable" };
  }
  const code = normaliseReceiptCode(String(rawCode ?? ""));
  if (!code) return { ok: false, reason: "invalid_code" };
  return findReceiptByCode(g.admin, { tenantId: g.tenantId, code });
}
