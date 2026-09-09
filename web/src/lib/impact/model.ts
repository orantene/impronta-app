/**
 * IMPACT PREVIEW — the shape of "here is what confirming will actually do".
 *
 * All three delivered blueprints ask for the same thing in different words:
 * before an operator confirms a destructive or money-moving action, show the
 * MONEY that moves, the ALLOCATION that is taken or released, the PROMISE made
 * to a guest, and the MESSAGE that will be sent. Today each surface improvises
 * that as a sentence in a confirm dialog, and the sentences are wrong in a
 * consistent way: they describe the action ("Cancel this event?") rather than
 * its consequences ("47 admissions void, €2,350 refunded, 47 emails sent").
 *
 * WHY THIS IS A MODEL AND NOT JUST A COMPONENT. The interesting decisions are
 * not visual. They are: does the operator get a confirm button at all; is an
 * empty preview "nothing happens" or "we could not work it out"; and may two
 * currencies be added together. Each of those has a wrong answer that ships
 * silently if it lives inside JSX, so they live here as pure functions with
 * tests, and the component renders what they decide.
 *
 * THE THREE STATES ARE DELIBERATELY NOT TWO.
 *
 *   ready with effects     — we computed the consequences, here they are
 *   ready with no effects  — we computed them and there are none
 *   unavailable            — we could not compute them
 *
 * Collapsing the last two into "render nothing" is the failure this file
 * exists to prevent. An operator who sees a blank preview reads it as "this is
 * harmless" and clicks; if the preview was blank because the availability read
 * timed out, the click is the one that cancels 47 tickets without warning. So
 * `unavailable` carries a reason, renders as a warning, and — this is the part
 * that matters — refuses the confirm.
 *
 * BLOCKERS ARE NOT WARNINGS. A blocker means the action cannot legally proceed
 * (a component of the bundle cannot be reserved, the deposit was already
 * applied, the pool is inactive). `impactIsConfirmable` returns false and the
 * caller must disable its own confirm control. It is a separate list rather
 * than an effect with a `tone` because a tone is a styling decision and this is
 * a permission decision — a future refactor may restyle every tone in the file
 * and must not be able to turn a blocker into a shrug.
 */

/**
 * The four consequence channels, in the order an operator reads them.
 *
 * The order is fixed here rather than at each call site, because "money last"
 * is exactly how a preview gets skimmed past. Money is what an operator is
 * accountable for; it goes first, always.
 */
export const IMPACT_CHANNELS = ["money", "allocation", "promise", "message"] as const;

export type ImpactChannel = (typeof IMPACT_CHANNELS)[number];

export interface ImpactEffect {
  readonly channel: ImpactChannel;
  /** One line, already localized by the caller. */
  readonly summary: string;
  /** Optional second line: the detail that explains the summary. */
  readonly detail?: string;
  /**
   * Signed integer cents. Negative leaves the business (a refund), positive
   * arrives. Only meaningful on the `money` channel; carried rather than
   * formatted so the totals below can be computed instead of parsed back out
   * of a string.
   */
  readonly amountCents?: number;
  /** ISO 4217, uppercase. Required whenever `amountCents` is present. */
  readonly currency?: string;
  /** Units affected — seats, admissions, covers, recipients. */
  readonly count?: number;
}

export interface ImpactBlocker {
  readonly summary: string;
  readonly detail?: string;
}

export type Impact =
  | {
      readonly status: "ready";
      readonly effects: readonly ImpactEffect[];
      readonly blockers: readonly ImpactBlocker[];
    }
  | {
      readonly status: "unavailable";
      /** Shown to the operator verbatim. "We could not reach the pool", not "500". */
      readonly reason: string;
    };

/**
 * May the caller offer a confirm control?
 *
 * THREE REFUSALS, AND THE THIRD IS THE ONE PEOPLE ARGUE WITH. Unavailable
 * refuses because we do not know the consequences. A blocker refuses because
 * the action is illegal. An empty ready preview ALSO refuses — and it must,
 * because "confirm this action, which does nothing" is either a bug in the
 * caller's impact computation or an action the operator does not need. The
 * cost of the refusal is a support ticket; the cost of allowing it is a
 * confirm button whose preview taught the operator that blank means safe.
 */
