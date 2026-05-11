/**
 * CSV parsing helpers for the bulk-import drawers.
 *
 * Extracted as a pure module (no React, no DOM) so it can be unit-tested
 * and reused across NewTalentDrawer's CSV mode and ClientCsvBulkAddDrawer.
 *
 * Implements RFC 4180 quoted-field handling (commas inside quotes, doubled
 * quotes as escape) and strips the Excel BOM (﻿) from the first line.
 * Does NOT handle multi-line quoted fields — those are extremely rare in
 * roster imports and would need a streaming parser.
 */

export type TalentCsvRow = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  type: string;
  city: string;
};

export type ClientCsvRow = {
  name: string;
  contact: string;
  email: string;
};

/** Split one CSV line into cells respecting RFC 4180 quoting rules. */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } // escaped ""
        else inQuote = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === ',') { cells.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
  }
  cells.push(cur.trim());
  return cells;
}

/** Resolve a column index by trying multiple header aliases.
 *  Each name is matched case-insensitively as either an exact match or a prefix. */
export function findColumn(cols: string[], ...names: string[]): number {
  const lower = cols.map(c => c.toLowerCase().trim());
  for (const name of names) {
    const target = name.toLowerCase();
    const idx = lower.findIndex(c => c === target || c.startsWith(target));
    if (idx >= 0) return idx;
  }
  return -1;
}

export function parseTalentCsv(raw: string): TalentCsvRow[] {
  // Strip Excel BOM if present.
  const cleaned = raw.replace(/^﻿/, "");
  if (!cleaned.trim()) return [];
  const lines = cleaned.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const cols = splitCsvLine(lines[0]);
  const iFirst = findColumn(cols, "first", "firstname", "first name", "given");
  const iLast  = findColumn(cols, "last", "lastname", "last name", "surname", "family");
  const iName  = findColumn(cols, "name", "full name", "displayname");
  const iEmail = findColumn(cols, "email", "e-mail");
  const iPhone = findColumn(cols, "phone", "tel", "mobile");
  const iType  = findColumn(cols, "type", "role", "talent type", "primary");
  const iCity  = findColumn(cols, "city", "base", "homebase", "home base");
  return lines.slice(1).map(line => {
    const cells = splitCsvLine(line);
    let firstName = iFirst >= 0 ? cells[iFirst] ?? "" : "";
    let lastName  = iLast  >= 0 ? cells[iLast]  ?? "" : "";
    if (!firstName && !lastName && iName >= 0) {
      const n = cells[iName] ?? "";
      const parts = n.split(/\s+/);
      firstName = parts[0] ?? "";
      lastName  = parts.slice(1).join(" ");
    }
    return {
      firstName,
      lastName,
      email: iEmail >= 0 ? cells[iEmail] ?? "" : "",
      phone: iPhone >= 0 ? cells[iPhone] ?? "" : "",
      type:  iType  >= 0 ? cells[iType]  ?? "" : "",
      city:  iCity  >= 0 ? cells[iCity]  ?? "" : "",
    } as TalentCsvRow;
  }).filter(r => r.firstName || r.lastName || r.email);
}

export function parseClientCsv(raw: string): ClientCsvRow[] {
  const cleaned = raw.replace(/^﻿/, "");
  if (!cleaned.trim()) return [];
  const lines = cleaned.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const cols = splitCsvLine(lines[0]);
  const iName    = findColumn(cols, "name", "company", "client", "brand");
  const iContact = findColumn(cols, "contact", "person", "buyer");
  const iEmail   = findColumn(cols, "email", "e-mail");
  return lines.slice(1).map(line => {
    const cells = splitCsvLine(line);
    return {
      name:    iName    >= 0 ? cells[iName]    ?? "" : "",
      contact: iContact >= 0 ? cells[iContact] ?? "" : "",
      email:   iEmail   >= 0 ? cells[iEmail]   ?? "" : "",
    };
  }).filter(r => r.name || r.contact || r.email);
}

/** Validation: a talent row needs first name + email to be importable. */
export function isValidTalentRow(row: TalentCsvRow): boolean {
  return Boolean(row.firstName.trim() && row.email.trim());
}

/** Validation: a client row needs name + at least one of contact/email. */
export function isValidClientRow(row: ClientCsvRow): boolean {
  return Boolean(row.name.trim() && (row.contact.trim() || row.email.trim()));
}
