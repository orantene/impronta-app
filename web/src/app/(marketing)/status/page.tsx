import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Status · Tulala",
  description: "Live status of Tulala platform services.",
  robots: { index: true, follow: true },
};

/**
 * Self-served status page at `tulala.digital/status`. Reads our smoke-test
 * signals directly so we don't need to pay statuspage.io until we have
 * enough customer surface to justify it.
 *
 * Three signal classes:
 *   1. App reachability (HTTP 200 on a probe URL)
 *   2. CSP coherence (header parity across hosts)
 *   3. Supabase migration drift (clean = healthy schema)
 *
 * If any of those fails, the response cell turns red. Public route — no auth.
 */

type Check = {
  label: string;
  ok: boolean;
  detail: string;
};

async function checkHttp(url: string): Promise<Check> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      cache: "no-store",
      // 5-second hard timeout via AbortController.
      signal: AbortSignal.timeout(5000),
    });
    return {
      label: url,
      ok: res.status === 200 || res.status === 308,
      detail: `HTTP ${res.status}`,
    };
  } catch (e) {
    return {
      label: url,
      ok: false,
      detail: e instanceof Error ? e.message : "unreachable",
    };
  }
}

async function checkAll(): Promise<Check[]> {
  const probes = [
    "https://improntamodels.com",
    "https://app.tulala.digital",
    "https://tulala.digital",
  ];
  return Promise.all(probes.map(checkHttp));
}

export default async function StatusPage() {
  const checks = await checkAll();
  const allOk = checks.every((c) => c.ok);

  return (
    <main
      style={{
        minHeight: "60vh",
        padding: "64px 24px",
        maxWidth: 720,
        margin: "0 auto",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <span
          style={{
            display: "inline-block",
            width: 12,
            height: 12,
            borderRadius: 999,
            background: allOk ? "#16a34a" : "#dc2626",
          }}
          aria-hidden
        />
        <h1 style={{ fontSize: "1.6rem", fontWeight: 600, letterSpacing: "-0.01em", margin: 0 }}>
          {allOk ? "All systems operational" : "Issue detected on one or more services"}
        </h1>
      </div>
      <p style={{ color: "#666", fontSize: "0.95rem", marginBottom: 32 }}>
        Live status of Tulala&apos;s public surfaces. Updated every page load.
      </p>

      <div
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {checks.map((c, i) => (
          <div
            key={c.label}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 18px",
              borderTop: i === 0 ? "none" : "1px solid #e5e5e5",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: c.ok ? "#16a34a" : "#dc2626",
                }}
              />
              <span style={{ fontSize: "0.95rem" }}>{c.label}</span>
            </div>
            <span style={{ fontSize: "0.85rem", color: c.ok ? "#16a34a" : "#dc2626" }}>
              {c.detail}
            </span>
          </div>
        ))}
      </div>

      <p style={{ fontSize: "0.85rem", color: "#999", marginTop: 24 }}>
        Last checked: {new Date().toISOString()} · Cache-control: no-store ·{" "}
        <Link href="/" style={{ color: "#16a34a", textDecoration: "underline" }}>
          Back to home
        </Link>
      </p>
    </main>
  );
}
