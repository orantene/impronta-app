"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Bookmark, Trash2 } from "lucide-react";
import { setTalentSaved } from "@/app/(public)/directory/actions";
import { Button } from "@/components/ui/button";

export type ClientSavedListRow = {
  talent_profile_id: string;
  talent_profiles: {
    profile_code: string;
    display_name: string | null;
  } | null;
};

export function ClientSavedList({
  initialRows,
}: {
  initialRows: ClientSavedListRow[];
}) {
  const [rows, setRows] = useState<ClientSavedListRow[]>(initialRows);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const ordered = useMemo(() => rows, [rows]);

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((s) => {
          const code = s.talent_profiles?.profile_code ?? null;
          const name = s.talent_profiles?.display_name ?? "Talent profile";
          return (
            <li
              key={s.talent_profile_id}
              className="flex h-full flex-col justify-between gap-4 rounded-2xl border border-border/55 bg-card/40 p-4 shadow-sm transition-[border-color,box-shadow] duration-200 hover:border-[var(--impronta-gold-border)]/45 hover:shadow-[0_18px_40px_-28px_rgba(0,0,0,0.55)]"
            >
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-[var(--impronta-gold-border)]/35 bg-[var(--impronta-gold)]/10 text-[var(--impronta-gold)]">
                    <Bookmark className="size-[18px]" aria-hidden />
                  </span>
                  <span className="truncate font-mono text-[10px] text-muted-foreground">{code ?? "—"}</span>
                </div>
                <p className="mt-3 line-clamp-2 text-sm font-medium leading-snug text-foreground">{name}</p>
                <div className="mt-3">
                  <Button
                    asChild
                    variant="link"
                    className="h-auto p-0 text-xs font-medium text-[var(--impronta-gold)] underline-offset-4 hover:underline"
                  >
                    <Link href={code ? `/t/${encodeURIComponent(code)}` : "/directory"} scroll={false}>
                      View profile →
                    </Link>
                  </Button>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                className="gap-2 border-border/60"
                onClick={() => {
                  setError(null);
                  const previous = rows;
                  setRows((prev) => prev.filter((r) => r.talent_profile_id !== s.talent_profile_id));
                  startTransition(async () => {
                    const res = await setTalentSaved(s.talent_profile_id, false);
                    if (!res.ok) {
                      setRows(previous);
                      setError(res.error);
                    }
                  });
                }}
              >
                <Trash2 className="size-4" />
                Remove
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

