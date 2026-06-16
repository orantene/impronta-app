/**
 * Dev-only index for /dev/template-preview — lists the two available keys
 * so QA can navigate without hand-typing URLs.
 *
 * Gated: production returns 404.
 */

import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const KEYS = [
  {
    key: "default-storefront",
    label: "Default Storefront",
    description:
      "PLATFORM_DEFAULT_STOREFRONT_TREE — the premium dark agency homepage shown to brand-new tenants.",
  },
  {
    key: "default-talent",
    label: "Default Talent Profile",
    description:
      "buildDefaultTalentProfileTree() hydrated with a fixture profile (Maya Reyes · Editorial Model · Mexico City).",
  },
] as const;

export default function TemplatePreviewIndex() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div
      style={{
        padding: 40,
        fontFamily: "ui-monospace, Menlo, monospace",
        fontSize: 13,
      }}
    >
      <h1 style={{ fontSize: 16, marginBottom: 8 }}>template preview harness</h1>
      <p style={{ color: "#666", marginBottom: 32 }}>
        Dev-only. Renders platform-default builder trees without any tenant or
        seed gymnastics. Section embeds show empty (no tenant context).
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 16 }}>
        {KEYS.map(({ key, label, description }) => (
          <li
            key={key}
            style={{
              border: "1px solid #e5e5e5",
              borderRadius: 6,
              padding: "16px 20px",
            }}
          >
            <Link
              href={`/dev/template-preview/${key}`}
              style={{ fontWeight: 700, color: "#0070f3", textDecoration: "none" }}
            >
              {label}
            </Link>
            <code
              style={{
                display: "block",
                color: "#888",
                fontSize: 11,
                marginTop: 4,
                marginBottom: 6,
              }}
            >
              /dev/template-preview/{key}
            </code>
            <span style={{ color: "#444", fontFamily: "system-ui, sans-serif", fontSize: 12 }}>
              {description}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
