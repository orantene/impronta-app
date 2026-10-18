/**
 * A5 (TUL-1250 family): /account is a server resolver (session, host, tenant, data) like
 * /admin and /client. Without a loading boundary a signed-in client sees a blank white page
 * until it renders. A neutral status region, because the page takes the visited site's theme
 * only after it loads.
 */
export default function AccountLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading"
      style={{ minHeight: "100dvh", background: "#fafaf7", padding: "32px 20px" }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto", display: "grid", gap: 14 }}>
        <div style={{ height: 28, width: 160, background: "#efeae2", borderRadius: 6 }} />
        <div style={{ height: 44, background: "#efeae2", borderRadius: 10 }} />
        <div style={{ height: 120, background: "#f3efe8", borderRadius: 14 }} />
        <div style={{ height: 120, background: "#f3efe8", borderRadius: 14 }} />
      </div>
    </div>
  );
}
