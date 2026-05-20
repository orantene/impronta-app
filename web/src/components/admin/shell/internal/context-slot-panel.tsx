"use client";
import { improntaLog } from "@/lib/server/structured-log";

// ============================================================================
// context-slot-panel.tsx — Contexts / Best-Fit editor (real-tenant, DB-backed)
//
// Built on the SAME proven race-safe setAll pattern as SkillSlotPanel:
//   - one authoritative local ref (contextsRef) updated OPTIMISTICALLY and
//     SYNCHRONOUSLY before any await, on both add and remove
//   - a monotonic mutation sequence guard; only the newest in-flight
//     response writes UI/cache, stale responses are ignored
//   - every mutation sends the full latest desired set to setAll
//   - server returns the authoritative final list; no reload cascade,
//     no per-chip action
// Contexts are simpler than skills: a flat set grouped by context_group,
// no proficiency / verify / featured / primary, no DB cap.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";

import {
  getResolvedContexts,
  setTalentProfileContexts,
} from "@/lib/server-actions/admin-talent-contexts";
import type { ResolvedContext } from "@/lib/server-actions/admin-talent-contexts.types";

import { AddContextSearch } from "./context-add-search";
import { useDashboardText } from "./dashboard-i18n";
import { F_BODY, T } from "./skill-tokens";

// ─── Module-level cache (mirrors _skillsCache) ─────────────────────────────
type CacheEntry = { contexts: ResolvedContext[]; ts: number };
const CACHE_TTL = 60_000;
const _contextsCache = new Map<string, CacheEntry>();
const _inflight = new Map<string, Promise<void>>();

/** Fire-and-forget prefetch — call when a talent drawer opens. */
export function prefetchContextsData(talentProfileId: string): void {
  const hit = _contextsCache.get(talentProfileId);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return;
  if (_inflight.has(talentProfileId)) return;
  const promise = (async () => {
    const res = await getResolvedContexts({
      talent_profile_id: talentProfileId,
    });
    if (res.ok) {
      _contextsCache.set(talentProfileId, {
        contexts: res.contexts,
        ts: Date.now(),
      });
    }
  })();
  _inflight.set(talentProfileId, promise);
  promise.finally(() => _inflight.delete(talentProfileId));
}

