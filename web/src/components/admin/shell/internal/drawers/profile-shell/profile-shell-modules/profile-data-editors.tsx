// Phase-1f decomp — Polaroids · Credits · Limits · Files editors (each
// React.memo'd; each handles its own optimistic-row + upload lifecycle).
// tempId kept module-scoped here (consumers: LimitsEditor add() + FilesEditor
// add()/optimistic-row).
"use client";
import React, { useEffect, useRef } from "react";
import { logServerError } from "@/lib/server/safe-error";
import {
  COLORS,
  FONTS,
  actionDeleteMediaAssets,
  actionDeleteTalentDocument,
  actionGetTalentDocumentSignedUrl,
  actionUploadAndAssignMedia,
  actionUploadTalentDocument,
  useAdminShell,
} from "../../drawer-shared";

// Q5: hoisted ID generator for new optimistic rows. Date.now() +
// Math.random() inside render-body closures (handler factories like
// `add = () => onChange([..., { id: tempId('lim') }])`) tripped
// react-hooks/purity even though they only execute on user events;
// moving the impure calls to module scope cleans that up.
function tempId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
}

export type PolaroidsEditorProps = {
  polaroids: { id: string; angle: string; url: string | null; mediaAssetId?: string | null }[];
  onChange: (p: { id: string; angle: string; url: string | null; mediaAssetId?: string | null }[]) => void;
  talentProfileId?: string;
};

export const PolaroidsEditor = React.memo(function PolaroidsEditor({ polaroids, onChange, talentProfileId }: PolaroidsEditorProps) {
  const { toast } = useAdminShell();
  const fileRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  // Q5: ref write moved to useEffect (was in render body, tripping refs).
  const polaroidsRef = useRef(polaroids);
  useEffect(() => {
    polaroidsRef.current = polaroids;
  });
  const filledCount = polaroids.filter(p => p.url).length;
  const setUrl = (id: string, url: string | null, mediaAssetId?: string | null) =>
    onChange(polaroidsRef.current.map(p => p.id === id ? { ...p, url, mediaAssetId: mediaAssetId === undefined ? p.mediaAssetId : mediaAssetId } : p));
  const handlePick = async (id: string, f: File) => {
    setUrl(id, URL.createObjectURL(f));
    if (!talentProfileId) return;
    const slot = polaroidsRef.current.find(p => p.id === id);
    // Soft-delete previous polaroid for this slot if any
    if (slot?.mediaAssetId) void actionDeleteMediaAssets([slot.mediaAssetId]);
    const fd = new FormData(); fd.append("file", f);
    const res = await actionUploadAndAssignMedia(fd, talentProfileId, "polaroid", { polaroidSlot: id });
    if (res.ok) setUrl(id, res.data.publicUrl, res.data.id);
    else { toast(res.error || "Upload failed"); setUrl(id, null, null); }
  };
  const handleClear = (id: string) => {
    const slot = polaroidsRef.current.find(p => p.id === id);
    if (talentProfileId && slot?.mediaAssetId) void actionDeleteMediaAssets([slot.mediaAssetId]);
    setUrl(id, null, null);
  };
  return (
    <div style={{ fontFamily: FONTS.body }}>
      <div style={{ fontSize: 11, marginBottom: 10, lineHeight: 1.5 }} className="text-admin-ink-muted">
        {filledCount} of 5 polaroids set. Casting directors check this set first.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
        {polaroids.map(p => (
          <div key={p.id}>
            <button type="button" onClick={() => fileRefs.current.get(p.id)?.click()} style={{
              width: "100%", aspectRatio: "3 / 4", borderRadius: 8,
              background: p.url ? `url(${p.url}) center/cover, ${COLORS.surfaceAlt}` : COLORS.surfaceAlt,
              border: p.url ? `1.5px solid ${COLORS.accent}` : `1.5px dashed ${COLORS.borderSoft}`,
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, color: COLORS.inkMuted, position: "relative", overflow: "hidden",
            }}>
              {!p.url && "+"}
              {p.url && (
                <span onClick={(e) => { e.stopPropagation(); handleClear(p.id); }} style={{
                  position: "absolute", top: 4, right: 4,
                  width: 20, height: 20, borderRadius: "50%",
                  background: "rgba(11,11,13,0.6)", color: "#fff",
                  fontSize: 11, lineHeight: 1, fontWeight: 700,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                }}>×</span>
              )}
            </button>
            <input ref={(el) => { if (el) fileRefs.current.set(p.id, el); }}
              type="file" accept="image/*" capture="user" style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handlePick(p.id, f);
                e.target.value = "";
              }}
            />
            <div style={{
              fontSize: 10, color: p.url ? COLORS.ink : COLORS.inkMuted,
              fontWeight: 600, textAlign: "center", marginTop: 4,
            }}>{p.angle}</div>
          </div>
        ))}
      </div>
    </div>
  );
});