export function impactIsConfirmable(impact: Impact): boolean {
  if (impact.status !== "ready") return false;
  if (impact.blockers.length > 0) return false;
  return impact.effects.length > 0;
}

export interface ImpactGroup {
  readonly channel: ImpactChannel;
  readonly effects: readonly ImpactEffect[];
}

/**
 * Group effects by channel in `IMPACT_CHANNELS` order, dropping empty channels.
 *
 * Order WITHIN a channel is the caller's insertion order and is preserved on
 * purpose: a caller that lists "refund the ticket" then "refund the booking
 * fee" is describing a sequence, and re-sorting it by amount would turn a
 * sequence into a leaderboard.
 */
export function groupImpact(effects: readonly ImpactEffect[]): readonly ImpactGroup[] {
  return IMPACT_CHANNELS.map((channel) => ({
    channel,
    effects: effects.filter((effect) => effect.channel === channel),
  })).filter((group) => group.effects.length > 0);
}

export interface ImpactMoneyTotal {
  readonly currency: string;
  readonly amountCents: number;
}

/**
 * Totals PER CURRENCY, never across.
 *
 * A tenant selling in EUR and USD has two totals, and the only honest way to
 * present them is side by side. Summing them requires an exchange rate, an
 * as-of timestamp and a rounding rule, none of which a confirm dialog has any
 * business inventing — and the failure mode of inventing them is a preview
 * that says €1,000 above a refund that pays out €1,140.
 *
 * Sorted by currency code so the same set of effects always renders in the
 * same order; a total that reorders between two renders of the same dialog
 * reads as a number that changed.
 */
export function impactMoneyTotals(
  effects: readonly ImpactEffect[],
): readonly ImpactMoneyTotal[] {
  const byCurrency = new Map<string, number>();
  for (const effect of effects) {
    if (effect.channel !== "money") continue;
    if (typeof effect.amountCents !== "number") continue;
    // An amount with no currency is not a small formatting problem, it is an
    // unattributable number. Dropping it would understate the total silently,
    // so it is skipped here AND surfaced by `impactMoneyIsAttributable` below,
    // which the component uses to refuse to show a total it knows is short.
    if (!effect.currency) continue;
    const currency = effect.currency.toUpperCase();
    byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + effect.amountCents);
  }
  return [...byCurrency.entries()]
    .map(([currency, amountCents]) => ({ currency, amountCents }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

/**
 * False when any money effect carries an amount with no currency — i.e. when
 * the totals above are provably incomplete.
 *
 * The component shows the per-effect lines either way and suppresses the TOTAL,
 * because a total that is quietly short is worse than no total: the lines are
 * individually true, and the sum is the only part a hurried operator reads.
 */
export function impactMoneyIsAttributable(effects: readonly ImpactEffect[]): boolean {
  return !effects.some(
    (effect) =>
      effect.channel === "money" &&
      typeof effect.amountCents === "number" &&
      !effect.currency,
  );
}

/**
 * Total units across a channel — the "47 admissions", "12 covers" number.
 *
 * Effects with no `count` contribute nothing rather than one. A caller that
 * omits the count is saying "this affects the booking", not "this affects one
 * of something", and inventing the 1 produces a headline number that is the
 * count of BULLET POINTS rather than the count of anything real.
 */
export function impactCount(
  effects: readonly ImpactEffect[],
  channel: ImpactChannel,
): number {
  return effects.reduce(
    (sum, effect) =>
      effect.channel === channel && typeof effect.count === "number"
        ? sum + effect.count
        : sum,
    0,
  );
}

/**
 * Format an integer-cent amount for a preview line.
 *
 * Deliberately NOT a general money formatter — this one always shows the sign,
 * because the whole question a preview answers is which way the money moves.
 * `Intl` renders -1234 as "-€12.34" in most locales, which is what we want;
 * the explicit `+` for inbound amounts is added here because no locale does it
 * and "€12.34" next to "-€12.34" is a difference of one character in a list an
 * operator is skimming.
 */
export function formatImpactAmount(
  amountCents: number,
  currency: string,
  locale = "en",
): string {
  const formatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
  return amountCents > 0 ? `+${formatted}` : formatted;
}
