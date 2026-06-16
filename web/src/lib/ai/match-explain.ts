import type { SearchExplanationItem } from "@/lib/ai/search-result";
import { pickLocale } from "@/lib/i18n/pick-locale";

export type ExplainMatchContext = {
  queryCity?: string | null;
  profileCityLabel?: string | null;
  heightCm?: number | null;
  heightMinCm?: number | null;
  heightMaxCm?: number | null;
  sharedTaxonomyLabels?: string[];
  /** All visible fit labels on the card (for query overlap beyond selected filters). */
  cardFitLabels?: string[];
  /** Normalized directory query (same as embedding leg). */
  canonicalQuery?: string | null;
  primaryTalentTypeLabel?: string | null;
  /** Richer rules + confidence bands (`ai_explanations_v2`). */
  explanationsV2?: boolean;
};

function orderTaxonomyLabels(
  labels: string[],
  primaryLabel: string | null,
): string[] {
  if (!primaryLabel?.trim()) return labels;
  const p = primaryLabel.trim().toLowerCase();
  const first: string[] = [];
  const rest: string[] = [];
  for (const raw of labels) {
    const t = raw.trim();
    if (!t) continue;
    if (t.toLowerCase() === p) first.push(t);
    else rest.push(t);
  }
  return [...first, ...rest];
}

/**
 * Deterministic explanations per `docs/match_explanations.md` (subset).
 * With `explanationsV2`, primary-type and query-token overlaps rank ahead of generic taxonomy lines.
 */
export function explainMatch(ctx: ExplainMatchContext): SearchExplanationItem[] {
  const out: SearchExplanationItem[] = [];
  const v2 = Boolean(ctx.explanationsV2);
  const maxLines = v2 ? 5 : 2;

  const qc = ctx.queryCity?.trim().toLowerCase();
  const pc = ctx.profileCityLabel?.trim().toLowerCase();
  if (qc && pc && pc.includes(qc)) {
    out.push({
      code: "loc_match_residence",
      templateParams: { city: ctx.profileCityLabel!.trim() },
      confidence: "high",
    });
  }

  const h = ctx.heightCm;
  if (
    h != null &&
    ctx.heightMinCm != null &&
    ctx.heightMaxCm != null &&
    h >= ctx.heightMinCm &&
    h <= ctx.heightMaxCm
  ) {
    out.push({ code: "height_in_range", confidence: "high" });
  }

  const primary = ctx.primaryTalentTypeLabel?.trim() ?? null;
  const cq = ctx.canonicalQuery?.trim() ?? "";

  if (v2 && cq && primary) {
    const pl = primary.toLowerCase();
    const tokens = cq.split(/\s+/).filter((t) => t.length >= 3);
    for (const tok of tokens) {
      if (pl.includes(tok) || tok.includes(pl)) {
        out.push({
          code: "primary_query_overlap",
          templateParams: { label: primary },
          confidence: "medium",
        });
        break;
      }
    }
  }

  if (v2 && cq.trim() && out.length < maxLines) {
    const tokens = cq.split(/\s+/).filter((t) => t.length >= 3);
    const sharedSet = new Set(
      (ctx.sharedTaxonomyLabels ?? []).map((l) => l.trim().toLowerCase()).filter(Boolean),
    );
    outer: for (const raw of ctx.cardFitLabels ?? []) {
      const lab = raw.trim();
      if (!lab) continue;
      if (sharedSet.has(lab.toLowerCase())) continue;
      const ll = lab.toLowerCase();
      for (const tok of tokens) {
        if (ll.includes(tok) || tok.includes(ll)) {
          out.push({
            code: "fit_label_query_overlap",
            templateParams: { label: lab },
            confidence: "medium",
          });
          break outer;
        }
      }
    }
  }

  const orderedLabels = orderTaxonomyLabels(
    ctx.sharedTaxonomyLabels ?? [],
    primary,
  );

  for (const label of orderedLabels) {
    if (out.length >= maxLines) break;
    if (!label.trim()) continue;
    const isPrimaryType =
      primary != null && label.trim().toLowerCase() === primary.toLowerCase();
    if (v2 && isPrimaryType) {
      out.push({
        code: "primary_type_overlap",
        templateParams: { label: label.trim() },
        confidence: "high",
      });
    } else {
      out.push({
        code: "taxonomy_overlap",
        templateParams: { label: label.trim() },
        confidence: v2 ? "medium" : "high",
      });
    }
  }

  return out.slice(0, maxLines);
}

const CONF_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

/**
 * Single subtle public line derived from explanation confidence bands (v2).
 */
export function publicMatchConfidenceFromExplanations(
  items: SearchExplanationItem[],
  locale: string,
): string | null {
  if (!items.length) return null;
  let best = 0;
  for (const it of items) {
    const r = CONF_RANK[it.confidence ?? "medium"] ?? 2;
    if (r > best) best = r;
  }
  if (best >= 3) {
    return pickLocale(locale, { en: "Strong match for your search", es: "Encaje sólido con tu búsqueda" });
  }
  if (best === 2) {
    return pickLocale(locale, { en: "Reasonable match", es: "Encaje razonable" });
  }
  return pickLocale(locale, { en: "Partial match", es: "Encaje parcial" });
}

export type MatchExplanationUiLine = { id: string; text: string };

/**
 * Turn API `explanation` DTOs into UI lines for `AIMatchExplanation` (Phase 11).
 */
export function formatMatchExplanationsForUi(
  items: SearchExplanationItem[],
  locale: string,
): MatchExplanationUiLine[] {
  const lines: MatchExplanationUiLine[] = [];
  let i = 0;
  for (const item of items) {
    const text = formatOneExplanationLine(item, locale);
    if (!text) continue;
    lines.push({ id: `${item.code}-${i++}`, text });
  }
  return lines;
}

function formatOneExplanationLine(
  item: SearchExplanationItem,
  locale: string,
): string {
  const p = item.templateParams ?? {};
  switch (item.code) {
    case "loc_match_residence":
      return pickLocale(locale, {
        en: `Located in ${p.city ?? ""}`.trim(),
        es: `Ubicación: ${p.city ?? ""}`.trim(),
      });
    case "height_in_range":
      return pickLocale(locale, { en: "Matches requested height", es: "Coincide con la altura solicitada" });
    case "taxonomy_overlap":
      return pickLocale(locale, {
        en: `${p.label ?? ""} experience`.trim(),
        es: `Experiencia: ${p.label ?? ""}`.trim(),
      });
    case "primary_type_overlap":
      return pickLocale(locale, {
        en: `Primary type: ${p.label ?? ""}`.trim(),
        es: `Tipo principal: ${p.label ?? ""}`.trim(),
      });
    case "primary_query_overlap":
      return pickLocale(locale, {
        en: `Aligned with your search (${p.label ?? ""})`.trim(),
        es: `Alineado con tu búsqueda (${p.label ?? ""})`.trim(),
      });
    case "fit_label_query_overlap":
      return pickLocale(locale, {
        en: `Matches your search: ${p.label ?? ""}`.trim(),
        es: `Coincide con tu búsqueda: ${p.label ?? ""}`.trim(),
      });
    default:
      return "";
  }
}
