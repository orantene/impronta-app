/**
 * GET the print-ready PDF for a print design.
 *
 * THE TENANT IS NOT TAKEN FROM THE URL. `[tenantSlug]` is attacker-supplied;
 * `loadPrintDesignAction` resolves the tenant from the workspace SURFACE via
 * `requireWorkspaceStaffAction` and filters `.eq("tenant_id", guard.tenantId)`,
 * so a signed-in staff member of tenant A cannot read tenant B's design by
 * editing the path. The action returns null for "not authorised" and for "no
 * such design" alike, and this route answers 404 to both — so the response
 * cannot be used to discover which design ids exist in another workspace.
 *
 * The QR is drawn from the LINKS bound to the design, one page per link. The
 * design binds once to a SET of links (ruled: a fan-out of eleven tables is one
 * design and eleven pages, never eleven trees), so the exporter iterates the set
 * and each page carries its own code.
 */
import { NextResponse } from "next/server";

import { loadPrintDesignAction } from "@/lib/site-admin/builder-core/adapters/print-actions";
import { PrintDesignRefusal, toPrintPdfDesign } from "@/lib/links/print-export";
import {
  EXTRACTOR_MISSING_REASON,
  getPrintDesignExtractor,
} from "@/lib/links/print-extraction";
import { PRINT_SIZES, type PrintSizeKey, type SheetItem } from "@/lib/links/qr/files";

export const runtime = "nodejs";

function problem(status: number, detail: string) {
  return NextResponse.json({ error: detail }, { status });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // The guard lives inside the action, on the resolved workspace. Nothing here
  // reads the slug.
  const row = await loadPrintDesignAction({ pageId: id });
  if (!row) return problem(404, "Not found.");

  const extract = getPrintDesignExtractor();
  if (!extract) {
    // 501, not 500: the request is well formed and the server has simply not
    // implemented this half yet. A 500 would send someone hunting for a fault
    // in their design, and there is none.
    return problem(501, EXTRACTOR_MISSING_REASON);
  }

  const size = (row.size in PRINT_SIZES ? row.size : "table_tent") as PrintSizeKey;
  const design = extract(row.builder_tree, size);

  // One SheetItem per bound link. Until the design->link-set binding ships, a
  // design with no links is the only reachable case, and an empty print run is
  // a refusal rather than a zero-page PDF that looks like a broken printer.
  const items: readonly SheetItem[] = [];
  if (items.length === 0) {
    return problem(409, "This design has no codes attached yet, so there is nothing to print.");
  }

  try {
    const pdf = await toPrintPdfDesign(items, design);
    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        // `inline` so a preview opens in the browser; the filename still
        // applies when the operator saves it.
        "content-disposition": `inline; filename="${row.name || "print"}.pdf"`,
        // A print run is per-tenant and staff-only: never store it anywhere.
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof PrintDesignRefusal) {
      // 422: the design is understood and unprintable, and the message names
      // what to change. These are the refusals that stop an unscannable code
      // reaching two hundred flyers.
      return problem(422, error.message);
    }
    throw error;
  }
}
