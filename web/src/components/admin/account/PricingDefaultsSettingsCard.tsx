"use client";

/**
 * PricingDefaultsSettingsCard — set the "From $X" a directory card shows when
 * a talent has not priced themselves.
 *
 * Product context: a starting price is one of the strongest signals a client
 * uses to shortlist talent, but on a fresh roster almost nobody has entered
 * services yet, so nearly every card shows nothing. Rather than ask an agency
 * to edit 40 profiles, they state their standard rate per category once here.
 *
 * The copy is deliberately explicit that these numbers are PUBLIC, and about
 * the two rules that protect talent:
 *   1. a talent's own published price always wins;
 *   2. a talent who chose "quote on request" is never overridden.
 */

import { useCallback, useEffect, useState } from "react";

import {
  EMPTY_PRICING_DEFAULTS,
  MAX_DEFAULT_PRICE_CENTS,
  MIN_DEFAULT_PRICE_CENTS,
  type TalentTypeOption,
  type TenantPricingDefaults,
} from "@/lib/directory/pricing-defaults-shape";
import {
  loadTenantPricingDefaultsAction,
  updateTenantPricingDefaults,
} from "@/lib/server-actions/admin-pricing-defaults";

/** Cents <-> whole-currency for the inputs (operators think in dollars). */
const toUnits = (cents: number | null) => (cents == null ? "" : String(cents / 100));
const toCents = (units: string): number | null => {
  const n = Number(units.trim());
  if (!units.trim() || !Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
};

export function PricingDefaultsSettingsCard() {
  const [state, setState] = useState<TenantPricingDefaults>(EMPTY_PRICING_DEFAULTS);
  const [types, setTypes] = useState<TalentTypeOption[]>([]);
  const [status, setStatus] = useState<"loading" | "idle" | "saving" | "saved" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadTenantPricingDefaultsAction().then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setState(res.data);
        setTypes(res.talentTypes);
        setStatus("idle");
      } else {
        setError(res.error);
        setStatus("error");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async (next: TenantPricingDefaults) => {
    setState(next);
    setStatus("saving");
    setError(null);
    const res = await updateTenantPricingDefaults(next);
    if (res.ok) {
      setStatus("saved");
      window.setTimeout(() => setStatus("idle"), 1800);
    } else {
      setError(res.error);
      setStatus("error");
    }
  }, []);

  if (status === "loading") {
    return (
      <p className="text-sm text-muted-foreground">Loading pricing defaults…</p>
    );
  }

  const minUnits = MIN_DEFAULT_PRICE_CENTS / 100;
  const maxUnits = MAX_DEFAULT_PRICE_CENTS / 100;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            Show a starting price when talent have not set one
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            These amounts appear publicly on directory cards as
            &quot;From&nbsp;$X&quot;. A talent&apos;s own published price always
            wins, and anyone who chose &quot;quote on request&quot; is never
            overridden.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={state.enabled}
            onChange={(e) => void save({ ...state, enabled: e.target.checked })}
            className="size-4 accent-[var(--tulala-accent,#c8a04a)]"
          />
          <span>{state.enabled ? "On" : "Off"}</span>
        </label>
      </div>

      {state.enabled ? (
        <>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Currency
              </span>
              <input
                type="text"
                value={state.currency}
                maxLength={3}
                onChange={(e) =>
                  setState({ ...state, currency: e.target.value.toUpperCase() })
                }
                onBlur={() => void save(state)}
                className="h-9 w-24 rounded-md border border-border bg-background px-3 text-sm uppercase"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Default for everyone
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={minUnits}
                max={maxUnits}
                placeholder="e.g. 200"
                value={toUnits(state.globalFromCents)}
                onChange={(e) =>
                  setState({ ...state, globalFromCents: toCents(e.target.value) })
                }
                onBlur={() => void save(state)}
                className="h-9 w-36 rounded-md border border-border bg-background px-3 text-sm"
              />
            </label>
          </div>

          {types.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Per talent type (overrides the default above)
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {types.map((t) => (
                  <label
                    key={t.slug}
                    className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm">
                      {t.label}
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        · {t.talentCount}
                      </span>
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={minUnits}
                      max={maxUnits}
                      placeholder="—"
                      value={toUnits(state.byTypeSlug[t.slug] ?? null)}
                      onChange={(e) => {
                        const cents = toCents(e.target.value);
                        const next = { ...state.byTypeSlug };
                        if (cents == null) delete next[t.slug];
                        else next[t.slug] = cents;
                        setState({ ...state, byTypeSlug: next });
                      }}
                      onBlur={() => void save(state)}
                      className="h-8 w-24 shrink-0 rounded-md border border-border bg-background px-2 text-sm"
                    />
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {/* Explicit state on every save — never a silent wait. */}
      <p
        className="text-xs"
        role="status"
        aria-live="polite"
        style={{
          color:
            status === "error"
              ? "var(--destructive, #ef4444)"
              : "var(--muted-foreground)",
        }}
      >
        {status === "saving"
          ? "Saving…"
          : status === "saved"
            ? "Saved."
            : status === "error"
              ? (error ?? "Could not save.")
              : " "}
      </p>
    </div>
  );
}
