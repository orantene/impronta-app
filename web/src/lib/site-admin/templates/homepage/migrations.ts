/**
 * Homepage template migrations. Each function upgrades a payload from
 * version N to N+1. Keys are source versions.
 *
 * Currently v1 is the only version; no migrations defined yet. When v2
 * lands, add `1: (old) => ({...})` here.
 */
export const homepageMigrations: Record<number, (old: unknown) => unknown> = {};
