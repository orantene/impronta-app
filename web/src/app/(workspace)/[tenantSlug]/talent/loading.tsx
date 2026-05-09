/**
 * Talent surface route loading state.
 *
 * Same rationale as the admin loading.tsx — without this Next.js holds the
 * URL update until all talent-layout queries (self profile, inquiries,
 * agency membership, unread, prefs) settle. With it, the URL commits
 * immediately and this skeleton fills the space until the shell hydrates.
 *
 * Skeleton chrome mirrors the talent topbar so the transition feels like
 * the same surface "filling in" rather than a full reload.
 */
export default function TalentLoading() {
  return (
    <div
      role="status"
      aria-label="Loading talent surface"
      style={{
        display: "flex",
        flexDirection: "column",
        background: "#f7f6f4",
        minHeight: "calc(100vh - 50px)",
      }}
    >
      {/* Identity bar skeleton */}
      <div style={{ height: 30, background: "#0b0b0d" }} />

      {/* HybridShell sub-bar */}
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

      {/* Talent topbar (lighter than admin — fewer tabs) */}
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
        {Array.from({ length: 7 }, (_, i) => (
          <div
            key={i}
            style={{
              width: 56 + (i % 3) * 14,
              height: 14,
              background: "#efeae2",
              borderRadius: 4,
              opacity: 0.7,
            }}
          />
        ))}
      </div>

      {/* Body skeleton */}
      <div style={{ padding: 28 }}>
        {/* Onboarding banner placeholder */}
        <div
          style={{
            height: 96,
            background: "#efeae2",
            borderRadius: 14,
            opacity: 0.6,
            marginBottom: 18,
          }}
        />
        {/* Hero card placeholder */}
        <div
          style={{
            height: 220,
            background: "#efeae2",
            borderRadius: 14,
            opacity: 0.5,
            marginBottom: 18,
          }}
        />
        {/* List section placeholder */}
        <div
          style={{
            height: 240,
            background: "#efeae2",
            borderRadius: 14,
            opacity: 0.4,
          }}
        />
      </div>
    </div>
  );
}
