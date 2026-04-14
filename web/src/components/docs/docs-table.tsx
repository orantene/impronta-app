"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ADMIN_TABLE_HEAD, ADMIN_TABLE_TH } from "@/lib/dashboard-shell-classes";

export type DocsTableColumn = {
  key: string;
  label: string;
  sortable?: boolean;
};

export function DocsTable({
  columns,
  rows,
  searchQuery = "",
  className,
}: {
  columns: DocsTableColumn[];
  rows: Record<string, string>[];
  /** When set, filters rows where any cell includes this string (case-insensitive). */
  searchQuery?: string;
  className?: string;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      columns.some((col) => String(row[col.key] ?? "").toLowerCase().includes(q)),
    );
  }, [rows, columns, searchQuery]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const next = [...filtered];
    next.sort((a, b) => {
      const av = String(a[sortKey] ?? "").toLowerCase();
      const bv = String(b[sortKey] ?? "").toLowerCase();
      const cmp = av.localeCompare(bv, undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return next;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: string) {
    const col = columns.find((c) => c.key === key);
    if (!col?.sortable) return;
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return (
    <div className={cn("overflow-x-auto rounded-xl border border-border/55 bg-card/50 shadow-sm", className)}>
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead className={cn(ADMIN_TABLE_HEAD, "sticky top-0 z-20 shadow-[0_1px_0_var(--border)]")}>
          <tr>
            {columns.map((col) => {
              const active = sortKey === col.key;
              return (
                <th key={col.key} scope="col" className={ADMIN_TABLE_TH}>
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg px-1 py-0.5 text-left transition-colors",
                        "hover:bg-[var(--impronta-gold)]/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/35",
                        active ? "text-foreground" : "",
                      )}
                    >
                      {col.label}
                      {active ? (
                        sortDir === "asc" ? (
                          <ArrowUp className="size-3.5 shrink-0 opacity-80" aria-hidden />
                        ) : (
                          <ArrowDown className="size-3.5 shrink-0 opacity-80" aria-hidden />
                        )
                      ) : (
                        <ArrowUpDown className="size-3.5 shrink-0 opacity-40" aria-hidden />
                      )}
                    </button>
                  ) : (
                    <span>{col.label}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-xs text-muted-foreground">
                No rows match your search.
              </td>
            </tr>
          ) : (
            sorted.map((row, i) => (
              <tr
                key={i}
                className="border-t border-border/40 transition-colors hover:bg-[var(--impronta-gold)]/[0.04]"
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-2.5 align-top text-xs leading-snug text-foreground/90">
                    {row[col.key] ?? "—"}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
