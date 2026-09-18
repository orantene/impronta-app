/**
 * PaymentLadder: "Request sent — Opened — Paid" (or Draft — Confirmed — Paid —
 * Fulfilled). Done steps are bold, the rest plain, a failed step reads red.
 */

export type LadderStep = { readonly label: string; readonly done: boolean; readonly failed?: boolean };

export function PaymentLadder({ steps }: { steps: readonly LadderStep[] }) {
  return (
    <div className="ladder" data-ladder>
      {steps.map((step, i) => (
        <span key={step.label} className="stop-wrap">
          {i > 0 ? <i aria-hidden="true" /> : null}
          {step.failed ? <span className="stop fail">{step.label}</span> : step.done ? <b>{step.label}</b> : <span className="stop">{step.label}</span>}
        </span>
      ))}
    </div>
  );
}

/** Build the three-step payment ladder from a payment state. */
export function paymentLadderSteps(state: string, labels: { requested: string; opened: string; paid: string; failed: string }): LadderStep[] {
  const rank: Record<string, number> = { requested: 1, opened: 2, paid: 3, refunded: 3, partially_refunded: 3 };
  const r = rank[state] ?? 0;
  const steps: LadderStep[] = [
    { label: labels.requested, done: r >= 1 },
    { label: labels.opened, done: r >= 2 },
    { label: labels.paid, done: r >= 3 },
  ];
  if (state === "failed") steps[2] = { label: labels.failed, done: false, failed: true };
  return steps;
}
