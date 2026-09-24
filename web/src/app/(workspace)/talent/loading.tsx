/**
 * Talent surface route loading state.
 * The URL commits immediately; this skeleton fills the shell until the
 * layout queries settle. No count is shown: the number is not known yet.
 */
export default function TalentLoading() {
  return (
    <div
      role="status"
      aria-label="Loading"
      style={{
        display: "flex",
        flexDirection: "column",
        background: "#f7f6f4",
        minHeight: "calc(100vh - 50px)",
      }}
    >
      <div style={{ height: 30, background: "#0b0b0d" }} />
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
        <p style={{ margin: 0, fontSize: 13, color: "rgba(11,11,13,0.55)" }}>Loading</p>
      </div>
      <div style={{ padding: 28 }}>
        <div style={{ height: 28, width: 180, background: "#efeae2", borderRadius: 6, marginBottom: 16 }} />
        <div style={{ height: 220, background: "#efeae2", borderRadius: 14, opacity: 0.55 }} />
      </div>
    </div>
  );
}
