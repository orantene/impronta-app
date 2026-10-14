"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { hqSearchTicketsAction } from "@/lib/support/hq-actions";
import type { HqQueueRow } from "@/lib/support/load-hq";

const DEBOUNCE_MS = 300;

/**
 * Server-side ticket search (TUL-624). The queue only holds the latest 200
 * tickets, so older ones are found by asking the database, debounced and paged.
 */
export function useServerTicketSearch(query: string) {
  const [rows, setRows] = useState<HqQueueRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const pageRef = useRef(0);
  const seqRef = useRef(0);
  const term = query.trim();

  const run = useCallback(async (q: string, page: number, seq: number) => {
    setLoading(true);
    const res = await hqSearchTicketsAction({ query: q, page }).catch(() => null);
    if (seq !== seqRef.current) return;
    setLoading(false);
    if (!res || !res.ok) return;
    pageRef.current = page;
    setHasMore(res.hasMore);
    setRows((prev) => (page === 0 ? res.rows : [...prev, ...res.rows]));
  }, []);

  useEffect(() => {
    const seq = ++seqRef.current;
    if (!term) {
      setRows([]);
      setHasMore(false);
      setLoading(false);
      return;
    }
    const id = setTimeout(() => void run(term, 0, seq), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [term, run]);

  const loadMore = useCallback(() => {
    if (!term) return;
    void run(term, pageRef.current + 1, seqRef.current);
  }, [term, run]);

  return { rows, hasMore, loading, loadMore };
}
