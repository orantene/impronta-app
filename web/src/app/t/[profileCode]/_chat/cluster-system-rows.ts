/**
 * cluster-system-rows — W1-1 pure core for a calm guest conversation.
 *
 * WHY: system notes are metadata ABOUT the conversation, not the conversation.
 * Rendering each `authorRole === "system"` row as its own bubble makes a burst
 * of lineup + AI-capture notes read as spam — the owner's 2026-07-11 screenshot
 * showed six identical "Added 9 talent to your inquiry." bubbles stacked. Real
 * messaging products collapse this kind of noise (Slack join/leave, iMessage
 * status) into one quiet caption.
 *
 * This module is the DOM-free grouping step: it folds runs of consecutive system
 * rows (no human message between them) into a single cluster node, so the
 * renderer can show ONE whisper-quiet caption per burst with an expand affordance.
 * Human messages pass through untouched and keep their timeline position.
 */

export type ClusterableRow = {
  id: string;
  authorRole: string;
  body: string;
  isDeleted?: boolean;
};

export type RenderNode<Row extends ClusterableRow> =
  | { kind: "message"; row: Row }
  | {
      kind: "system-cluster";
      /** Stable id = first row's id (order-preserving; unique per burst). */
      id: string;
      rows: Row[];
    };

/**
 * Fold consecutive system rows into clusters. A run of length 1 still becomes a
 * cluster (uniform handling) but the renderer treats singletons as a plain
 * caption with no expander. Deleted system rows are dropped from clusters (a
 * removed status note carries no signal); if that empties a run, no cluster is
 * emitted. Human messages are emitted 1:1 as `message` nodes.
 */
export function clusterSystemRows<Row extends ClusterableRow>(rows: Row[]): RenderNode<Row>[] {
  const out: RenderNode<Row>[] = [];
  let run: Row[] = [];

  const flush = () => {
    if (run.length === 0) return;
    const kept = run.filter((r) => !r.isDeleted);
    if (kept.length > 0) {
      out.push({ kind: "system-cluster", id: kept[0]!.id, rows: kept });
    }
    run = [];
  };

  for (const row of rows) {
    if (row.authorRole === "system") {
      run.push(row);
    } else {
      flush();
      out.push({ kind: "message", row });
    }
  }
  flush();
  return out;
}

/**
 * The default collapsed/expanded choice for a cluster. A short run (≤2) reads
 * fine expanded; a long burst (≥3) collapses to one caption so it never
 * dominates the thread. The renderer owns the live toggle; this is only the
 * initial state.
 */
export function clusterDefaultCollapsed(rowCount: number): boolean {
  return rowCount >= 3;
}

/**
 * The one-line caption for a collapsed cluster: the newest note plus a count of
 * the rest. The newest note is the most useful summary (latest state), e.g.
 * "Budget: USD 6,000 · 5 more". The caller localizes the "N more" connector.
 */
export function clusterCaption<Row extends ClusterableRow>(
  rows: Row[],
): { latest: string; hiddenCount: number } {
  if (rows.length === 0) return { latest: "", hiddenCount: 0 };
  const latest = rows[rows.length - 1]!.body;
  return { latest, hiddenCount: rows.length - 1 };
}
