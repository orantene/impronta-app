"use client";
import { improntaLog } from "@/lib/server/structured-log";

// Single-input curated city autocomplete for the full-page service-area
// editor. Type a city → curated suggestions (global, no country-first) →
// pick → curated locations.id. Same data contract as the drawer panel
// (/api/location-cities). NO free text, NO raw Google place id.
// Dependency-free + plainly styled to slot into the existing form.

import { useEffect, useRef, useState } from "react";

type Picked = { id: string; label: string };

export function CuratedCityField({
  selectedLabel,
  onPick,
}: {
  selectedLabel: string;
  onPick: (city: Picked) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [opts, setOpts] = useState<Array<{ id: string; name: string; sub: string }>>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  const closeList = () => {
    setOpen(false);
    setOpts([]);
    setLoading(false);
  };

  // Search only with a query AND open. Empty query => nothing fetched /
  // shown. Late results dropped via `off` on any q/open change so a stale
  // delayed response can't reopen the list.
  useEffect(() => {
    const query = q.trim();
    if (!open || query.length < 1) {
      setOpts([]);
      setLoading(false);
      return;
    }
    let off = false;
    setLoading(true);
    const h = setTimeout(() => {
      void improntaLog("admin_curated_city_field.info", {
        message: `[serviceAreas-ui] (full-page) search query="${query}"`,
      });
      fetch(`/api/location-cities?query=${encodeURIComponent(query)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d: { cities?: Array<{ id: string | null; name_en: string; country_name_en?: string; country_iso2?: string }> }) => {
          if (off) return;
          const mapped = (d.cities ?? [])
            .filter((c) => !!c.id)
            .map((c) => ({ id: c.id as string, name: c.name_en, sub: c.country_name_en || c.country_iso2 || "" }));
          void improntaLog("admin_curated_city_field.info", {
            message: `[serviceAreas-ui] (full-page) search results count=${mapped.length}`,
          });
          setOpts(mapped);
        })
        .catch(() => !off && setOpts([]))
        .finally(() => !off && setLoading(false));
    }, 200);
    return () => { off = true; clearTimeout(h); };
  }, [q, open]);

  // Click-outside closes the list.
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) closeList();
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  const inp: React.CSSProperties = {
    width: "100%", padding: "7px 10px", borderRadius: 8,
    border: "1px solid rgba(11,11,13,0.18)", fontSize: 13, boxSizing: "border-box", outline: "none",
  };
  const row: React.CSSProperties = {
    display: "block", width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 6,
    border: "none", background: "transparent", cursor: "pointer", fontSize: 13,
  };

  // Results render IN-FLOW (not absolute) — an absolute dropdown was
  // clipped/unclickable inside the editor form, so selection never fired.
  const showList = open && q.trim().length >= 1;
  return (
    <div ref={boxRef}>
      <div className="relative">
        <input
          value={q}
          placeholder={selectedLabel ? `${selectedLabel} — type to change` : "Type a city…"}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.stopPropagation(); closeList(); }
          }}
          style={{ ...inp, paddingRight: q ? 30 : undefined }}
        />
        {q && (
          <button
            type="button"
            aria-label="Clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setQ(""); closeList(); }}
            style={{
              position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
              border: "none", background: "transparent", color: "#8a8a8a",
              cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 4,
            }}
          >
            ×
          </button>
        )}
      </div>
      {showList && (
        <div
          style={{
            marginTop: 4, maxHeight: 240, overflowY: "auto", background: "#fff",
            border: "1px solid rgba(11,11,13,0.18)", borderRadius: 8, padding: 6,
          }}
        >
          {loading && <div style={{ padding: 10, color: "#8a8a8a", fontSize: 12 }}>Searching…</div>}
          {!loading && opts.length === 0 && (
            <div style={{ padding: 10, color: "#8a8a8a", fontSize: 12 }}>
              City not in the supported list yet.
            </div>
          )}
          {opts.map((o) => (
            <button
              key={o.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                void improntaLog("admin_curated_city_field.info", {
                  message: `[serviceAreas-ui] (full-page) pick city label="${o.name}" id=${o.id}`,
                });
                onPick({ id: o.id, label: o.name });
                setQ("");
                closeList();
              }}
              style={row}
            >
              <span className="font-semibold">{o.name}</span>
              {o.sub ? <span style={{ color: "#8a8a8a" }}> · {o.sub}</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
