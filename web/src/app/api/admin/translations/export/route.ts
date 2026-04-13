import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireStaff } from "@/lib/server/action-guards";
import { logServerError } from "@/lib/server/safe-error";

const PAGE = 1000;

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function row(cells: string[]): string {
  return `${cells.map(csvEscape).join(",")}\r\n`;
}

function exportIncludesStale(searchParams: URLSearchParams): boolean {
  const raw = (searchParams.get("include") ?? "").trim().toLowerCase();
  if (!raw) return false;
  return raw.split(",").some((part) => part.trim() === "stale");
}

export async function GET(request: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const includeStaleBios = exportIncludesStale(request.nextUrl.searchParams);

  const { supabase } = auth;

  const header = row([
    "type",
    "entity_name",
    "slug_or_code",
    "status",
    "english_value",
    "spanish_value",
    "has_draft",
    "bio_es_updated_at",
    "bio_en_updated_at",
    "entity_updated_at",
  ]);

  const chunks: string[] = [header];

  try {
    for (let from = 0; ; from += PAGE) {
      let profileQuery = supabase
        .from("talent_profiles")
        .select(
          "profile_code, display_name, bio_en, bio_es, bio_es_draft, bio_es_status, bio_es_updated_at, bio_en_updated_at",
        )
        .is("deleted_at", null);

      profileQuery = includeStaleBios
        ? profileQuery.in("bio_es_status", ["missing", "stale"])
        : profileQuery.eq("bio_es_status", "missing");

      const { data, error } = await profileQuery
        .order("profile_code", { ascending: true })
        .range(from, from + PAGE - 1);

      if (error) {
        logServerError("admin/translations/export/profiles", error);
        return NextResponse.json({ error: "Export failed." }, { status: 500 });
      }
      const rows = data ?? [];
      for (const p of rows) {
        const code = p.profile_code as string;
        const name = ((p.display_name as string | null) ?? "").trim() || code;
        const draft = (p.bio_es_draft as string | null) ?? "";
        chunks.push(
          row([
            "profile",
            name,
            code,
            String(p.bio_es_status ?? "missing"),
            (p.bio_en as string | null) ?? "",
            (p.bio_es as string | null) ?? "",
            draft.trim() ? "yes" : "no",
            (p.bio_es_updated_at as string | null) ?? "",
            (p.bio_en_updated_at as string | null) ?? "",
            "",
          ]),
        );
      }
      if (rows.length < PAGE) break;
    }

    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("taxonomy_terms")
        .select("kind, slug, name_en, name_es, updated_at")
        .is("archived_at", null)
        .or("name_es.is.null,name_es.eq.")
        .order("kind", { ascending: true })
        .order("slug", { ascending: true })
        .range(from, from + PAGE - 1);

      if (error) {
        logServerError("admin/translations/export/taxonomy", error);
        return NextResponse.json({ error: "Export failed." }, { status: 500 });
      }
      const rows = data ?? [];
      for (const t of rows) {
        const slug = t.slug as string;
        chunks.push(
          row([
            "taxonomy_term",
            (t.name_en as string) ?? "",
            slug,
            "missing",
            (t.name_en as string) ?? "",
            (t.name_es as string | null) ?? "",
            "",
            "",
            "",
            (t.updated_at as string | null) ?? "",
          ]),
        );
      }
      if (rows.length < PAGE) break;
    }

    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("locations")
        .select("country_code, city_slug, display_name_en, display_name_es, updated_at")
        .is("archived_at", null)
        .or("display_name_es.is.null,display_name_es.eq.")
        .order("country_code", { ascending: true })
        .order("display_name_en", { ascending: true })
        .range(from, from + PAGE - 1);

      if (error) {
        logServerError("admin/translations/export/locations", error);
        return NextResponse.json({ error: "Export failed." }, { status: 500 });
      }
      const rows = data ?? [];
      for (const loc of rows) {
        const cc = loc.country_code as string;
        const cs = loc.city_slug as string;
        chunks.push(
          row([
            "location",
            (loc.display_name_en as string) ?? "",
            `${cs}|${cc}`,
            "missing",
            (loc.display_name_en as string) ?? "",
            (loc.display_name_es as string | null) ?? "",
            "",
            "",
            "",
            (loc.updated_at as string | null) ?? "",
          ]),
        );
      }
      if (rows.length < PAGE) break;
    }
  } catch (e) {
    logServerError("admin/translations/export", e);
    return NextResponse.json({ error: "Export failed." }, { status: 500 });
  }

  const body = chunks.join("");
  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = includeStaleBios
    ? `translation-gaps-with-stale-bios-${dateStamp}.csv`
    : `translation-gaps-${dateStamp}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
