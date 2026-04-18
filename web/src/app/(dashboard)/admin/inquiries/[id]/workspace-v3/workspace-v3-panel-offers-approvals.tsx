import type { OffersApprovalsPanelData } from "./workspace-v3-panel-types";

/**
 * Admin Workspace V3 — Offers / Approvals rail panel (§5.2.3, roadmap M4.3).
 *
 * Renders two orthogonal counter rows, intentionally not conflated:
 *   • Offers  — inquiry_offers grouped by status
 *   • Approvals — inquiry_approvals on the current offer, grouped by status
 *
 * Per-talent accuracy is preserved (execution-mode brief: "do not flatten
 * into inquiry-level abstraction"). If no offer has been drafted yet, the
 * panel surfaces that state explicitly.
 */
export function WorkspaceV3PanelOffersApprovals({
  data,
}: {
  data: OffersApprovalsPanelData;
}) {
  const offerTotal =
    data.offers.draft + data.offers.sent + data.offers.accepted + data.offers.rejected;
  const hasNoOffers = offerTotal === 0;

  return (
    <div className="flex flex-col gap-2 text-[12px]">
      <section aria-label="Offers">
        <h4 className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
          Offers
        </h4>
        {hasNoOffers ? (
          <p className="mt-1 text-muted-foreground/80">No offers drafted yet.</p>
        ) : (
          <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
            <Counter label="Draft" value={data.offers.draft} />
            <Counter label="Sent" value={data.offers.sent} />
            <Counter label="Accepted" value={data.offers.accepted} />
            <Counter label="Rejected" value={data.offers.rejected} />
          </ul>
        )}
      </section>

      <section aria-label="Approvals on current offer">
        <h4 className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
          Approvals {data.currentOfferId ? "· current offer" : ""}
        </h4>
        {data.currentOfferId == null ? (
          <p className="mt-1 text-muted-foreground/80">
            No current offer — approvals arrive once an offer is sent.
          </p>
        ) : (
          <ul className="mt-1 grid grid-cols-3 gap-x-3 gap-y-0.5">
            <Counter label="Pending" value={data.approvals.pending} />
            <Counter label="Accepted" value={data.approvals.accepted} />
            <Counter label="Rejected" value={data.approvals.rejected} />
          </ul>
        )}
      </section>
    </div>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex items-baseline gap-1.5">
      <span className="min-w-[3ch] text-right font-mono font-medium text-foreground/90">
        {value}
      </span>
      <span className="text-muted-foreground/90">{label}</span>
    </li>
  );
}
