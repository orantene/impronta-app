/**
 * Cron — project money events into the ledger.
 *
 * Endpoint: GET /api/cron/project-ledger  (CRON_SECRET bearer auth)
 *
 * The ledger is DERIVED from the provider-truth tables and the commission
 * snapshots rather than written in the hot path. "What is missing" is computed
 * from deterministic group ids on every run, so there is no cursor to corrupt
 * and no watermark to fall behind: a failed run changes nothing, and the next
 * run does exactly the same work.
 *
 * That also means this endpoint IS the backfill. Running it by hand and running
 * it on a schedule are the same operation.
 *
 * Hourly at :50 in `web/vercel.json`, deliberately AFTER the balance-transaction
 * ingest at :35, so the processing fees this projects are already in place
 * rather than a cycle behind.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/project-ledger
 */

import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { runLedgerProjection } from "@/lib/ledger/run-projection";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/project-ledger", "CRON_SECRET not set; refusing to run");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runLedgerProjection();

  const refusedTotal =
    result.bookingPayments.refused +
    result.processingFees.refused +
    result.invoices.refused +
    result.payouts.refused;

  void improntaLog("money.cron.ledger_projection", {
    ok: result.ok,
    bookingPayments: result.bookingPayments,
    processingFees: result.processingFees,
    invoices: result.invoices,
    payouts: result.payouts,
    refusedTotal,
  });

  // A refusal is a money event the books cannot express. It is not fatal to the
  // run — the rest still projects — but it must not pass silently, because the
  // ledger is then knowingly incomplete.
  if (refusedTotal > 0) {
    try {
      Sentry.captureMessage(
        `[ledger] ${refusedTotal} source(s) refused projection`,
        {
          level: "error",
          extra: { refusals: result.refusals },
          tags: { cron: "project-ledger" },
        },
      );
    } catch {
      // Observability must not affect the response.
    }
  }

  if (!result.ok) {
    return NextResponse.json(result, { status: 500 });
  }
  return NextResponse.json(result);
}
