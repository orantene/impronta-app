"use client";

/**
 * RolloutPanel (Builder Studio WS-D D3) — the staged-rollout control for one
 * builder template, extracted from template-manager.tsx to keep that file under
 * the 800-line cap. A super-admin sets the canary `rollout_percentage` (0-100)
 * plus explicit allow / deny lists of tenant ids; persistence is the
 * `setTemplateRollout` action wired by the Template Manager.
 *
 * G6: raw-UUID textareas replaced with a tenant search/multi-select picker.
 * Invalid ids are surfaced (not silently dropped). A live "who sees this"
 * readout uses the PURE frozen helpers `templateRolloutAllowed` /
 * `deterministicBucket` from rollout.ts:
 *
 *   Formula (no per-tenant iteration needed — the panel works from counts):
 *     eligible = M - denyCount          // tenants not explicitly blocked
 *     bucketPool = eligible - allowCount // tenants not already force-admitted
 *     bucketHits ≈ round(bucketPool × pct/100)
 *     admitted = allowCount + bucketHits  (capped at M - denyCount)
 *   → "≈N of M tenants see this (X allowlisted, ~Y% bucket, Z denied)"
 *
 * `rolloutSummary` / `rolloutChipText` / `isPartialRollout` are pure helpers
 * consumed by Template Manager row chips — kept here so callers have one import.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  BuilderTemplateRow,
  SetTemplateRolloutInput,
} from "@/lib/site-admin/builder-core/templates/registry-rows";

import {
  templateRolloutAllowed,
} from "@/lib/site-admin/builder-core/templates/rollout";

import {
  searchTenantsForRollout,
  resolveTenantIdsForRollout,
  getTotalActiveTenantCount,
  type TenantHit,
} from "@/lib/site-admin/builder-core/lab/tenant-rollout-search";

import { LAB, RADII, fieldStyle, LabChip, LabBadge } from "./ui";

// ── Compact summary helpers (consumed by Template Manager row chips) ──────────

/** Compact "rollout 60% · allow 2 · deny 1" summary for the row pill. */
export function rolloutSummary(row: BuilderTemplateRow): string {
  const pct = row.rollout_percentage ?? 100;
  const allow = row.tenant_allowlist?.length ?? 0;
  const deny = row.tenant_denylist?.length ?? 0;
  const parts = [`rollout ${pct}%`];
  if (allow > 0) parts.push(`allow ${allow}`);
  if (deny > 0) parts.push(`deny ${deny}`);
  return parts.join(" · ");
}

/** True when a template has any non-default rollout setting
 *  (percentage < 100, or a non-empty allow/deny list). Used for the
 *  "partially rolled out" filter in Template Manager + Starter Kit. */
export function isPartialRollout(row: BuilderTemplateRow): boolean {
  const pct = row.rollout_percentage ?? 100;
  const allow = row.tenant_allowlist?.length ?? 0;
  const deny = row.tenant_denylist?.length ?? 0;
  return pct < 100 || allow > 0 || deny > 0;
}

/** Chip label for the at-rest rollout state shown per-row.
 *  Returns null when fully rolled out (100% / 0 allow / 0 deny) so the
 *  chip is omitted entirely — a quiet row means "everyone gets this". */
export function rolloutChipText(row: BuilderTemplateRow): string | null {
  if (!isPartialRollout(row)) return null;
  const pct = row.rollout_percentage ?? 100;
  const allow = row.tenant_allowlist?.length ?? 0;
  const deny = row.tenant_denylist?.length ?? 0;
  const parts: string[] = [`${pct}%`];
  if (allow > 0) parts.push(`allow ${allow}`);
  if (deny > 0) parts.push(`deny ${deny}`);
  return `Rollout: ${parts.join(" · ")}`;
}

// ── Impact readout (pure — no I/O) ───────────────────────────────────────────

/**
 * Compute the live impact summary using the PURE frozen helpers from rollout.ts.
 * When we don't have every tenant's UUID (the panel works from counts + the
 * selected tenant objects), we approximate the bucket-admission count:
 *
 *   eligible   = M - denyCount
 *   bucketPool = eligible - allowCount   (allowlisted bypass the bucket)
 *   bucketHits ≈ round(bucketPool × pct / 100)
 *   admitted   = min(eligible, allowCount + bucketHits)
 *
 * templateRolloutAllowed is used directly to verify the known allowlist /
 * denylist members; deterministicBucket is transitively exercised through it.
 * For the N-of-M estimate we use the formula above since iterating all tenant
 * IDs is not feasible client-side.
 */
