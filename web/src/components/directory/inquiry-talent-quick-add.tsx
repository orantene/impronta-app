"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { setTalentSaved } from "@/app/(public)/directory/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePublicDiscoveryState } from "@/components/directory/public-discovery-state";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";
import { cn } from "@/lib/utils";
import type { DirectoryPageResponse } from "@/lib/directory/types";

type QuickTalent = {
  id: string;
  profileCode: string;
  displayName: string;
};

export function InquiryTalentQuickAdd({
  className,
  disabled,
  copy,
}: {
  className?: string;
  disabled?: boolean;
  copy: DirectoryUiCopy["inquiryQuickAdd"];
}) {
  const state = usePublicDiscoveryState();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<QuickTalent[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 320);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (debounced.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const res = await fetch(
          `/api/directory?limit=12&q=${encodeURIComponent(debounced)}`,
        );
        if (!res.ok) {
          if (!cancelled) setResults([]);
          return;
        }
        const body = (await res.json()) as DirectoryPageResponse;
        if (cancelled) return;
        setResults(
          body.items.map((item) => ({
            id: item.id,
            profileCode: item.profileCode,
            displayName: item.displayName,
          })),
        );
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const savedSet = useMemo(() => new Set(state.savedIds), [state.savedIds]);

  const addTalent = useCallback(
    (talent: QuickTalent) => {
      if (savedSet.has(talent.id)) return;
      state.setSavedState(talent.id, true);
      startTransition(async () => {
        const result = await setTalentSaved(talent.id, true);
        if (!result.ok) {
          state.setSavedState(talent.id, false);
          state.setFlash({
            tone: "error",
            title: copy.couldNotAddTitle,
            message: result.error,
          });
        }
      });
    },
    [savedSet, state, copy.couldNotAddTitle],
  );

  return (
    <div className={cn("space-y-2", className)}>
      <label className="text-sm font-medium text-foreground" htmlFor="inquiry-talent-search">
        {copy.label}
      </label>
      <Input
        id="inquiry-talent-search"
        value={q}
        disabled={disabled}
        onChange={(e) => setQ(e.target.value)}
        placeholder={copy.placeholder}
        autoComplete="off"
      />
      {debounced.length >= 2 ? (
        <div className="rounded-lg border border-border/80 bg-muted/20">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {copy.searching}
            </div>
          ) : results.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">{copy.noMatches}</p>
          ) : (
            <ul className="max-h-48 divide-y divide-border/60 overflow-y-auto">
              {results.map((row) => {
                const already = savedSet.has(row.id);
                return (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-2 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.displayName}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {row.profileCode}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={already ? "secondary" : "outline"}
                      disabled={already || pending || disabled}
                      className="shrink-0 gap-1"
                      onClick={() => addTalent(row)}
                    >
                      {already ? (
                        copy.added
                      ) : (
                        <>
                          <Plus className="size-3.5" />
                          {copy.add}
                        </>
                      )}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{copy.minCharsHint}</p>
      )}
    </div>
  );
}
