/**
 * Demo-account markers (the ONLY way a site counts as a demo for theme
 * releases and the demo pipeline; never `is_test_account`). A demo is a
 * profile code in THEME_DEMOS whose auth user carries `app_metadata.demo_batch`
 * = DEMO_BATCH and a demo email.
 */
export const DEMO_BATCH = "demo-2026-09-28";

export const DEMO_EMAIL = /^(?:[^@]+@demo\.tulala\.digital|demo-[^@]+@impronta\.test)$/;

export function isDemoAccount(email: string | null | undefined, demoBatch: unknown): boolean {
  return DEMO_EMAIL.test(email ?? "") && demoBatch === DEMO_BATCH;
}
