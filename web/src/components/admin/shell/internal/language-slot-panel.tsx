"use client";

// ============================================================================
// language-slot-panel.tsx — Languages editor (real-tenant, DB-backed, V1)
//
// Same proven race-safe setAll pattern as Skill/Context panels:
//   - one authoritative local ref (languagesRef) of the FULL row set,
//     updated optimistically + synchronously before any await
//   - monotonic mutation sequence guard; only the newest in-flight
//     response writes UI/cache, stale responses ignored
//   - every mutation sends the full latest desired set to setTalentLanguages
//     (lossless), which returns the authoritative final list
//
// V1 UI deliberately shows ONLY: language · speaking level · remove.
// The capability flags (can_host/sell/translate/teach), is_native and
// display_order are NOT shown but are carried through every payload from
// the hydrated server rows, so editing level/membership never wipes them.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";

import {
  getTalentLanguages,
  setTalentLanguages,
} from "@/lib/server-actions/admin-talent-languages";
import type { TalentLanguageInput } from "@/lib/server-actions/admin-talent-languages.types";

import { LanguageAddSearch, COMMON_LANGUAGES } from "./language-add-search";
import { useDashboardText } from "./dashboard-i18n";
import { F_BODY, T } from "./skill-tokens";

type LangRow = TalentLanguageInput;

// ─── Module cache (mirrors _contextsCache) ─────────────────────────────────
type CacheEntry = { languages: LangRow[]; ts: number };
const CACHE_TTL = 60_000;
const _langCache = new Map<string, CacheEntry>();
const _inflight = new Map<string, Promise<void>>();

export function prefetchLanguagesData(talentProfileId: string): void {
  const hit = _langCache.get(talentProfileId);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return;
  if (_inflight.has(talentProfileId)) return;
  const promise = (async () => {
    const res = await getTalentLanguages({
      talent_profile_id: talentProfileId,
    });
    if (res.ok) {
      _langCache.set(talentProfileId, {
        languages: res.languages,
        ts: Date.now(),
      });
    }
  })();
  _inflight.set(talentProfileId, promise);
  promise.finally(() => _inflight.delete(talentProfileId));
}

const LEVELS = ["basic", "conversational", "fluent", "native"] as const;
type UiLevel = (typeof LEVELS)[number];
const LEVEL_LABEL: Record<string, string> = {
  basic: "Basic",
  conversational: "Conversational",
  professional: "Professional",
  fluent: "Fluent",
  native: "Native",
};

// Two clear presets only. The legacy prototype's confusing "Riviera Maya"
// preset is intentionally NOT carried into the real-tenant editor.
const PRESETS: Array<{ id: string; label: string; codes: string[] }> = [
  { id: "en-es", label: "English + Spanish", codes: ["en", "es"] },
  { id: "en-fr", label: "English + French", codes: ["en", "fr"] },
];

