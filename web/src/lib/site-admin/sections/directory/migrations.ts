export const directoryMigrations: Record<
  number,
  (old: unknown) => unknown
> = {
  /**
   * v1 → v2 — turn the "From $X" starting-price chip ON for every persisted
   * section that has never had an explicit choice made about it. At the
   * time this was written, `showPriceFrom` existed in the v1 schema
   * (default false) but the Editor toggle was deliberately hidden (#649:
   * no data shipped to cards), so a `false` here meant "the schema default
   * wrote this, nobody chose it" — safe to force to `true`.
   *
   * That assumption stopped holding the moment the Editor toggle shipped:
   * `false` can now be a tenant's DELIBERATE choice (Directory Section →
   * "Mostrar precio desde" off). Because this migration re-runs on every
   * render of any payload whose stored `schemaVersion` is still 1 — which
   * includes every page-publish snapshot baked before that page's next
   * re-publish, observed to persist for hours — an unconditional overwrite
   * here silently reverts a tenant's explicit "off" back to "on" forever,
   * with the underlying `cms_sections` row (and the DB) staying correctly
   * `false` the whole time. Confirmed live on improntamodels.com: the DB
   * write was instant and correct; the rendered page never once reflected
   * it, because this line kept flipping it back on every request.
   *
   * `?? true` only fills the gap for payloads that never set the key at
   * all (the genuinely untouched, pre-toggle rows this migration was
   * written for); an explicit `false` — the only kind a modern row can
   * have, since `upsertSection` always writes the key — passes through
   * unchanged.
   */
  1: (old) => {
    const base = typeof old === "object" && old !== null ? (old as Record<string, unknown>) : {};
    return {
      ...base,
      showPriceFrom: base.showPriceFrom ?? true,
    };
  },
};
