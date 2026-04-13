"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GlobalUserSearchResult, GlobalUserSearchResponse } from "@/lib/admin/global-user-search-types";

type SelectedClient = {
  id: string;
  displayName: string | null;
  subtitle: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
};

export function AdminClientSearchPicker({
  inputName,
  selectedClient,
  onSelect,
  allowClear = true,
  helpText = "Search existing clients by name, email, or phone.",
}: {
  inputName?: string;
  selectedClient?: SelectedClient | null;
  onSelect?: (client: SelectedClient | null) => void;
  allowClear?: boolean;
  helpText?: string;
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GlobalUserSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [localSelected, setLocalSelected] = useState<SelectedClient | null>(selectedClient ?? null);

  useEffect(() => {
    setLocalSelected(selectedClient ?? null);
  }, [selectedClient]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q,
          role: "client",
        });
        const response = await fetch(`/api/admin/users/global-search?${params.toString()}`, {
          credentials: "same-origin",
        });
        if (!response.ok) {
          throw new Error("Search failed");
        }
        const json = (await response.json()) as GlobalUserSearchResponse;
        if (cancelled) return;
        setResults(json.results.filter((result) => result.kind === "client"));
      } catch {
        if (cancelled) return;
        setError("Could not load client matches.");
        setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const resultList = useMemo(() => results.slice(0, 8), [results]);

  return (
    <div className="space-y-2">
      {inputName ? <input type="hidden" name={inputName} value={localSelected?.id ?? ""} /> : null}
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by client name, email, or phone"
      />
      <p className="text-xs text-muted-foreground">{helpText}</p>

      {localSelected ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/45 bg-muted/20 px-3 py-2 text-sm">
          <div className="min-w-0">
            <p className="font-medium text-foreground">{localSelected.displayName?.trim() || "Client selected"}</p>
            {localSelected.subtitle ? <p className="truncate text-xs text-muted-foreground">{localSelected.subtitle}</p> : null}
          </div>
          {allowClear ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => {
                setLocalSelected(null);
                onSelect?.(null);
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
      ) : null}

      {query.trim().length >= 2 ? (
        <div className="rounded-lg border border-border/45 bg-background">
          {loading ? <p className="px-3 py-3 text-sm text-muted-foreground">Searching…</p> : null}
          {!loading && error ? <p className="px-3 py-3 text-sm text-destructive">{error}</p> : null}
          {!loading && !error && resultList.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">No client matches.</p>
          ) : null}
          {!loading && !error && resultList.length > 0 ? (
            <ul className="divide-y divide-border/40">
              {resultList.map((result) => (
                <li key={result.key}>
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/30"
                    onClick={() => {
                      const next = {
                        id: result.id,
                        displayName: result.displayName,
                        subtitle: result.subtitle,
                      };
                      setLocalSelected(next);
                      setQuery("");
                      setResults([]);
                      onSelect?.(next);
                    }}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{result.displayName?.trim() || "Unnamed client"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[result.subtitle, result.statusLabel].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <span className="text-xs text-[var(--impronta-gold)]">Select</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
