import "server-only";

/**
 * Age gates, enforced server-side instead of printed on a page.
 *
 * THE DEFECT THIS CLOSES. `events.age_gate` and `talent_offering_variants.age_gate`
 * have existed since 20261229000361 and 20261229000364. The public event page
 * renders "Ages 18+". Nothing else in the system has ever read either column:
 * `createPurchase` did not, the ticket picker did not, the door did not. An 18+
 * show sold tickets to anybody who could type an email, and the only place the
 * restriction existed was a line of copy above the button.
 *
 *
 * WHAT "ENFORCED" CAN HONESTLY MEAN HERE
 * ══════════════════════════════════════
 * There is no date of birth anywhere in this schema. `customers` does not carry
 * one, guest checkout is genuinely account-less by design (L-decision, and the
 * `customers` header argues it), and inventing a DOB field would mean collecting
 * a special category of personal data from every buyer of every product to gate
 * the small minority of events that need it.
 *
 * So the enforceable artefact is an ATTESTATION: the buyer states, at the point
 * of purchase, that they meet the stated minimum, and the system records what
 * was stated, when, and against which minimum. Three things follow, and all
 * three are improvements on the current nothing:
 *
 *   1. A purchase of a gated ticket that carries no attestation is REFUSED.
 *      Today it succeeds silently. This is the change that matters: the gate
 *      becomes a thing the server can fail on rather than a thing the client
 *      may or may not have drawn.
 *   2. An attestation below the minimum is refused with a different reason, so
 *      the picker can say "this event is 18+" rather than "something went
 *      wrong".
 *   3. The stated age is persisted on the order, so the door has a record and a
 *      chargeback or a licensing question has an answer.
 *
 * WHAT IT DELIBERATELY DOES NOT CLAIM. An attestation is a promise, not proof.
 * The real check is a human looking at an ID at the door, and this module's job
 * is to make sure that human knows a check is required — which is why
 * `requiredAgeGate` is also what the door screen reads. Pretending an online
 * checkbox is age verification would be worse than the defect: it would let a
 * venue believe it had complied.
 *
 *
 * STRICTEST WINS, ACROSS BOTH SOURCES
 * ═══════════════════════════════════
 * A gate can sit on the EVENT ("this show is 18+") or on a TICKET TIER ("the
 * bar package is 21+ even though the show is 18+"). An order is one purchase by
 * one buyer, so the whole order takes the highest minimum any of its lines
 * demands, for the same reason `resolvePurchasePolicy` applies the strictest
 * cancellation window and refuses a cart that is half pay-in-person: a cart is
 * charged once and cannot be half-legal.
 */

import { logServerError } from "@/lib/server/safe-error";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

/** Where a minimum came from, so the refusal can name it. */
export type AgeGateSource = "event" | "ticket_tier";

export type AgeGate = {
  readonly minimumAge: number;
  readonly source: AgeGateSource;
  /** The event or tier the gate is written on, for the message. */
  readonly label: string | null;
};

/**
 * The buyer's statement. `null` means they were never asked, which is a
 * different refusal from "they said 16" — the first is a client that has not
 * been updated, the second is a person who may not come in.
 */
export type AgeAttestation = { readonly confirmedAge: number } | null;

export type AgeGateVerdict =
  | { ok: true; requiredMinimumAge: number | null; confirmedAge: number | null }
  | {
      ok: false;
      reason: "age_gate_unconfirmed" | "age_gate_below_minimum";
      requiredMinimumAge: number;
      message: string;
    };

/** The strictest gate across a purchase, or null when nothing is gated. */
export function strictestAgeGate(gates: readonly AgeGate[]): AgeGate | null {
  let strictest: AgeGate | null = null;
  for (const gate of gates) {
    if (!Number.isInteger(gate.minimumAge) || gate.minimumAge <= 0) continue;
    if (!strictest || gate.minimumAge > strictest.minimumAge) strictest = gate;
  }
  return strictest;
}

/**
 * Rule on one purchase.
 *
 * Ungated purchases pass without an attestation and without asking for one:
 * demanding an age declaration to buy a coffee would be the kind of blanket
 * data collection this design exists to avoid.
 */
export function ruleOnAgeGate(input: {
  gates: readonly AgeGate[];
  attestation: AgeAttestation;
}): AgeGateVerdict {
  const gate = strictestAgeGate(input.gates);
  if (!gate) {
    // A volunteered age against no gate is DISCARDED, not stored. A client that
    // collected an age and then had its gated line removed — or raced an
    // operator lowering the gate — would otherwise hand us an answer to a
    // question nobody asked, and keeping it would be the blanket collection
    // this module's header refuses. `age_gate_min_age IS NULL` means nothing in
    // the basket was gated, and that has to stay true of the whole triple.
    return { ok: true, requiredMinimumAge: null, confirmedAge: null };
  }

  const stated = input.attestation?.confirmedAge;
  if (stated == null || !Number.isFinite(stated)) {
    return {
      ok: false,
      reason: "age_gate_unconfirmed",
      requiredMinimumAge: gate.minimumAge,
      message: `This one is ${gate.minimumAge}+. Please confirm your age to continue.`,
    };
  }

  if (Math.trunc(stated) < gate.minimumAge) {
    return {
      ok: false,
      reason: "age_gate_below_minimum",
      requiredMinimumAge: gate.minimumAge,
      message: `This one is ${gate.minimumAge}+, so we cannot sell it to you.`,
    };
  }

  return { ok: true, requiredMinimumAge: gate.minimumAge, confirmedAge: Math.trunc(stated) };
}

