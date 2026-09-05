"use client";

/**
 * ReviewMediaModerationGrid — staff-facing per-photo moderation for review
 * images (STANDING v3 item 5). Each card shows the thumbnail + which talent /
 * reviewer it belongs to, its current approval_state, and Approve / Reject
 * controls that call setReviewMediaApprovalState with explicit
 * pending/done/error state (no silent waits — admin UX bar).
 *
 * Photos default to 'approved' (auto-live), so the common ops are REJECT (hide a
 * bad photo) and RESTORE (Approve a rejected one). A rejected photo is hidden
 * from the public profile but the parent review still shows — this is the
 * per-photo granularity that replaces the old hide-the-whole-review approach.
 */

import React from "react";
import { setReviewMediaApprovalState } from "@/lib/reviews/review-moderation-actions";
import type { ReviewMediaModerationItem } from "@/lib/reviews/review-moderation-loaders";

type Filter = "all" | "approved" | "rejected" | "pending";

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  border: "rgba(24,24,27,0.10)",
  cardBg: "#ffffff",
  surface: "rgba(11,11,13,0.02)",
  accent: "#1D4ED8",
  success: "#1A7348",
  successSoft: "rgba(26,115,72,0.10)",
  danger: "#B4231F",
  dangerSoft: "rgba(180,35,31,0.10)",
  amber: "var(--color-admin-amber)",
  amberSoft: "rgba(138,111,26,0.12)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

function stateBadge(state: string): { label: string; bg: string; fg: string } {
  if (state === "approved") return { label: "Live", bg: C.successSoft, fg: C.success };
  if (state === "rejected") return { label: "Hidden", bg: C.dangerSoft, fg: C.danger };
  return { label: "Pending", bg: C.amberSoft, fg: C.amber };
}

function Card({ item }: { item: ReviewMediaModerationItem }) {
  const [state, setState] = React.useState(item.approvalState);
  const [busy, setBusy] = React.useState<null | "approved" | "rejected">(null);
  const [error, setError] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);

  async function apply(next: "approved" | "rejected") {
    if (busy || state === next) return;
    setBusy(next);
    setError(null);
    const res = await setReviewMediaApprovalState(item.mediaId, next);
    setBusy(null);
    if (res.ok) {
      setState(res.data.approvalState);
      setSavedAt(Date.now());
    } else {
      setError(res.error);
    }
  }

  const badge = stateBadge(state);
  const context =
    [item.talentName ? `for ${item.talentName}` : null, item.reviewerName ? `by ${item.reviewerName}` : "by verified client"]
      .filter(Boolean)
      .join(" · ");

  return (
    <div
      style={{
        background: C.cardBg,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ position: "relative", aspectRatio: "4 / 3", background: C.surface }}>
        {item.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.url}
            alt="Review photo"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              filter: state === "rejected" ? "grayscale(1) opacity(0.55)" : "none",
            }}
          />
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 12, color: C.inkDim }}>
            No image
          </div>
        )}
        <span
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            padding: "3px 8px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            background: badge.bg,
            color: badge.fg,
          }}
        >
          {badge.label}
        </span>
      </div>

      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 12.5, color: C.ink, fontWeight: 600, lineHeight: 1.4 }}>
          {typeof item.rating === "number" ? `${item.rating}★ review ` : "Review "}
          <span style={{ fontWeight: 500, color: C.inkMuted }}>{context}</span>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => apply("approved")}
            disabled={busy !== null || state === "approved"}
            style={{
              flex: 1,
              height: 32,
              borderRadius: 8,
              border: "none",
              cursor: busy !== null || state === "approved" ? "default" : "pointer",
              fontSize: 12.5,
              fontWeight: 600,
              background: state === "approved" ? "rgba(11,11,13,0.06)" : C.successSoft,
              color: state === "approved" ? C.inkDim : C.success,
            }}
          >
            {busy === "approved" ? "Saving…" : state === "rejected" ? "Restore" : "Approve"}
          </button>
          <button
            type="button"
            onClick={() => apply("rejected")}
            disabled={busy !== null || state === "rejected"}
            style={{
              flex: 1,
              height: 32,
              borderRadius: 8,
              border: "none",
              cursor: busy !== null || state === "rejected" ? "default" : "pointer",
              fontSize: 12.5,
              fontWeight: 600,
              background: state === "rejected" ? "rgba(11,11,13,0.06)" : C.dangerSoft,
              color: state === "rejected" ? C.inkDim : C.danger,
            }}
          >
            {busy === "rejected" ? "Saving…" : "Reject"}
          </button>
        </div>

        {error ? (
          <div style={{ fontSize: 11.5, color: C.danger }}>{error}</div>
        ) : savedAt ? (
          <div style={{ fontSize: 11.5, color: C.inkMuted }}>Saved ✓</div>
        ) : null}
      </div>
    </div>
  );
}

export function ReviewMediaModerationGrid({ items }: { items: ReviewMediaModerationItem[] }) {
  const [filter, setFilter] = React.useState<Filter>("all");

  const filtered = React.useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.approvalState === filter)),
    [items, filter],
  );

  const counts = React.useMemo(() => {
    const c = { all: items.length, approved: 0, rejected: 0, pending: 0 };
    for (const i of items) {
      if (i.approvalState === "approved") c.approved += 1;
      else if (i.approvalState === "rejected") c.rejected += 1;
      else c.pending += 1;
    }
    return c;
  }, [items]);

  const tabs: { key: Filter; label: string }[] = [
    { key: "all", label: `All (${counts.all})` },
    { key: "approved", label: `Live (${counts.approved})` },
    { key: "pending", label: `Pending (${counts.pending})` },
    { key: "rejected", label: `Hidden (${counts.rejected})` },
  ];

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFilter(t.key)}
            style={{
              height: 30,
              padding: "0 12px",
              borderRadius: 999,
              border: `1px solid ${filter === t.key ? C.accent : C.border}`,
              background: filter === t.key ? C.accent : "transparent",
              color: filter === t.key ? "#fff" : C.inkMuted,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div
          style={{
            padding: "40px 20px",
            textAlign: "center",
            fontSize: 13,
            color: C.inkMuted,
            background: C.surface,
            borderRadius: 12,
          }}
        >
          No photos in this view.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 14,
          }}
        >
          {filtered.map((item) => (
            <Card key={item.mediaId} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
