import {
  DIRECTORY_HEIGHT_CM_MAX,
  DIRECTORY_HEIGHT_CM_MIN,
} from "@/lib/directory/search-params";

const TOLERANCE_CM = 2;

export type HeightSearchBand = {
  heightMinCm: number;
  heightMaxCm: number;
  targetCm: number;
};

function clampCm(n: number): number {
  return Math.min(DIRECTORY_HEIGHT_CM_MAX, Math.max(DIRECTORY_HEIGHT_CM_MIN, Math.round(n)));
}

function bandFromTargetCm(target: number): HeightSearchBand {
  const t = clampCm(target);
  const min = clampCm(t - TOLERANCE_CM);
  const max = clampCm(t + TOLERANCE_CM);
  return { heightMinCm: min, heightMaxCm: max, targetCm: t };
}

function feetInchesToCm(feet: number, inches: number): number {
  return Math.round(feet * 30.48 + inches * 2.54);
}

/**
 * Parse height-like patterns from free text. Returns null if nothing matched.
 */
export function parseHeightSearchBandFromQuery(raw: string): HeightSearchBand | null {
  const q = raw.trim();
  if (!q) return null;

  const cmRe =
    /\b([1-9]\d{1,2})\s*(?:cm|CM|Cm)\b|\b([1-9]\d{1,2})(?:cm|CM|Cm)\b/;
  const cmM = cmRe.exec(q);
  if (cmM) {
    const n = Number.parseInt(cmM[1] ?? cmM[2] ?? "", 10);
    if (Number.isFinite(n) && n >= 100 && n <= 250) {
      return bandFromTargetCm(n);
    }
  }

  const mRe = /\b([01])\s*[.,]\s*(\d{2})\s*(?:m|M|metros?|metre?s?)\b/i;
  const mM = mRe.exec(q);
  if (mM) {
    const whole = Number.parseInt(mM[1]!, 10);
    const frac = Number.parseInt(mM[2]!, 10);
    const meters = whole + frac / 100;
    const cm = Math.round(meters * 100);
    if (cm >= 100 && cm <= 250) {
      return bandFromTargetCm(cm);
    }
  }

  const ftRe =
    /\b(\d)\s*(?:'|′|ft|feet)\s*(\d{1,2})\b|\b(\d)\s*(?:ft|feet)\s*(\d{1,2})\b/i;
  const ftM = ftRe.exec(q);
  if (ftM) {
    const ft = Number.parseInt(ftM[1] ?? ftM[3] ?? "", 10);
    const inch = Number.parseInt(ftM[2] ?? ftM[4] ?? "", 10);
    if (Number.isFinite(ft) && Number.isFinite(inch) && inch >= 0 && inch < 12 && ft >= 4 && ft <= 7) {
      const cm = feetInchesToCm(ft, inch);
      if (cm >= DIRECTORY_HEIGHT_CM_MIN && cm <= DIRECTORY_HEIGHT_CM_MAX) {
        return bandFromTargetCm(cm);
      }
    }
  }

  const bareRe = /\b(1[4-9]\d|2[01]\d)\b/;
  const bareM = bareRe.exec(q);
  if (bareM) {
    const n = Number.parseInt(bareM[1]!, 10);
    if (n >= DIRECTORY_HEIGHT_CM_MIN && n <= DIRECTORY_HEIGHT_CM_MAX) {
      return bandFromTargetCm(n);
    }
  }

  return null;
}

export function stripHeightMentionsFromQuery(raw: string): string {
  let t = raw;
  t = t.replace(/\b[1-9]\d{1,2}\s*(?:cm|CM|Cm)\b/gi, " ");
  t = t.replace(/\b[1-9]\d{1,2}(?:cm|CM|Cm)\b/gi, " ");
  t = t.replace(/\b[01]\s*[.,]\s*\d{2}\s*(?:m|M|metros?|metre?s?)\b/gi, " ");
  t = t.replace(/\b\d\s*(?:'|′|ft|feet)\s*\d{1,2}\b/gi, " ");
  t = t.replace(/\b\d\s*(?:ft|feet)\s*\d{1,2}\b/gi, " ");
  return t.replace(/\s+/g, " ").trim();
}
