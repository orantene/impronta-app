import { Section } from "@react-email/components";
import * as React from "react";

import type { FeeLine } from "@/lib/billing/processing-fee-payer";
import { validClientFeeLines } from "@/lib/payments/fee-lines-payload";

/**
 * Receipt price breakdown. Renders ONLY lines the server already computed from
 * the booking's frozen commission snapshot and `validClientFeeLines` accepted
 * (parts add up to the amount charged). Never recomputes a fee: when the lines
 * are absent or do not add up, the component renders nothing and the caller
 * keeps its single-total row.
 */

const LABELS: Record<string, Record<string, string>> = {
  en: {
    service_subtotal: "Service",
    base_reservation_fee: "Reservation fee",
    platform_fee: "Tulala service fee (1.5%)",
    processing_fee: "Card processing",
    total_charged: "Total",
  },
  es: {
    service_subtotal: "Servicio",
    base_reservation_fee: "Cargo de reserva",
    platform_fee: "Cargo por servicio Tulala (1.5%)",
    processing_fee: "Procesamiento de tarjeta",
    total_charged: "Total",
  },
};

/** "MX$1,015.00 MXN": symbol-formatted amount plus the ISO code, unambiguous. */
export function formatMoneyWithCode(cents: number, currency: string): string {
  const code = (currency || "USD").trim().toUpperCase();
  try {
    return `${new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(cents / 100)} ${code}`;
  } catch {
    return `${(cents / 100).toFixed(2)} ${code}`;
  }
}

/** Valid lines for this charge, or [] (the caller then keeps the single total). */
export function usableFeeLines(raw: unknown, totalCents: number | null | undefined): FeeLine[] {
  return validClientFeeLines(raw, totalCents ?? null);
}

interface Props {
  feeLines: readonly FeeLine[] | null | undefined;
  /** The amount charged, in cents. Lines must sum to it. */
  totalCents: number | null | undefined;
  currency: string;
  locale?: string;
}

export function MoneyBreakdown({ feeLines, totalCents, currency, locale }: Props) {
  const lines = usableFeeLines(feeLines, totalCents);
  if (lines.length === 0) return null;
  const labels = LABELS[locale === "es" ? "es" : "en"];
  return (
    <Section style={wrap}>
      {lines.map((l) => {
        const isTotal = l.code === "total_charged";
        return (
          <table key={l.code} width="100%" style={isTotal ? totalTable : rowTable}>
            <tbody>
              <tr>
                <td style={isTotal ? totalLabel : label}>{labels[l.code] ?? l.code}</td>
                <td style={isTotal ? totalValue : value}>{formatMoneyWithCode(l.cents, currency)}</td>
              </tr>
            </tbody>
          </table>
        );
      })}
    </Section>
  );
}

const wrap: React.CSSProperties = { margin: "0 0 16px" };
const rowTable: React.CSSProperties = { borderCollapse: "collapse" };
const totalTable: React.CSSProperties = { borderCollapse: "collapse", borderTop: "1px solid #e5e5e5", marginTop: "6px" };
const label: React.CSSProperties = { padding: "4px 0", fontSize: "14px", color: "#555555" };
const value: React.CSSProperties = { padding: "4px 0", fontSize: "14px", color: "#1a1a1a", textAlign: "right" };
const totalLabel: React.CSSProperties = { ...label, paddingTop: "8px", fontWeight: 700, color: "#1a1a1a" };
const totalValue: React.CSSProperties = { ...value, paddingTop: "8px", fontWeight: 700 };
