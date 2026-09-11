"use client";

/**
 * W45's filter row, the interactive half: `Status: any`, `Deadline: this
 * month` and the search box. Each one writes the URL (`?filter=&status=
 * &deadline=&q=`), so the server page re-reads and the list stays a
 * Server Component. `Owner: any` is drawn disabled: the project record
 * carries no owner (D-POS-35).
 */

import { useRouter } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";
import { useId, useState } from "react";

import { cn } from "@/lib/utils";

export type ListControlsCopy = {
  readonly owner: string;
  readonly ownerUnavailable: string;
  readonly status: string;
  readonly statusAny: string;
  readonly statuses: readonly { readonly id: string; readonly label: string }[];
  readonly deadline: string;
  readonly deadlineAny: string;
  readonly deadlineThisMonth: string;
  readonly deadlineOverdue: string;
  readonly search: string;
};

const CHIP =
  "inline-flex h-[28px] items-center gap-1.5 rounded-full border border-admin-border bg-admin-card px-2.5 text-[12px] text-admin-ink";

export function ListControls({
  filter,
  status,
  deadline,
  query,
  copy,
}: {
  filter: string;
  status: string;
  deadline: string;
  query: string;
  copy: ListControlsCopy;
}) {
  const router = useRouter();
  const [q, setQ] = useState(query);
  const searchId = useId();

  const push = (next: { status?: string; deadline?: string; q?: string }) => {
    const params = new URLSearchParams();
    if (filter && filter !== "open") params.set("filter", filter);
    const s = next.status ?? status;
    if (s && s !== "any") params.set("status", s);
    const d = next.deadline ?? deadline;
    if (d && d !== "any") params.set("deadline", d);
    const text = (next.q ?? q).trim();
    if (text) params.set("q", text);
    const qs = params.toString();
    router.push(qs ? `?${qs}` : "?");
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled title={copy.ownerUnavailable} className={cn(CHIP, "disabled:cursor-not-allowed disabled:opacity-60 max-[720px]:hidden")}>
        {copy.owner}
        <ChevronDown aria-hidden size={12} strokeWidth={1.75} className="text-admin-ink-dim" />
      </button>
      <label className={cn(CHIP, "max-[720px]:hidden")}>
        <span>{copy.status}</span>
        <select
          value={status}
          onChange={(e) => push({ status: e.target.value })}
          className="bg-transparent text-[12px] text-admin-ink focus:outline-none"
        >
          <option value="any">{copy.statusAny}</option>
          {copy.statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className={cn(CHIP, "max-[720px]:hidden")}>
        <span>{copy.deadline}</span>
        <select
          value={deadline}
          onChange={(e) => push({ deadline: e.target.value })}
          className="bg-transparent text-[12px] text-admin-ink focus:outline-none"
        >
          <option value="any">{copy.deadlineAny}</option>
          <option value="this_month">{copy.deadlineThisMonth}</option>
          <option value="overdue">{copy.deadlineOverdue}</option>
        </select>
      </label>
      <form
        className={cn(CHIP, "w-[220px] gap-1.5 max-[720px]:h-[44px] max-[720px]:w-full max-[720px]:rounded-[12px]")}
        onSubmit={(e) => {
          e.preventDefault();
          push({ q });
        }}
      >
        <Search aria-hidden size={12} strokeWidth={1.75} className="shrink-0 text-admin-ink-dim" />
        <label htmlFor={searchId} className="sr-only">
          {copy.search}
        </label>
        <input
          id={searchId}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={copy.search}
          className="min-w-0 flex-1 bg-transparent text-[12px] text-admin-ink placeholder:text-admin-ink-dim focus:outline-none"
        />
      </form>
    </div>
  );
}
