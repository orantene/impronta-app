// Minimal print-designs list — slice 1b's interim manager for print cards.
// Lists the tenant's print designs and offers the "Design a print card" door.
// The richer links-seam entry lands when the QR & Links surface is built.

import Link from "next/link";

import { listTenantPrintDesignsAction } from "@/lib/site-admin/builder-core/adapters/print-actions";

import { DesignPrintCardButton } from "./DesignPrintCardButton";

const SIZE_LABELS: Record<string, string> = {
  table_tent: "Table tent",
  a5: "A5 flyer",
  a4: "A4 poster",
  sticker: "Sticker",
  card: "Business card",
};

export default async function PrintDesignsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const designs = await listTenantPrintDesignsAction();

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px", fontFamily: 'var(--font-admin-body, "Inter", system-ui, sans-serif)' }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--color-admin-ink)", margin: 0 }}>
            Print cards
          </h1>
          <p style={{ fontSize: 13, color: "var(--color-admin-ink-muted)", margin: "4px 0 0" }}>
            Design a card, table tent or sticker for one of your links, then export it as a print PDF.
          </p>
        </div>
        <DesignPrintCardButton tenantSlug={tenantSlug} />
      </div>

      {designs.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--color-admin-ink-muted)" }}>
          No print cards yet. Design your first one.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {designs.map((d) => (
            <li key={d.id}>
              <Link
                href={`/${tenantSlug}/admin/print/${d.id}`}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 16px", borderRadius: 8,
                  border: "1px solid var(--color-admin-border)",
                  background: "var(--color-admin-card)",
                  color: "var(--color-admin-ink)", textDecoration: "none",
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600 }}>{d.name}</span>
                <span style={{ fontSize: 12, color: "var(--color-admin-ink-muted)" }}>
                  {SIZE_LABELS[d.size] ?? d.size}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
