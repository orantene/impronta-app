/**
 * Phase 3 — section sandbox.
 *
 * Lets a developer iterate on a single section type in isolation.
 * Loads the section's library defaults via `getLibraryDefault`, runs
 * them through the section's v1 schema, and renders the section with
 * those props.
 *
 * URL: /dev/section-sandbox/[type]
 *
 * Gated to development builds only — production returns 404 to avoid
 * exposing a developer surface to visitors.
 */

import { notFound } from "next/navigation";

import {
  SECTION_REGISTRY,
  type SectionTypeKey,
} from "@/lib/site-admin/sections/registry";
import { getLibraryDefault } from "@/lib/site-admin/sections/shared/default-content";

export const dynamic = "force-dynamic";

export default async function SectionSandboxPage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { type } = await params;
  if (!(type in SECTION_REGISTRY)) notFound();

  const entry = SECTION_REGISTRY[type as SectionTypeKey];
  const defaults = getLibraryDefault(type as SectionTypeKey);
  const parsed = entry.schemasByVersion[entry.currentVersion].safeParse(defaults.props);
  if (!parsed.success) {
    return (
      <div style={{ padding: 32, fontFamily: "monospace", color: "#c44" }}>
        <h1>Section sandbox — schema parse failed</h1>
        <p>
          Defaults for <code>{type}</code> don&apos;t parse against v
          {entry.currentVersion}.
        </p>
        <pre style={{ fontSize: 11, whiteSpace: "pre-wrap" }}>
          {JSON.stringify(parsed.error.issues, null, 2)}
        </pre>
      </div>
    );
  }
  const Component = entry.Component;

  return (
    <div style={{ minHeight: "100vh", background: "#fafafa" }}>
      <header
        style={{
          padding: "12px 20px",
          borderBottom: "1px solid #e5e5e5",
          background: "white",
          fontFamily: "ui-monospace, Menlo, monospace",
          fontSize: 12,
          color: "#666",
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <strong>section sandbox</strong>
        <span>·</span>
        <code>{type}</code>
        <span>·</span>
        <span>v{entry.currentVersion}</span>
        <span>·</span>
        <span>{entry.meta.label}</span>
      </header>
      <main>
        <Component
          props={parsed.data as never}
          tenantId="00000000-0000-0000-0000-000000000000"
          locale="en"
          preview={true}
        />
      </main>
    </div>
  );
}
