/**
 * projects-mode-model.ts — every judgement the Projects point of sale mode
 * makes, PURE. No database, no clock, no React.
 *
 * THE MODE COMPUTES NO MONEY. Every figure here comes off a `ProjectRecord`
 * through `projectMoney` / `balanceOwedCents` in `lib/projects/project-record.ts`,
 * which asks the orders desk's own rule (`isMoneyOwed`, `outstandingCents`).
 * That rule is what prove-money verified on the QA host: a cancelled order and
 * a draft order move nothing. This module only decides WHICH order to collect
 * against, HOW MUCH the operator may ask for, and WHETHER the design allows
 * Collect right now.
 *
 * THE COLLECT GATE IS STRICTER THAN THE PROJECT PAGE'S. `nextProjectAction`
 * suppresses Collect while a DELIVERABLE is waiting on the client. The mode
 * additionally refuses while an AGREEMENT version is waiting on the client (a
 * sent or drafted amendment on top of an accepted version): the design boards
 * (O06, O07) forbid collecting under terms the client has not agreed to, and
 * the accepted version's balance may be about to change. Both refusals are
 * sentences, never a missing button.
 */

import {
  acceptedAgreement,
  balanceOwedCents,
  liveAgreement,
  milestonesAwaitingApproval,
  nextProjectAction,
  projectMoney,
  type ProjectAction,
  type ProjectBalance,
  type ProjectRecord,
} from "@/lib/projects/project-record";

// ── Finding a client or project ──────────────────────────────────────

export type ProjectsModeRow = {
  readonly id: string;
  readonly title: string;
  readonly clientName: string | null;
  readonly currency: string;
  /** Owed on the project, by the desk's rule. */
  readonly dueCents: number;
  readonly collectedCents: number;
  readonly action: ProjectAction;
  readonly collect: CollectVerdict;
};

export function projectsModeRow(project: ProjectRecord): ProjectsModeRow {
  const money = projectMoney(project);
  return {
    id: project.id,
    title: project.title,
    clientName: project.clientName,
    currency: project.currency,
    dueCents: money.dueCents,
    collectedCents: money.collectedCents,
    action: nextProjectAction(project),
    collect: collectVerdict(project),
  };
}

function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Rows matching a typed name, due first, then by title.
 *
 * An empty query lists everything (the operator has not typed yet), still due
 * first: the landing action is "Collect a balance", so the projects with money
 * owed are the ones a person standing at the desk came for. Matching is on the
 * client name and the project title, accent- and case-insensitive, so "sofia"
 * finds "Sofía".
 */
export function findProjects(
  rows: readonly ProjectsModeRow[],
  query: string,
): ProjectsModeRow[] {
  const needle = normalise(query);
  const hits = needle
    ? rows.filter(
        (r) =>
          normalise(r.title).includes(needle)
          || normalise(r.clientName ?? "").includes(needle),
      )
    : rows.slice();
  return hits.sort((a, b) => {
    const aDue = a.collect.ok ? 1 : 0;
    const bDue = b.collect.ok ? 1 : 0;
    if (aDue !== bDue) return bDue - aDue;
    if (a.dueCents !== b.dueCents) return b.dueCents - a.dueCents;
    return a.title.localeCompare(b.title);
  });
}

// ── May money be collected on this project right now ─────────────────

export type CollectRefusal =
  | "project_closed"
  | "agreement_awaiting"
  | "milestone_awaiting"
  | "nothing_owed"
  | "mixed_currency";

export type CollectVerdict =
  | {
      readonly ok: true;
      /** The one order the collection is taken against. */
      readonly orderId: string;
      readonly outstandingCents: number;
      readonly currency: string;
    }
  | { readonly ok: false; readonly reason: CollectRefusal };

/**
 * The order a collection is taken against: the OLDEST attached order that the
 * desk says is owed. One record at a time, by ruling (`notBuilt.allocation`
 * on the project page: choosing which unpaid record a payment applies to is
 * not recorded anywhere). Deterministic so two tablets pick the same one.
 */
