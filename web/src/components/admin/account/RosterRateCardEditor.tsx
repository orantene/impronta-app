"use client";

/**
 * RosterRateCardEditor — set every talent's headline day rate from one table.
 *
 * Entering a rate used to mean opening each talent's Services tab in turn
 * (40+ page loads for a normal roster), which is why almost no roster had
 * pricing and why nearly every directory card showed no price at all.
 *
 * Edits write REAL catalog rows (see admin-roster-rates.ts), so the number
 * typed here is the number a client is quoted — not a separate display field
 * that would drift from the storefront.
 *
 * Rows are grouped by role because that is how an agency reasons about rates
 * ("all our fashion models are 500"), and a per-role fill button applies one
 * number down a group in a single gesture.
 *
 * Talents who publish "quote on request" are shown but never writable — that
 * is their decision to make on their own profile, not something to sweep over
 * from a bulk table.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { useT } from "@/i18n/use-t";
import type { RosterRateRow } from "@/lib/directory/pricing-defaults-shape";
import {
  loadRosterRates,
  saveRosterRates,
} from "@/lib/server-actions/admin-roster-rates";

const toUnits = (cents: number | null) =>
  cents == null ? "" : String(Math.round(cents / 100));

export function RosterRateCardEditor() {
  const t = useT();
  const [rows, setRows] = useState<RosterRateRow[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<
    "loading" | "idle" | "saving" | "saved" | "error"
  >("loading");
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void loadRosterRates().then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setRows(res.rows);
        setDraft(
          Object.fromEntries(
            res.rows.map((r) => [r.talentProfileId, toUnits(r.headlineCents)]),
          ),
        );
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

  const groups = useMemo(() => {
    const map = new Map<string, RosterRateRow[]>();
    for (const row of rows) {
      const key = row.roleLabel ?? t("dashboard.adminWorkspace.rosterRatesNoRole");
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [rows, t]);

  /** Only rows whose value actually changed, and that are writable. */
  const pending = useMemo(() => {
    const out: { talentProfileId: string; amountCents: number }[] = [];
    for (const row of rows) {
      if (row.quoteOnly) continue;
      const raw = (draft[row.talentProfileId] ?? "").trim();
      if (!raw) continue;
      const cents = Math.round(Number(raw) * 100);
      if (!Number.isFinite(cents) || cents <= 0) continue;
      if (cents === row.headlineCents) continue;
      out.push({ talentProfileId: row.talentProfileId, amountCents: cents });
    }
    return out;
  }, [rows, draft]);

  const fillGroup = useCallback(
    (members: RosterRateRow[], value: string) => {
      setDraft((prev) => {
        const next = { ...prev };
        for (const m of members) {
          if (!m.quoteOnly) next[m.talentProfileId] = value;
        }
        return next;
      });
    },
    [],
  );

  const save = useCallback(async () => {
    if (pending.length === 0) return;
    setStatus("saving");
    setError(null);
    const res = await saveRosterRates(pending);
    if (res.ok) {
      setSavedCount(res.updated);
      setStatus("saved");
      // Re-read so the baseline matches what is now published (a row that was
      // skipped server-side must not keep looking "changed").
      const fresh = await loadRosterRates();
      if (fresh.ok) {
        setRows(fresh.rows);
        setDraft(
          Object.fromEntries(
            fresh.rows.map((r) => [r.talentProfileId, toUnits(r.headlineCents)]),
          ),
        );
      }
      window.setTimeout(() => setStatus("idle"), 2200);
    } else {
      setError(res.error);
      setStatus("error");
    }
  }, [pending]);

  if (status === "loading") {
    return (
      <p className="text-sm text-muted-foreground">
        {t("dashboard.adminWorkspace.rosterRatesLoading")}
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("dashboard.adminWorkspace.rosterRatesEmpty")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-medium text-foreground">
          {t("dashboard.adminWorkspace.rosterRatesTitle")}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {t("dashboard.adminWorkspace.rosterRatesDesc")}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {groups.map(([role, members]) => (
          <div key={role} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {role}
                <span className="ml-1.5 normal-case tracking-normal">
                  · {members.length}
                </span>
              </p>
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                {t("dashboard.adminWorkspace.rosterRatesFillAll")}
                <input
                  type="number"
                  inputMode="decimal"
                  min={1}
                  placeholder="—"
                  onChange={(e) => fillGroup(members, e.target.value)}
                  className="h-7 w-20 rounded-md border border-border bg-background px-2 text-xs"
                />
              </label>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {members.map((row) => (
                <label
                  key={row.talentProfileId}
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-1.5"
                >
                  <span className="min-w-0 truncate text-sm">
                    {row.displayName}
                  </span>
                  {row.quoteOnly ? (
                    // Their explicit choice — visible, deliberately not editable.
                    <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {t("dashboard.adminWorkspace.rosterRatesQuoteOnly")}
                    </span>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1">
                      <span className="text-xs text-muted-foreground">
                        {row.currency}
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={1}
                        placeholder="—"
                        value={draft[row.talentProfileId] ?? ""}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [row.talentProfileId]: e.target.value,
                          }))
                        }
                        className="h-8 w-24 rounded-md border border-border bg-background px-2 text-sm"
                      />
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={pending.length === 0 || status === "saving"}
          className="inline-flex h-9 items-center rounded-full bg-foreground px-4 text-xs font-semibold text-background disabled:opacity-45"
        >
          {t("dashboard.adminWorkspace.rosterRatesSave")}
          {pending.length > 0 ? ` · ${pending.length}` : ""}
        </button>
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
            ? t("dashboard.adminWorkspace.pricingDefaultsSaving")
            : status === "saved"
              ? `${t("dashboard.adminWorkspace.pricingDefaultsSaved")} ${savedCount}`
              : status === "error"
                ? (error ?? t("dashboard.adminWorkspace.pricingDefaultsSaveFailed"))
                : " "}
        </p>
      </div>
    </div>
  );
}
