"use client";

import { useMemo, useState } from "react";

export type HubAgencyItem = { hostname: string; name: string | null };

/** The tenant's name when we have one; the bare domain is the fallback, not the headline (TUL-978). */
export function hubAgencyLabel(item: HubAgencyItem): { title: string; sub: string | null } {
  const name = item.name?.trim();
  return name ? { title: name, sub: item.hostname } : { title: item.hostname, sub: null };
}

/** Hub landing agency list with a small search box (TUL-978). Matches the name and the domain. */
export function HubAgencyList({ agencies }: { agencies: HubAgencyItem[] }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return agencies;
    return agencies.filter((a) => `${a.name ?? ""} ${a.hostname}`.toLowerCase().includes(needle));
  }, [agencies, q]);

  return (
    <div className="mt-12">
      {agencies.length > 6 ? (
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search agencies"
          aria-label="Search agencies"
          className="mb-4 w-full rounded-[var(--site-radius)] border border-[var(--impronta-gold-border)] bg-transparent px-4 py-2.5 text-sm text-foreground outline-none"
        />
      ) : null}
      {shown.length === 0 ? (
        <p className="text-sm text-[var(--impronta-muted)]">No agencies match your search.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {shown.map((agency) => {
            const { title, sub } = hubAgencyLabel(agency);
            return (
              <li key={agency.hostname}>
                <a
                  href={`//${agency.hostname}`}
                  className="block rounded-[var(--site-radius)] border border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)]/40 px-5 py-4 text-sm text-foreground transition hover:bg-[var(--impronta-surface)]/60"
                >
                  <span className="font-display tracking-[0.08em]">{title}</span>
                  {sub ? <span className="mt-1 block text-xs text-[var(--impronta-muted)]">{sub}</span> : null}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
