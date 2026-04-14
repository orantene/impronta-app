/**
 * Parse age range from natural language queries.
 * Examples: "20 to 30 years old", "age between 20 and 30", "20-30 años", "under 25"
 * Returns null if nothing matched.
 */

export type AgeSearchBand = {
  ageMin: number;
  ageMax: number;
};

const AGE_CLAMP_MIN = 18;
const AGE_CLAMP_MAX = 70;

function clampAge(n: number): number {
  return Math.min(AGE_CLAMP_MAX, Math.max(AGE_CLAMP_MIN, Math.round(n)));
}

function band(min: number, max: number): AgeSearchBand {
  const lo = clampAge(Math.min(min, max));
  const hi = clampAge(Math.max(min, max));
  return { ageMin: lo, ageMax: hi };
}

export function parseAgeSearchBandFromQuery(raw: string): AgeSearchBand | null {
  const q = raw.trim();
  if (!q) return null;

  // "20 to 30 years", "20 and 30 years", "20-30 years", "20–30 years"
  const rangeRe =
    /\b(\d{1,2})\s*(?:to|and|a|hasta|-|–)\s*(\d{1,2})\s*(?:year|years|yr|años?|año)?\s*(?:old|de edad)?\b/i;
  const rangeM = rangeRe.exec(q);
  if (rangeM) {
    const a = Number.parseInt(rangeM[1]!, 10);
    const b = Number.parseInt(rangeM[2]!, 10);
    if (a >= 14 && a <= 80 && b >= 14 && b <= 80) return band(a, b);
  }

  // "age between 20 and 30", "entre 20 y 30"
  const betweenRe =
    /(?:age\s+between|entre)\s+(\d{1,2})\s+(?:and|y)\s+(\d{1,2})/i;
  const betweenM = betweenRe.exec(q);
  if (betweenM) {
    const a = Number.parseInt(betweenM[1]!, 10);
    const b = Number.parseInt(betweenM[2]!, 10);
    if (a >= 14 && a <= 80 && b >= 14 && b <= 80) return band(a, b);
  }

  // "under 30 years", "menos de 30 años"
  const underRe =
    /(?:under|younger\s+than|less\s+than|menos\s+de|menor\s+de)\s+(\d{1,2})\s*(?:year|years|yr|años?|año)?/i;
  const underM = underRe.exec(q);
  if (underM) {
    const a = Number.parseInt(underM[1]!, 10);
    if (a >= 14 && a <= 80) return band(AGE_CLAMP_MIN, a);
  }

  // "over 25 years", "older than 25", "más de 25"
  const overRe =
    /(?:over|older\s+than|more\s+than|más\s+de|mayor\s+de)\s+(\d{1,2})\s*(?:year|years|yr|años?|año)?/i;
  const overM = overRe.exec(q);
  if (overM) {
    const a = Number.parseInt(overM[1]!, 10);
    if (a >= 14 && a <= 80) return band(a, AGE_CLAMP_MAX);
  }

  // Bare "25 years old"
  const bareRe = /\b(\d{1,2})\s*(?:years?\s*old|años?\s*de\s*edad)\b/i;
  const bareM = bareRe.exec(q);
  if (bareM) {
    const a = Number.parseInt(bareM[1]!, 10);
    if (a >= 14 && a <= 80) return band(a - 2, a + 2);
  }

  return null;
}

/** Strip age mentions from query text so they don't pollute full-text search. */
export function stripAgeMentionsFromQuery(raw: string): string {
  let t = raw;
  t = t.replace(
    /\b\d{1,2}\s*(?:to|and|a|hasta|-|–)\s*\d{1,2}\s*(?:year|years|yr|años?|año)?\s*(?:old|de edad)?\b/gi,
    " ",
  );
  t = t.replace(
    /(?:age\s+between|entre)\s+\d{1,2}\s+(?:and|y)\s+\d{1,2}/gi,
    " ",
  );
  t = t.replace(
    /(?:under|younger\s+than|less\s+than|menos\s+de|menor\s+de)\s+\d{1,2}\s*(?:year|years|yr|años?|año)?/gi,
    " ",
  );
  t = t.replace(
    /(?:over|older\s+than|more\s+than|más\s+de|mayor\s+de)\s+\d{1,2}\s*(?:year|years|yr|años?|año)?/gi,
    " ",
  );
  t = t.replace(/\b\d{1,2}\s*(?:years?\s*old|años?\s*de\s*edad)\b/gi, " ");
  t = t.replace(/\bage\b/gi, " ");
  return t.replace(/\s+/g, " ").trim();
}

/** Convert age band to date_of_birth range (ISO strings for Supabase query). */
export function ageBandToDobRange(band: AgeSearchBand): {
  dobMin: string; // oldest (born earliest) — max age
  dobMax: string; // youngest (born latest) — min age
} {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();

  // Min age: born at most (ageMin) years ago → dobMax is recent
  const dobMaxDate = new Date(year - band.ageMin, month, day);
  // Max age: born at least (ageMax) years ago → dobMin is older
  const dobMinDate = new Date(year - band.ageMax, month, day);

  return {
    dobMin: dobMinDate.toISOString().slice(0, 10),
    dobMax: dobMaxDate.toISOString().slice(0, 10),
  };
}
