"use client";

import { useMemo, useState } from "react";

import { visibleHubAgencies, type HubAgencyItem } from "./hub-agency-model";

export type { HubAgencyItem };

/**
 * Hub landing agency section (TUL-978, TUL-1884): name cards only (no raw addresses), the first
 * dozen, and a "see all" control for the rest. The search box matches names.
 */
export function HubAgencyList({
  agencies,
  labels,
}: {
  agencies: HubAgencyItem[];
  labels: { search: string; noMatch: string; seeAll: string; showFewer: string };
}) {
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState(false);
  const { shown, total, hiddenCount } = useMemo(
    () => visibleHubAgencies(agencies, q, expanded),
    [agencies, q, expanded],
  );
  const canToggle = !q.trim() && (hiddenCount > 0 || expanded);

  return (
    <div className="mt-12">
      {agencies.length > 6 ? (
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={labels.search}
          aria-label={labels.search}
          className="mb-4 w-full rounded-[var(--site-radius)] border border-[var(--impronta-gold-border)] bg-transparent px-4 py-2.5 text-sm text-foreground outline-none"
        />
      ) : null}
      {shown.length === 0 ? (
        <p className="text-sm text-[var(--impronta-muted)]">{labels.noMatch}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {shown.map((agency) => (
            <li key={agency.hostname}>
              <a
                href={`//${agency.hostname}`}
                className="block rounded-[var(--site-radius)] border border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)]/40 px-5 py-4 text-sm text-foreground transition hover:bg-[var(--impronta-surface)]/60"
              >
                <span className="font-display tracking-[0.08em]">{agency.name}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {canToggle ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-4 text-sm text-[var(--impronta-gold-dim)] underline underline-offset-4"
        >
          {expanded ? labels.showFewer : labels.seeAll.replace("{count}", String(total))}
        </button>
      ) : null}
    </div>
  );
}