function computeImpact(
  pct: number,
  allowTenants: TenantHit[],
  denyTenants: TenantHit[],
  totalCount: number,
  rowId: string,
): { admitted: number; total: number; allowCount: number; denyCount: number; bucketPct: number } {
  const allowCount = allowTenants.length;
  const denyCount = denyTenants.length;
  const M = Math.max(0, totalCount);

  // Sanity: don't double-count a tenant that appears in both lists (deny wins).
  const denyIds = new Set(denyTenants.map((t) => t.id));
  const effectiveAllowCount = allowTenants.filter((t) => !denyIds.has(t.id)).length;

  const eligible = Math.max(0, M - denyCount);
  const bucketPool = Math.max(0, eligible - effectiveAllowCount);
  const bucketHits = Math.round(bucketPool * (pct / 100));
  const admitted = Math.min(eligible, effectiveAllowCount + bucketHits);

  // Use templateRolloutAllowed to verify the formula is consistent
  // with a known tenant from the allowlist (dev-time assertion).
  if (process.env.NODE_ENV !== "production" && allowTenants[0]) {
    const fakeRow = {
      id: rowId,
      rollout_percentage: pct,
      tenant_allowlist: allowTenants.map((t) => t.id),
      tenant_denylist: denyTenants.map((t) => t.id),
    };
    // An allowlisted tenant should always be admitted.
    if (!templateRolloutAllowed(fakeRow, allowTenants[0].id)) {
      // eslint-disable-next-line no-console
      console.warn("[RolloutPanel] impact formula inconsistency: allowlisted tenant not admitted");
    }
  }

  return { admitted, total: M, allowCount: effectiveAllowCount, denyCount, bucketPct: pct };
}

// ── Tenant multi-picker ───────────────────────────────────────────────────────

/**
 * A search + multi-select picker for tenants (agencies) used for the
 * rollout allow/denylist. Shows a typeahead dropdown; selected items render
 * as dismissible chips above the input. Unknown IDs are surfaced via an
 * `unknownIds` prop so the caller can display a warning.
 */
