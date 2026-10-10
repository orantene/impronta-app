/**
 * First-paint shell for public talent Max sites (TUL-495).
 *
 * Soft-nav to `/en` (and cold loads that stream behind Suspense) used to sit on
 * a blank white page for 10+ s while the heavy Max-site tree and font CSS
 * finished. This skeleton is a server component with no data and no client JS:
 * header bar + hero blocks so the visitor sees structure immediately.
 *
 * Theme-agnostic (neutral ink on a light canvas). Gridline / Maison / Folio all
 * share this one shell; do not fork per talent.
 */

export function TalentSitePaintSkeleton({
  locale = "en",
}: {
  locale?: string;
}) {
  const es = locale.toLowerCase().startsWith("es");
  const label = es ? "Cargando el sitio…" : "Loading the site…";

  return (
    <div
      data-talent-site-paint-skeleton=""
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label={label}
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#f7f7f5",
        color: "#1a1a1a",
        fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
      }}
    >
      <header
        data-talent-site-paint-skeleton-header=""
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          height: 56,
          padding: "0 20px",
          borderBottom: "1px solid rgba(0,0,0,0.08)",
          background: "#fff",
        }}
      >
        <Block w={96} h={14} />
        <div style={{ flex: 1 }} />
        <Block w={64} h={10} />
        <Block w={64} h={10} />
        <Block w={88} h={28} radius={999} />
      </header>

      <main style={{ flex: "1 0 auto", padding: "28px 20px 64px", maxWidth: 1120, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <p
          style={{
            margin: "0 0 20px",
            fontSize: 13,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "rgba(0,0,0,0.45)",
          }}
        >
          {label}
        </p>
        <Block w="42%" h={12} />
        <div style={{ height: 14 }} />
        <Block w="78%" h={36} />
        <div style={{ height: 10 }} />
        <Block w="62%" h={36} />
        <div style={{ height: 24 }} />
        <Block w="55%" h={14} />
        <div style={{ height: 28 }} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 12,
          }}
        >
          <Block w="100%" h={72} />
          <Block w="100%" h={72} />
          <Block w="100%" h={72} />
        </div>
        <div style={{ height: 28 }} />
        <Block w="100%" h={180} />
      </main>
    </div>
  );
}

function Block({
  w,
  h,
  radius = 8,
}: {
  w: number | string;
  h: number;
  radius?: number;
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: w,
        height: h,
        borderRadius: radius,
        background: "rgba(0,0,0,0.07)",
      }}
    />
  );
}
