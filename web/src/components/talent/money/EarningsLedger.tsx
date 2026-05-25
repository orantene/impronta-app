"use client";

import { useMemo, useState } from "react";
import { useAdminShell } from "@/components/admin/shell/internal/state";
import { TalentSectionLabel } from "@/components/talent/talent-dashboard-primitives";
import { formatEurCents, type TalentEarningsRow } from "@/lib/talent/earnings-view";
import { ReceiptText } from "lucide-react";
import { useResolvedTalentEarnings } from "./use-resolved-talent-earnings";

type SourceFilter = "all" | TalentEarningsRow["source"];
type StatusFilter = "all" | TalentEarningsRow["status"];

const SOURCE_FILTERS: Array<{ key: SourceFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "agency_routed", label: "Agency" },
  { key: "personal_page", label: "Personal page" },
  { key: "hub", label: "Hub" },
  { key: "unknown", label: "Other" },
];

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "all", label: "All statuses" },
  { key: "paid", label: "Paid" },
  { key: "invoiced", label: "Invoiced" },
  { key: "pending", label: "Pending" },
  { key: "confirmed", label: "Confirmed" },
];

function sourceLabel(source: TalentEarningsRow["source"]): string {
  if (source === "agency_routed") return "Agency";
  if (source === "personal_page") return "Personal page";
  if (source === "hub") return "Hub";
  return "Other";
}

function statusTone(status: TalentEarningsRow["status"]): string {
  if (status === "paid") return "bg-emerald-50 text-emerald-800 ring-emerald-100";
  if (status === "invoiced") return "bg-sky-50 text-sky-800 ring-sky-100";
  if (status === "confirmed") return "bg-indigo-50 text-indigo-800 ring-indigo-100";
  return "bg-amber-50 text-amber-800 ring-amber-100";
}

export function EarningsLedger() {
  const { openDrawer } = useAdminShell();
  const earnings = useResolvedTalentEarnings();
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    return earnings.rows.filter((row) => {
      const sourceOk = sourceFilter === "all" || row.source === sourceFilter;
      const statusOk = statusFilter === "all" || row.status === statusFilter;
      return sourceOk && statusOk;
    });
  }, [earnings.rows, sourceFilter, statusFilter]);

  const filteredTotal = filtered.reduce((sum, row) => sum + row.netCents, 0);

  return (
    <section className="space-y-4">
      <TalentSectionLabel icon={ReceiptText}>Earnings ledger</TalentSectionLabel>

      <div className="flex flex-wrap gap-2">
        {SOURCE_FILTERS.map((chip) => {
          const active = sourceFilter === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setSourceFilter(chip.key)}
              className={
                active
                  ? "rounded-full bg-admin-accent px-3 py-1.5 text-xs font-semibold text-white"
                  : "rounded-full border border-admin-border-soft bg-white px-3 py-1.5 text-xs font-medium text-admin-ink hover:bg-admin-surface-alt"
              }
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((chip) => {
          const active = statusFilter === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setStatusFilter(chip.key)}
              className={
                active
                  ? "rounded-full bg-admin-surface-alt px-3 py-1 text-[11px] font-semibold text-admin-ink ring-1 ring-admin-border-soft"
                  : "rounded-full px-3 py-1 text-[11px] font-medium text-admin-ink-muted hover:text-admin-ink"
              }
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-admin-ink-muted">
        {sourceFilter === "all" ? "All earnings" : `${sourceLabel(sourceFilter)} earnings`} ·{" "}
        {formatEurCents(filteredTotal)}
      </div>

      <div className="overflow-hidden rounded-admin-lg border border-admin-border-soft bg-admin-card shadow-admin-rest">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-admin-ink">No earnings here yet</p>
            <p className="mt-1 text-sm text-admin-ink-muted">
              Once bookings close, your ledger becomes the story of your income.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-admin-border-soft">
            {filtered.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="flex w-full items-start gap-4 px-4 py-3 text-left hover:bg-admin-surface-alt/60"
                  onClick={() => openDrawer("talent-earnings-detail", { id: row.id })}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-admin-ink">{row.client}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${statusTone(row.status)}`}
                      >
                        {row.status}
                      </span>
                      <span className="rounded-full bg-admin-surface-alt px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-admin-ink-muted">
                        {sourceLabel(row.source)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-admin-ink-muted">
                      {row.agencyName} · Work {row.workDate}
                      {row.payoutDate ? ` · Paid ${row.payoutDate}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums text-admin-ink">
                      {formatEurCents(row.netCents)}
                    </p>
                    {row.paymentMethod ? (
                      <div className="mt-0.5 text-[11px] capitalize text-admin-ink-muted">
                        {row.paymentMethod.replace(/-/g, " ")}
                      </div>
                    ) : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
