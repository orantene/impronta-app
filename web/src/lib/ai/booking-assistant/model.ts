/**
 * Pinned booking-assistant model id.
 *
 * Verified against Anthropic's published Haiku 5.5 id (`claude-haiku-5-5`,
 * fixed id, no date suffix) and enrolled in `AI_ROUTE_MODEL_OPTIONS`.
 * `model.test.ts` fails if this drifts off the allow-list.
 */

export const BOOKING_ASSISTANT_MODEL = "claude-haiku-5-5";