// ── Credits editor ──────────────────────────────────────────────────

export type CreditsEntry = { id: string; year: string; brand: string; type: string; credit?: string; role?: string; pinned?: boolean };

export type CreditsEditorProps = {
  credits: CreditsEntry[];
  onChange: (c: CreditsEntry[]) => void;
};

export const CreditsEditor = React.memo(function CreditsEditor({ credits, onChange }: CreditsEditorProps) {
  const add = () => onChange([...credits, { id: `cr-${Date.now()}`, year: "", brand: "", type: "Editorial" }]);
  const update = (id: string, patch: Partial<typeof credits[number]>) =>
    onChange(credits.map(c => c.id === id ? { ...c, ...patch } : c));
  const remove = (id: string) => onChange(credits.filter(c => c.id !== id));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, fontFamily: FONTS.body }}>
      {credits.length > 0 && (
        <div style={{ fontSize: 11, marginBottom: -2 }} className="text-admin-ink-dim">
          Pin up to 3 with the ★ — they show first on your public profile.
        </div>
      )}
      {credits.map(c => (
        <div key={c.id} style={{
          padding: 12, borderRadius: 10,
          border: `1px solid ${c.pinned ? COLORS.accent : COLORS.borderSoft}`,
          background: c.pinned ? "rgba(15,79,62,0.04)" : "#fff",
        }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
            <input type="text" value={c.year} onChange={(e) => update(c.id, { year: e.target.value })}
              placeholder="2026 / S/S 25"
              style={{ width: 120, padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink, outline: "none" }}
            />
            <input type="text" value={c.brand} onChange={(e) => update(c.id, { brand: e.target.value })}
              placeholder="Brand — e.g. Vogue Italia"
              style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, color: COLORS.ink, outline: "none" }}
            />
            <button type="button" onClick={() => update(c.id, { pinned: !c.pinned })} aria-label={c.pinned ? "Unpin" : "Pin"} style={{
              width: 30, height: 30, borderRadius: 8, border: "none",
              background: c.pinned ? COLORS.accent : "transparent",
              color: c.pinned ? "#fff" : COLORS.inkMuted,
              fontSize: 13, cursor: "pointer",
            }}>★</button>
            <button type="button" onClick={() => remove(c.id)} aria-label="Remove" style={{
              width: 28, height: 28, borderRadius: 8, border: "none",
              background: "transparent", color: COLORS.inkMuted, fontSize: 14, cursor: "pointer",
            }}>×</button>
          </div>
          <div className="flex gap-1.5">
            <select value={c.type} onChange={(e) => update(c.id, { type: e.target.value })} style={{
              padding: "8px 10px", borderRadius: 8, border: `1px solid ${COLORS.borderSoft}`,
              background: "#fff", fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink, outline: "none",
            }}>
              <option value="Editorial">Editorial</option>
              <option value="Campaign">Campaign</option>
              <option value="Cover">Cover</option>
              <option value="Lookbook">Lookbook</option>
              <option value="Runway">Runway</option>
              <option value="Performance">Performance</option>
              <option value="Event">Event</option>
              <option value="Other">Other</option>
            </select>
            <input type="text" value={c.role ?? ""} onChange={(e) => update(c.id, { role: e.target.value })}
              placeholder="Role — e.g. Lead, Walk · 4 looks"
              style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink, outline: "none" }}
            />
          </div>
          <input type="text" value={c.credit ?? ""} onChange={(e) => update(c.id, { credit: e.target.value })}
            placeholder="Credit — e.g. Photo · Marco Russo"
            style={{ width: "100%", boxSizing: "border-box", marginTop: 6, padding: "8px 10px", borderRadius: 8, border: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted, outline: "none" }}
          />
        </div>
      ))}
      <button type="button" onClick={add} style={{
        padding: "9px 14px", borderRadius: 10,
        background: "transparent", border: `1.5px dashed ${COLORS.border}`,
        color: COLORS.inkMuted, fontSize: 12, fontWeight: 600, cursor: "pointer",
        fontFamily: FONTS.body,
      }}>+ Add credit</button>
    </div>
  );
});

