/**
 * Client-side debounce band for requests that trigger `/api/ai/search` (or hybrid paths).
 * See docs/execution-plan.md — Phase 9.
 */
export const AI_SEARCH_DEBOUNCE_MS_MIN = 250;
export const AI_SEARCH_DEBOUNCE_MS_MAX = 400;

/** Default within the band; align with directory listing query debounce where appropriate. */
export const AI_SEARCH_DEBOUNCE_MS_DEFAULT = 320;