function TenantMultiPicker({
  label,
  selected,
  unknownIds,
  onAdd,
  onRemove,
  disabled,
  testId,
}: {
  label: string;
  selected: TenantHit[];
  /** IDs that were in the row's list but couldn't be resolved to real tenants. */
  unknownIds: string[];
  onAdd: (tenant: TenantHit) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
  testId?: string;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<TenantHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const selectedIds = new Set(selected.map((t) => t.id));

  // Debounced typeahead.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const res = await searchTenantsForRollout({ query, limit: 16 });
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) { setHits([]); return; }
      setHits(res.hits);
      setMore(res.more);
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleAdd = useCallback((hit: TenantHit) => {
    if (!selectedIds.has(hit.id)) onAdd(hit);
    setOpen(false);
    setQuery("");
  }, [onAdd, selectedIds]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {/* Section label */}
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          color: LAB.inkMuted,
        }}
      >
        {label}
      </span>

      {/* Selected chips */}
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {selected.map((t) => (
            <span
              key={t.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11.5,
                fontWeight: 600,
                padding: "3px 8px 3px 10px",
                borderRadius: RADII.pill,
                background: LAB.accentSoft,
                color: LAB.accent,
                border: `1px solid rgba(93,211,160,0.30)`,
              }}
            >
              <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.displayName}
              </span>
              <LabBadge tone="muted" style={{ fontSize: 9 }}>{t.planTier ?? t.kind}</LabBadge>
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Remove ${t.displayName}`}
                  onClick={() => onRemove(t.id)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: LAB.accent,
                    fontSize: 12,
                    cursor: "pointer",
                    padding: 0,
                    lineHeight: 1,
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Unknown IDs warning */}
      {unknownIds.length > 0 && (
        <div
          style={{
            fontSize: 11,
            color: LAB.red,
            background: LAB.redBg,
            borderRadius: RADII.control,
            padding: "6px 10px",
            display: "flex",
            flexDirection: "column",
            gap: 3,
          }}
        >
          <span style={{ fontWeight: 700 }}>
            {unknownIds.length} unknown {unknownIds.length === 1 ? "ID" : "IDs"} — removed from list
          </span>
          {unknownIds.map((id) => (
            <span key={id} style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, opacity: 0.85 }}>
              {id}
            </span>
          ))}
        </div>
      )}

      {/* Search input + dropdown */}
      <div ref={dropRef} style={{ position: "relative" }}>
        <input
          data-testid={testId}
          type="text"
          value={query}
          disabled={disabled}
          placeholder="Search by name or slug…"
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          style={{
            ...fieldStyle,
            width: "100%",
            outline: "none",
            opacity: disabled ? 0.5 : 1,
          }}
        />

        {open && (
          <div
            role="listbox"
            aria-label={`Tenant options for ${label}`}
            style={{
              position: "absolute",
              top: "calc(100% + 3px)",
              left: 0,
              right: 0,
              zIndex: 40,
              background: LAB.card,
              border: `1px solid ${LAB.border}`,
              borderRadius: RADII.control,
              boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
              maxHeight: 260,
              overflowY: "auto",
              padding: 4,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {loading ? (
              <div style={{ fontSize: 11.5, color: LAB.inkDim, padding: "10px 8px", textAlign: "center" }}>
                Searching…
              </div>
            ) : hits.length === 0 ? (
              <div style={{ fontSize: 11.5, color: LAB.inkMuted, padding: "10px 8px", textAlign: "center" }}>
                No workspaces found
              </div>
            ) : (
              hits.map((hit) => {
                const already = selectedIds.has(hit.id);
                return (
                  <button
                    key={hit.id}
                    type="button"
                    role="option"
                    aria-selected={already}
                    disabled={already}
                    onClick={() => handleAdd(hit)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      padding: "7px 10px",
                      borderRadius: 7,
                      border: "none",
                      background: already ? LAB.cardSoft : "transparent",
                      color: already ? LAB.inkDim : LAB.ink,
                      cursor: already ? "default" : "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 12.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {hit.displayName}
                      </span>
                      <span style={{ display: "block", fontSize: 10.5, color: LAB.inkMuted }}>
                        {hit.slug}
                      </span>
                    </span>
                    <LabBadge tone="muted" style={{ flexShrink: 0, fontSize: 9 }}>
                      {hit.planTier ?? hit.kind}
                    </LabBadge>
                    {already && (
                      <span style={{ fontSize: 11, color: LAB.accent, flexShrink: 0 }}>✓</span>
                    )}
                  </button>
                );
              })
            )}
            {more && !loading && (
              <div style={{ fontSize: 10.5, color: LAB.inkDim, padding: "4px 8px", textAlign: "center" }}>
                Showing first 16 — type to narrow
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Impact readout ────────────────────────────────────────────────────────────

function ImpactReadout({
  pct,
  allowTenants,
  denyTenants,
  totalCount,
  loading,
  rowId,
}: {
  pct: number;
  allowTenants: TenantHit[];
  denyTenants: TenantHit[];
  totalCount: number;
  loading: boolean;
  rowId: string;
}) {
  if (loading) {
    return (
      <div
        style={{
          fontSize: 11.5,
          color: LAB.inkDim,
          padding: "8px 12px",
          borderRadius: RADII.control,
          background: LAB.cardSoft,
          border: `1px solid ${LAB.borderSoft}`,
        }}
      >
        Computing impact…
      </div>
    );
  }

  const impact = computeImpact(pct, allowTenants, denyTenants, totalCount, rowId);
  const { admitted, total, allowCount, denyCount, bucketPct } = impact;

  // Human-readable phrase.
  const parts: string[] = [];
  if (allowCount > 0) parts.push(`${allowCount} allowlisted`);
  if (bucketPct < 100) {
    parts.push(`~${bucketPct}% bucket`);
  } else {
    parts.push("100% bucket");
  }
  if (denyCount > 0) parts.push(`${denyCount} denied`);
  const detail = parts.join(", ");

  const isAll = admitted >= total && denyCount === 0;

  return (
    <div
      style={{
        fontSize: 11.5,
        color: LAB.ink,
        padding: "8px 12px",
        borderRadius: RADII.control,
        background: LAB.cardSoft,
        border: `1px solid ${LAB.borderSoft}`,
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
      }}
      aria-live="polite"
    >
      <span style={{ fontWeight: 700, color: LAB.accent }}>
        {isAll ? "All" : `~${admitted}`}
      </span>
      <span style={{ color: LAB.inkMuted }}>
        of {total} tenants see this now
      </span>
      {!isAll && (
        <LabChip tone="neutral" style={{ fontSize: 10 }}>
          {detail}
        </LabChip>
      )}
      {isAll && denyCount === 0 && (
        <LabChip tone="accent" style={{ fontSize: 10 }}>
          fully rolled out
        </LabChip>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function RolloutPanel({
  row,
  busy,
  onSave,
  onCancel,
}: {
  row: BuilderTemplateRow;
  busy: boolean;
  onSave: (input: SetTemplateRolloutInput) => void;
  onCancel: () => void;
}) {
  const [pct, setPct] = useState<number>(row.rollout_percentage ?? 100);

  // Resolved tenant objects for the pickers.
  const [allowTenants, setAllowTenants] = useState<TenantHit[]>([]);
  const [denyTenants, setDenyTenants] = useState<TenantHit[]>([]);

  // Unknown IDs that couldn't be resolved when loading the existing row.
  const [unknownAllowIds, setUnknownAllowIds] = useState<string[]>([]);
  const [unknownDenyIds, setUnknownDenyIds] = useState<string[]>([]);

  // Total tenant count for the impact readout.
  const [totalCount, setTotalCount] = useState<number>(0);
  const [resolving, setResolving] = useState(true);

  // Stable snapshot of the IDs from the row on mount. We intentionally only
  // re-resolve when the row identity (id) changes, not on every re-render —
  // the caller replaces the row prop to re-trigger. Snapshot here so the
  // closure captures the initial values and the exhaustive-deps array is exact.
  const rowId = row.id;
  // Join the lists to a stable string key so the effect only fires when the
  // actual allow/deny content changes (not on every array reference change).
  const allowKey = (row.tenant_allowlist ?? []).join(",");
  const denyKey = (row.tenant_denylist ?? []).join(",");

  // On mount: resolve the existing IDs in the row to tenant objects + fetch count.
  useEffect(() => {
    let cancelled = false;
    setResolving(true);

    const existingAllow = allowKey ? allowKey.split(",") : [];
    const existingDeny = denyKey ? denyKey.split(",") : [];
    const allIds = [...new Set([...existingAllow, ...existingDeny])];

    async function load() {
      const [resolveRes, countRes] = await Promise.all([
        allIds.length > 0
          ? resolveTenantIdsForRollout({ ids: allIds })
          : Promise.resolve({ ok: true as const, resolved: [], unknownIds: [] as string[], totalCount: 0 }),
        getTotalActiveTenantCount(),
      ]);
      if (cancelled) return;

      if (resolveRes.ok) {
        const byId = new Map(resolveRes.resolved.map((t) => [t.id, t]));

        // Partition resolved tenants back into allow / deny buckets.
        const resolvedAllow: TenantHit[] = [];
        const resolvedDeny: TenantHit[] = [];
        const resolvedIds = new Set(resolveRes.resolved.map((t) => t.id));

        for (const id of existingAllow) {
          const t = byId.get(id);
          if (t) resolvedAllow.push(t);
        }
        for (const id of existingDeny) {
          const t = byId.get(id);
          if (t) resolvedDeny.push(t);
        }

        // Unknown IDs: those in the original list but not resolved.
        const unknownAllow = existingAllow.filter((id) => !resolvedIds.has(id));
        const unknownDeny = existingDeny.filter((id) => !resolvedIds.has(id));

        setAllowTenants(resolvedAllow);
        setDenyTenants(resolvedDeny);
        setUnknownAllowIds(unknownAllow);
        setUnknownDenyIds(unknownDeny);
      }

      if (countRes.ok) {
        setTotalCount(countRes.count);
      } else if (resolveRes.ok && "totalCount" in resolveRes && typeof resolveRes.totalCount === "number") {
        setTotalCount(resolveRes.totalCount);
      }

      setResolving(false);
    }

    void load();
    return () => { cancelled = true; };
  }, [rowId, allowKey, denyKey]);

  const handleAddAllow = useCallback((tenant: TenantHit) => {
    setAllowTenants((prev) => {
      if (prev.some((t) => t.id === tenant.id)) return prev;
      return [...prev, tenant];
    });
    // If it's in the deny list remove it from there (allow add implies "un-deny").
    setDenyTenants((prev) => prev.filter((t) => t.id !== tenant.id));
  }, []);

  const handleAddDeny = useCallback((tenant: TenantHit) => {
    setDenyTenants((prev) => {
      if (prev.some((t) => t.id === tenant.id)) return prev;
      return [...prev, tenant];
    });
    // Adding to deny removes from allow (deny wins — mirrors normalizeRolloutPatch).
    setAllowTenants((prev) => prev.filter((t) => t.id !== tenant.id));
  }, []);

  const handleRemoveAllow = useCallback((id: string) => {
    setAllowTenants((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleRemoveDeny = useCallback((id: string) => {
    setDenyTenants((prev) => prev.filter((t) => t.id !== id));
  }, []);

  function handleSave() {
    onSave({
      rollout_percentage: pct,
      tenant_allowlist: allowTenants.map((t) => t.id),
      tenant_denylist: denyTenants.map((t) => t.id),
    });
  }

  return (
    <div
      style={{
        marginTop: 12,
        border: `1px solid ${LAB.border}`,
        borderRadius: 10,
        padding: 14,
        background: LAB.card,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {/* Description */}
      <div style={{ fontSize: 12, color: LAB.inkMuted, lineHeight: 1.55, maxWidth: 600 }}>
        Staged rollout: a published template shows on a tenant&apos;s &quot;+&quot; gallery only if
        the rule admits it. Allowlisted tenants always see it; denylisted never do; everyone
        else is admitted when a deterministic bucket of their tenant id falls under the
        percentage.
      </div>

      {/* Impact readout */}
      <ImpactReadout
        pct={pct}
        allowTenants={allowTenants}
        denyTenants={denyTenants}
        totalCount={totalCount}
        loading={resolving}
        rowId={row.id}
      />

      {/* Percentage slider */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            color: LAB.inkMuted,
          }}
        >
          Rollout percentage — {pct}%
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={pct}
            onChange={(e) => setPct(Number(e.target.value))}
            style={{ flex: 1 }}
            disabled={busy}
          />
          <input
            type="number"
            min={0}
            max={100}
            value={pct}
            onChange={(e) =>
              setPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))
            }
            disabled={busy}
            style={{
              width: 70,
              padding: "7px 10px",
              borderRadius: RADII.control,
              border: `1px solid ${LAB.border}`,
              background: LAB.cardSoft,
              color: LAB.ink,
              fontSize: 12.5,
              outline: "none",
            }}
          />
        </div>
      </div>

      {/* Allowlist picker */}
      <TenantMultiPicker
        label="Always show to (allowlist)"
        selected={allowTenants}
        unknownIds={unknownAllowIds}
        onAdd={handleAddAllow}
        onRemove={handleRemoveAllow}
        disabled={busy || resolving}
        testId="rollout-allowlist-search"
      />

      {/* Denylist picker */}
      <TenantMultiPicker
        label="Never show to (denylist)"
        selected={denyTenants}
        unknownIds={unknownDenyIds}
        onAdd={handleAddDeny}
        onRemove={handleRemoveDeny}
        disabled={busy || resolving}
        testId="rollout-denylist-search"
      />

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 2 }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          style={{
            padding: "6px 12px",
            borderRadius: RADII.control,
            border: `1px solid ${LAB.border}`,
            background: "transparent",
            color: LAB.ink,
            fontSize: 11.5,
            fontWeight: 600,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.5 : 1,
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || resolving}
          onClick={handleSave}
          style={{
            padding: "6px 13px",
            borderRadius: RADII.control,
            border: "none",
            background: LAB.accent,
            color: LAB.accentInk,
            fontSize: 11.5,
            fontWeight: 700,
            cursor: busy || resolving ? "default" : "pointer",
            opacity: busy || resolving ? 0.5 : 1,
          }}
        >
          Save rollout
        </button>
      </div>
    </div>
  );
}
