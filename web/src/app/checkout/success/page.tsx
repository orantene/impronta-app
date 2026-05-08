import Link from "next/link";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ mock?: string; tx?: string }>;

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const isMock = sp.mock === "1";
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
        background: "rgba(46,125,91,0.14)", color: "#1F5C40",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: 28, fontWeight: 700,
      }}>✓</div>
      <h1 style={{ fontSize: 22, margin: 0, fontWeight: 600 }}>
        {isMock ? "Mock checkout complete" : "Payment received"}
      </h1>
      <p style={{ fontSize: 14, color: "rgba(11,11,13,0.6)", maxWidth: 480, margin: 0 }}>
        {isMock
          ? "STRIPE_SECRET_KEY isn't configured for this environment. The transaction stays in payment_requested until the agency manually marks it received."
          : "Thanks — your payment is confirmed. The agency has been notified and the booking is locked in."}
      </p>
      <Link href="/" style={{
        marginTop: 8, padding: "9px 16px", borderRadius: 999,
        background: "#0B0B0D", color: "#fff",
        fontSize: 13, fontWeight: 600, textDecoration: "none",
      }}>Back to dashboard</Link>
    </main>
  );
}
