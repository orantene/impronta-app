"use client";

import { COLORS } from "@/components/admin/shell/internal/state";

/**
 * A tiny CSS-only wireframe thumbnail hinting at each Max-site starter
 * template's layout (split / centered / cover / gallery-first). Purely
 * decorative — no images to load. Extracted from TalentMaxSiteManager to keep
 * that file within the max-lines budget.
 */
export function TalentMaxSiteTemplateThumb({ templateKey }: { templateKey: string }) {
  const bar = (w: string, h = 6, bg = COLORS.border) =>
    ({ width: w, height: h, borderRadius: 3, background: bg }) as React.CSSProperties;
  const tile = (bg = COLORS.border) =>
    ({ flex: 1, borderRadius: 3, background: bg }) as React.CSSProperties;

  let inner: React.ReactNode;
  if (templateKey === "minimal") {
    inner = (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: 8 }}>
        <div style={bar("60%", 8)} />
        <div style={bar("40%")} />
        <div style={{ display: "flex", gap: 4, width: "100%", marginTop: 4 }}>
          <div style={tile()} />
          <div style={tile()} />
        </div>
      </div>
    );
  } else if (templateKey === "bold") {
    inner = (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 4, padding: 8, height: "100%", background: "linear-gradient(180deg, #3a3a3a, #111)" }}>
        <div style={bar("55%", 8, "#f4d58d")} />
        <div style={bar("35%", 5, "rgba(255,255,255,0.55)")} />
      </div>
    );
  } else if (templateKey === "portfolio") {
    inner = (
      <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 8 }}>
        <div style={bar("45%", 7)} />
        <div style={{ display: "flex", gap: 4, height: 22 }}>
          <div style={tile()} />
          <div style={tile()} />
          <div style={tile()} />
        </div>
      </div>
    );
  } else if (templateKey === "editorial") {
    inner = (
      <div style={{ display: "flex", gap: 6, padding: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "0 0 38%" }}>
          <div style={bar("100%", 7)} />
          <div style={bar("80%")} />
          <div style={bar("60%")} />
        </div>
        <div style={{ ...tile(), borderRadius: 4 }} />
      </div>
    );
  } else {
    // default — split hero
    inner = (
      <div style={{ display: "flex", gap: 6, padding: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
          <div style={bar("90%", 7)} />
          <div style={bar("70%")} />
          <div style={{ display: "flex", gap: 3 }}>
            <div style={bar("24%", 5)} />
            <div style={bar("24%", 5)} />
          </div>
        </div>
        <div style={{ ...tile(), borderRadius: 4 }} />
      </div>
    );
  }

  return (
    <div
      aria-hidden
      style={{
        height: 64,
        borderRadius: 8,
        border: `1px solid ${COLORS.borderSoft}`,
        background: "#fff",
        overflow: "hidden",
      }}
    >
      {inner}
    </div>
  );
}
