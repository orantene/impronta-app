export const directoryMigrations: Record<
  number,
  (old: unknown) => unknown
> = {
  /**
   * v1 → v2 — turn the "From $X" starting-price chip ON for every persisted
   * section. `showPriceFrom` existed in the v1 schema (default false) but the
   * Editor toggle was deliberately hidden (#649: no data shipped to cards),
   * so every stored `false` is a materialized default, never a tenant's
   * choice. v2 ships the offerings-backed chip enabled; tenants who don't
   * want it now have a real toggle to turn it off, and that choice persists
   * at v2.
   */
  1: (old) => ({
    ...(typeof old === "object" && old !== null ? old : {}),
    showPriceFrom: true,
  }),
};
