/**
 * Phase C — internal validation harness for the rich-text editor.
 *
 * NOT a product surface. NOT linked from anywhere. Use only to validate
 * the editor primitive against real-world marker strings during Phase C
 * development + post-deploy verification.
 *
 * Gates:
 *   - `process.env.NODE_ENV === "production"` returns 404 unless an
 *     explicit `?dev=1` query param is present (per ratified scope —
 *     allows on-tenant verification without exposing the page broadly).
 *   - `?edit=1` is also required so the route follows the same edit-mode
 *     entry as the rest of the builder. A request without `?edit=1` 404s.
 *
 * Renders each fixture string in two columns: live RichEditor on the
 * left, public `renderInlineRich` output on the right. Operators
 * verifying §17 parity should see identical visual styling between the
 * two columns at rest, and zero visible markers in the editor column.
 */

import { notFound } from "next/navigation";

import { renderInlineRich } from "@/lib/site-admin/sections/shared/rich-text";
import { ROUND_TRIP_FIXTURES } from "@/components/edit-chrome/rich-editor/transformers/fixtures";
import { HarnessClient } from "./HarnessClient";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ edit?: string; dev?: string }>;
}

export default async function PhaseCHarnessPage({ searchParams }: PageProps) {
  const params = await searchParams;
  if (params.edit !== "1") notFound();
  if (params.dev !== "1") notFound();

  // Pre-compute the public-render React for each fixture, so the client
  // component can show side-by-side without re-running the renderer on
  // every keystroke.
  const fixtures = ROUND_TRIP_FIXTURES.map((s, i) => ({
    index: i,
    input: s,
    publicRender: <span>{renderInlineRich(s)}</span>,
  }));

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
          Phase C — RichEditor harness
        </h1>
        <p style={{ fontSize: 12, color: "#666" }}>
          Internal validation surface. Each row shows the same marker string
          as a live RichEditor (left) and the public renderer (right). Edit
          freely — values do not persist anywhere.
        </p>
      </header>

      <HarnessClient fixtures={fixtures} />
    </main>
  );
}
