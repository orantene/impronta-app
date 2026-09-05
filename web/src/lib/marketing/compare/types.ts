/**
 * Head-to-head comparison pages.
 *
 * The highest commercial intent search we do not serve. Someone typing
 * "booksy alternative" has a tool, knows what it costs, and is looking for a
 * reason to move. That is a warmer visitor than any feature page reaches.
 *
 * THREE RULES, because publishing claims about someone else's pricing is a
 * factual and legal exposure, not just a copy exercise.
 *
 * 1. EVERY competitor claim is dated and sourced. Their pricing changes and
 *    ours must visibly be a snapshot, never an assertion about today.
 * 2. STATE FACTS, do not disparage. "They charge X, we charge Y" persuades.
 *    Calling them greedy does not, and invites a complaint we would lose.
 * 3. SAY WHAT THEY DO BETTER. Both of these run marketplaces with real
 *    demand and we do not. A comparison that pretends otherwise is not
 *    trustworthy, and the reader already knows, so pretending only costs us
 *    the sale.
 */

export type ComparisonRow = {
  /** What is being compared, in the reader's terms. */
  label: string;
  /** Our answer. */
  tulala: string;
  /** Theirs, as published. */
  them: string;
};

export type ComparisonContent = {
  /** Page title. Leads with intent, not with our name. */
  title: string;
  subtitle: string;
  intro: string[];
  tableHeading: string;
  rows: ComparisonRow[];
  /** Where they genuinely win. Non-empty, always. */
  honestHeading: string;
  honest: string[];
  /** Who should switch, stated plainly enough to send the wrong person away. */
  fitHeading: string;
  fit: string[];
  ctaHeading: string;
  ctaBody: string;
};

export type Comparison = {
  key: string;
  /** The competitor's name, used in the URL and the copy. */
  competitor: string;
  slugEn: string;
  slugEs: string;
  /**
   * When their pricing was last read from their own public pages. Rendered on
   * the page. A comparison without this is a claim about today that nobody
   * checked today.
   */
  pricingCheckedOn: string;
  /** Public sources, rendered as links so a reader can verify us. */
  sources: { label: string; url: string }[];
  /**
   * Optional. Set when the figures could NOT be read from the competitor's own
   * pricing page, and say why.
   *
   * The rule for these pages is that every number is verified at source. When
   * that is not possible, the honest move is to publish the limitation rather
   * than to imply a reading we did not do: a page whose entire job is being
   * checkable cannot start by overstating its own sourcing. Rendered next to
   * the checked-on date.
   */
  sourceCaveat?: { en: string; es: string };
  en: ComparisonContent;
  es: ComparisonContent;
};
