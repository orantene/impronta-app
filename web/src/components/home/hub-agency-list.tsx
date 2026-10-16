"use client";

import { useMemo, useState } from "react";

/** Hub landing agency list with a small search box (TUL-978). */
export function HubAgencyList({ hostnames }: { hostnames: string[] }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? hostnames.filter((h) => h.toLowerCase().includes(needle)) : hostnames;
  }, [hostnames, q]);

  return (
    <div className="mt-12">
      {hostnames.length > 6 ? (
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
          {shown.map((hostname) => (
            <li key={hostname}>
              <a
                href={`//${hostname}`}
                className="block rounded-[var(--site-radius)] border border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)]/40 px-5 py-4 text-sm text-foreground transition hover:bg-[var(--impronta-surface)]/60"
              >
                <span className="font-display tracking-[0.08em]">{hostname}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