export function ContextSlotPanel({
  talentProfileId,
  talentName,
  onContextsChanged,
}: {
  talentProfileId: string;
  /** Talent's stage / professional name, for a human profile hint. */
  talentName?: string;
  /** Fired after any context mutation so the parent can re-resolve
   *  context-driven surfaces (search doc, etc.) immediately. */
  onContextsChanged?: () => void;
}) {
  const copy = useDashboardText();
  const [contexts, setContexts] = useState<ResolvedContext[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  // Race-safe plumbing — identical to the proven SkillSlotPanel design.
  const contextsRef = useRef<ResolvedContext[] | null>(null);
  const mutationSeqRef = useRef(0);
  useEffect(() => {
    contextsRef.current = contexts;
  }, [contexts]);

  useEffect(() => {
    void improntaLog("admin_context_slot_panel.info", {
      message: `[contexts-ui] ContextSlotPanel mounted talent=${talentProfileId}`,
    });
  }, [talentProfileId]);

  const fetchData = async (useCache: boolean) => {
    if (useCache) {
      const hit = _contextsCache.get(talentProfileId);
      if (hit && Date.now() - hit.ts < CACHE_TTL) {
        setContexts(hit.contexts);
        return;
      }
      const existing = _inflight.get(talentProfileId);
      if (existing) {
        await existing;
        const fresh = _contextsCache.get(talentProfileId);
        if (fresh) setContexts(fresh.contexts);
        return;
      }
    }
    setLoading(true);
    setError(null);
    const promise = (async () => {
      const res = await getResolvedContexts({
        talent_profile_id: talentProfileId,
      });
      setLoading(false);
      if (res.ok) {
        _contextsCache.set(talentProfileId, {
          contexts: res.contexts,
          ts: Date.now(),
        });
        setContexts(res.contexts);
      } else {
        setError(res.error);
      }
    })();
    if (useCache) {
      _inflight.set(talentProfileId, promise);
      promise.finally(() => _inflight.delete(talentProfileId));
    }
    await promise;
  };

  useEffect(() => {
    fetchData(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchData closes over talentProfileId and stable setters; re-fetch when the talent changes
  }, [talentProfileId]);

  const setSaving = (id: string, on: boolean) => {
    setSavingIds((p) => {
      const n = new Set(p);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  };

  const grouped = useMemo(() => {
    const m = new Map<
      string,
      { group_name: string; sort: number; items: ResolvedContext[] }
    >();
    for (const c of contexts ?? []) {
      const key = c.group_id ?? "__none__";
      if (!m.has(key)) {
        m.set(key, {
          group_name: c.group_name_en ?? "Other Contexts",
          sort: c.group_sort_order,
          items: [],
        });
      }
      m.get(key)!.items.push(c);
    }
    return [...m.values()].sort(
      (a, b) => a.sort - b.sort || a.group_name.localeCompare(b.group_name),
    );
  }, [contexts]);

  const total = contexts?.length ?? 0;
  const ready = contexts !== null;

  const handleRemove = async (ctx: ResolvedContext) => {
    void improntaLog("admin_context_slot_panel.info", {
      message: `[contexts-ui] remove clicked label="${ctx.context_name_en}" ` +
        `id=${ctx.context_term_id}`,
    });
    const seq = ++mutationSeqRef.current;
    const reqId = `rm-${seq}`;
    const base = contextsRef.current ?? [];
    const rollbackSnapshot = base;
    void improntaLog("admin_context_slot_panel.info", {
      message: `[contexts-ui] ${reqId} seq=${seq} desired-before-remove=[` +
        `${base.map((c) => c.context_term_id).join(",")}]`,
    });
    const next = base.filter(
      (c) => c.context_term_id !== ctx.context_term_id,
    );
    setSaving(ctx.context_term_id, true);
    // Optimistic + synchronous ref advance (so a same-tick next remove or a
    // pending add builds its desired set off this result).
    contextsRef.current = next;
    setContexts(next);
    const desiredIds = next.map((c) => c.context_term_id);
    void improntaLog("admin_context_slot_panel.info", {
      message: `[contexts-ui] ${reqId} seq=${seq} desired-after-optimistic-remove=[` +
        `${desiredIds.join(",")}] payload-sent=${desiredIds.length}`,
    });
    const res = await setTalentProfileContexts({
      talent_profile_id: talentProfileId,
      context_term_ids: desiredIds,
    });
    setSaving(ctx.context_term_id, false);
    if (seq !== mutationSeqRef.current) {
      void improntaLog("admin_context_slot_panel.info", {
        message: `[contexts-ui] ${reqId} seq=${seq} IGNORED stale (latest=` +
          `${mutationSeqRef.current}) serverOk=${res.ok}` +
          (res.ok
            ? ` serverReturned=[${res.contexts
                .map((c) => c.context_term_id)
                .join(",")}]`
            : ""),
      });
      return;
    }
    if (!res.ok) {
      contextsRef.current = rollbackSnapshot;
      setContexts(rollbackSnapshot);
      _contextsCache.set(talentProfileId, {
        contexts: rollbackSnapshot,
        ts: Date.now(),
      });
      setError(res.error);
      void improntaLog("admin_context_slot_panel.info", {
        message: `[contexts-ui] ${reqId} seq=${seq} APPLIED rollback (server error: ` +
          `${res.error}) finalUI=${rollbackSnapshot.length}`,
      });
      return;
    }
    contextsRef.current = res.contexts;
    setContexts(res.contexts);
    _contextsCache.set(talentProfileId, {
      contexts: res.contexts,
      ts: Date.now(),
    });
    void improntaLog("admin_context_slot_panel.info", {
      message: `[contexts-ui] ${reqId} seq=${seq} APPLIED server truth ` +
        `serverReturned=[${res.contexts
          .map((c) => c.context_term_id)
          .join(",")}] finalUI=${res.contexts.length}`,
    });
    onContextsChanged?.();
  };

  const handleAdded = async (picked: {
    ids: string[];
    items: Array<{
      id: string;
      name_en: string;
      name_es: string | null;
      group_id: string | null;
      group_name_en: string | null;
      group_sort_order: number;
    }>;
  }) => {
    void improntaLog("admin_context_slot_panel.info", {
      message: `[contexts-ui] add submitted ids=[${picked.ids.join(",")}]`,
    });
    const seq = ++mutationSeqRef.current;
    const reqId = `add-${seq}`;
    const base = contextsRef.current ?? [];
    const rollbackSnapshot = base;
    void improntaLog("admin_context_slot_panel.info", {
      message: `[contexts-ui] ${reqId} seq=${seq} desired-before-add=[` +
        `${base.map((c) => c.context_term_id).join(",")}]`,
    });
    const metaById = new Map(picked.items.map((it) => [it.id, it]));
    const provisional: ResolvedContext[] = picked.ids
      .filter((id) => !base.some((c) => c.context_term_id === id))
      .map((id) => {
        const m = metaById.get(id);
        return {
          context_term_id: id,
          context_slug: "",
          context_name_en: m?.name_en ?? "…",
          context_name_es: m?.name_es ?? null,
          group_id: m?.group_id ?? null,
          group_slug: null,
          group_name_en: m?.group_name_en ?? null,
          group_sort_order: m?.group_sort_order ?? 999,
          sort_order: 9999,
        };
      });
    const optimistic = [...base, ...provisional];
    contextsRef.current = optimistic;
    setContexts(optimistic);
    const desiredIds = optimistic.map((c) => c.context_term_id);
    void improntaLog("admin_context_slot_panel.info", {
      message: `[contexts-ui] ${reqId} seq=${seq} desired-after-optimistic-add=[` +
        `${desiredIds.join(",")}] payload-sent=${desiredIds.length}`,
    });
    const res = await setTalentProfileContexts({
      talent_profile_id: talentProfileId,
      context_term_ids: desiredIds,
    });
    const isLatest = seq === mutationSeqRef.current;
    if (!res.ok) {
      if (isLatest) {
        contextsRef.current = rollbackSnapshot;
        setContexts(rollbackSnapshot);
        _contextsCache.set(talentProfileId, {
          contexts: rollbackSnapshot,
          ts: Date.now(),
        });
        setError(res.error);
        void improntaLog("admin_context_slot_panel.info", {
          message: `[contexts-ui] ${reqId} seq=${seq} APPLIED rollback (add-failure: ` +
            `${res.error}) finalUI=${rollbackSnapshot.length}`,
        });
      } else {
        void improntaLog("admin_context_slot_panel.info", {
          message: `[contexts-ui] ${reqId} seq=${seq} IGNORED stale add-failure ` +
            `(latest=${mutationSeqRef.current}: ${res.error})`,
        });
      }
      return { ok: false, error: res.error };
    }
    if (!isLatest) {
      void improntaLog("admin_context_slot_panel.info", {
        message: `[contexts-ui] ${reqId} seq=${seq} IGNORED stale (latest=` +
          `${mutationSeqRef.current}) serverReturned=[${res.contexts
            .map((c) => c.context_term_id)
            .join(",")}] — latest setAll carries this add`,
      });
      setAdding(false);
      return { ok: true };
    }
    contextsRef.current = res.contexts;
    setContexts(res.contexts);
    _contextsCache.set(talentProfileId, {
      contexts: res.contexts,
      ts: Date.now(),
    });
    setAdding(false);
    void improntaLog("admin_context_slot_panel.info", {
      message: `[contexts-ui] ${reqId} seq=${seq} APPLIED server truth ` +
        `serverReturned=[${res.contexts
          .map((c) => c.context_term_id)
          .join(",")}] finalUI=${res.contexts.length}`,
    });
    onContextsChanged?.();
    return { ok: true };
  };

  return (
    <div style={{ fontFamily: F_BODY, marginTop: 18 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: T.ink }}>
            {copy.t("Best fit · contexts")}
          </div>
          <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 1 }}>
            {talentName && talentName.trim()
              ? `Where ${talentName.trim()} works best. Helps clients find the right match.`
              : copy.t(
                  "Where this talent works best. Helps clients find the right match.",
                )}
          </div>
        </div>
        <span style={{ fontSize: 11, color: T.inkMuted }}>{total}</span>
      </div>

      {error && (
        <div
          style={{
            padding: 10,
            marginBottom: 10,
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

      {loading && !contexts && (
        <div style={{ color: T.inkMuted, fontSize: 12, padding: 8 }}>
          {copy.t("Loading contexts…")}
        </div>
      )}

      {ready && total === 0 && (
        <div
          style={{
            fontSize: 12,
            color: T.inkMuted,
            padding: "10px 0 12px",
          }}
        >
          {copy.t("No contexts yet. Add the settings this person is best for.")}
        </div>
      )}

      {grouped.map((g) => (
        <div key={g.group_name} style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: 0.4,
              color: T.inkMuted,
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            {copy.term(g.group_name)}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {g.items.map((c) => {
              const saving = savingIds.has(c.context_term_id);
              return (
                <span
                  key={c.context_term_id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: T.surfaceWarm,
                    border: `1px solid ${T.border}`,
                    fontSize: 12,
                    fontWeight: 600,
                    color: T.ink,
                    opacity: saving ? 0.55 : 1,
                  }}
                >
                  {copy.term(c.context_name_en, c.context_name_es)}
                  <button
                    type="button"
                    onClick={() => handleRemove(c)}
                    title={copy.t("Remove context")}
                    style={{
                      width: 18,
                      height: 18,
                      padding: 0,
                      borderRadius: 5,
                      border: "none",
                      background: "transparent",
                      color: T.red,
                      cursor: "pointer",
                      fontSize: 13,
                      lineHeight: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: F_BODY,
                    }}
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      ))}

      {ready && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          style={{
            marginTop: 4,
            padding: "10px 12px",
            width: "100%",
            borderRadius: 10,
            border: `1px dashed ${T.border}`,
            background: "transparent",
            color: T.inkMuted,
            cursor: "pointer",
            fontFamily: F_BODY,
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          {total === 0
            ? `+ ${copy.t("Add best-fit contexts")}`
            : `+ ${copy.t("Add more contexts")}`}
        </button>
      )}

      {adding && (
        <AddContextSearch
          existingContextIds={
            new Set((contexts ?? []).map((c) => c.context_term_id))
          }
          onClose={() => setAdding(false)}
          onAdded={handleAdded}
        />
      )}
    </div>
  );
}