export function collectableBalance(project: ProjectRecord): ProjectBalance | null {
  const owed = project.balances.filter((b) => balanceOwedCents(b) > 0);
  if (owed.length === 0) return null;
  // `balances` arrive in reader order, which is not a promise; sort by id so the
  // choice is stable across renders and devices.
  return owed.slice().sort((a, b) => a.orderId.localeCompare(b.orderId))[0] ?? null;
}

export function collectVerdict(project: ProjectRecord): CollectVerdict {
  if (project.status === "cancelled" || project.status === "archived") {
    return { ok: false, reason: "project_closed" };
  }
  if (milestonesAwaitingApproval(project).length > 0) {
    return { ok: false, reason: "milestone_awaiting" };
  }
  const live = liveAgreement(project);
  const accepted = acceptedAgreement(project);
  // A draft or sent version on top of an accepted one is an amendment the
  // client has not agreed to. A draft or sent version with NOTHING accepted is
  // the original offer still out. Either way the terms are not settled.
  if (live && live.status !== "accepted") {
    return { ok: false, reason: "agreement_awaiting" };
  }
  // Nothing accepted and nothing live: no terms exist, so nothing is owed
  // under them even if a stray order is attached.
  if (!accepted) return { ok: false, reason: "nothing_owed" };
  const money = projectMoney(project);
  if (money.mixedCurrency) return { ok: false, reason: "mixed_currency" };
  const balance = collectableBalance(project);
  if (!balance) return { ok: false, reason: "nothing_owed" };
  return {
    ok: true,
    orderId: balance.orderId,
    outstandingCents: balanceOwedCents(balance),
    currency: balance.currency,
  };
}

// ── How much: the whole balance, or a deposit ────────────────────────

export type CollectAmount =
  | { readonly kind: "balance"; readonly cents: number }
  | { readonly kind: "deposit"; readonly cents: number };

export type AmountRefusal = "not_a_number" | "zero" | "over_balance";

export type AmountVerdict =
  | { readonly ok: true; readonly amount: CollectAmount }
  | { readonly ok: false; readonly reason: AmountRefusal };

/**
 * The amount this collection asks for.
 *
 * A deposit is typed in major units, as a person writes it, and must be more
 * than zero and less than what is outstanding: a "deposit" equal to the
 * balance IS the balance and is recorded as such, and one above it is refused
 * here before the engine refuses it as `amount` (the engine's word for
 * "someone else got there first", which would be the wrong sentence).
 */
export function collectAmount(input: {
  outstandingCents: number;
  mode: "balance" | "deposit";
  depositText: string;
  minorUnitDivisor: number;
}): AmountVerdict {
  if (input.mode === "balance") {
    return { ok: true, amount: { kind: "balance", cents: input.outstandingCents } };
  }
  const raw = input.depositText.trim().replace(",", ".");
  if (raw === "" || !/^\d+(\.\d{1,2})?$/.test(raw)) {
    return { ok: false, reason: "not_a_number" };
  }
  const cents = Math.round(Number(raw) * input.minorUnitDivisor);
  if (!Number.isInteger(cents) || cents <= 0) return { ok: false, reason: "zero" };
  if (cents > input.outstandingCents) return { ok: false, reason: "over_balance" };
  if (cents === input.outstandingCents) {
    return { ok: true, amount: { kind: "balance", cents } };
  }
  return { ok: true, amount: { kind: "deposit", cents } };
}

// ── Receipts ─────────────────────────────────────────────────────────

/**
 * A typed receipt code, as `/r/<code>` accepts it: the page refuses anything
 * shorter than 16 or longer than 64 characters, and codes are opaque
 * alphanumerics. Whitespace a person pastes around it is dropped; anything
 * else is refused here rather than sent to the database.
 */
export function normaliseReceiptCode(raw: string): string | null {
  const code = raw.trim();
  if (code.length < 16 || code.length > 64) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(code)) return null;
  return code;
}
