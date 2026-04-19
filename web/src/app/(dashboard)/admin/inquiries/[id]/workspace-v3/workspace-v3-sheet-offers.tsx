import { cn } from "@/lib/utils";
import type { OffersDrillPayload } from "./workspace-v3-drill-types";

/**
 * Admin Workspace V3 — Offers / Approvals drill body (spec §5.3.2, M5.2).
 *
 * Extends the rail panel: the same offer-level and approval-level counters
 * remain authoritative at the top (sourced from `summary`), and the sheet
 * surfaces:
 *   • The full offer version history (one row per inquiry_offers), with the
 *     current offer flagged. Ordered newest version first.
 *   • Per-talent approval rows on the current offer (name + code + status).
 *
 * Read-only in M5. Edit / send / rebuild actions continue to live in the
 * existing V2 offer editor until a later milestone moves them here.
 */
export function WorkspaceV3SheetOffers({ data }: { data: OffersDrillPayload }) {
  return (
    <div className="flex flex-col gap-3 text-[12px]">
      <CountersHeader data={data} />

      <section aria-label="Offer versions">
        <h4 className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
          Offer versions ({data.offers.length})
        </h4>
        {data.offers.length === 0 ? (
          <p className="mt-1 text-muted-foreground/80">No offers drafted yet.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {data.offers.map((o) => (
              <li
                key={o.id}
                className={cn(
                  "flex flex-col gap-0.5 rounded-md border px-2 py-1.5",
                  o.isCurrent
                    ? "border-[var(--impronta-gold,#c9a24b)]/40 bg-[var(--impronta-gold,#c9a24b)]/10"
                    : "border-border/40 bg-foreground/[0.02]",
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">
                    v{o.version}
                    {o.isCurrent ? (
                      <span className="ml-1.5 rounded-full border border-[var(--impronta-gold,#c9a24b)]/40 px-1.5 text-[10px] uppercase tracking-wide text-[var(--impronta-gold,#c9a24b)]">
                        Current
                      </span>
                    ) : null}
                  </span>
                  <OfferStatusChip status={o.status} />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground/90">
                  <span>
                    Total {formatMoney(o.totalClientPrice, o.currencyCode)}
                  </span>
                  <span>
                    Fee {formatMoney(o.coordinatorFee, o.currencyCode)}
                  </span>
                  <span>Created {formatDate(o.createdAt)}</span>
                  {o.sentAt ? <span>Sent {formatDate(o.sentAt)}</span> : null}
                  {o.acceptedAt ? (
                    <span>Accepted {formatDate(o.acceptedAt)}</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Approvals on current offer">
        <h4 className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
          Approvals · current offer
        </h4>
        {data.summary.currentOfferId == null ? (
          <p className="mt-1 text-muted-foreground/80">
            No current offer — approvals arrive once an offer is sent.
          </p>
        ) : data.currentOfferApprovals.length === 0 ? (
          <p className="mt-1 text-muted-foreground/80">
            No approvals recorded on the current offer.
          </p>
        ) : (
          <ul className="mt-1 flex flex-col gap-0.5">
            {data.currentOfferApprovals.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-2 rounded border border-border/30 bg-background/60 px-2 py-1 text-[11px]"
              >
                <span className="font-mono text-muted-foreground/80">
                  {a.profileCode || "—"}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {a.displayName ?? "Unnamed"}
                </span>
                <ApprovalStatusChip status={a.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CountersHeader({ data }: { data: OffersDrillPayload }) {
  const o = data.summary.offers;
  const a = data.summary.approvals;
  const total = o.draft + o.sent + o.accepted + o.rejected;
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border/40 bg-foreground/[0.02] px-2 py-1.5 text-[11px]">
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        <span className="text-muted-foreground/80">
          <b className="text-foreground/80">{total}</b> offer
          {total === 1 ? "" : "s"}
        </span>
        <span>
          <b className="text-foreground/80">{o.draft}</b> draft
        </span>
        <span>
          <b className="text-foreground/80">{o.sent}</b> sent
        </span>
        <span>
          <b className="text-foreground/80">{o.accepted}</b> accepted
        </span>
        <span>
          <b className="text-foreground/80">{o.rejected}</b> rejected
        </span>
      </div>
      {data.summary.currentOfferId ? (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground/80">
          <span>Current approvals:</span>
          <span>
            <b className="text-foreground/80">{a.pending}</b> pending
          </span>
          <span>
            <b className="text-foreground/80">{a.accepted}</b> accepted
          </span>
          <span>
            <b className="text-foreground/80">{a.rejected}</b> rejected
          </span>
        </div>
      ) : null}
    </div>
  );
}

function OfferStatusChip({ status }: { status: string }) {
  const tone =
    status === "accepted"
      ? "border-emerald-500/40 bg-emerald-50/60 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
      : status === "rejected"
        ? "border-rose-500/40 bg-rose-50/60 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
        : status === "sent"
          ? "border-sky-500/40 bg-sky-50/60 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300"
          : "border-border/40 bg-foreground/[0.02] text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 text-[10px] uppercase tracking-wide",
        tone,
      )}
    >
      {status}
    </span>
  );
}

function ApprovalStatusChip({
  status,
}: {
  status: "pending" | "accepted" | "rejected";
}) {
  const tone =
    status === "accepted"
      ? "border-emerald-500/40 bg-emerald-50/60 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
      : status === "rejected"
        ? "border-rose-500/40 bg-rose-50/60 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
        : "border-sky-500/40 bg-sky-50/60 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 text-[10px] uppercase tracking-wide",
        tone,
      )}
    >
      {status}
    </span>
  );
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
