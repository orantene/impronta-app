import Link from "next/link";

export const dynamic = "force-dynamic";

export default function CheckoutCancelPage() {
  return (
    <main style={{
      minHeight: "60vh",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 16, padding: 32,
      fontFamily: '"Inter", system-ui, sans-serif',
      color: "#0B0B0D",
      textAlign: "center",
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 999,
        background: "rgba(212,160,23,0.14)", color: "#8A6F1A",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: 28, fontWeight: 700,
      }}>!</div>
      <h1 style={{ fontSize: 22, margin: 0, fontWeight: 600 }}>Payment cancelled</h1>
      <p style={{ fontSize: 14, color: "rgba(11,11,13,0.6)", maxWidth: 480, margin: 0 }}>
        No charge was made. You can try paying again from your project page when you're ready.
      </p>
      <Link href="/" style={{
        marginTop: 8, padding: "9px 16px", borderRadius: 999,
        background: "#0B0B0D", color: "#fff",
        fontSize: 13, fontWeight: 600, textDecoration: "none",
      }}>Back to dashboard</Link>
    </main>
  );
}
