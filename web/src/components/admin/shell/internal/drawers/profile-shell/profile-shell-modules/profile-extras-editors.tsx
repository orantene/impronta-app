// Phase-1f decomp — "extras" cluster: skills with proficiency · personality
// (loves/avoids) · hello reel · multi-album editor · aspirations · seasonal
// windows · recurring pattern + vacation · package rates · past-clients ·
// next-tier coach · per-field lock toggle.  These are all the secondary
// editors that the active section body composes after the core block.
"use client";
import React, { useState, useEffect, useRef } from "react";
import { logServerError } from "@/lib/server/safe-error";
import {
  COLORS,
  CatalogChips,
  ChipsInput,
  FONTS,
  FieldLockPath,
  PROFICIENCY_META,
  PackageRate,
  PastClient,
  Personality,
  PhotoMeta,
  RecurringPattern,
  SKILL_CATALOG,
  SeasonalWindow,
  SkillEntry,
  SkillProficiency,
  TALENT_TRUST_META,
  TaxonomyParent,
  TrustTier,
  VacationWindow,
  Verifications,
  VideoSlot,
  actionUploadAndAssignMedia,
  useAdminShell,
  useDashboardText,
} from "../../drawer-shared";

export function SkillsProEditor({ entries, onChange }: {
  entries: SkillEntry[];
  onChange: (skillId: string, prof: SkillProficiency | null) => void;
}) {
  const profOf = (id: string): SkillProficiency | null =>
    entries.find(e => e.skillId === id)?.proficiency ?? null;
  const profCycle: Record<SkillProficiency, SkillProficiency | null> = {
    great:    "can_do",
    can_do:   "learning",
    learning: null,
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, fontFamily: FONTS.body }}>
      {(["great", "can_do", "learning"] as SkillProficiency[]).map(p => {
        const meta = PROFICIENCY_META[p];
        const inThisBucket = entries.filter(e => e.proficiency === p);
        return (
          <div key={p}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 6,
              fontSize: 11, fontWeight: 600, letterSpacing: 0.4,
              color: meta.fg,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: meta.fg }} />
              {meta.label}
              <span style={{ color: COLORS.inkDim, fontWeight: 500, letterSpacing: 0 }}>· {inThisBucket.length}</span>
            </div>
            <div style={{ fontSize: 10.5, marginBottom: 6 }} className="text-admin-ink-dim">
              {meta.helper}
            </div>
            {inThisBucket.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6 }}>
                {inThisBucket.map(e => {
                  const item = SKILL_CATALOG.find(s => s.id === e.skillId);
                  if (!item) return null;
                  return (
                    <button key={e.skillId} type="button"
                      onClick={() => onChange(e.skillId, profCycle[p])}
                      style={{
                        padding: "5px 10px", borderRadius: 999,
                        border: `1.5px solid ${meta.fg}`,
                        background: meta.bg, color: meta.fg,
                        fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                      }}>{item.label}</button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      <div style={{
        borderTop: `1px solid ${COLORS.borderSoft}`, paddingTop: 10,
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, marginBottom: 6 }} className="text-admin-ink-muted">
          Catalog · tap to start at &quot;Great at&quot; then cycle to lower tiers
        </div>
        <CatalogChips
          items={SKILL_CATALOG.filter(s => !entries.some(e => e.skillId === s.id))}
          selected={new Set([])}
          onToggle={(id) => onChange(id, "great")}
        />
      </div>
    </div>
  );
}

// ── Bio tone selector ────────────────────────────────────────────────
// ── Personality (love / avoid) ───────────────────────────────────────

export type PersonalityEditorProps = {
  value: Personality;
  onChange: (p: Personality) => void;
};

export const PersonalityEditor = React.memo(function PersonalityEditor({ value, onChange }: PersonalityEditorProps) {
  // Stable callbacks so the memoized ChipsInput children only re-render
  // when their `values` actually change.
  // Q5: ref write moved to useEffect (was in render body, tripping refs).
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  });
  const setLoves = React.useCallback((v: string[]) => onChange({ ...valueRef.current, loves: v }), [onChange]);
  const setAvoids = React.useCallback((v: string[]) => onChange({ ...valueRef.current, avoids: v }), [onChange]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: FONTS.body }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, marginBottom: 6 }} className="text-admin-ink-muted">
          ❤️  I love
        </div>
        <ChipsInput label="" placeholder="e.g. Champagne service, French villas, late-night gigs"
          values={value.loves} onChange={setLoves} />
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, marginBottom: 6 }} className="text-admin-ink-muted">
          ⊘  I avoid
        </div>
        <ChipsInput label="" placeholder="e.g. Photoshoots before 10am, smoking environments"
          values={value.avoids} onChange={setAvoids} />
      </div>
    </div>
  );
});