export function LanguageSlotPanel({
  talentProfileId,
}: {
  talentProfileId: string;
}) {
  const copy = useDashboardText();
  const [languages, setLanguages] = useState<LangRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingCodes, setSavingCodes] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const languagesRef = useRef<LangRow[] | null>(null);
  const mutationSeqRef = useRef(0);
  useEffect(() => {
    languagesRef.current = languages;
  }, [languages]);

  useEffect(() => {
    console.info(
      `[lang-ui] LanguageSlotPanel mounted talent=${talentProfileId}`,
    );
  }, [talentProfileId]);

  const fetchData = async (useCache: boolean) => {
    if (useCache) {
      const hit = _langCache.get(talentProfileId);
      if (hit && Date.now() - hit.ts < CACHE_TTL) {
        setLanguages(hit.languages);
        return;
      }
      const existing = _inflight.get(talentProfileId);
      if (existing) {
        await existing;
        const fresh = _langCache.get(talentProfileId);
        if (fresh) setLanguages(fresh.languages);
        return;
      }
    }
    setLoading(true);
    setError(null);
    const promise = (async () => {
      const res = await getTalentLanguages({
        talent_profile_id: talentProfileId,
      });
      setLoading(false);
      if (res.ok) {
        _langCache.set(talentProfileId, {
          languages: res.languages,
          ts: Date.now(),
        });
        setLanguages(res.languages);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talentProfileId]);

  const setSaving = (code: string, on: boolean) => {
    setSavingCodes((p) => {
      const n = new Set(p);
      if (on) n.add(code);
      else n.delete(code);
      return n;
    });
  };

  const sorted = useMemo(
    () =>
      [...(languages ?? [])].sort(
        (a, b) =>
          (a.display_order ?? 0) - (b.display_order ?? 0) ||
          a.language_name.localeCompare(b.language_name),
      ),
    [languages],
  );

  // Single race-safe commit path shared by add / level-change / remove.
  // `next` is the FULL desired row set (flags preserved by the caller).
  const commitDesired = async (
    next: LangRow[],
    savingKey: string,
    label: string,
  ) => {
    const seq = ++mutationSeqRef.current;
    const reqId = `lang-${seq}`;
    const base = languagesRef.current ?? [];
    const rollbackSnapshot = base;
    console.info(
      `[lang-ui] ${reqId} seq=${seq} ${label} desired-before=[` +
        `${base.map((l) => l.language_code).join(",")}]`,
    );
    // Optimistic + synchronous ref advance.
    languagesRef.current = next;
    setLanguages(next);
    setSaving(savingKey, true);
    const payload = next.map((l, i) => ({ ...l, display_order: i }));
    console.info(
      `[lang-ui] ${reqId} seq=${seq} desired-after-optimistic=[` +
        `${next.map((l) => `${l.language_code}:${l.speaking_level}`).join(",")}] ` +
        `payload-sent=${payload.length}`,
    );
    const res = await setTalentLanguages({
      talent_profile_id: talentProfileId,
      languages: payload,
    });
    setSaving(savingKey, false);
    if (seq !== mutationSeqRef.current) {
      console.info(
        `[lang-ui] ${reqId} seq=${seq} IGNORED stale (latest=` +
          `${mutationSeqRef.current}) serverOk=${res.ok}` +
          (res.ok
            ? ` serverReturned=[${res.languages
                .map((l) => l.language_code)
                .join(",")}]`
            : ""),
      );
      return;
    }
    if (!res.ok) {
      languagesRef.current = rollbackSnapshot;
      setLanguages(rollbackSnapshot);
      _langCache.set(talentProfileId, {
        languages: rollbackSnapshot,
        ts: Date.now(),
      });
      setError(res.error);
      console.info(
        `[lang-ui] ${reqId} seq=${seq} APPLIED rollback (server error: ` +
          `${res.error}) finalUI=${rollbackSnapshot.length}`,
      );
      return;
    }
    languagesRef.current = res.languages;
    setLanguages(res.languages);
    _langCache.set(talentProfileId, {
      languages: res.languages,
      ts: Date.now(),
    });
    setError(null);
    console.info(
      `[lang-ui] ${reqId} seq=${seq} APPLIED server truth ` +
        `serverReturned=[${res.languages
          .map((l) => l.language_code)
          .join(",")}] finalUI=${res.languages.length}`,
    );
  };

  const handleAdd = async (picked: Array<{ code: string; name: string }>) => {
    console.info(
      `[lang-ui] add submitted codes=[${picked.map((p) => p.code).join(",")}]`,
    );
    const base = languagesRef.current ?? [];
    const have = new Set(base.map((l) => l.language_code));
    const additions: LangRow[] = picked
      .filter((p) => !have.has(p.code))
      .map((p, i) => ({
        language_code: p.code,
        language_name: p.name,
        speaking_level: "conversational",
        is_native: false,
        can_host: false,
        can_sell: false,
        can_translate: false,
        can_teach: false,
        display_order: base.length + i,
      }));
    setAdding(false);
    if (additions.length === 0) return;
    await commitDesired([...base, ...additions], picked[0]!.code, "add");
  };

  const handleLevelChange = async (code: string, level: UiLevel) => {
    console.info(`[lang-ui] level changed code=${code} -> ${level}`);
    const base = languagesRef.current ?? [];
    // Preserve every other field (incl. capability flags); sync is_native.
    const next = base.map((l) =>
      l.language_code === code
        ? { ...l, speaking_level: level, is_native: level === "native" }
        : l,
    );
    await commitDesired(next, code, "level");
  };

  const handleRemove = async (row: LangRow) => {
    console.info(
      `[lang-ui] remove clicked code=${row.language_code} name="${row.language_name}"`,
    );
    const base = languagesRef.current ?? [];
    const next = base.filter((l) => l.language_code !== row.language_code);
    await commitDesired(next, row.language_code, "remove");
  };

  const ready = languages !== null;

  return (
    <div style={{ fontFamily: F_BODY }}>
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

      {loading && !languages && (
        <div style={{ color: T.inkMuted, fontSize: 12, padding: 8 }}>
          {copy.t("Loading languages…")}
        </div>
      )}

      {ready && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() =>
                handleAdd(
                  p.codes.map((c) => ({
                    code: c,
                    name:
                      COMMON_LANGUAGES.find((x) => x.code === c)?.name ?? c,
                  })),
                )
              }
              style={{
                padding: "5px 11px",
                borderRadius: 999,
                border: `1px dashed ${T.border}`,
                background: "transparent",
                color: T.inkMuted,
                fontSize: 11,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: F_BODY,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {sorted.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginBottom: 12,
          }}
        >
          {sorted.map((row) => {
            const saving = savingCodes.has(row.language_code);
            const lvl = row.speaking_level;
            const opts = LEVELS.includes(lvl as UiLevel)
              ? (LEVELS as readonly string[])
              : [lvl, ...LEVELS];
            return (
              <div
                key={row.language_code}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: 10,
                  border: `1px solid ${T.borderSoft}`,
                  borderRadius: 10,
                  background: T.surface,
                  opacity: saving ? 0.6 : 1,
                }}
              >
                <span
                  style={{
                    flex: 1,
                    fontSize: 13,
                    fontWeight: 600,
                    color: T.ink,
                  }}
                >
                  {row.language_name}
                </span>
                <select
                  value={lvl}
                  disabled={saving}
                  onChange={(e) =>
                    handleLevelChange(
                      row.language_code,
                      e.target.value as UiLevel,
                    )
                  }
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: `1px solid ${T.border}`,
                    fontFamily: F_BODY,
                    fontSize: 12,
                    color: T.ink,
                    background: T.surface,
                    outline: "none",
                  }}
                >
                  {opts.map((lv) => (
                    <option key={lv} value={lv}>
                      {LEVEL_LABEL[lv] ?? lv}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => handleRemove(row)}
                  title={copy.t("Remove language")}
                  aria-label="Remove language"
                  style={{
                    width: 22,
                    height: 22,
                    padding: 0,
                    borderRadius: 6,
                    border: "none",
                    background: "transparent",
                    color: T.red,
                    cursor: "pointer",
                    fontSize: 15,
                    lineHeight: 1,
                    fontWeight: 700,
                    fontFamily: F_BODY,
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {ready && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          style={{
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
          {`+ ${copy.t("Add the languages this talent speaks.")}`}
        </button>
      )}

      {adding && (
        <LanguageAddSearch
          existingCodes={
            new Set((languages ?? []).map((l) => l.language_code))
          }
          onClose={() => setAdding(false)}
          onAdded={handleAdd}
        />
      )}
    </div>
  );
}