/** The three `orders` columns, which move together or not at all. */
export type AgeGateStamp = {
  readonly age_gate_min_age: number | null;
  readonly age_gate_confirmed_age: number | null;
  readonly age_gate_confirmed_at: string | null;
};

/**
 * Turn a passing verdict into the columns to persist.
 *
 * WHY THIS IS A FUNCTION AND NOT THREE LINES AT THE INSERT. It was three lines
 * at the insert, and they disagreed: two read straight off the verdict while
 * the third was conditional on the minimum, so an ungated basket carrying an
 * attestation produced `min = NULL, confirmed_age = 21, confirmed_at = NULL`.
 *
 * `orders_age_gate_paired` is a CHECK requiring all three or none, so that
 * triple is not a slightly-wrong record — it is a REFUSED INSERT. The buyer
 * confirmed their age and got "Could not start the order", on the one path
 * where money and capacity are about to move. It was invisible until the
 * constraint reached an environment the purchase path actually runs in.
 *
 * Deriving all three from one branch is what makes the disagreement
 * unrepresentable rather than merely fixed.
 */
export function ageGateStamp(
  verdict: Extract<AgeGateVerdict, { ok: true }>,
  nowIso: string,
): AgeGateStamp {
  if (verdict.requiredMinimumAge == null || verdict.confirmedAge == null) {
    return { age_gate_min_age: null, age_gate_confirmed_age: null, age_gate_confirmed_at: null };
  }
  return {
    age_gate_min_age: verdict.requiredMinimumAge,
    age_gate_confirmed_age: verdict.confirmedAge,
    age_gate_confirmed_at: nowIso,
  };
}

export type LoadAgeGatesResult =
  | { ok: true; gates: AgeGate[] }
  /** The READ failed. A retry, not a verdict — never treated as "no gate". */
  | { ok: false };

/**
 * Every gate a purchase's lines touch.
 *
 * FAILS CLOSED, and that is the opposite of this codebase's usual parser rule
 * for a reason. A parser that cannot read stored data returns nothing because
 * an empty page is better than a crash. A gate that cannot read its own
 * restriction and returns "no restriction" sells an 18+ ticket to a child
 * because the database was briefly slow. So an unreadable gate refuses the
 * purchase, and the caller reports it as a retry rather than a verdict.
 */
export async function loadAgeGates(
  admin: Admin,
  input: {
    tenantId: string;
    lines: ReadonlyArray<{ variantId?: string | null; sessionId?: string | null }>;
  },
): Promise<LoadAgeGatesResult> {
  const variantIds = [...new Set(input.lines.map((l) => l.variantId).filter((v): v is string => !!v))];
  const sessionIds = [...new Set(input.lines.map((l) => l.sessionId).filter((v): v is string => !!v))];
  const gates: AgeGate[] = [];

  if (variantIds.length > 0) {
    const { data, error } = await admin
      .from("talent_offering_variants")
      .select("id, label, age_gate")
      .in("id", variantIds);
    if (error) {
      logServerError("orders.loadAgeGates/variants", error);
      return { ok: false };
    }
    for (const row of (data ?? []) as Array<{ label: string | null; age_gate: number | null }>) {
      if (row.age_gate != null) {
        gates.push({ minimumAge: Math.trunc(Number(row.age_gate)), source: "ticket_tier", label: row.label });
      }
    }
  }

  if (sessionIds.length > 0) {
    // Two hops, because the gate lives on the EVENT and the line binds a
    // SESSION. Done as two reads rather than an embedded select so a change to
    // the foreign-key naming cannot silently return an empty embed — which
    // PostgREST does without an error, and which would read here as "no gate".
    const { data: sessionRows, error: sErr } = await admin
      .from("sessions")
      .select("id, event_id")
      .eq("tenant_id", input.tenantId)
      .in("id", sessionIds);
    if (sErr) {
      logServerError("orders.loadAgeGates/sessions", sErr);
      return { ok: false };
    }
    const eventIds = [
      ...new Set(
        ((sessionRows ?? []) as Array<{ event_id: string | null }>)
          .map((r) => r.event_id)
          .filter((v): v is string => !!v),
      ),
    ];
    if (eventIds.length > 0) {
      const { data: eventRows, error: eErr } = await admin
        .from("events")
        .select("id, title, age_gate")
        .eq("tenant_id", input.tenantId)
        .in("id", eventIds);
      if (eErr) {
        logServerError("orders.loadAgeGates/events", eErr);
        return { ok: false };
      }
      for (const row of (eventRows ?? []) as Array<{ title: string | null; age_gate: number | null }>) {
        if (row.age_gate != null) {
          gates.push({ minimumAge: Math.trunc(Number(row.age_gate)), source: "event", label: row.title });
        }
      }
    }
  }

  return { ok: true, gates };
}
