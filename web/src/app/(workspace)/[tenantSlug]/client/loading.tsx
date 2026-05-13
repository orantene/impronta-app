/**
 * Workspace client-surface loading state (C.4).
 *
 * Mirrors the admin loading.tsx pattern: shows a calm identity bar +
 * sub-nav skeleton while the layout pre-fetches client-self profile,
 * inquiries, bookings, and discovery data. Without this the URL hangs
 * during navigation across client tabs.
 */
export default function ClientLoading() {
  return (
    <div
      role="status"
      aria-label="Loading"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 0,
        background: "#f7f6f4",
        minHeight: "calc(100vh - 50px)",
      }}
    >
      {/* Identity bar skeleton */}
      <div style={{ height: 30, background: "#0b0b0d" }} />

      {/* Top sub-bar skeleton */}
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
        <div style={{ width: 180, height: 30, background: "#efeae2", borderRadius: 999 }} />
      </div>

      {/* Client nav tabs skeleton (Today / Discover / Inquiries / Bookings / Settings) */}
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
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            style={{
              width: 70 + (i % 3) * 14,
              height: 14,
              background: "#efeae2",
              borderRadius: 4,
              opacity: 0.7,
            }}
          />
        ))}
      </div>

      {/* Page body skeleton */}
      <div style={{ padding: 28 }}>
        <div style={{ width: 220, height: 26, background: "#efeae2", borderRadius: 6, marginBottom: 18 }} />
        <div style={{ width: 380, height: 14, background: "#efeae2", borderRadius: 4, opacity: 0.7, marginBottom: 32 }} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 14,
          }}
        >
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              style={{
                aspectRatio: "16 / 9",
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
