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
 *
 * COLOURS: `admin-*` utilities only (styles/admin-color-bridge.css), never the
 * shadcn semantics. Those are theme-scoped, and this page renders under
 * `<body class="site-theme-dark">` while the workspace grid paints a LIGHT
 * canvas — so `text-foreground` resolved to near-white ON white (invisible),
 * and `bg-muted`/`bg-background` to near-black slabs. The `admin-*` scale is
 * defined at `:root`, so it resolves identically in every hosting context.
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
      <div className="flex flex-col gap-3 text-admin-ink" aria-busy="true">
        <div className="h-6 w-56 animate-pulse rounded-md bg-admin-surface-alt" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded-md bg-admin-surface-alt" />
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-admin-surface-alt" />
          ))}
        </div>
        <p className="sr-only">{t("dashboard.adminWorkspace.rosterRatesLoading")}</p>
      </div>
    );
  }

  if (rows.length === 0 && status !== "error") {
    return (
      <p className="text-sm text-admin-ink-muted">
        {t("dashboard.adminWorkspace.rosterRatesEmpty")}
      </p>
    );
  }

  const showBar =
    pending.length > 0 || status === "saving" || status === "saved" || status === "error";

  return (
    <div className="flex flex-col gap-5 pb-24 text-admin-ink">
      {/* ── Header: title + stats + search ─────────────────────────────── */}
      <header className="flex flex-col gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-admin-ink">
            {t("dashboard.adminWorkspace.rosterRatesTitle")}
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-admin-ink-muted">
            {t("dashboard.adminWorkspace.rosterRatesDesc")}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Neutral chips — no colour accents (the workspace palette is ink +
              greys; coloured status dots read as decoration here). */}
          <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-admin-ink-muted">
            <span className="inline-flex items-center gap-1 rounded-full border border-admin-border px-2.5 py-1">
              <span className="font-semibold text-admin-ink">{stats.total}</span>
              {t("dashboard.adminWorkspace.rosterRatesTalents")}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-admin-border px-2.5 py-1">
              <span className="font-semibold text-admin-ink">{stats.priced}</span>
              {t("dashboard.adminWorkspace.rosterRatesWithRate")}
            </span>
            {stats.missing > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-admin-border px-2.5 py-1">
                <span className="font-semibold text-admin-ink">{stats.missing}</span>
                {t("dashboard.adminWorkspace.rosterRatesNoRate")}
              </span>
            ) : null}
            {stats.quoteOnly > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-admin-border px-2.5 py-1">
                <span className="font-semibold text-admin-ink">{stats.quoteOnly}</span>
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
            className="h-9 w-full max-w-[240px] rounded-full border border-admin-border bg-admin-card px-4 text-[13px] outline-none transition-colors placeholder:text-admin-ink-muted focus:border-admin-accent sm:w-60"
          />
        </div>
      </header>

      {/* ── Groups ─────────────────────────────────────────────────────── */}
      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-admin-border px-4 py-8 text-center text-sm text-admin-ink-muted">
          {t("dashboard.adminWorkspace.rosterRatesNoMatches")}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([role, members]) => (
            <section
              key={role}
              className="rounded-xl border border-admin-border p-3 text-admin-ink sm:p-4"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-medium uppercase tracking-wider text-admin-ink-muted">
                  {role}
                  <span className="ml-1.5 normal-case tracking-normal">
                    · {members.length}
                  </span>
                </p>
                <div className="flex items-center gap-1.5">
                  <label className="flex items-center gap-1.5 text-[11px] text-admin-ink-muted">
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
                      className="h-7 w-20 rounded-md border border-admin-border bg-admin-card px-2 text-xs text-admin-ink outline-none focus:border-admin-accent"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => applyFill(role, members)}
                    disabled={!(fillDraft[role] ?? "").trim()}
                    className="h-7 rounded-md border border-admin-border px-2.5 text-[11px] font-medium text-admin-ink transition-colors hover:bg-admin-surface-alt disabled:opacity-40"
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
                      className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors ${
                        dirty
                          ? "border-admin-border-strong bg-admin-surface-alt"
                          : "border-admin-border hover:border-admin-border-strong"
                      }`}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-admin-ink">
                            {row.displayName}
                          </span>
                          {dirty ? (
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-admin-accent"
                              aria-hidden
                            />
                          ) : null}
                        </span>
                        <span className="truncate text-[11px] text-admin-ink-muted">
                          {row.quoteOnly
                            ? t("dashboard.adminWorkspace.rosterRatesQuoteOnlyHint")
                            : row.willCreate
                              ? t("dashboard.adminWorkspace.rosterRatesWillCreate")
                              : (row.targetTitle ?? "")}
                        </span>
                      </span>

                      {row.quoteOnly ? (
                        // Their explicit choice — visible, deliberately not editable.
                        <span className="shrink-0 rounded-full border border-admin-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-admin-ink-muted">
                          {t("dashboard.adminWorkspace.rosterRatesQuoteOnly")}
                        </span>
                      ) : (
                        <span className="flex shrink-0 items-center gap-1.5">
                          {row.willCreate && !dirty ? (
                            <span className="rounded-full border border-dashed border-admin-border-strong px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-admin-ink-muted">
                              {t("dashboard.adminWorkspace.rosterRatesNewBadge")}
                            </span>
                          ) : null}
                          <span className="text-xs text-admin-ink-muted">
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
                            className="h-8 w-24 rounded-md border border-admin-border bg-admin-card px-2 text-right text-sm tabular-nums text-admin-ink outline-none focus:border-admin-accent"
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
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-full border border-admin-border bg-admin-card py-1.5 pl-4 pr-1.5 shadow-lg">
          <p className="text-xs text-admin-ink-muted" role="status" aria-live="polite">
            {status === "saving" ? (
              t("dashboard.adminWorkspace.pricingDefaultsSaving")
            ) : status === "error" ? (
              <span className="text-admin-red">
                {error ?? t("dashboard.adminWorkspace.pricingDefaultsSaveFailed")}
              </span>
            ) : status === "saved" && pending.length === 0 ? (
              <>
                {t("dashboard.adminWorkspace.pricingDefaultsSaved")}{" "}
                <span className="font-semibold text-admin-ink">{savedCount}</span>
                {createdCount > 0
                  ? ` · ${createdCount} ${t("dashboard.adminWorkspace.rosterRatesCreatedNew")}`
                  : ""}
              </>
            ) : (
              <>
                <span className="font-semibold text-admin-ink">{pending.length}</span>{" "}
                {t("dashboard.adminWorkspace.rosterRatesUnsaved")}
              </>
            )}
          </p>
          {pending.length > 0 ? (
            <button
              type="button"
              onClick={discard}
              disabled={status === "saving"}
              className="h-8 rounded-full px-3 text-xs font-medium text-admin-ink-muted transition-colors hover:text-admin-ink disabled:opacity-40"
            >
              {t("dashboard.adminWorkspace.rosterRatesDiscard")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void save()}
            disabled={pending.length === 0 || status === "saving"}
            className="inline-flex h-8 items-center rounded-full bg-admin-accent px-4 text-xs font-semibold text-white transition-opacity disabled:opacity-45"
          >
            {t("dashboard.adminWorkspace.rosterRatesSave")}
          </button>
        </div>
      </div>
    </div>
  );
}