// ── Limits editor ──────────────────────────────────────────────────

export type LimitsEntry = { id: string; category: string; label: string; enforcement: "hard" | "soft" };

export type LimitsEditorProps = {
  limits: LimitsEntry[];
  onChange: (l: LimitsEntry[]) => void;
};

export const LimitsEditor = React.memo(function LimitsEditor({ limits, onChange }: LimitsEditorProps) {
  const QUICK_LIMITS = [
    "No nudity", "No fur", "Lingerie · case-by-case", "No tobacco / vape",
    "No alcohol", "No religious imagery", "Vegan only",
  ];
  const add = (label?: string) => onChange([...limits, {
    id: tempId("lim"), category: "wardrobe", label: label ?? "", enforcement: "hard",
  }]);
  const update = (id: string, patch: Partial<typeof limits[number]>) =>
    onChange(limits.map(l => l.id === id ? { ...l, ...patch } : l));
  const remove = (id: string) => onChange(limits.filter(l => l.id !== id));
  const usedLabels = new Set(limits.map(l => l.label.toLowerCase()));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, fontFamily: FONTS.body }}>
      {limits.map(l => (
        <div key={l.id} style={{
          display: "flex", gap: 6, alignItems: "center",
          padding: "8px 10px", borderRadius: 10,
          border: `1px solid ${l.enforcement === "hard" ? "rgba(176,48,58,0.30)" : COLORS.borderSoft}`,
          background: l.enforcement === "hard" ? "rgba(176,48,58,0.04)" : "#fff",
        }}>
          <input type="text" value={l.label} onChange={(e) => update(l.id, { label: e.target.value })}
            placeholder="e.g. No nudity"
            style={{ flex: 1, padding: "6px 8px", border: "none", background: "transparent", fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, outline: "none" }}
          />
          <select value={l.enforcement} onChange={(e) => update(l.id, { enforcement: e.target.value as "hard" | "soft" })} style={{
            padding: "5px 8px", borderRadius: 6,
            border: `1px solid ${COLORS.borderSoft}`,
            background: "#fff", fontSize: 11, color: COLORS.ink, outline: "none",
          }}>
            <option value="hard">Hard · won&apos;t do</option>
            <option value="soft">Soft · case-by-case</option>
          </select>
          <button type="button" onClick={() => remove(l.id)} aria-label="Remove" style={{
            width: 26, height: 26, borderRadius: 6, border: "none",
            background: "transparent", color: COLORS.inkMuted, fontSize: 13, cursor: "pointer",
          }}>×</button>
        </div>
      ))}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, marginBottom: 6 }} className="text-admin-ink-muted">Quick add</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {QUICK_LIMITS.filter(l => !usedLabels.has(l.toLowerCase())).map(l => (
            <button key={l} type="button" onClick={() => add(l)} style={{
              padding: "5px 11px", borderRadius: 999,
              border: `1px dashed ${COLORS.border}`,
              background: "transparent", color: COLORS.inkMuted,
              fontSize: 11, fontWeight: 500, cursor: "pointer",
              fontFamily: FONTS.body,
            }}>+ {l}</button>
          ))}
        </div>
      </div>
      <button type="button" onClick={() => add()} style={{
        alignSelf: "flex-start", padding: "7px 12px", borderRadius: 999,
        background: "transparent", border: `1.5px dashed ${COLORS.border}`,
        color: COLORS.inkMuted, fontSize: 12, fontWeight: 600, cursor: "pointer",
        fontFamily: FONTS.body,
      }}>+ Custom limit</button>
    </div>
  );
});

