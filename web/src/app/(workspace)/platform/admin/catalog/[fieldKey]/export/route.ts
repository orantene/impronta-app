// Phase 9A slice 6 — Platform HQ · Catalog · per-field export (GET).
// Returns field summary + risks + workspace adoption as CSV or JSON.
// Auth: re-checked here (Route Handlers don't inherit layout auth).

import { type NextRequest, NextResponse } from "next/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { loadPlatformCatalogFieldDetail } from "../../../../catalog-field-detail-data";

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ fieldKey: string }> },
) {
  const { profile } = await getCachedActorSession();
  if (!isPlatformAdmin(profile)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { fieldKey } = await params;
  const decoded = decodeURIComponent(fieldKey);
  const format = req.nextUrl.searchParams.get("format") ?? "json";
  const detail = await loadPlatformCatalogFieldDetail(decoded);

  if (!detail.ok || !detail.field) {
    return new NextResponse("Field not found", { status: 404 });
  }

  const f = detail.field;
  const tag = dateTag();
  const safeKey = decoded.replace(/[^a-zA-Z0-9_-]/g, "_");

  if (format === "csv") {
    const lines: string[] = [];

    // Section 1: field summary
    lines.push(toCsvRow(["section", "key", "value"]));
    const summaryRows: [string, unknown][] = [
      ["field_key", f.field_key],
      ["label", f.label],
      ["tier", f.tier],
      ["section", f.section ?? ""],
      ["group", f.field_group_name ?? ""],
      ["visibility", f.visibility],
      ["admin_only", f.admin_only],
      ["is_sensitive", f.is_sensitive],
      ["show_in_public", f.show_in_public],
      ["required_default", f.required_default],
      ["deprecated", f.deprecated],
      ["total_value_count", f.total_value_count],
      ["total_override_count", f.total_override_count],
      // Slice-5 fields — were initially omitted from exports.
      ["tenants_with_values", f.tenants_with_values],
    ];
    for (const [k, v] of summaryRows) {
      lines.push(toCsvRow(["summary", k, v]));
    }

    // Section 2: risks
    lines.push("");
    lines.push(toCsvRow(["risk_kind", "detail"]));
    for (const r of detail.risks) {
      lines.push(toCsvRow([r.kind, r.detail]));
    }
    if (detail.risks.length === 0) {
      lines.push(toCsvRow(["(none)", ""]));
    }

    // Section 3: workspace adoption
    // Includes slice-5 `value_count` + `has_override` so exports surface
    // the same data the per-field detail page shows.
    lines.push("");
    lines.push(
      toCsvRow([
        "workspace_name",
        "slug",
        "plan",
        "status",
        "entity_type",
        "has_override",
        "value_count",
        "enabled_override",
        "required_override",
        "custom_label",
        "custom_helper",
        "show_in_public_override",
        "admin_only_override",
        "effective_label",
        "is_customized",
      ]),
    );
    for (const w of detail.workspaces) {
      lines.push(
        toCsvRow([
          w.name,
          w.slug,
          w.plan,
          w.status,
          w.entity_type,
          w.has_override,
          w.value_count,
          w.enabled_override ?? "",
          w.required_override ?? "",
          w.custom_label ?? "",
          w.custom_helper ?? "",
          w.show_in_public_override ?? "",
          w.admin_only_override ?? "",
          w.effective_label,
          w.is_customized,
        ]),
      );
    }
    if (detail.workspaces.length === 0) {
      lines.push(toCsvRow(["(none)", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]));
    }

    const body = lines.join("\r\n") + "\r\n";
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="field-${safeKey}-${tag}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // JSON (default)
  // Includes slice-5 `tenants_with_values` (field summary) and
  // `has_override` + `value_count` (per-workspace row).
  const payload = {
    field: {
      field_key: f.field_key,
      label: f.label,
      tier: f.tier,
      section: f.section ?? null,
      group: f.field_group_name ?? null,
      visibility: f.visibility,
      admin_only: f.admin_only,
      is_sensitive: f.is_sensitive,
      show_in_public: f.show_in_public,
      required_default: f.required_default,
      deprecated: f.deprecated,
      total_value_count: f.total_value_count,
      total_override_count: f.total_override_count,
      tenants_with_values: f.tenants_with_values,
    },
    risks: detail.risks.map((r) => ({ kind: r.kind, detail: r.detail })),
    workspaces: detail.workspaces.map((w) => ({
      name: w.name,
      slug: w.slug,
      plan: w.plan,
      status: w.status,
      entity_type: w.entity_type,
      has_override: w.has_override,
      value_count: w.value_count,
      enabled_override: w.enabled_override,
      required_override: w.required_override,
      custom_label: w.custom_label,
      custom_helper: w.custom_helper,
      show_in_public_override: w.show_in_public_override,
      admin_only_override: w.admin_only_override,
      effective_label: w.effective_label,
      is_customized: w.is_customized,
    })),
  };

  return NextResponse.json(payload, {
    headers: {
      "Content-Disposition": `attachment; filename="field-${safeKey}-${tag}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
