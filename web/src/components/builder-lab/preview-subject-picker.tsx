"use client";

/**
 * PreviewSubjectPicker (WS5) — choose the real talent / workspace the Builder
 * Lab canvas hydrates against.
 *
 * The Lab authors templates against REAL data. This picker is a cross-tenant
 * search (super_admin-gated server actions) that lets the operator pick:
 *   - a TALENT  → previewSubject { kind:"talent",    id: talent_profiles.id }
 *   - a WORKSPACE → previewSubject { kind:"workspace", id: agencies.id }
 *
 * Selecting one calls `onSelect(subject)`. The Lab stage threads that subject
 * into the editor's render context so connected freeform nodes resolve their
 * data scoped to the chosen subject instead of the platform tenant (WS4).
 *
 * It is a thin debounced-search list — NOT the homepage `TalentPicker` (which is
 * a multi-select modal returning an ORDERED profile_code[] for the
 * featured_talent section, and is tenant-roster-scoped). The Lab needs a single
 * cross-tenant subject, so it uses its own dedicated actions.
 */

import { useCallback, useEffect, useState } from "react";

import {
  searchLabTalentSubjects,
  searchLabWorkspaceSubjects,
  type LabTalentSubjectHit,
  type LabWorkspaceSubjectHit,
} from "@/lib/site-admin/builder-core/lab/preview-subject-search";

import { LAB as T, RADII, fieldStyle, LabBadge } from "./ui";

export type PreviewSubject =
  | { kind: "talent"; id: string; label: string; thumbnailUrl?: string | null }
  | { kind: "workspace"; id: string; label: string };

export function PreviewSubjectPicker({
  kind,
  selectedId,
  onSelect,
}: {
  /** Which area is active — drives which search runs + which subject shape. */
  kind: "talent" | "workspace";
  /** Currently-selected subject id (for the active highlight). */
  selectedId?: string | null;
  onSelect: (subject: PreviewSubject) => void;
}) {
  const [query, setQuery] = useState("");
  const [talentHits, setTalentHits] = useState<LabTalentSubjectHit[]>([]);
  const [workspaceHits, setWorkspaceHits] = useState<LabWorkspaceSubjectHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  // Debounced cross-tenant search. Re-runs when the active area or query changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const t = setTimeout(async () => {
      if (kind === "talent") {
        const res = await searchLabTalentSubjects({ query, limit: 18 });
        if (cancelled) return;
        setLoading(false);
        if (!res.ok) {
          setError(res.error);
          setTalentHits([]);
          setMore(false);
          return;
        }
        setTalentHits(res.hits);
        setMore(res.more);
      } else {
        const res = await searchLabWorkspaceSubjects({ query, limit: 18 });
        if (cancelled) return;
        setLoading(false);
        if (!res.ok) {
          setError(res.error);
          setWorkspaceHits([]);
          setMore(false);
          return;
        }
        setWorkspaceHits(res.hits);
        setMore(res.more);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [kind, query]);

  const pickTalent = useCallback(
    (hit: LabTalentSubjectHit) =>
      onSelect({
        kind: "talent",
        id: hit.id,
        label: hit.displayName,
        thumbnailUrl: hit.thumbnailUrl,
      }),
    [onSelect],
  );

  const pickWorkspace = useCallback(
    (hit: LabWorkspaceSubjectHit) =>
      onSelect({ kind: "workspace", id: hit.id, label: hit.displayName }),
    [onSelect],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={
          kind === "talent"
            ? "Search talent by name or code…"
            : "Search workspaces by name or slug…"
        }
        style={{ ...fieldStyle, width: "100%", outline: "none" }}
      />

      {error ? (
        <div
          style={{
            fontSize: 12,
            color: T.red,
            padding: "8px 11px",
            background: T.redBg,
            borderRadius: RADII.control,
          }}
        >
          {error}
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          maxHeight: 360,
          overflowY: "auto",
        }}
      >
        {loading ? (
          <SubjectSkeleton />
        ) : kind === "talent" ? (
          talentHits.length === 0 ? (
            <EmptyState label="No talent match this search." />
          ) : (
            talentHits.map((hit) => (
              <SubjectRow
                key={hit.id}
                active={selectedId === hit.id}
                onClick={() => pickTalent(hit)}
                thumbnailUrl={hit.thumbnailUrl}
                title={hit.displayName}
                subtitle={hit.roleLabel ?? hit.profileCode}
                chip={hit.profileCode}
              />
            ))
          )
        ) : workspaceHits.length === 0 ? (
          <EmptyState label="No workspaces match this search." />
        ) : (
          workspaceHits.map((hit) => (
            <SubjectRow
              key={hit.id}
              active={selectedId === hit.id}
              onClick={() => pickWorkspace(hit)}
              title={hit.displayName}
              subtitle={hit.slug}
              chip={hit.kind === "hub" ? "Hub" : "Agency"}
            />
          ))
        )}
        {more && !loading ? (
          <div style={{ fontSize: 11, color: T.inkDim, padding: "6px 4px", textAlign: "center" }}>
            Showing the first 18. Refine your search to narrow.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SubjectRow({
  active,
  onClick,
  thumbnailUrl,
  title,
  subtitle,
  chip,
}: {
  active?: boolean;
  onClick: () => void;
  thumbnailUrl?: string | null;
  title: string;
  subtitle?: string | null;
  chip?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "8px 10px",
        borderRadius: 9,
        border: `1px solid ${active ? T.accent : "transparent"}`,
        background: active ? T.accentSoft : "transparent",
        cursor: "pointer",
        textAlign: "left",
        color: T.ink,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 30,
          height: 30,
          borderRadius: RADII.icon,
          flexShrink: 0,
          background: T.cardSoft,
          overflow: "hidden",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 600,
          color: T.inkMuted,
        }}
      >
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          initialsOf(title)
        )}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </span>
        {subtitle ? (
          <span style={{ display: "block", fontSize: 11, color: T.inkMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {subtitle}
          </span>
        ) : null}
      </span>
      {chip ? (
        <LabBadge tone="muted" style={{ flexShrink: 0 }}>
          {chip}
        </LabBadge>
      ) : null}
    </button>
  );
}

function SubjectSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 46,
            borderRadius: 9,
            background: "rgba(255,255,255,0.03)",
            animation: "tulala-lab-pulse 1.2s ease-in-out infinite",
          }}
        />
      ))}
      <style>{`@keyframes tulala-lab-pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }`}</style>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{ fontSize: 12.5, color: T.inkMuted, padding: "16px 8px", textAlign: "center" }}>
      {label}
    </div>
  );
}

function initialsOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "·";
  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
