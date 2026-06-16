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
      // bio_en/bio_es/bio_es_draft/bio_es_status/bio_*_updated_at were folded
      // into per-locale JSONB maps by the WS4 i18n migration; read the maps.
      let profileQuery = supabase
        .from("talent_profiles")
        .select(
          "profile_code, display_name, bio_i18n, bio_draft_i18n, bio_status_i18n, bio_updated_at_i18n",
        )
        .is("deleted_at", null);

      profileQuery = includeStaleBios
        ? profileQuery.or("bio_status_i18n->>es.eq.missing,bio_status_i18n->>es.eq.stale")
        : profileQuery.eq("bio_status_i18n->>es", "missing");

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
        const bio = (p.bio_i18n as Record<string, string> | null) ?? null;
        const bioDraft = (p.bio_draft_i18n as Record<string, string> | null) ?? null;
        const bioStatus = (p.bio_status_i18n as Record<string, string> | null) ?? null;
        const bioUpdatedAt = (p.bio_updated_at_i18n as Record<string, string> | null) ?? null;
        const draft = (bioDraft?.es as string | null) ?? "";
        chunks.push(
          row([
            "profile",
            name,
            code,
            String(bioStatus?.es ?? "missing"),
            (bio?.en as string | null) ?? "",
            (bio?.es as string | null) ?? "",
            draft.trim() ? "yes" : "no",
            (bioUpdatedAt?.es as string | null) ?? "",
            (bioUpdatedAt?.en as string | null) ?? "",
            "",
          ]),
        );
      }
      if (rows.length < PAGE) break;
    }

    for (let from = 0; ; from += PAGE) {
      // name_en/name_es → name_i18n {en,es} (WS4 i18n migration).
      const { data, error } = await supabase
        .from("taxonomy_terms")
        .select("kind, slug, name_i18n, updated_at")
        .is("archived_at", null)
        .or("name_i18n->>es.is.null,name_i18n->>es.eq.")
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
        const nameMap = (t.name_i18n as Record<string, string> | null) ?? null;
        const nameEn = (nameMap?.en as string | null) ?? "";
        chunks.push(
          row([
            "taxonomy_term",
            nameEn,
            slug,
            "missing",
            nameEn,
            (nameMap?.es as string | null) ?? "",
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
      // display_name_en/display_name_es → display_name_i18n {en,es} (WS4).
      const { data, error } = await supabase
        .from("locations")
        .select("country_code, city_slug, display_name_i18n, updated_at")
        .is("archived_at", null)
        .or("display_name_i18n->>es.is.null,display_name_i18n->>es.eq.")
        .order("country_code", { ascending: true })
        .order("display_name_i18n->>en", { ascending: true })
        .range(from, from + PAGE - 1);

      if (error) {
        logServerError("admin/translations/export/locations", error);
        return NextResponse.json({ error: "Export failed." }, { status: 500 });
      }
      const rows = data ?? [];
      for (const loc of rows) {
        const cc = loc.country_code as string;
        const cs = loc.city_slug as string;
        const nameMap = (loc.display_name_i18n as Record<string, string> | null) ?? null;
        const nameEn = (nameMap?.en as string | null) ?? "";
        chunks.push(
          row([
            "location",
            nameEn,
            `${cs}|${cc}`,
            "missing",
            nameEn,
            (nameMap?.es as string | null) ?? "",
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
