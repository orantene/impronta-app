"use client";

// "Design a print card" — slice 1b's door. Creates a blank print_designs row
// for the tenant and opens it in the builder at /<tenantSlug>/admin/print/<id>.
// The richer links-seam entry lands when the QR & Links surface exists; this
// list is the interim manager.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createPrintDesignAction } from "@/lib/site-admin/builder-core/adapters/print-actions";

export function DesignPrintCardButton({ tenantSlug }: { tenantSlug: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const result = await createPrintDesignAction();
      if (result.ok) {
        router.push(`/${tenantSlug}/admin/print/${result.id}`);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 6 }}>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        style={{
          fontSize: 13,
          fontWeight: 700,
          padding: "8px 16px",
          borderRadius: 6,
          color: "#fff",
          background: "var(--color-admin-brand)",
          border: "none",
          cursor: pending ? "default" : "pointer",
          opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? "Creating…" : "Design a print card"}
      </button>
      {error ? (
        <span style={{ fontSize: 12, color: "var(--color-admin-red)" }}>{error}</span>
      ) : null}
    </div>
  );
}
