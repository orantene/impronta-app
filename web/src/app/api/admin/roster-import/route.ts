/**
 * F.13 — Roster import API route.
 *
 * Accepts a multipart form-data POST with a CSV or Excel file under the
 * field name `file`. Parses the file, creates a roster_import_jobs row,
 * processes rows synchronously via processRosterImportRow, and returns
 * the job summary. Owner/admin only — same gating as the inline-rows
 * server action.
 *
 * Endpoint: POST /api/admin/roster-import
 *
 * For large imports (>500 rows) this should ideally move to an Edge
 * Function worker; for the typical agency case (50-200 talents) the
 * synchronous path is fine and avoids the worker-deployment complexity.
 *
 * Supported formats:
 *   - CSV (text/csv)        — header row required; columns mapped by name
 *   - JSON (application/json) — already structured rows; bypasses parser
 *   - XLSX is deferred — sheetjs adds 1MB to the bundle and agencies can
 *     export to CSV in one click
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  processRosterImportRow,
  type RosterImportRow,
} from "@/lib/server-actions/roster-import";
import { logServerError } from "@/lib/server/safe-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB hard cap
const MAX_ROWS = 2000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }
  const { tenantId, user } = auth;

  // Owner / admin only — bulk roster mutation is high-impact.
  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Service unavailable" }, { status: 503 });
  }

  const { data: myMembership } = await admin
    .from("agency_memberships")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("profile_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  const myRole = (myMembership as { role?: string } | null)?.role;
  if (myRole !== "owner" && myRole !== "admin") {
    return NextResponse.json({ ok: false, error: "Owner/admin only" }, { status: 403 });
  }

  // Parse the multipart body. Reject early on size + format.
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Missing `file` field" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { ok: false, error: `File exceeds ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB limit` },
      { status: 413 },
    );
  }

  const mimeType = (file.type || "").toLowerCase();
  const fileName = file.name || "import";
  const looksLikeCsv = mimeType === "text/csv" || fileName.toLowerCase().endsWith(".csv");
  const looksLikeJson = mimeType === "application/json" || fileName.toLowerCase().endsWith(".json");

  if (!looksLikeCsv && !looksLikeJson) {
    return NextResponse.json(
      { ok: false, error: "Unsupported format. Upload CSV or JSON." },
      { status: 415 },
    );
  }

  // Parse rows.
  const text = await file.text();
  let rows: RosterImportRow[] = [];
  try {
    rows = looksLikeJson ? parseJsonRows(text) : parseCsvRows(text);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Could not parse file: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  if (rows.length === 0) {
    return NextResponse.json({ ok: false, error: "File contains no rows" }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { ok: false, error: `File has ${rows.length} rows; max is ${MAX_ROWS}. Split into batches.` },
      { status: 413 },
    );
  }

  // Create the job + process synchronously.
  const { data: job, error: insertErr } = await admin
    .from("roster_import_jobs")
    .insert({
      tenant_id: tenantId,
      initiated_by_user_id: user.id,
      source_file_name: fileName,
      source_file_size_bytes: file.size,
      source_format: looksLikeJson ? "json" : "csv",
      total_rows: rows.length,
      note: `Uploaded via /api/admin/roster-import`,
    })
    .select("id")
    .single();

  if (insertErr || !job) {
    logServerError("api.roster-import.insert", insertErr);
    return NextResponse.json({ ok: false, error: "Couldn't create job" }, { status: 500 });
  }

  const jobId = (job as { id: string }).id;
  await admin
    .from("roster_import_jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", jobId);

  const failures: Array<{ row: number; error: string; values: RosterImportRow }> = [];
  let succeeded = 0;
  let processed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    processed += 1;
    try {
      const result = await processRosterImportRow(admin, tenantId, row);
      if (result.ok) succeeded += 1;
      else failures.push({ row: i + 1, error: result.error, values: row });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      failures.push({ row: i + 1, error: msg, values: row });
    }
  }

  const completedAt = new Date().toISOString();
  await admin
    .from("roster_import_jobs")
    .update({
      status: failures.length === rows.length ? "failed" : "completed",
      processed_rows: processed,
      succeeded_rows: succeeded,
      failed_rows: failures.length,
      failure_details: failures,
      completed_at: completedAt,
    })
    .eq("id", jobId);

  return NextResponse.json({
    ok: true,
    data: {
      jobId,
      totalRows: rows.length,
      succeeded,
      failed: failures.length,
      failures: failures.slice(0, 50), // Cap response payload
    },
  });
}

// ─── Parsers ──────────────────────────────────────────────────────────────

function parseJsonRows(text: string): RosterImportRow[] {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error("JSON must be an array of row objects");
  }
  return parsed.map((row: unknown, i: number) => {
    if (!row || typeof row !== "object") {
      throw new Error(`Row ${i + 1} is not an object`);
    }
    return row as RosterImportRow;
  });
}

/**
 * Minimal RFC 4180 CSV parser sufficient for roster imports:
 *   - Comma separator
 *   - Double-quote escape
 *   - Header row maps column names to RosterImportRow keys
 *
 * Supported header names (case-insensitive, whitespace-trimmed):
 *   display_name | name
 *   first_name   | first
 *   last_name    | last
 *   email
 *   phone
 *   height_cm    | height
 *   home_city_text | city
 *   short_bio    | bio
 *   primary_type_slug | type
 */
function parseCsvRows(text: string): RosterImportRow[] {
  const lines = splitCsvLines(text);
  if (lines.length < 2) return [];
  const headerCells = parseCsvLine(lines[0]!).map((h) => h.trim().toLowerCase());
  const columnMap = mapHeadersToFields(headerCells);

  const rows: RosterImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const cells = parseCsvLine(line);
    const row: RosterImportRow = {};
    for (let c = 0; c < cells.length; c++) {
      const field = columnMap[c];
      if (!field) continue;
      const value = cells[c]?.trim();
      if (!value) continue;
      if (field === "height_cm") {
        const n = Number(value);
        if (Number.isFinite(n)) row.height_cm = n;
      } else {
        (row as Record<string, string>)[field] = value;
      }
    }
    if (Object.keys(row).length > 0) rows.push(row);
  }
  return rows;
}

function splitCsvLines(text: string): string[] {
  // Naive but adequate: split on \r\n / \n while respecting quoted newlines.
  const out: string[] = [];
  let buf = "";
  let insideQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') insideQuotes = !insideQuotes;
    if (!insideQuotes && (c === "\n" || c === "\r")) {
      if (buf) out.push(buf);
      buf = "";
      // Skip \n following \r
      if (c === "\r" && text[i + 1] === "\n") i++;
      continue;
    }
    buf += c;
  }
  if (buf) out.push(buf);
  return out;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let buf = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        buf += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (c === "," && !inQuotes) {
      cells.push(buf);
      buf = "";
      continue;
    }
    buf += c;
  }
  cells.push(buf);
  return cells;
}

function mapHeadersToFields(headers: string[]): (keyof RosterImportRow | undefined)[] {
  const aliases: Record<string, keyof RosterImportRow> = {
    display_name: "display_name",
    name: "display_name",
    first_name: "first_name",
    first: "first_name",
    last_name: "last_name",
    last: "last_name",
    email: "email",
    phone: "phone",
    height_cm: "height_cm",
    height: "height_cm",
    home_city_text: "home_city_text",
    city: "home_city_text",
    short_bio: "short_bio",
    bio: "short_bio",
    primary_type_slug: "primary_type_slug",
    type: "primary_type_slug",
  };
  return headers.map((h) => aliases[h]);
}