// ── Hello reel + per-photo metadata ─────────────────────────────────

export type HelloReelEditorProps = {
  reel: VideoSlot | null;
  onChange: (r: VideoSlot | null) => void;
  /** Talent profile id — when present, the picked file is uploaded to
   *  Supabase storage as a media_assets row tagged with metadata.kind=
   *  'hello_reel' so it persists across sessions. */
  talentProfileId?: string;
};

export const HelloReelEditor = React.memo(function HelloReelEditor({ reel, onChange, talentProfileId }: HelloReelEditorProps) {
  const { toast } = useAdminShell();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const handleFile = async (f: File) => {
    // Optimistic preview so the user immediately sees the reel as picked.
    onChange({ url: URL.createObjectURL(f), durationSec: 30 });
    if (!talentProfileId) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", f);
      const res = await actionUploadAndAssignMedia(fd, talentProfileId, "reel");
      if (res.ok) {
        onChange({ url: res.data.publicUrl, durationSec: 30 });
      } else {
        toast(`Reel upload failed: ${res.error}`);
        onChange(null);
      }
    } catch (err) {
      logServerError("helloreeleditor_upload", err);
      toast("Reel upload failed");
      onChange(null);
    } finally {
      setUploading(false);
    }
  };
  return (
    <div style={{ marginBottom: 12, fontFamily: FONTS.body }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, marginBottom: 6 }} className="text-admin-ink-muted">
        ✦  Hello reel · 30 sec intro
      </div>
      {reel ? (
        <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${COLORS.borderSoft}`, display: "flex", alignItems: "center", gap: 10 }} className="bg-admin-surface">
          <span style={{ width: 36, height: 36, borderRadius: 10, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }} className="bg-admin-accent">▶</span>
          <div className="flex-1 min-w-0">
            <div className="text-admin-ink text-admin-12h font-semibold">
              {uploading ? "Uploading reel…" : "Reel uploaded"}
            </div>
            <div style={{ fontSize: 11, marginTop: 1 }} className="text-admin-ink-muted">
              {reel.durationSec ? `~${reel.durationSec}s` : "Ready"} · {reel.url.startsWith("blob:") ? (uploading ? "saving…" : "local preview") : "saved"}
            </div>
          </div>
          <button type="button" onClick={() => onChange(null)} style={{
            padding: "5px 10px", borderRadius: 8, border: "none",
            background: "transparent", color: COLORS.inkMuted,
            fontSize: 11, fontWeight: 600, cursor: "pointer",
          }}>Replace</button>
        </div>
      ) : (
        <button type="button" onClick={() => fileRef.current?.click()} style={{
          width: "100%", padding: "16px 12px", borderRadius: 12,
          border: `1.5px dashed ${COLORS.borderSoft}`,
          background: "#fff", cursor: "pointer",
          fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted, fontWeight: 500,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <span className="text-lg">+</span>
          Drop or pick a 30-sec hello reel
        </button>
      )}
      <input ref={fileRef} type="file" accept="video/*" style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
});


export function AlbumsEditorPro({ albums, activeId, onActivate, onChange, loading }: {
  albums: { id: string; name: string; items: PhotoMeta[] }[];
  activeId: string;
  onActivate: (id: string) => void;
  onChange: (a: { id: string; name: string; items: PhotoMeta[] }[]) => void;
  loading?: boolean;
}) {
  const [newName, setNewName] = useState("");
  const addAlbum = () => {
    const name = newName.trim();
    if (!name) return;
    const id = name.toLowerCase().replace(/\s+/g, "-").slice(0, 30) + "-" + Math.random().toString(36).slice(2, 6);
    onChange([...albums, { id, name, items: [] }]);
    setNewName("");
  };
  const renameAlbum = (id: string, name: string) =>
    onChange(albums.map(a => a.id === id ? { ...a, name } : a));
  const deleteAlbum = (id: string) => {
    if (albums.length <= 1) return;
    onChange(albums.filter(a => a.id !== id));
    if (activeId === id) onActivate(albums[0].id);
  };

  return (
    <div style={{ fontFamily: FONTS.body }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {albums.map(a => {
          const active = a.id === activeId;
          return (
            <button key={a.id} type="button" onClick={() => onActivate(a.id)} style={{
              padding: "6px 11px", borderRadius: 999,
              border: `1.5px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
              background: active ? "rgba(15,79,62,0.08)" : "#fff",
              color: active ? COLORS.accentDeep : COLORS.ink,
              fontSize: 11.5, fontWeight: 600, cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              {a.name} <span style={{ fontWeight: 500 }} className="text-admin-ink-dim">· {loading ? "…" : a.items.length}</span>
            </button>
          );
        })}
      </div>
      <div style={{ padding: 14, borderRadius: 10, border: `1px solid ${COLORS.borderSoft}` }} className="bg-admin-surface">
        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }} className="text-admin-ink">
          Manage albums
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {albums.map(a => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="text" value={a.name}
                onChange={(e) => renameAlbum(a.id, e.target.value)}
                style={{
                  flex: 1, padding: "7px 10px", borderRadius: 8,
                  border: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body,
                  fontSize: 12.5, color: COLORS.ink, outline: "none", background: "#fff",
                }}
              />
              <span className="text-admin-ink-muted text-admin-11">{loading ? "…" : `${a.items.length} photo${a.items.length === 1 ? "" : "s"}`}</span>
              {albums.length > 1 && (
                <button type="button" onClick={() => deleteAlbum(a.id)} aria-label="Delete album" style={{
                  width: 24, height: 24, borderRadius: 6,
                  border: "none", background: "transparent", color: COLORS.inkMuted,
                  fontSize: 14, cursor: "pointer", padding: 0,
                }}>×</button>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input type="text" value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAlbum(); } }}
            placeholder="e.g. Editorial, Lookbook, Behind-the-scenes…"
            style={{
              flex: 1, padding: "9px 12px", borderRadius: 8,
              border: `1.5px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body,
              fontSize: 12.5, color: COLORS.ink, outline: "none",
            }}
          />
          <button type="button" onClick={addAlbum} disabled={!newName.trim()} style={{
            padding: "0 14px", borderRadius: 8, border: "none",
            background: newName.trim() ? COLORS.fill : "rgba(11,11,13,0.10)",
            color: newName.trim() ? "#fff" : COLORS.inkDim,
            fontFamily: FONTS.body, fontSize: 12, fontWeight: 600,
            cursor: newName.trim() ? "pointer" : "default",
          }}>Add album</button>
        </div>
      </div>
    </div>
  );
}

// ── Aspirations editor ───────────────────────────────────────────────

export function AspirationsEditor({ allowedParents, primaryType, secondaryTypes, value, onToggle }: {
  allowedParents: TaxonomyParent[];
  primaryType: string | null;
  secondaryTypes: string[];
  value: string[];
  onToggle: (id: string) => void;
}) {
  const exclude = new Set([primaryType, ...secondaryTypes].filter(Boolean) as string[]);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, fontFamily: FONTS.body }}>
      {allowedParents.flatMap(p => p.children).filter(c => !exclude.has(c.id)).map(c => {
        const active = value.includes(c.id);
        return (
          <button key={c.id} type="button" onClick={() => onToggle(c.id)} style={{
            padding: "5px 11px", borderRadius: 999,
            border: `1px ${active ? "solid" : "dashed"} ${active ? COLORS.indigo : COLORS.border}`,
            background: active ? COLORS.indigoSoft : "transparent",
            color: active ? COLORS.indigoDeep : COLORS.inkMuted,
            fontSize: 11, fontWeight: 500, cursor: "pointer",
          }}>{c.label}</button>
        );
      })}
    </div>
  );
}

// ── Seasonal availability ────────────────────────────────────────────

export function SeasonalEditor({ windows, onChange }: {
  windows: SeasonalWindow[];
  onChange: (w: SeasonalWindow[]) => void;
}) {
  const [draft, setDraft] = useState<{ city: string; startMonth: number; endMonth: number }>({ city: "", startMonth: 11, endMonth: 4 });
  const monthName = (m: number) => ["", "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m] ?? String(m);
  return (
    <div style={{ fontFamily: FONTS.body }}>
      {windows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {windows.map(w => (
            <div key={w.id} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 10px", borderRadius: 10,
              background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }} className="text-admin-ink">
                {w.city} · {monthName(w.startMonth)}–{monthName(w.endMonth)}
              </span>
              <button type="button" onClick={() => onChange(windows.filter(x => x.id !== w.id))} aria-label="Remove" style={{
                background: "transparent", border: "none", padding: 0, cursor: "pointer",
                color: COLORS.inkMuted, fontSize: 14, lineHeight: 1, fontWeight: 700, width: 20,
              }}>×</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <input type="text" value={draft.city} onChange={(e) => setDraft(d => ({ ...d, city: e.target.value }))}
          placeholder="City — e.g. Tulum"
          style={{
            flex: 1, minWidth: 140, padding: "8px 12px", borderRadius: 8,
            border: `1.5px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body,
            fontSize: 12.5, color: COLORS.ink, outline: "none",
          }}
        />
        <select value={draft.startMonth} onChange={(e) => setDraft(d => ({ ...d, startMonth: Number(e.target.value) }))}
          style={{ padding: "8px 8px", borderRadius: 8, border: `1px solid ${COLORS.borderSoft}`, fontSize: 12, color: COLORS.ink, background: "#fff" }}>
          {Array.from({ length: 12 }).map((_, i) => <option key={i+1} value={i+1}>{monthName(i+1)}</option>)}
        </select>
        <span className="text-admin-ink-dim text-admin-11">→</span>
        <select value={draft.endMonth} onChange={(e) => setDraft(d => ({ ...d, endMonth: Number(e.target.value) }))}
          style={{ padding: "8px 8px", borderRadius: 8, border: `1px solid ${COLORS.borderSoft}`, fontSize: 12, color: COLORS.ink, background: "#fff" }}>
          {Array.from({ length: 12 }).map((_, i) => <option key={i+1} value={i+1}>{monthName(i+1)}</option>)}
        </select>
        <button type="button" onClick={() => {
          if (!draft.city.trim()) return;
          onChange([...windows, { id: `season-${Date.now()}`, ...draft }]);
          setDraft({ city: "", startMonth: 11, endMonth: 4 });
        }} disabled={!draft.city.trim()} style={{
          padding: "8px 14px", borderRadius: 8, border: "none",
          background: draft.city.trim() ? COLORS.fill : "rgba(11,11,13,0.10)",
          color: draft.city.trim() ? "#fff" : COLORS.inkDim,
          fontSize: 12, fontWeight: 600, cursor: draft.city.trim() ? "pointer" : "default",
        }}>Add</button>
      </div>
    </div>
  );
}

