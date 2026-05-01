/**
 * CSV parsing helpers for the bulk-import drawers.
 *
 * Extracted as a pure module (no React, no DOM) so it can be unit-tested
 * via `tsx --test` and reused across NewTalentDrawer's CSV mode and
 * ClientCsvBulkAddDrawer.
 *
 * Naive split-on-comma; quotes ignored. For production-grade CSV (with
 * quoted commas, escaped newlines, etc.) the runtime-side wires
 * papaparse — this is prototype-tight.
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
  if (!raw.trim()) return [];
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const cols = lines[0].split(",").map(c => c.trim());
  const iFirst = findColumn(cols, "first", "firstname", "first name", "given");
  const iLast  = findColumn(cols, "last", "lastname", "last name", "surname", "family");
  const iName  = findColumn(cols, "name", "full name", "displayname");
  const iEmail = findColumn(cols, "email", "e-mail");
  const iPhone = findColumn(cols, "phone", "tel", "mobile");
  const iType  = findColumn(cols, "type", "role", "talent type", "primary");
  const iCity  = findColumn(cols, "city", "base", "homebase", "home base");
  return lines.slice(1).map(line => {
    const cells = line.split(",").map(c => c.trim());
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
  if (!raw.trim()) return [];
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const cols = lines[0].split(",").map(c => c.trim());
  const iName    = findColumn(cols, "name", "company", "client", "brand");
  const iContact = findColumn(cols, "contact", "person", "buyer");
  const iEmail   = findColumn(cols, "email", "e-mail");
  return lines.slice(1).map(line => {
    const cells = line.split(",").map(c => c.trim());
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
