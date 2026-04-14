/**
 * Post-process LLM inquiry drafts: strip common risky patterns (Chunk 8 guardrails).
 * Complements prompt constraints in `inquiry-draft-model.ts`.
 */
export function sanitizeInquiryDraftOutput(text: string): string {
  let s = text;
  const patterns: RegExp[] = [
    /\$\s*[\d.,]+/g,
    /€\s*[\d.,]+/g,
    /£\s*[\d.,]+/g,
    /\b\d+\s*(usd|eur|gbp)\b/gi,
    /\b(price|pricing|rate|tariff|precio|tarifa)\s*[:]\s*[^\n.]+/gi,
    /\b(available|disponible)\s+(now|today|tomorrow|ahora|hoy|ya)\b/gi,
    /\bI\s+confirm\s+(their\s+)?availability\b/gi,
    /\b(confirmo|confirmamos)\s+(su\s+)?disponibilidad\b/gi,
    /\b(guaranteed|garantizado|guaranteed\s+booking)\b/gi,
    /\b(book\s+now|reserva\s+ya|reserve\s+now)\b/gi,
    /\b100%\s*(available|certain|confirmed|seguro|confirmado)\b/gi,
    /\b(no\s+)?risk[\s-]*(free|guarantee)/gi,
    /\b(fully\s+)?refundable\b/gi,
    /\bI\s+(am\s+)?(a\s+)?(licensed\s+)?(medical|legal)\s+/gi,
  ];
  for (const re of patterns) {
    s = s.replace(re, "");
  }
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

/** Hard cap after sanitization (API response size + abuse). */
export const INQUIRY_DRAFT_MAX_CHARS = 4500;
