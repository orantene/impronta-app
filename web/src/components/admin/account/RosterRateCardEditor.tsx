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
 * that would drift from the storefront. Each row says WHICH service the
 * number lands on; talents with no catalog yet get a standard "Day rate"
 * service created on save (marked before saving, never silently).
 *
 * Rows are grouped by role because that is how an agency reasons about rates
 * ("all our fashion models are 500"), and a per-role fill applies one number
 * down a group in a single explicit gesture.
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

type SaveState = "loading" | "idle" | "saving" | "saved" | "error";

export function RosterRateCardEditor() {
  const t = useT();
  const [rows, setRows] = useState<RosterRateRow[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<SaveState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [createdCount, setCreatedCount] = useState(0);
  const [query, setQuery] = useState("");
  const [fillDraft, setFillDraft] = useState<Record<string, string>>({});

  const baseline = useMemo(
    () =>
      Object.fromEntries(
        rows.map((r) => [r.talentProfileId, toUnits(r.headlineCents)]),
      ),
    [rows],
  );

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
    const q = query.trim().toLowerCase();
    const map = new Map<string, RosterRateRow[]>();
    for (const row of rows) {
      if (q && !row.displayName.toLowerCase().includes(q)) continue;
      const key = row.roleLabel ?? t("dashboard.adminWorkspace.rosterRatesNoRole");
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [rows, query, t]);

  const stats = useMemo(() => {
    let priced = 0;
    let quoteOnly = 0;
    let missing = 0;
    for (const row of rows) {
      if (row.quoteOnly) quoteOnly += 1;
      else if (row.headlineCents != null) priced += 1;
      else missing += 1;
    }
    return { total: rows.length, priced, quoteOnly, missing };
  }, [rows]);

  const isDirty = useCallback(
    (row: RosterRateRow) => {
      const raw = (draft[row.talentProfileId] ?? "").trim();
      return raw !== (baseline[row.talentProfileId] ?? "");
    },
    [draft, baseline],
  );

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

  const applyFill = useCallback(
    (role: string, members: RosterRateRow[]) => {
      const value = (fillDraft[role] ?? "").trim();
      if (!value) return;
      setDraft((prev) => {
        const next = { ...prev };
        for (const m of members) {
          if (!m.quoteOnly) next[m.talentProfileId] = value;
        }
        return next;
      });
    },
    [fillDraft],
  );

  const discard = useCallback(() => {
    setDraft({ ...baseline });
    setFillDraft({});
    setStatus("idle");
    setError(null);
  }, [baseline]);

  const save = useCallback(async () => {
    if (pending.length === 0) return;
    setStatus("saving");
    setError(null);
    const res = await saveRosterRates(pending);
    if (res.ok) {
      setSavedCount(res.updated + res.created);
      setCreatedCount(res.created);
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
        setFillDraft({});
      }
      window.setTimeout(() => setStatus("idle"), 3200);
    } else {
      setError(res.error);
      setStatus("error");
    }
  }, [pending]);

  if (status === "loading") {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <div className="h-6 w-56 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded-md bg-muted" />
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
        <p className="sr-only">{t("dashboard.adminWorkspace.rosterRatesLoading")}</p>
      </div>
    );
  }

  if (rows.length === 0 && status !== "error") {
    return (
      <p className="text-sm text-muted-foreground">
        {t("dashboard.adminWorkspace.rosterRatesEmpty")}
      </p>
    );
  }

  const showBar =
    pending.length > 0 || status === "saving" || status === "saved" || status === "error";

  return (
    <div className="flex flex-col gap-5 pb-24">
      {/* ── Header: title + stats + search ─────────────────────────────── */}
      <header className="flex flex-col gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            {t("dashboard.adminWorkspace.rosterRatesTitle")}
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            {t("dashboard.adminWorkspace.rosterRatesDesc")}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-foreground">
              <span className="font-semibold">{stats.total}</span>
              {t("dashboard.adminWorkspace.rosterRatesTalents")}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
              <span className="font-semibold text-foreground">{stats.priced}</span>
              {t("dashboard.adminWorkspace.rosterRatesWithRate")}
            </span>
            {stats.missing > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
                <span className="font-semibold text-foreground">{stats.missing}</span>
                {t("dashboard.adminWorkspace.rosterRatesNoRate")}
              </span>
            ) : null}
            {stats.quoteOnly > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-muted-foreground">
                <span className="font-semibold text-foreground">{stats.quoteOnly}</span>
                {t("dashboard.adminWorkspace.rosterRatesQuoteOnly")}
              </span>
            ) : null}
          </div>

          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("dashboard.adminWorkspace.rosterRatesSearch")}
            aria-label={t("dashboard.adminWorkspace.rosterRatesSearch")}
            className="h-9 w-full max-w-[240px] rounded-full border border-border bg-background px-4 text-[13px] outline-none transition-colors focus:border-foreground/40 sm:w-60"
          />
        </div>
      </header>

      {/* ── Groups ─────────────────────────────────────────────────────── */}
      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {t("dashboard.adminWorkspace.rosterRatesNoMatches")}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([role, members]) => (
            <section
              key={role}
              className="rounded-xl border border-border bg-card/40 p-3 sm:p-4"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {role}
                  <span className="ml-1.5 normal-case tracking-normal">
                    · {members.length}
                  </span>
                </p>
                <div className="flex items-center gap-1.5">
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    {t("dashboard.adminWorkspace.rosterRatesFillAll")}
                    <input
                      type="number"
                      inputMode="decimal"
                      min={1}
                      placeholder="—"
                      value={fillDraft[role] ?? ""}
                      onChange={(e) =>
                        setFillDraft((prev) => ({ ...prev, [role]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") applyFill(role, members);
                      }}
                      className="h-7 w-20 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-foreground/40"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => applyFill(role, members)}
                    disabled={!(fillDraft[role] ?? "").trim()}
                    className="h-7 rounded-md border border-border px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40"
                  >
                    {t("dashboard.adminWorkspace.rosterRatesApply")}
                  </button>
                </div>
              </div>

              <div className="grid gap-1.5 sm:grid-cols-2">
                {members.map((row) => {
                  const dirty = !row.quoteOnly && isDirty(row);
                  return (
                    <label
                      key={row.talentProfileId}
                      className={`flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 transition-colors ${
                        dirty ? "border-foreground/50" : "border-border"
                      }`}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-foreground">
                            {row.displayName}
                          </span>
                          {dirty ? (
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/70"
                              aria-hidden
                            />
                          ) : null}
                        </span>
                        <span className="truncate text-[11px] text-muted-foreground">
                          {row.quoteOnly
                            ? t("dashboard.adminWorkspace.rosterRatesQuoteOnlyHint")
                            : row.willCreate
                              ? t("dashboard.adminWorkspace.rosterRatesWillCreate")
                              : (row.targetTitle ?? "")}
                        </span>
                      </span>

                      {row.quoteOnly ? (
                        // Their explicit choice — visible, deliberately not editable.
                        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {t("dashboard.adminWorkspace.rosterRatesQuoteOnly")}
                        </span>
                      ) : (
                        <span className="flex shrink-0 items-center gap-1.5">
                          {row.willCreate && !dirty ? (
                            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
                              {t("dashboard.adminWorkspace.rosterRatesNewBadge")}
                            </span>
                          ) : null}
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
                            className="h-8 w-24 rounded-md border border-border bg-background px-2 text-right text-sm tabular-nums outline-none focus:border-foreground/40"
                          />
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* ── Sticky save bar: appears only when there is something to say ── */}
      <div
        className={`pointer-events-none sticky bottom-4 z-10 flex justify-center transition-all duration-200 ${
          showBar ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        }`}
      >
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-full border border-border bg-background/95 py-1.5 pl-4 pr-1.5 shadow-lg backdrop-blur">
          <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
            {status === "saving" ? (
              t("dashboard.adminWorkspace.pricingDefaultsSaving")
            ) : status === "error" ? (
              <span className="text-destructive">
                {error ?? t("dashboard.adminWorkspace.pricingDefaultsSaveFailed")}
              </span>
            ) : status === "saved" && pending.length === 0 ? (
              <>
                {t("dashboard.adminWorkspace.pricingDefaultsSaved")}{" "}
                <span className="font-semibold text-foreground">{savedCount}</span>
                {createdCount > 0
                  ? ` · ${createdCount} ${t("dashboard.adminWorkspace.rosterRatesCreatedNew")}`
                  : ""}
              </>
            ) : (
              <>
                <span className="font-semibold text-foreground">{pending.length}</span>{" "}
                {t("dashboard.adminWorkspace.rosterRatesUnsaved")}
              </>
            )}
          </p>
          {pending.length > 0 ? (
            <button
              type="button"
              onClick={discard}
              disabled={status === "saving"}
              className="h-8 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              {t("dashboard.adminWorkspace.rosterRatesDiscard")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void save()}
            disabled={pending.length === 0 || status === "saving"}
            className="inline-flex h-8 items-center rounded-full bg-foreground px-4 text-xs font-semibold text-background transition-opacity disabled:opacity-45"
          >
            {t("dashboard.adminWorkspace.rosterRatesSave")}
          </button>
        </div>
      </div>
    </div>
  );
}
