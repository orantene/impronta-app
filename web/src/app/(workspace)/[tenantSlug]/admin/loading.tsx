/**
 * Workspace admin route loading state.
 *
 * The layout pre-fetches ~10 server queries for the admin shell. Without
 * this loading.tsx, Next.js's App Router would hold the URL update until
 * the entire RSC payload arrives — making cross-tab navigation feel "stuck"
 * for the duration of the slowest query.
 *
 * With it, the URL commits immediately and this skeleton renders while the
 * shell hydrates. The skeleton intentionally mimics the shell chrome (top
 * identity bar + topbar nav strip) so the transition is calm rather than a
 * full white flash.
 */
export default function AdminLoading() {
  return (
    <div
      role="status"
      aria-label="Loading workspace"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 0,
        background: "#f7f6f4",
        minHeight: "calc(100vh - 50px)",
      }}
    >
      {/* Identity bar skeleton — black ribbon at the very top */}
      <div style={{ height: 30, background: "#0b0b0d" }} />

      {/* HybridShell sub-bar skeleton */}
      <div
        style={{
          height: 56,
          background: "#fff",
          borderBottom: "1px solid #efeae2",
          display: "flex",
          alignItems: "center",
          padding: "0 28px",
          gap: 16,
        }}
      >
        <div style={{ width: 90, height: 22, background: "#efeae2", borderRadius: 4 }} />
        <div style={{ flex: 1 }} />
        <div style={{ width: 200, height: 30, background: "#efeae2", borderRadius: 999 }} />
      </div>

      {/* Topbar nav skeleton */}
      <div
        style={{
          height: 52,
          background: "#fff",
          borderBottom: "1px solid #efeae2",
          padding: "0 28px",
          display: "flex",
          alignItems: "center",
          gap: 24,
        }}
      >
        {Array.from({ length: 9 }, (_, i) => (
          <div
            key={i}
            style={{
              width: 60 + (i % 3) * 12,
              height: 14,
              background: "#efeae2",
              borderRadius: 4,
              opacity: 0.7,
            }}
          />
        ))}
      </div>

      {/* Page body skeleton — generic content placeholder */}
      <div style={{ padding: 28 }}>
        <div style={{ width: 240, height: 28, background: "#efeae2", borderRadius: 6, marginBottom: 18 }} />
        <div style={{ width: 420, height: 14, background: "#efeae2", borderRadius: 4, opacity: 0.7, marginBottom: 32 }} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={i}
              style={{
                aspectRatio: "3 / 4",
                background: "#efeae2",
                borderRadius: 12,
                opacity: 0.6,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