// ── Files editor ───────────────────────────────────────────────────

export type FilesEditorEntry = { id: string; name: string; kind: string; sizeBytes?: number; uploadedAt: string; storagePath?: string; bucketId?: string; mimeType?: string; uploading?: boolean; uploadError?: string };

export type FilesEditorProps = {
  files: FilesEditorEntry[];
  onChange: (f: FilesEditorEntry[]) => void;
  /** When set, picked files are uploaded to the private media-originals
   *  bucket and the metadata list reflects the real storage path. */
  talentProfileId?: string;
};

export const FilesEditor = React.memo(function FilesEditor({ files, onChange, talentProfileId }: FilesEditorProps) {
  const { toast } = useAdminShell();
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Q5: ref write moved to useEffect (was in render body, tripping refs).
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  });
  const ICON_FOR_KIND: Record<string, string> = {
    tax: "🧾", release: "📝", nda: "🔒", contract: "📃", cert: "🎓", id: "🪪", other: "📄",
  };
  const guessKind = (name: string) => {
    const lower = name.toLowerCase();
    return /tax|w8|w9|w-8|w-9/.test(lower) ? "tax"
      : /release/.test(lower) ? "release"
      : /nda/.test(lower) ? "nda"
      : /contract/.test(lower) ? "contract"
      : /cert|diploma/.test(lower) ? "cert"
      : "other";
  };
  const add = async (selectedFile: File) => {
    const id = tempId("f");
    const kind = guessKind(selectedFile.name);
    // Optimistic — show the file row immediately with `uploading: true`.
    const optimistic: FilesEditorEntry = {
      id,
      name: selectedFile.name,
      kind,
      sizeBytes: selectedFile.size,
      uploadedAt: new Date().toISOString(),
      mimeType: selectedFile.type || undefined,
      uploading: !!talentProfileId,
    };
    onChange([...filesRef.current, optimistic]);
    if (!talentProfileId) return;
    try {
      const fd = new FormData(); fd.append("file", selectedFile);
      const res = await actionUploadTalentDocument(fd, talentProfileId);
      const next = [...filesRef.current];
      const idx = next.findIndex(f => f.id === id);
      if (idx === -1) return;
      if (res.ok) {
        next[idx] = { ...next[idx], storagePath: res.data.storagePath, bucketId: res.data.bucketId, sizeBytes: res.data.sizeBytes, mimeType: res.data.mimeType, uploading: false, uploadError: undefined };
      } else {
        next[idx] = { ...next[idx], uploading: false, uploadError: res.error };
      }
      onChange(next);
    } catch (err) {
      logServerError("fileseditor_upload", err);
      const next = [...filesRef.current];
      const idx2 = next.findIndex(f => f.id === id);
      if (idx2 !== -1) next[idx2] = { ...next[idx2], uploading: false, uploadError: "Upload failed — try again." };
      onChange(next);
    }
  };
  const update = (id: string, patch: Partial<FilesEditorEntry>) =>
    onChange(filesRef.current.map(f => f.id === id ? { ...f, ...patch } : f));
  const remove = async (id: string) => {
    const target = filesRef.current.find(f => f.id === id);
    onChange(filesRef.current.filter(f => f.id !== id));
    if (target?.storagePath && target.bucketId && talentProfileId) {
      await actionDeleteTalentDocument(target.bucketId, target.storagePath, talentProfileId, target.id);
    }
  };
  const download = async (entry: FilesEditorEntry) => {
    if (!entry.storagePath || !entry.bucketId || !talentProfileId) return;
    const res = await actionGetTalentDocumentSignedUrl(entry.bucketId, entry.storagePath, talentProfileId);
    if (res.ok) window.open(res.data.url, "_blank", "noopener,noreferrer");
    else toast(res.error);
  };
  const fmtSize = (b?: number) => {
    if (!b) return "—";
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, fontFamily: FONTS.body }}>
      {files.length === 0 && (
        <div style={{ fontSize: 12, lineHeight: 1.5 }} className="text-admin-ink-muted">
          Common files: W-8BEN tax form · NDA · model release · driving license · public-liability cert.
        </div>
      )}
      {files.map(f => (
        <div key={f.id} style={{
          display: "flex", gap: 10, alignItems: "center",
          padding: "10px 12px", borderRadius: 10,
          background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>{ICON_FOR_KIND[f.kind] ?? ICON_FOR_KIND.other}</span>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 12.5, fontWeight: 600, color: f.uploadError ? "#C82828" : COLORS.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {f.name}{f.uploading ? " · uploading…" : ""}
            </div>
            {f.uploadError ? (
              <div style={{ fontSize: 10.5, color: "#C82828", marginTop: 1 }}>{f.uploadError}</div>
            ) : (
              <div style={{ fontSize: 10.5, marginTop: 1 }} className="text-admin-ink-muted">
                {fmtSize(f.sizeBytes)} · uploaded {new Date(f.uploadedAt).toLocaleDateString()}{f.storagePath ? " · saved" : (f.uploading ? "" : " · not saved")}
              </div>
            )}
          </div>
          {f.storagePath && (
            <button type="button" onClick={() => void download(f)} aria-label="Download" title="Download" style={{
              padding: "5px 9px", borderRadius: 6, border: `1px solid ${COLORS.borderSoft}`,
              background: "#fff", color: COLORS.inkMuted, fontSize: 11, fontWeight: 600,
              cursor: "pointer", fontFamily: FONTS.body,
            }}>↓</button>
          )}
          <select value={f.kind} onChange={(e) => update(f.id, { kind: e.target.value })} style={{
            padding: "5px 8px", borderRadius: 6,
            border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
            fontSize: 11, color: COLORS.inkMuted, outline: "none",
          }}>
            <option value="tax">Tax form</option>
            <option value="release">Model release</option>
            <option value="nda">NDA</option>
            <option value="contract">Contract</option>
            <option value="cert">Certification</option>
            <option value="id">ID</option>
            <option value="other">Other</option>
          </select>
          <button type="button" onClick={() => void remove(f.id)} aria-label="Remove" style={{
            width: 26, height: 26, borderRadius: 6, border: "none",
            background: "transparent", color: COLORS.inkMuted, fontSize: 13, cursor: "pointer",
          }}>×</button>
        </div>
      ))}
      <button type="button" onClick={() => fileRef.current?.click()} style={{
        padding: "10px 14px", borderRadius: 10,
        border: `1.5px dashed ${COLORS.border}`,
        background: "transparent", color: COLORS.inkMuted,
        fontSize: 12, fontWeight: 600, cursor: "pointer",
        fontFamily: FONTS.body,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
      }}>
        <span className="text-base">+</span> Upload file (PDF, JPG, PNG, DOC)
      </button>
      <input ref={fileRef} type="file"
        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.heic" multiple style={{ display: "none" }}
        onChange={(e) => {
          const fs = Array.from(e.target.files ?? []);
          fs.forEach(f => add(f));
          e.target.value = "";
        }}
      />
      <div style={{ fontSize: 10.5, marginTop: 4 }} className="text-admin-ink-dim">
        🔒 Files are admin-visible by default. Talent sees but doesn&apos;t edit unless an admin shares.
      </div>
    </div>
  );
});
