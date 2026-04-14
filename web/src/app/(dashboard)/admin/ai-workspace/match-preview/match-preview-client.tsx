"use client";

import { useCallback, useMemo, useState } from "react";

import { AIMatchExplanation } from "@/components/ai/ai-match-explanation";
import { AICompareTable } from "@/components/ai/ai-compare-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMatchExplanationsForUi } from "@/lib/ai/match-explain";
import type { SearchResult } from "@/lib/ai/search-result";

type SearchDebugPayload = {
  merge_strategy: string;
  fallback_reason: string | null;
  vector_active: boolean;
  candidate_counts: {
    classic_fetched: number;
    vector_neighbors: number;
    post_merge: number;
  };
  vector_score_summary: {
    min: number;
    max: number;
    avg: number;
  } | null;
  wall_time_ms: number;
};

type ApiResponse = {
  search_mode: string;
  results: SearchResult[];
  vector_active?: boolean;
  note?: string;
  debug?: SearchDebugPayload;
};

const MAX_COMPARE = 4;

export function MatchPreviewClient() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<ApiResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPayload(null);
    setSelected(new Set());
    try {
      const res = await fetch("/api/admin/ai/search-debug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q, limit: 12, locale: "en" }),
      });
      const body = (await res.json()) as ApiResponse & { error?: string };
      if (!res.ok) {
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setPayload(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [q]);

  const selectedResults = useMemo(() => {
    if (!payload?.results.length) return [];
    return payload.results.filter((r) => selected.has(r.talent_id));
  }, [payload, selected]);

  function toggleId(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_COMPARE) next.add(id);
      return next;
    });
  }

  const compareRows = useMemo(() => {
    return selectedResults.map((r) => ({
      name: (
        <span className="font-medium text-foreground">{r.card.displayName}</span>
      ),
      score: r.score != null ? r.score.toFixed(4) : "—",
      confidence: r.confidence ?? "—",
      explain: (
        <AIMatchExplanation
          className="text-xs"
          items={formatMatchExplanationsForUi(r.explanation, "en")}
        />
      ),
      signals:
        r.ranking_signals && Object.keys(r.ranking_signals).length > 0 ? (
          <pre className="max-h-24 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-foreground">
            {JSON.stringify(r.ranking_signals, null, 2)}
          </pre>
        ) : (
          "—"
        ),
    }));
  }, [selectedResults]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search query"
          className="max-w-md"
          aria-label="Search query"
        />
        <Button type="button" onClick={run} disabled={loading}>
          {loading ? "Searching…" : "Run search (staff debug)"}
        </Button>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {payload ? (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            Mode: <span className="text-foreground">{payload.search_mode}</span>
            {payload.vector_active != null ? (
              <>
                {" "}
                · vector_active:{" "}
                <span className="text-foreground">
                  {payload.vector_active ? "true" : "false"}
                </span>
              </>
            ) : null}
          </p>
          {payload.note ? <p className="text-amber-700 dark:text-amber-500">{payload.note}</p> : null}
          {payload.debug ? (
            <div
              className="rounded-md border border-dashed border-border bg-muted/30 p-3 font-mono text-xs text-foreground"
              data-testid="ai-search-debug-panel"
            >
              <div className="mb-1 font-sans text-m font-medium text-muted-foreground">
                Pipeline debug
              </div>
              <div>merge_strategy: {payload.debug.merge_strategy}</div>
              <div>fallback_reason: {payload.debug.fallback_reason ?? "—"}</div>
              <div>
                candidates: classic {payload.debug.candidate_counts.classic_fetched} · vector{" "}
                {payload.debug.candidate_counts.vector_neighbors} · post_merge{" "}
                {payload.debug.candidate_counts.post_merge}
              </div>
              <div>
                vector scores:{" "}
                {payload.debug.vector_score_summary
                  ? `min ${payload.debug.vector_score_summary.min.toFixed(4)} · max ${payload.debug.vector_score_summary.max.toFixed(4)} · avg ${payload.debug.vector_score_summary.avg.toFixed(4)}`
                  : "—"}
              </div>
              <div>wall_time_ms: {payload.debug.wall_time_ms}</div>
            </div>
          ) : null}

          <div className="border-t border-border pt-4">
            <p className="mb-2 text-xs font-medium text-foreground">
              Select up to {MAX_COMPARE} results to compare (checkboxes).
            </p>
            <ul className="space-y-4">
              {payload.results.map((r) => (
                <li key={r.talent_id} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex items-center gap-2 pt-0.5">
                      <input
                        type="checkbox"
                        id={`cmp-${r.talent_id}`}
                        checked={selected.has(r.talent_id)}
                        onChange={() => toggleId(r.talent_id)}
                        disabled={
                          !selected.has(r.talent_id) && selected.size >= MAX_COMPARE
                        }
                        className="size-4 rounded border-border"
                      />
                      <Label
                        htmlFor={`cmp-${r.talent_id}`}
                        className="cursor-pointer font-medium text-foreground"
                      >
                        {r.card.displayName}
                      </Label>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    score: {r.score != null ? r.score.toFixed(4) : "—"} ·{" "}
                    {r.card.primaryTalentTypeLabel} · {r.card.locationLabel}
                  </div>
                  {r.ranking_signals && Object.keys(r.ranking_signals).length > 0 ? (
                    <pre className="mt-2 max-h-28 overflow-auto rounded border border-border/60 bg-muted/20 p-2 font-mono text-[10px] leading-snug text-foreground">
                      {JSON.stringify(r.ranking_signals, null, 2)}
                    </pre>
                  ) : null}
                  <AIMatchExplanation
                    className="mt-2"
                    items={formatMatchExplanationsForUi(r.explanation, "en")}
                  />
                  {r.explanation.length > 0 ? (
                    <p className="mt-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                      {r.explanation
                        .map(
                          (e) =>
                            `${e.code}${e.confidence ? ` (${e.confidence})` : ""}`,
                        )
                        .join(" · ")}
                    </p>
                  ) : null}
                  {r.confidence ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Public confidence line: {r.confidence}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>

          {selectedResults.length >= 2 ? (
            <div className="border-t border-border pt-4">
              <h3 className="mb-2 text-sm font-medium text-foreground">Side-by-side compare</h3>
              <AICompareTable
                columns={[
                  { key: "name", header: "Talent" },
                  { key: "score", header: "Score" },
                  { key: "confidence", header: "Confidence" },
                  { key: "explain", header: "Explanations" },
                  { key: "signals", header: "Ranking signals" },
                ]}
                rows={compareRows}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