// ── Recurring + vacation ─────────────────────────────────────────────

export function RecurringPatternEditor({ value, vacation, onChange, onVacationChange }: {
  value: RecurringPattern;
  vacation: VacationWindow | null;
  onChange: (r: RecurringPattern) => void;
  onVacationChange: (v: VacationWindow | null) => void;
}) {
  const dows = ["S", "M", "T", "W", "T", "F", "S"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: FONTS.body }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, marginBottom: 6 }} className="text-admin-ink-muted">
          Recurring pattern
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {([
            { id: "none" as const,           label: "No pattern" },
            { id: "weekends-only" as const,  label: "Weekends only" },
            { id: "weekdays-only" as const,  label: "Weekdays only" },
            { id: "weekly-busy" as const,    label: "Weekly busy days" },
          ]).map(o => {
            const active = value.kind === o.id;
            return (
              <button key={o.id} type="button" onClick={() => onChange({ kind: o.id, busyDays: o.id === "weekly-busy" ? value.busyDays ?? [] : undefined })} style={{
                padding: "6px 11px", borderRadius: 999,
                border: `1.5px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
                background: active ? "rgba(15,79,62,0.08)" : "#fff",
                color: active ? COLORS.accentDeep : COLORS.ink,
                fontSize: 11.5, fontWeight: 600, cursor: "pointer",
              }}>{o.label}</button>
            );
          })}
        </div>
        {value.kind === "weekly-busy" && (
          <div style={{ marginTop: 8, display: "flex", gap: 4 }}>
            {dows.map((d, i) => {
              const active = value.busyDays?.includes(i) ?? false;
              return (
                <button key={i} type="button" onClick={() => {
                  const cur = value.busyDays ?? [];
                  const next = active ? cur.filter(x => x !== i) : [...cur, i];
                  onChange({ kind: "weekly-busy", busyDays: next });
                }} style={{
                  width: 32, height: 32, borderRadius: "50%", border: "none",
                  background: active ? COLORS.amberDeep : COLORS.surface,
                  color: active ? "#fff" : COLORS.inkMuted,
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                }}>{d}</button>
              );
            })}
          </div>
        )}
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, marginBottom: 6 }} className="text-admin-ink-muted">
          Vacation mode
        </div>
        {vacation ? (
          <div style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid rgba(91,107,160,0.18)`, display: "flex", alignItems: "center", gap: 8 }} className="bg-admin-indigo-soft">
            <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }} className="text-admin-indigo-deep">
              Out {vacation.start} → {vacation.end}
            </span>
            <button type="button" onClick={() => onVacationChange(null)} style={{
              padding: "5px 10px", borderRadius: 8, border: "none",
              background: "#fff", color: COLORS.indigoDeep,
              fontSize: 11, fontWeight: 600, cursor: "pointer",
            }}>Cancel</button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="date" id="vacstart" style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${COLORS.borderSoft}`, fontSize: 12 }} />
            <span className="text-admin-ink-dim text-admin-11">→</span>
            <input type="date" id="vacend"   style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${COLORS.borderSoft}`, fontSize: 12 }} />
            <button type="button" onClick={() => {
              const s = (document.getElementById("vacstart") as HTMLInputElement)?.value;
              const e = (document.getElementById("vacend") as HTMLInputElement)?.value;
              if (s && e) onVacationChange({ start: s, end: e });
            }} style={{
              padding: "8px 14px", borderRadius: 8, border: "none",
              background: COLORS.fill, color: "#fff",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>Set vacation</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Package rates ────────────────────────────────────────────────────

export function PackageRatesEditor({ packages, onChange }: {
  packages: PackageRate[];
  onChange: (p: PackageRate[]) => void;
}) {
  const add = () => onChange([...packages, {
    id: `pkg-${Date.now()}`, name: "", description: "", amount: 0, currency: "EUR",
  }]);
  const update = (id: string, p: Partial<PackageRate>) =>
    onChange(packages.map(x => x.id === id ? { ...x, ...p } : x));
  const remove = (id: string) => onChange(packages.filter(x => x.id !== id));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, fontFamily: FONTS.body }}>
      {packages.map(p => (
        <div key={p.id} style={{
          padding: 12, borderRadius: 10,
          border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
        }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <input type="text" value={p.name} onChange={(e) => update(p.id, { name: e.target.value })}
              placeholder="Package name — e.g. 1-day shoot + social repost"
              style={{
                flex: 1, padding: "9px 12px", borderRadius: 8,
                border: `1.5px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body,
                fontSize: 13, fontWeight: 600, color: COLORS.ink, outline: "none",
              }}
            />
            <button type="button" onClick={() => remove(p.id)} aria-label="Remove" style={{
              width: 32, height: 32, borderRadius: 8, border: "none",
              background: "transparent", color: COLORS.inkMuted, fontSize: 16, cursor: "pointer",
            }}>×</button>
          </div>
          <textarea value={p.description} onChange={(e) => update(p.id, { description: e.target.value })}
            placeholder="What's included — e.g. 1 day on set + 1 Instagram repost within 7 days"
            rows={2}
            style={{
              width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8,
              border: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body,
              fontSize: 12, color: COLORS.ink, outline: "none", resize: "vertical",
              marginBottom: 6,
            }}
          />
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select value={p.currency} onChange={(e) => update(p.id, { currency: e.target.value })} style={{
              padding: "8px 10px", borderRadius: 8, border: `1px solid ${COLORS.borderSoft}`,
              background: "#fff", fontSize: 12, color: COLORS.ink,
            }}>
              <option value="EUR">€ EUR</option>
              <option value="USD">$ USD</option>
              <option value="GBP">£ GBP</option>
              <option value="MXN">$ MXN</option>
            </select>
            <input type="number" min={0} value={p.amount} onChange={(e) => update(p.id, { amount: Number(e.target.value) })}
              placeholder="0"
              style={{
                flex: 1, padding: "8px 12px", borderRadius: 8,
                border: `1.5px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body,
                fontSize: 13, color: COLORS.ink, outline: "none",
              }}
            />
            <input type="text" value={p.conditions ?? ""} onChange={(e) => update(p.id, { conditions: e.target.value })}
              placeholder="Conditions"
              style={{
                flex: 1, padding: "8px 12px", borderRadius: 8,
                border: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body,
                fontSize: 12, color: COLORS.ink, outline: "none",
              }}
            />
          </div>
        </div>
      ))}
      <button type="button" onClick={add} style={{
        padding: "9px 14px", borderRadius: 10,
        background: "transparent", border: `1.5px dashed ${COLORS.border}`,
        color: COLORS.inkMuted, fontSize: 12, fontWeight: 600, cursor: "pointer",
      }}>+ Add package</button>
    </div>
  );
}

