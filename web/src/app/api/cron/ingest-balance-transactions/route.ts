/**
 * Cron — page Stripe balance transactions into `provider_balance_transactions`.
 *
 * Endpoint: GET /api/cron/ingest-balance-transactions  (CRON_SECRET bearer auth)
 *
 * Balance transactions are the only place Stripe records what it CHARGED us and
 * what FX rate it applied. Without them, gross-to-net is not derivable from our
 * own data and a bank deposit cannot be decomposed into what it settled.
 *
 * They have no reliable webhook of their own — they are created as a side effect
 * of charges, refunds, transfers, payouts and adjustments — so the supported way
 * to build a ledger from them is to page the list endpoint. That also makes this
 * self-healing: a run that fails leaves the watermark where it was, and the next
 * run re-reads the same window. Re-reading is free, because the upsert is keyed
 * on Stripe's own transaction id.
 *
 * Hourly in `web/vercel.json`. Hourly rather than daily because `available_on`
 * is what makes a balance forecast possible, and a day-stale forecast is not
 * one.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/ingest-balance-transactions
 */

import { NextResponse } from "next/server";
import { recordCronHeartbeat } from "@/lib/ops/cron-heartbeat";
import * as Sentry from "@sentry/nextjs";
import { ingestBalanceTransactions } from "@/lib/payments/balance-transactions";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/ingest-balance-transactions", "CRON_SECRET not set; refusing to run");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await ingestBalanceTransactions();

  void improntaLog("money.cron.balance_transactions", {
    ok: result.ok,
    pages: result.pages,
    fetched: result.fetched,
    written: result.written,
    truncated: result.truncated,
    windowStart: result.windowStart,
  });

  // Heartbeat on BOTH paths -- see the note in project-ledger's route.
  await recordCronHeartbeat({
    job: "ingest-balance-transactions",
    ok: result.ok,
    detail: result.ok
      ? `fetched=${result.fetched} written=${result.written} pages=${result.pages}`
      : `failed: ${result.error ?? "unknown"}`,
  });

  if (!result.ok) {
    // A failed ingest is a growing hole in the fee and FX record, and nothing
    // downstream would notice on its own. Surface it.
    try {
      Sentry.captureMessage(
        `[balance-transactions] ingest failed: ${result.error ?? "unknown"}`,
        { level: "error", tags: { cron: "ingest-balance-transactions" } },
      );
    } catch {
      // Observability must not affect the response.
    }
    // Spread only: `result` already carries ok:false. Listing `ok` before the
    // spread would let the spread overwrite it, which is a bug waiting for the
    // two values to disagree.
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}
