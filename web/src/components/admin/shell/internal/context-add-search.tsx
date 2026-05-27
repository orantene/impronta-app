"use client";

// ============================================================================
// context-add-search.tsx — AddContextSearch
//
// Grouped multi-select picker for Contexts / Best-Fit. Sourced from the live
// DB taxonomy (term_type='context' grouped by term_type='context_group',
// tenant-overlay aware) via getContextCatalog(). Mirrors the AddSkillSearch
// commit contract: the parent owns the write (one setAll), so we just hand
// up the picked term ids + per-item metadata + group, and the parent merges
// optimistically and returns ok/error.
// ============================================================================

import { useEffect, useRef, useState } from "react";

import { getContextCatalog } from "@/lib/server-actions/admin-talent-contexts";
import type { ContextCatalogGroup } from "@/lib/server-actions/admin-talent-contexts.types";

import { useDashboardText } from "./dashboard-i18n";
import { F_BODY, T } from "./skill-tokens";

export type ContextCatalogActions = {
  getContextCatalog: (input?: { talent_profile_id?: string }) => Promise<
    | { ok: true; groups: ContextCatalogGroup[] }
    | { ok: false; error: string }
  >;
};

const adminContextCatalogActions: ContextCatalogActions = {
  getContextCatalog: () => getContextCatalog(),
};

export function AddContextSearch({
  existingContextIds,
  onClose,
  onAdded,
  talentProfileId,
  actions = adminContextCatalogActions,
}: {
  existingContextIds: Set<string>;
  onClose: () => void;
  onAdded: (picked: {
    ids: string[];
    items: Array<{
      id: string;
      name_en: string;
      name_es: string | null;
      group_id: string | null;
      group_name_en: string | null;
      group_sort_order: number;
    }>;
  }) => Promise<{ ok: boolean; error?: string }>;
  talentProfileId: string;
  actions?: ContextCatalogActions;
}) {
  const copy = useDashboardText();
  const [groups, setGroups] = useState<ContextCatalogGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  // id -> metadata (name + group), so a selection survives search filtering.
  const metaRef = useRef<
    Map<
      string,
      {
        name_en: string;
        name_es: string | null;
        group_id: string | null;
        group_name_en: string | null;
        group_sort_order: number;
      }
    >
  >(new Map());

  useEffect(() => {
    let alive = true;
    actions.getContextCatalog({ talent_profile_id: talentProfileId })
      .then((res) => {
        if (!alive) return;
        if (res.ok) {
          setGroups(res.groups);
          for (const g of res.groups) {
            for (const c of g.contexts) {
              metaRef.current.set(c.id, {
                name_en: c.name_en,
                name_es: c.name_es,
                group_id: g.group_id,
                group_name_en: g.group_name_en,
                group_sort_order: g.sort_order,
              });
            }
          }
        } else setError(res.error);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [actions, talentProfileId]);

  const toggle = (id: string) => {
    if (existingContextIds.has(id)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setError(null);
  };

  const q = searchQuery.trim().toLowerCase();
  const filteredGroups = groups
    .map((g) => ({
      ...g,
      contexts: g.contexts.filter(
        (c) =>
          !q ||
          c.name_en.toLowerCase().includes(q) ||
          (c.name_es ?? "").toLowerCase().includes(q),
      ),
    }))
    .filter((g) => g.contexts.length > 0);

  const handleAdd = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    setError(null);
    const ids = Array.from(selected);
    const items = ids.map((id) => {
      const m = metaRef.current.get(id);
      return {
        id,
        name_en: m?.name_en ?? "…",
        name_es: m?.name_es ?? null,
        group_id: m?.group_id ?? null,
        group_name_en: m?.group_name_en ?? null,
        group_sort_order: m?.group_sort_order ?? 999,
      };
    });
    const res = await onAdded({ ids, items });
    if (!res.ok) {
      setError(res.error ?? "Couldn't save. Try again.");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    // Parent closes the dialog on success.
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        background: "rgba(11,11,13,0.45)",
        fontFamily: F_BODY,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.surface,
          borderRadius: "16px 16px 0 0",
          maxWidth: 560,
          width: "100%",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "18px 20px 14px",
            borderBottom: `1px solid ${T.borderSoft}`,
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: T.ink,
              marginBottom: 2,
            }}
          >
            {copy.t("Add best-fit contexts")}
          </div>
          <div style={{ fontSize: 12, color: T.inkMuted }}>
            {copy.t("Where is this person best used? Pick all that apply.")}
          </div>
        </div>

        <div
          style={{
            padding: "10px 16px",
            borderBottom: `1px solid ${T.borderSoft}`,
          }}
        >
          <input
            autoFocus
            placeholder={copy.t("Search…")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 8,
              border: `1px solid ${T.border}`,
              fontSize: 13,
              fontFamily: F_BODY,
              boxSizing: "border-box",
              outline: "none",
            }}
          />
        </div>

        {error && (
          <div
            style={{
              margin: "10px 16px 0",
              padding: 10,
              borderRadius: 8,
              background: T.redSoft,
              border: `1px solid ${T.red}`,
              fontSize: 12,
              color: T.ink,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", padding: "10px 16px" }}>
          {loading && (
            <div style={{ padding: 12, color: T.inkMuted, fontSize: 12 }}>
              {copy.t("Loading…")}
            </div>
          )}
          {!loading && filteredGroups.length === 0 && (
            <div style={{ padding: 12, color: T.inkMuted, fontSize: 12 }}>
              {copy.t("No matching contexts.")}
            </div>
          )}
          {filteredGroups.map((g) => (
            <div key={g.group_id} style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  color: T.inkMuted,
                  textTransform: "uppercase",
                  marginBottom: 6,
                }}
              >
                {copy.term(g.group_name_en)}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {g.contexts.map((c) => {
                  const already = existingContextIds.has(c.id);
                  const isSel = selected.has(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={already}
                      onClick={() => toggle(c.id)}
                      style={{
                        padding: "7px 12px",
                        borderRadius: 999,
                        border: `1.5px solid ${
                          isSel
                            ? T.accent
                            : already
                              ? T.borderSoft
                              : T.border
                        }`,
                        background: isSel
                          ? T.accentSoft
                          : already
                            ? T.surfaceAlt
                            : T.surface,
                        color: isSel
                          ? T.accent
                          : already
                            ? T.inkMuted
                            : T.ink,
                        cursor: already ? "default" : "pointer",
                        opacity: already ? 0.55 : 1,
                        fontFamily: F_BODY,
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {isSel ? "✓ " : ""}
                      {copy.term(c.name_en, c.name_es)}
                      {already ? ` · ${copy.t("on profile")}` : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            padding: "12px 16px",
            borderTop: `1px solid ${T.borderSoft}`,
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 8,
          }}
        >
          {selected.size > 0 && (
            <button
              type="button"
              disabled={submitting}
              onClick={handleAdd}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 8,
                border: "none",
                background: submitting ? T.inkMuted : T.accent,
                color: "#fff",
                cursor: submitting ? "not-allowed" : "pointer",
                fontFamily: F_BODY,
                whiteSpace: "nowrap",
              }}
            >
              {submitting
                ? copy.t("Adding…")
                : `${copy.t("Add")} ${selected.size}`}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              border: `1px solid ${T.border}`,
              background: T.surface,
              color: T.inkMuted,
              cursor: "pointer",
              fontFamily: F_BODY,
            }}
          >
            {copy.t("Close")}
          </button>
        </div>
      </div>
    </div>
  );
}
