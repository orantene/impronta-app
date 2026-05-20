// Phase 9A slice 6 — Platform HQ · Catalog Map export (GET).
// Returns all catalog fields as CSV or JSON for offline analysis.
// Auth: re-checked here (Route Handlers don't inherit layout auth).

import { type NextRequest, NextResponse } from "next/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { loadPlatformCatalogMap, type CatalogField } from "../../../catalog-map-data";

const CSV_HEADERS: string[] = [
  "field_key",
  "label",
  "tier",
  "section",
  "group",
  "visibility",
  "admin_only",
  "is_sensitive",
  "show_in_public",
  "required_default",
  "deprecated",
  "override_count",
  "value_count",
];

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

function dateTag(): string {
  return new Date().toISOString().slice(0, 10);
}

type FieldRow = CatalogField & { group: string };

function buildRows(
  groups: { slug: string; fields: CatalogField[] }[],
  ungrouped: CatalogField[],
): FieldRow[] {
  const rows: FieldRow[] = [];
  for (const g of groups) {
    for (const f of g.fields) rows.push({ ...f, group: g.slug });
  }
  for (const f of ungrouped) rows.push({ ...f, group: "" });
  return rows;
}

export async function GET(req: NextRequest) {
  const { profile } = await getCachedActorSession();
  if (!isPlatformAdmin(profile)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const format = req.nextUrl.searchParams.get("format") ?? "json";
  const map = await loadPlatformCatalogMap();

  if (!map.ok) {
    return new NextResponse("Catalog unavailable", { status: 503 });
  }

  const rows = buildRows(map.groups, map.ungrouped);
  const tag = dateTag();

  if (format === "csv") {
    const lines: string[] = [toCsvRow(CSV_HEADERS)];
    for (const r of rows) {
      lines.push(
        toCsvRow([
          r.field_key,
          r.label,
          r.tier,
          r.section ?? "",
          r.group,
          r.visibility,
          r.admin_only,
          r.is_sensitive,
          r.show_in_public,
          r.required_default,
          r.deprecated,
          r.override_count,
          r.value_count,
        ]),
      );
    }
    const body = lines.join("\r\n") + "\r\n";
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="catalog-map-${tag}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // JSON (default)
  const payload = rows.map((r) => ({
    field_key: r.field_key,
    label: r.label,
    tier: r.tier,
    section: r.section ?? null,
    group: r.group || null,
    visibility: r.visibility,
    admin_only: r.admin_only,
    is_sensitive: r.is_sensitive,
    show_in_public: r.show_in_public,
    required_default: r.required_default,
    deprecated: r.deprecated,
    override_count: r.override_count,
    value_count: r.value_count,
  }));

  return NextResponse.json(payload, {
    headers: {
      "Content-Disposition": `attachment; filename="catalog-map-${tag}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
