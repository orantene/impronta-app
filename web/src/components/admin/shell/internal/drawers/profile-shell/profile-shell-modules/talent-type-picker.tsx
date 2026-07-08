// Phase-1f decomp — admin-add helpers: CSV bulk import panel,
// paste-contact modal, the talent-type picker family (primary grid +
// parent-expanded view + sibling Top-N), the management-method radio.
// Co-located because NewTalentDrawer + ServicesEditor + the wizard all
// reach for the same chip + parent-card UX.
"use client";
import React, { useState, useMemo, useRef } from "react";
import {
  COLORS,
  FONTS,
  TRANSITION,
  TaxonomyChild,
  TaxonomyParent,
  parseTalentCsv,
  shortParentLabel,
  useDashboardText,
} from "../../drawer-shared";

export function CsvBulkAddPanel({ allowedParents, onComplete }: {
  allowedParents: TaxonomyParent[];
  onComplete: (rows: { firstName: string; lastName: string; email: string; phone: string; type: string; city: string }[], defaultType: string | null) => void;
}) {
  const copy = useDashboardText();
  const [raw, setRaw] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [defaultType, setDefaultType] = useState<string | null>(null);
  const parsed = useMemo(() => parseTalentCsv(raw), [raw]);
  const valid = parsed.filter(r => r.firstName.trim() && r.email.trim()).length;
  const sample = `firstName,lastName,email,phone,type,city
Sofia,Lupo,sofia@example.com,+34 612 345 678,Fashion model,Madrid
Carlos,Pérez,carlos@example.com,+52 555 123 4567,DJ,Tulum
Yuna,Park,yuna@example.com,+44 7700 900123,VIP host,London`;

  const handleFile = async (f: File) => {
    const text = await f.text();
    setRaw(text);
  };

  return (
    <div style={{ fontFamily: FONTS.body }}>
      <div style={{ padding: 14, borderRadius: 12, border: `1px solid ${COLORS.borderSoft}`, marginBottom: 14 }} className="bg-admin-surface">
        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }} className="text-admin-ink">
          {copy.t("Paste or upload a CSV")}
        </div>
        <div style={{ fontSize: 11.5, marginBottom: 10, lineHeight: 1.5 }} className="text-admin-ink-muted">
          {copy.t("Headers we recognize:")} <code style={{ fontFamily: FONTS.mono }}>firstName, lastName, email, phone, type, city</code>.
          {" "}{copy.t("Other column orders work too.")}
        </div>
        <textarea value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={sample}
          rows={6}
          style={{
            width: "100%", boxSizing: "border-box", padding: "10px 12px",
            borderRadius: 10, border: `1px solid ${COLORS.border}`,
            fontFamily: FONTS.mono, fontSize: 11.5, color: COLORS.ink, outline: "none",
            resize: "vertical", background: "#fff",
          }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={() => fileRef.current?.click()} style={{
            padding: "7px 12px", borderRadius: 999,
            border: `1px solid ${COLORS.borderSoft}`, background: "#fff", color: COLORS.ink,
            fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>📎 {copy.t("Upload .csv file")}</button>
          <button type="button" onClick={() => setRaw(sample)} style={{
            padding: "7px 12px", borderRadius: 999,
            border: `1px dashed ${COLORS.border}`, background: "transparent",
            color: COLORS.inkMuted,
            fontSize: 12, fontWeight: 500, cursor: "pointer",
          }}>{copy.t("Use sample")}</button>
          {raw && (
            <button type="button" onClick={() => setRaw("")} style={{
              padding: "7px 12px", borderRadius: 999, border: "none",
              background: "transparent", color: COLORS.inkMuted,
              fontSize: 12, fontWeight: 500, cursor: "pointer",
            }}>{copy.t("Clear")}</button>
          )}
          <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
          />
        </div>
      </div>

      {parsed.length > 0 && (
        <>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 8,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }} className="text-admin-ink-muted">
              {(parsed.length === 1 ? copy.t("Preview · {count} row ({valid} valid)") : copy.t("Preview · {count} rows ({valid} valid)")).replace("{count}", String(parsed.length)).replace("{valid}", String(valid))}
            </div>
            <select value={defaultType ?? ""} onChange={(e) => setDefaultType(e.target.value || null)} style={{
              padding: "5px 9px", borderRadius: 6,
              border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
              fontSize: 11, color: COLORS.ink, outline: "none", fontFamily: FONTS.body,
            }}>
              <option value="">{copy.t("Default type · skip")}</option>
              {allowedParents.flatMap(p => p.children).map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
          <div style={{
            border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10,
            overflow: "hidden", marginBottom: 14,
            background: "#fff",
          }}>
            <div style={{ maxHeight: 260, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONTS.body, fontSize: 12 }}>
                <thead>
                  <tr className="bg-admin-surface">
                    <th style={csvCellStyle(true)}>{copy.t("Name")}</th>
                    <th style={csvCellStyle(true)}>{copy.t("Email")}</th>
                    <th style={csvCellStyle(true)}>{copy.t("Phone")}</th>
                    <th style={csvCellStyle(true)}>{copy.t("Type")}</th>
                    <th style={csvCellStyle(true)}>{copy.t("City")}</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.slice(0, 50).map((r, i) => {
                    const isValid = !!(r.firstName && r.email);
                    return (
                      <tr key={i} style={{ borderTop: `1px solid ${COLORS.borderSoft}`, opacity: isValid ? 1 : 0.55 }}>
                        <td style={csvCellStyle(false)}>
                          {`${r.firstName} ${r.lastName}`.trim() || <span className="text-admin-amber-deep">{copy.t("missing name")}</span>}
                        </td>
                        <td style={csvCellStyle(false)}>
                          {r.email || <span className="text-admin-amber-deep">{copy.t("missing email")}</span>}
                        </td>
                        <td style={csvCellStyle(false)}>{r.phone || "—"}</td>
                        <td style={csvCellStyle(false)}>{r.type || (defaultType && allowedParents.flatMap(p => p.children).find(c => c.id === defaultType)?.label) || <span className="text-admin-ink-dim">—</span>}</td>
                        <td style={csvCellStyle(false)}>{r.city || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {parsed.length > 200 && (
            <div style={{ padding: "8px 12px", borderRadius: 8, fontSize: 12, marginBottom: 8 }} className="bg-admin-amber-soft text-admin-amber-deep">
              {copy.t("{count} rows detected. Imports are capped at 200. Trim your CSV to continue.").replace("{count}", String(parsed.length))}
            </div>
          )}
          <button type="button" onClick={() => onComplete(parsed.slice(0, 200), defaultType)} disabled={valid === 0 || parsed.length > 200} style={{
            width: "100%", padding: "11px 18px", borderRadius: 10, border: "none",
            background: valid > 0 && parsed.length <= 200 ? COLORS.fill : "rgba(11,11,13,0.10)",
            color: valid > 0 && parsed.length <= 200 ? "#fff" : COLORS.inkDim,
            fontFamily: FONTS.body, fontSize: 13, fontWeight: 600,
            cursor: valid > 0 && parsed.length <= 200 ? "pointer" : "default",
          }}>{valid === 0 ? copy.t("Add a name + email per row to continue") : parsed.length > 200 ? copy.t("Trim to ≤ 200 rows first ({count} detected)").replace("{count}", String(parsed.length)) : (valid === 1 ? copy.t("Create {count} talent") : copy.t("Create {count} talents")).replace("{count}", String(valid))}</button>
        </>
      )}

      {parsed.length === 0 && raw.trim() && (
        <div style={{ padding: 12, borderRadius: 10, fontSize: 12, lineHeight: 1.5 }} className="bg-admin-amber-soft text-admin-amber-deep">
          {copy.t("Couldn't parse this. The first row should be column headers (firstName, lastName, email, …).")}
        </div>
      )}
    </div>
  );
}


export function csvCellStyle(isHeader: boolean): React.CSSProperties {
  return {
    padding: isHeader ? "8px 10px" : "9px 10px",
    fontSize: isHeader ? 10.5 : 11.5,
    fontWeight: isHeader ? 600 : 500,
    letterSpacing: isHeader ? 0.4 : 0,
    textTransform: isHeader ? "uppercase" : "none",
    color: isHeader ? COLORS.inkMuted : COLORS.ink,
    textAlign: "left",
    whiteSpace: "nowrap",
    maxWidth: 180,
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
}


export function PasteContactModal({ onClose, onApply }: {
  onClose: () => void;
  onApply: (text: string) => void;
}) {
  const copy = useDashboardText();
  const [text, setText] = useState("");
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 250,
      background: "rgba(11,11,13,0.55)", backdropFilter: "blur(10px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: FONTS.body,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 480,
        background: "#fff", borderRadius: 14, padding: 20,
        boxShadow: "0 30px 60px -10px rgba(11,11,13,0.4)",
      }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }} className="text-admin-ink">{copy.t("Paste a contact")}</h3>
        <p style={{ margin: "6px 0 12px", fontSize: 12.5, lineHeight: 1.5 }} className="text-admin-ink-muted">
          {copy.t("vCard · Instagram handle (@user) · linkedin.com/in/slug · or just paste a name + email + phone. We'll extract what we can.")}
        </p>
        <textarea autoFocus value={text} onChange={e => setText(e.target.value)}
          placeholder="Sofia Lupo&#10;sofia@example.com&#10;+34 612 345 678&#10;@sofia.lupo"
          rows={6}
          style={{
            width: "100%", boxSizing: "border-box", padding: "10px 12px",
            borderRadius: 10, border: `1px solid ${COLORS.border}`,
            fontFamily: FONTS.mono, fontSize: 12, color: COLORS.ink, outline: "none",
            resize: "vertical",
          }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button type="button" onClick={onClose} style={{
            padding: "9px 14px", borderRadius: 999,
            border: `1px solid ${COLORS.border}`, background: "#fff", color: COLORS.ink,
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>{copy.t("Cancel")}</button>
          <button type="button" onClick={() => onApply(text)} disabled={!text.trim()} style={{
            padding: "9px 16px", borderRadius: 999, border: "none",
            background: text.trim() ? COLORS.fill : "rgba(11,11,13,0.10)",
            color: text.trim() ? "#fff" : COLORS.inkDim,
            fontSize: 13, fontWeight: 600, cursor: text.trim() ? "pointer" : "default",
          }}>{copy.t("Apply")}</button>
        </div>
      </div>
    </div>
  );
}


export function qaInputStyle(): React.CSSProperties {
  return {
    flex: 1, width: "100%", boxSizing: "border-box",
    padding: "10px 12px", borderRadius: 10,
    border: `1px solid ${COLORS.border}`,
    fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, outline: "none",
    background: "#fff",
  };
}

// Talent Type picker — grouped by parent, mobile-first chip grid.
// Used in NewTalentDrawer + (later) TalentProfileShell.
// ════════════════════════════════════════════════════════════════════
// SmartTalentTypePicker — replaces the old "show every type, all the
// time" grid. New shape:
//   1. Search bar with autocomplete across all child types
//   2. "Popular" row — top 8 most-picked (mock frequency for prototype)
//   3. Per-parent collapsed columns; parent header shows count + click
//      to expand the full child list of that parent only
//   4. "Show all" button to reveal every type at once
//
// Performance + cognitive load fix: instead of 200 chips on screen,
// admin sees ~8 popular + a search bar. Power-users type to find.
// ════════════════════════════════════════════════════════════════════

/** Mock popularity score per type id. Higher = more frequently picked. */

export const TYPE_POPULARITY: Record<string, number> = {
  fashion: 95, vip_host: 88, dj: 82, promotional: 78, private_chef: 70,
  fire: 65, dancer: 62, photographer: 58, content: 55, commercial: 52,
  brand_amb: 48, mc: 44, chauffeur: 38, massage: 36, singer: 34,
  belly_dancer: 32, swimwear: 30, yoga: 26, videographer: 24, housekeeper: 20,
  trade_show: 18, butler: 14, airport: 12, mixologist: 10, pastry: 8,
};

// 2026 reset — short parent labels for the prototype UI live in the
// shared module @/lib/taxonomy/parent-labels so the storefront facet,
// the admin drawer, and the prototype all render the same friendly
// names ("Hosts" / "Music" / "Chefs") while the schema preserves the
// canonical full names ("Hosts & Promo" / "Music & DJs" / "Chefs &
// Culinary") for internal lookups.


export function PrimaryTalentTypeGrid({ parents, selected, onPick }: {
  parents: TaxonomyParent[];
  selected: string | null;
  onPick: (id: string) => void;
}) {
  const copy = useDashboardText();
  // 2026 reset — UI rule: parent category first, specific talent type second.
  // No flat "Popular · top 8" row of specific types here. No 425-chip
  // show-all wall. The user must drill into a parent to see the types
  // inside it. Search is the escape hatch for power users who already
  // know exactly which type they want.
  const [query, setQuery] = useState("");
  const [expandedParentId, setExpandedParentId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Build flat list of all (parent, child) pairs — used ONLY for the
  // search-typeahead dropdown. Never rendered as a top-level wall.
  type FlatType = { parent: TaxonomyParent; child: TaxonomyChild; popularity: number };
  const flatTypes: FlatType[] = parents.flatMap(p =>
    p.children.map(c => ({
      parent: p,
      child: c,
      popularity: TYPE_POPULARITY[c.id] ?? 5,
    }))
  );

  const q = query.trim().toLowerCase();
  const matched = q.length === 0 ? [] : flatTypes
    .filter(t =>
      t.child.label.toLowerCase().includes(q) ||
      t.parent.label.toLowerCase().includes(q) ||
      (t.child.specialties ?? []).some(s => s.toLowerCase().includes(q))
    )
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, 12);

  // If something is selected, show ONLY its pill (matches existing parent-cleared UI)
  const selectedPair = selected ? flatTypes.find(t => t.child.id === selected) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: FONTS.body }}>
      {/* Search */}
      <div className="relative">
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={copy.t("Search talent types, e.g. fashion, host, DJ, chef…")}
          style={{
            width: "100%", boxSizing: "border-box",
            padding: "10px 36px 10px 36px", borderRadius: 10,
            border: `1px solid ${COLORS.border}`,
            fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, outline: "none",
            background: "#fff",
          }}
        />
        <span aria-hidden style={{
          position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
          color: COLORS.inkMuted, fontSize: 14, pointerEvents: "none",
        }}>🔍</span>
        {query && (
          <button type="button" onClick={() => { setQuery(""); inputRef.current?.focus(); }}
            aria-label={copy.t("Clear search")}
            style={{
              position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
              width: 22, height: 22, borderRadius: "50%", border: "none",
              background: "rgba(11,11,13,0.06)", color: COLORS.inkMuted,
              fontSize: 12, lineHeight: 1, fontWeight: 600, cursor: "pointer",
            }}>×</button>
        )}
        {/* Autocomplete dropdown */}
        {q.length > 0 && (
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 30,
            background: "#fff", borderRadius: 12,
            border: `1px solid ${COLORS.borderSoft}`,
            boxShadow: "0 14px 36px -10px rgba(11,11,13,0.18)",
            maxHeight: 320, overflowY: "auto",
            padding: 4,
          }}>
            {matched.length === 0 ? (
              <div style={{ padding: "10px 12px", fontSize: 12 }} className="text-admin-ink-muted">
                {copy.t("No matches. Try a broader search.")}
              </div>
            ) : (
              matched.map(t => {
                const active = selected === t.child.id;
                return (
                  <button key={t.child.id} type="button"
                    onClick={() => { onPick(t.child.id); setQuery(""); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 10px", borderRadius: 8,
                      background: active ? "rgba(15,79,62,0.06)" : "transparent",
                      border: "none", width: "100%", textAlign: "left",
                      cursor: "pointer", fontFamily: FONTS.body,
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = COLORS.surfaceAlt; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{ fontSize: 16, flexShrink: 0 }}>{t.parent.emoji}</span>
                    <span className="flex-1 min-w-0">
                      <span style={{ display: "block", fontSize: 13, fontWeight: 600 }} className="text-admin-ink">
                        {t.child.label}
                      </span>
                      <span style={{ display: "block", fontSize: 10.5, marginTop: 1 }} className="text-admin-ink-muted">
                        {t.parent.label}{t.child.specialties && t.child.specialties.length > 0 ? ` · ${t.child.specialties.slice(0, 3).join(", ")}` : ""}
                      </span>
                    </span>
                    {t.popularity >= 50 && (
                      <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 999, flexShrink: 0 }} className="bg-admin-amber-soft text-admin-amber-deep">★ {copy.t("Popular")}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* When search is empty: parent categories only. Drill in to see
          the specific talent types under each. No flat wall of specific
          types at the top level — that's the V1 reset rule. */}
      {q.length === 0 && (
        <>
          <div style={{ fontSize: 11.5, lineHeight: 1.4 }} className="text-admin-ink-dim">
            {copy.t("Choose a category to see the specific roles inside it.")}
          </div>

          {/* Per-parent rolled-up rows */}
          <div style={{ borderRadius: 12, border: `1px solid ${COLORS.borderSoft}`, overflow: "hidden" }} className="bg-admin-surface">
            {parents.map((parent, i) => {
              const isOpen = expandedParentId === parent.id;
              return (
                <div key={parent.id} style={{
                  borderTop: i === 0 ? "none" : `1px solid ${COLORS.borderSoft}`,
                }}>
                  <button type="button" onClick={() => setExpandedParentId(isOpen ? null : parent.id)} style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px", border: "none",
                    background: "transparent", cursor: "pointer", textAlign: "left",
                    fontFamily: FONTS.body,
                  }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{parent.emoji}</span>
                    <div className="flex-1">
                      <div className="text-admin-ink text-admin-13 font-semibold">
                        {shortParentLabel(parent)}
                      </div>
                      <div style={{ fontSize: 10.5, marginTop: 1 }} className="text-admin-ink-muted">
                        {(parent.children.length === 1 ? copy.t("{count} type") : copy.t("{count} types")).replace("{count}", String(parent.children.length))} · {parent.helper}
                      </div>
                    </div>
                    <span style={{ fontSize: 14, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }} className="text-admin-ink-muted">›</span>
                  </button>
                  {isOpen && (
                    <ParentExpandedView
                      parent={parent}
                      selected={selected}
                      onPick={onPick}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 10.5, fontStyle: "italic" }} className="text-admin-ink-dim">
            {copy.t("Looking for something specific? Use the search above.")}
          </div>
        </>
      )}

      {/* Selection acknowledgment */}
      {selectedPair && (
        <div className="text-admin-ink-dim text-admin-11">
          ✓ {copy.t("Selected:")} <strong style={{ fontWeight: 600 }} className="text-admin-ink">{selectedPair.child.label}</strong> {copy.t("under {parent}").replace("{parent}", selectedPair.parent.label)}
        </div>
      )}
    </div>
  );
}

/**
 * 2026 reset — when a parent_category is expanded in PrimaryTalentTypeGrid,
 * we don't dump all its children as a flat chip wall. Instead:
 *   1. Show the TOP N most-popular types (default 6) immediately.
 *   2. Offer a per-parent search input — filters within THIS parent only.
 *   3. Offer a "Show all N more in {parent}" button to reveal the rest.
 *
 * State (search text, show-all toggle) is local to each instance, so each
 * expanded parent has its own scoped UI without leaking into siblings.
 */

export function ParentExpandedView({
  parent,
  selected,
  onPick,
}: {
  parent: TaxonomyParent;
  selected: string | null;
  onPick: (id: string) => void;
}) {
  const copy = useDashboardText();
  const TOP_N = 6;
  const [localQuery, setLocalQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const popSorted = useMemo(
    () =>
      [...parent.children].sort(
        (a, b) => (TYPE_POPULARITY[b.id] ?? 0) - (TYPE_POPULARITY[a.id] ?? 0),
      ),
    [parent.children],
  );

  const lq = localQuery.trim().toLowerCase();
  const filtered = lq.length > 0
    ? parent.children.filter(c =>
        c.label.toLowerCase().includes(lq) ||
        (c.specialties ?? []).some(s => s.toLowerCase().includes(lq)),
      )
    : null;

  const visible: TaxonomyChild[] = filtered ?? (showAll ? popSorted : popSorted.slice(0, TOP_N));
  const hidden = filtered ? 0 : Math.max(0, popSorted.length - TOP_N);
  const shortLabel = shortParentLabel(parent);

  return (
    <div style={{ padding: "4px 14px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Per-parent search — only when there are enough children to warrant one */}
      {parent.children.length > TOP_N && (
        <div className="relative">
          <input
            type="search"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            placeholder={copy.t("Search in {parent}…").replace("{parent}", shortLabel)}
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "7px 28px 7px 28px", borderRadius: 8,
              border: `1px solid ${COLORS.borderSoft}`,
              fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink, outline: "none",
              background: "#fff",
            }}
          />
          <span aria-hidden style={{
            position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)",
            color: COLORS.inkMuted, fontSize: 12, pointerEvents: "none",
          }}>🔍</span>
          {localQuery && (
            <button type="button" onClick={() => setLocalQuery("")}
              aria-label={copy.t("Clear search")}
              style={{
                position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                width: 18, height: 18, borderRadius: "50%", border: "none",
                background: "rgba(11,11,13,0.06)", color: COLORS.inkMuted,
                fontSize: 11, lineHeight: 1, fontWeight: 600, cursor: "pointer",
              }}>×</button>
          )}
        </div>
      )}

      {/* "Top in {parent}" or "All N types" header */}
      {!filtered && (
        <div style={{ fontSize: 10.5, marginTop: 2 }} className="text-admin-ink-dim">
          {showAll
            ? copy.t("All {count} types in {parent}").replace("{count}", String(popSorted.length)).replace("{parent}", shortLabel)
            : copy.t("Top in {parent}").replace("{parent}", shortLabel)}
        </div>
      )}
      {filtered && (
        <div style={{ fontSize: 10.5, marginTop: 2 }} className="text-admin-ink-dim">
          {filtered.length === 0
            ? copy.t("No matches in this category.")
            : (filtered.length === 1 ? copy.t("{count} match in {parent}") : copy.t("{count} matches in {parent}")).replace("{count}", String(filtered.length)).replace("{parent}", shortLabel)}
        </div>
      )}

      {/* Chip list */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {visible.map(c => {
          const active = selected === c.id;
          return (
            <button key={c.id} type="button" onClick={() => onPick(c.id)} style={{
              padding: "6px 11px", borderRadius: 999,
              border: `1.5px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
              background: active ? "rgba(15,79,62,0.08)" : "#fff",
              color: active ? COLORS.accentDeep : COLORS.ink,
              fontSize: 12, fontWeight: 600, cursor: "pointer",
              fontFamily: FONTS.body,
            }}>
              {c.label}
              {(TYPE_POPULARITY[c.id] ?? 0) >= 50 && (
                <span style={{ marginLeft: 5, fontSize: 9 }} className="text-admin-amber-deep">★</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Show-all toggle — only when there are hidden types AND no active filter */}
      {!filtered && hidden > 0 && (
        <button type="button" onClick={() => setShowAll(v => !v)} style={{
          alignSelf: "flex-start", padding: "5px 10px", borderRadius: 999,
          background: "transparent", border: `1px dashed ${COLORS.border}`,
          color: COLORS.inkMuted, fontSize: 11, fontWeight: 500, cursor: "pointer",
          fontFamily: FONTS.body,
        }}>
          {showAll ? copy.t("- Show fewer") : copy.t("+ Show all {count} more in {parent}").replace("{count}", String(hidden)).replace("{parent}", shortLabel)}
        </button>
      )}
    </div>
  );
}

/**
 * 2026 reset — multi-select sibling picker. Used for "Other roles within
 * {parent}" and for cross-category expanded sections in the Services
 * section. Same Top-N + per-parent search + Show-all UX as ParentExpandedView,
 * but supports MULTI selection (toggling chips).
 *
 * The wall problem: Models has ~40 children. Showing all 40 as chips is
 * overwhelming. This component shows the top 6 by popularity, lets the user
 * search within the parent, and offers an explicit "+ Show all N more"
 * expander for the rest.
 */

export function SiblingTopNPicker({
  children: childTypes,
  selected,
  onToggle,
  parentLabel,
  excludeId,
  tenantEnabledSlugs,
}: {
  children: TaxonomyChild[];
  selected: string[];
  onToggle: (id: string) => void;
  parentLabel: string;
  excludeId?: string | null;
  /** Slugs ENABLED in the current tenant's agency_taxonomy_settings. When
   *  provided, any chip whose slug is NOT in this set renders faded
   *  (opacity 0.55 + muted tokens) — Phase 2b multi-tenant identity fade
   *  for secondary talent types. Optional: omit to keep all chips full
   *  contrast (standalone / pre-tenant-context usage).
   *
   *  Note: TaxonomyChild.id IS the slug in this codebase (see
   *  use-taxonomy.ts → toDisplay() and fromHardcoded() — both project the
   *  taxonomy_terms.slug into the display child id). So this set is
   *  keyed by the same string as `selected` (talent_profile.primary_type
   *  and the secondary id list). */
  tenantEnabledSlugs?: Set<string>;
}) {
  const copy = useDashboardText();
  const TOP_N = 6;
  const [localQuery, setLocalQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  // Filter out the excluded id (typically the primary role).
  const pool = useMemo(
    () => childTypes.filter((c) => !excludeId || c.id !== excludeId),
    [childTypes, excludeId],
  );
  // Always-on rule: any selected chip should also be in the visible set
  // so the user can see what's currently picked. Sort selected first, then
  // popularity-desc.
  const popSorted = useMemo(() => {
    const sel = new Set(selected);
    return [...pool].sort((a, b) => {
      const aSel = sel.has(a.id) ? 1 : 0;
      const bSel = sel.has(b.id) ? 1 : 0;
      if (aSel !== bSel) return bSel - aSel;
      return (TYPE_POPULARITY[b.id] ?? 0) - (TYPE_POPULARITY[a.id] ?? 0);
    });
  }, [pool, selected]);

  const lq = localQuery.trim().toLowerCase();
  const filtered = lq.length > 0
    ? pool.filter((c) =>
        c.label.toLowerCase().includes(lq) ||
        (c.specialties ?? []).some((s) => s.toLowerCase().includes(lq)),
      )
    : null;

  const visible: TaxonomyChild[] = filtered ?? (showAll ? popSorted : popSorted.slice(0, TOP_N));
  const hidden = filtered ? 0 : Math.max(0, popSorted.length - TOP_N);

  return (
    <div className="flex flex-col gap-2">
      {/* Per-parent search — only when there are enough siblings to warrant one */}
      {pool.length > TOP_N && (
        <div className="relative">
          <input
            type="search"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            placeholder={copy.t("Search in {parent}…").replace("{parent}", parentLabel)}
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "7px 28px 7px 28px", borderRadius: 8,
              border: `1px solid ${COLORS.borderSoft}`,
              fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink, outline: "none",
              background: "#fff",
            }}
          />
          <span aria-hidden style={{
            position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)",
            color: COLORS.inkMuted, fontSize: 12, pointerEvents: "none",
          }}>🔍</span>
          {localQuery && (
            <button type="button" onClick={() => setLocalQuery("")}
              aria-label={copy.t("Clear search")}
              style={{
                position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                width: 18, height: 18, borderRadius: "50%", border: "none",
                background: "rgba(11,11,13,0.06)", color: COLORS.inkMuted,
                fontSize: 11, lineHeight: 1, fontWeight: 600, cursor: "pointer",
              }}>×</button>
          )}
        </div>
      )}

      {filtered && filtered.length === 0 && (
        <div style={{ fontSize: 11, fontStyle: "italic" }} className="text-admin-ink-dim">
          {copy.t("No matches in {parent}.").replace("{parent}", parentLabel)}
        </div>
      )}

      {/* Chip list */}
      {visible.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {visible.map((c) => {
            const active = selected.includes(c.id);
            // Phase 2b — fade signal. Only fires when this tenant context is
            // known AND this chip's slug is NOT in the tenant's enabled set.
            // (When tenantEnabledSlugs is undefined the picker behaves as it
            // did before — every chip full contrast.)
            const disabledForTenant =
              !!tenantEnabledSlugs && !tenantEnabledSlugs.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onToggle(c.id)}
                title={
                  disabledForTenant
                    ? copy.t("This talent type isn't enabled in your workspace. Enable it in Settings → Roster → Talent types.")
                    : undefined
                }
                style={{
                  padding: "6px 11px",
                  borderRadius: 999,
                  border: `1.5px solid ${
                    active
                      ? disabledForTenant
                        ? COLORS.borderSoft
                        : COLORS.accent
                      : COLORS.borderSoft
                  }`,
                  background: active
                    ? disabledForTenant
                      ? "rgba(11,11,13,0.04)"
                      : "rgba(15,79,62,0.08)"
                    : "#fff",
                  color: active
                    ? disabledForTenant
                      ? COLORS.inkMuted
                      : COLORS.accentDeep
                    : disabledForTenant
                      ? COLORS.inkMuted
                      : COLORS.ink,
                  opacity: disabledForTenant ? 0.55 : 1,
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: FONTS.body,
                }}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Show-all toggle — only when there are hidden types AND no active filter */}
      {!filtered && hidden > 0 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} style={{
          alignSelf: "flex-start", padding: "5px 10px", borderRadius: 999,
          background: "transparent", border: `1px dashed ${COLORS.border}`,
          color: COLORS.inkMuted, fontSize: 11, fontWeight: 500, cursor: "pointer",
          fontFamily: FONTS.body,
        }}>
          {showAll ? copy.t("- Show fewer") : copy.t("+ Show all {count} more in {parent}").replace("{count}", String(hidden)).replace("{parent}", parentLabel)}
        </button>
      )}
    </div>
  );
}


export function ManagementMethodPicker({
  value, onChange,
}: {
  value: "agency" | "invited" | "draft";
  onChange: (v: "agency" | "invited" | "draft") => void;
}) {
  const copy = useDashboardText();
  // Each method spells out what happens next + which fields are coming.
  // Eliminates the "wait, do I lose data if I switch?" ambiguity.
  const options: {
    id: "agency" | "invited" | "draft";
    title: string;
    desc: string;
    cta: string;
    nextFields: string[];
    emoji: string;
  }[] = [
    {
      id: "agency", emoji: "✍️",
      title: copy.t("Agency-managed"),
      desc: copy.t("You fill in the full profile right now. Talent can claim ownership of it later, when they're ready, or when you decide they should self-edit."),
      cta: copy.t("Opens the full Profile Builder next"),
      nextFields: [
        copy.t("Cover photo + portfolio gallery (up to 8 + albums)"),
        copy.t("Service areas + travel radius"),
        copy.t("Bio in any language"),
        copy.t("Type-specific fields (height, measurements, vehicle, cuisine, etc.)"),
        copy.t("Languages with levels + role flags"),
        copy.t("Skills + best-for contexts"),
        copy.t("Rates + availability calendar"),
        copy.t("Files (comp cards, contracts, certifications)"),
        copy.t("Custom workspace fields"),
        copy.t("Status + admin controls"),
        copy.t("↗ Send claim invite later, talent takes ownership any time"),
      ],
    },
    {
      id: "invited", emoji: "📧",
      title: copy.t("Invite talent to claim"),
      desc: copy.t("Email them a claim link. They edit and approve their own profile."),
      cta: copy.t("Sends a claim email · talent fills the rest"),
      nextFields: [
        copy.t("Talent receives email with claim link"),
        copy.t("They complete their profile via Talent Registration wizard"),
        copy.t("Submission lands in your Pending Approvals queue"),
        copy.t("You approve or request changes"),
      ],
    },
    {
      id: "draft", emoji: "💾",
      title: copy.t("Save as draft"),
      desc: copy.t("Not published. Pick this back up later."),
      cta: copy.t("Quietly saves what you've entered"),
      nextFields: [
        copy.t("Lives in Roster as a Draft"),
        copy.t("Open any time to continue editing"),
        copy.t("Never visible on the storefront until published"),
      ],
    },
  ];
  return (
    <div className="flex flex-col gap-2.5">
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button key={o.id} type="button" onClick={() => onChange(o.id)} style={{
            background: active ? "rgba(15,79,62,0.04)" : "#fff",
            border: `1.5px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
            borderRadius: 12, padding: 14, cursor: "pointer",
            fontFamily: FONTS.body, textAlign: "left",
            display: "flex", flexDirection: "column", gap: active ? 10 : 0,
            transition: `border-color ${TRANSITION.micro}, background ${TRANSITION.micro}`,
          }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{
                width: 20, height: 20, borderRadius: "50%",
                border: `1.5px solid ${active ? COLORS.accent : "rgba(11,11,13,0.18)"}`,
                background: active ? COLORS.fill : "transparent",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, marginTop: 1,
              }}>
                {active && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />}
              </span>
              <div className="flex-1">
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span className="text-sm">{o.emoji}</span>
                  <span className="text-admin-ink text-admin-13h font-semibold">{o.title}</span>
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.5 }} className="text-admin-ink-muted">{o.desc}</div>
              </div>
            </div>
            {active && (
              <div style={{
                marginLeft: 32, paddingTop: 10,
                borderTop: `1px solid ${COLORS.borderSoft}`,
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, marginBottom: 8, textTransform: "uppercase" }} className="text-admin-accent-deep">
                  ↗ {o.cta}
                </div>
                <ul style={{ margin: 0, paddingLeft: 14, display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, lineHeight: 1.5, listStyle: "disc" }} className="text-admin-ink-muted">
                  {o.nextFields.map((f) => (<li key={f}>{f}</li>))}
                </ul>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

