/**
 * TUL-1113: the ONE first-paint budget for the talent dashboard loaders
 * (Resenas, Servicios, Today). PM decision 2026-10-21: 2 s.
 *
 * A loader on these screens is time-boxed to this budget and falls back to its
 * empty / null state instead of holding the first paint. The shared test
 * (`src/lib/quality/talent-loader-budget.static.test.ts`) fails when a loader
 * stops using this constant or a longer literal comes back.
 *
 * Plain constant on purpose: imported by server components and client hooks.
 */
export const TALENT_LOADER_BUDGET_MS = 2_000;
