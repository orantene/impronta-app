/**
 * The person a customer believes they are talking to in support.
 *
 * This exists because the name used to be baked into 33 catalog strings and 6
 * source files. Renaming meant editing every one, in three locales, and missing
 * one meant a customer met two different people in the same conversation.
 * Copy now carries an `{agent}` placeholder and reads the name from here.
 *
 * The persona is deliberately a PRESENTATION concern and nothing more. It never
 * decides routing, permissions, or who is notified — those follow the real
 * account behind the ticket. Changing this file changes what a customer reads,
 * and nothing else.
 */
export const SUPPORT_AGENT = {
  /** First name shown to customers. Used in copy via the `{agent}` placeholder. */
  name: "Orlando",
  /**
   * Initial for the avatar fallback. Kept explicit rather than derived, because
   * a derived initial breaks on names that do not start with a Latin letter.
   */
  initial: "O",
  /**
   * Optional real photograph. Null renders the illustrated avatar instead.
   *
   * Deliberately empty: an invented headshot presented as a real support agent
   * would be a fabricated person. The illustrated avatar reads as an
   * illustration, which is honest. Point this at a real photo of the real human
   * whenever you want, and the avatar picks it up everywhere at once.
   */
  photoUrl: null as string | null,
} as const;

/** Convenience for `interpolate(t(key), SUPPORT_AGENT_VARS)`. */
export const SUPPORT_AGENT_VARS = { agent: SUPPORT_AGENT.name } as const;