// ── Past clients + testimonials ──────────────────────────────────────

export type PastClientsEditorProps = {
  clients: PastClient[];
  onChange: (c: PastClient[]) => void;
};

export const PastClientsEditor = React.memo(function PastClientsEditor({ clients, onChange }: PastClientsEditorProps) {
  const add = () => onChange([...clients, { id: `pc-${Date.now()}`, name: "", testimonial: "", testimonialBy: "" }]);
  const update = (id: string, p: Partial<PastClient>) =>
    onChange(clients.map(x => x.id === id ? { ...x, ...p } : x));
  const remove = (id: string) => onChange(clients.filter(x => x.id !== id));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, fontFamily: FONTS.body }}>
      {clients.map(c => (
        <div key={c.id} style={{
          padding: 12, borderRadius: 10,
          border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
        }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
            <input type="text" value={c.name} onChange={(e) => update(c.id, { name: e.target.value })}
              placeholder="Client name — e.g. Mango"
              style={{
                flex: 1, padding: "9px 12px", borderRadius: 8,
                border: `1.5px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body,
                fontSize: 13, fontWeight: 600, color: COLORS.ink, outline: "none",
              }}
            />
            {c.verified && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 999 }} className="bg-admin-success-soft text-admin-success-deep">✓ Verified booking</span>
            )}
            <button type="button" onClick={() => remove(c.id)} aria-label="Remove" style={{
              width: 28, height: 28, borderRadius: 8, border: "none",
              background: "transparent", color: COLORS.inkMuted, fontSize: 14, cursor: "pointer",
            }}>×</button>
          </div>
          <textarea value={c.testimonial ?? ""} onChange={(e) => update(c.id, { testimonial: e.target.value })}
            placeholder="One-line testimonial…"
            rows={2}
            style={{
              width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8,
              border: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body,
              fontSize: 12, color: COLORS.ink, outline: "none", resize: "vertical",
              marginBottom: 6,
            }}
          />
          <input type="text" value={c.testimonialBy ?? ""} onChange={(e) => update(c.id, { testimonialBy: e.target.value })}
            placeholder="By — e.g. Marco Russo, photographer"
            style={{
              width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8,
              border: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body,
              fontSize: 11.5, color: COLORS.inkMuted, outline: "none",
            }}
          />
        </div>
      ))}
      <button type="button" onClick={add} style={{
        padding: "9px 14px", borderRadius: 10,
        background: "transparent", border: `1.5px dashed ${COLORS.border}`,
        color: COLORS.inkMuted, fontSize: 12, fontWeight: 600, cursor: "pointer",
      }}>+ Add client</button>
    </div>
  );
});

// ── Next-tier coach (in trust section) ──────────────────────────────

export function NextTierCoach({ tier, verifications }: {
  tier: TrustTier;
  verifications: Verifications;
}) {
  if (tier === "gold") {
    return (
      <div style={{
        padding: 12, borderRadius: 10, marginTop: 12,
        background: "rgba(184,135,49,0.10)",
        border: "1px solid rgba(184,135,49,0.25)",
        fontSize: 12, color: "#7A5A1F", fontFamily: FONTS.body, lineHeight: 1.5,
      }}>★ You&apos;ve reached the top tier. Keep delivering on bookings to stay there.</div>
    );
  }
  let nextSteps: string[] = [];
  if (tier === "basic") {
    if (!verifications.idSubmitted)     nextSteps.push("Submit a government ID");
    if (!verifications.payoutConnected) nextSteps.push("Connect a payout method");
  } else if (tier === "verified") {
    nextSteps.push("Complete 1 booking on Tulala to reach Silver");
  } else if (tier === "silver") {
    if (verifications.bookingsCount < 5) {
      nextSteps.push(`${5 - verifications.bookingsCount} more bookings`);
    }
    if (!verifications.hasFundedClient) {
      nextSteps.push("1 funded-account client booking");
    }
  }
  if (nextSteps.length === 0) return null;
  const targetTier: TrustTier = tier === "basic" ? "verified" : tier === "verified" ? "silver" : "gold";
  const targetMeta = TALENT_TRUST_META[targetTier];
  return (
    <div style={{
      padding: 12, borderRadius: 10, marginTop: 12,
      background: targetMeta.bg, border: `1px solid ${targetMeta.fg}30`,
      fontFamily: FONTS.body,
    }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: targetMeta.fg, marginBottom: 6 }}>
        Reach {targetMeta.label} {targetMeta.emoji}
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.55 }} className="text-admin-ink">
        {nextSteps.map(s => <li key={s}>{s}</li>)}
      </ul>
    </div>
  );
}


// ── Field-lock toggle (admin) ────────────────────────────────────────

export function FieldLockToggle({ path, locks, onChange, fieldLabel }: {
  path: FieldLockPath;
  locks: FieldLockPath[];
  onChange: (next: FieldLockPath[]) => void;
  /** Audit #5 — when the toggle is rendered away from its field (e.g.
   *  the admin lock cluster), pass the field's friendly name so the
   *  pill says WHICH field it controls instead of being an orphan. */
  fieldLabel?: string;
}) {
  const copy = useDashboardText();
  const isLocked = locks.includes(path);
  return (
    <button
      type="button"
      title={copy.t(isLocked ? "Talent can't edit this. Tap to unlock." : "Talent can edit this. Tap to lock.")}
      onClick={() => onChange(isLocked ? locks.filter(x => x !== path) : [...locks, path])}
      style={{
        padding: "4px 9px", borderRadius: 999,
        border: `1px solid ${isLocked ? COLORS.amberDeep : COLORS.borderSoft}`,
        background: isLocked ? COLORS.amberSoft : "#fff",
        color: isLocked ? COLORS.amberDeep : COLORS.inkMuted,
        fontSize: 10.5, fontWeight: 600, cursor: "pointer",
        fontFamily: FONTS.body,
        display: "inline-flex", alignItems: "center", gap: 4,
      }}
    >
      {fieldLabel && (
        <span style={{ fontWeight: 700 }} className="text-admin-ink">
          {copy.t(fieldLabel)} ·
        </span>
      )}
      {isLocked ? `🔒 ${copy.t("Talent can't edit")}` : `🔓 ${copy.t("Talent can edit")}`}
    </button>
  );
}

