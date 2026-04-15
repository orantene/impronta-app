import { buildTranslationUnitInlineEdit } from "@/lib/translation-center/editor-contract";
import type { TranslationCenterAdapter, AdapterContext } from "@/lib/translation-center/adapters/adapter-types";
import { TC_TABLE_PAGE_SIZE } from "@/lib/translation-center/adapters/adapter-types";
import type {
  DomainAggregateDTO,
  ListUnitsParams,
  ListUnitsResult,
  TranslationUnitDTO,
} from "@/lib/translation-center/types";
import { healthMessageKey } from "@/lib/translation-center/health/messages";

// JSON lives at web/messages (outside src); resolve from web/src/lib/translation-center/adapters/
// eslint-disable-next-line @typescript-eslint/no-require-imports
const enMessages: Record<string, unknown> = require("../../../../messages/en.json") as Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const esMessages: Record<string, unknown> = require("../../../../messages/es.json") as Record<string, unknown>;

function empty(domain: AdapterContext["domain"]): DomainAggregateDTO {
  return {
    domainId: domain.id,
    title: domain.title,
    navTabKey: domain.navTabKey,
    contentClass: domain.contentClass,
    coverageWeight: domain.coverageWeight,
    counts: {
      missing: 0,
      complete: 0,
      needs_attention: 0,
      language_issue: 0,
      applicableRequired: 0,
      filledRequired: 0,
    },
  };
}

function flattenLeaves(obj: unknown, prefix: string, out: Map<string, string>): void {
  if (obj === null || obj === undefined) return;
  if (typeof obj === "string") {
    if (prefix) out.set(prefix, obj);
    return;
  }
  if (typeof obj === "number" || typeof obj === "boolean") {
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => flattenLeaves(item, `${prefix}[${i}]`, out));
    return;
  }
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const next = prefix ? `${prefix}.${k}` : k;
      flattenLeaves(v, next, out);
    }
  }
}

const enFlat = new Map<string, string>();
const esFlat = new Map<string, string>();
flattenLeaves(enMessages, "", enFlat);
flattenLeaves(esMessages, "", esFlat);

const allKeys = [...enFlat.keys()].sort();

export const messagesUiAdapter: TranslationCenterAdapter = {
  adapterId: "messagesUi",

  async aggregate(ctx: AdapterContext): Promise<DomainAggregateDTO> {
    const { domain } = ctx;
    const base = empty(domain);
    for (const key of allKeys) {
      const enVal = enFlat.get(key);
      if (!enVal?.trim()) continue;
      base.counts.applicableRequired += 1;
      const esVal = esFlat.get(key);
      const h = healthMessageKey(enVal, esVal);
      if (h.health === "missing") base.counts.missing += 1;
      else if (h.health === "language_issue") base.counts.language_issue += 1;
      else if (h.health === "needs_attention") {
        base.counts.needs_attention += 1;
        base.counts.filledRequired += 1;
      } else if (h.health === "complete") {
        base.counts.complete += 1;
        base.counts.filledRequired += 1;
      }
    }
    return base;
  },

  async listUnits(ctx: AdapterContext, params: ListUnitsParams): Promise<ListUnitsResult> {
    const { domain } = ctx;
    if (params.navTabKey !== domain.navTabKey) {
      return { units: [], hasMore: false, loadError: null };
    }

    const rows: Array<{ key: string; en: string; es: string | undefined }> = [];
    for (const key of allKeys) {
      const enVal = enFlat.get(key);
      if (!enVal?.trim()) continue;
      rows.push({ key, en: enVal, es: esFlat.get(key) });
    }

    let filtered = rows;
    const st = params.statusFilter;
    if (st === "missing") {
      filtered = rows.filter((r) => healthMessageKey(r.en, r.es).health === "missing");
    } else if (st === "needs_attention") {
      filtered = rows.filter((r) => healthMessageKey(r.en, r.es).health === "needs_attention");
    } else if (st === "complete" || st === "translated" || st === "published") {
      filtered = rows.filter((r) => healthMessageKey(r.en, r.es).health === "complete");
    } else if (st === "language_issue" || st === "language_conflict") {
      filtered = rows.filter((r) => healthMessageKey(r.en, r.es).health === "language_issue");
    }
    if (params.q.trim()) {
      const q = params.q.trim().toLowerCase();
      filtered = filtered.filter((r) => r.key.toLowerCase().includes(q));
    }

    const slice = filtered.slice(params.offset, params.offset + TC_TABLE_PAGE_SIZE);
    const units: TranslationUnitDTO[] = slice.map((r) => {
      const h = healthMessageKey(r.en, r.es);
      const adminHref = `/admin/translations?view=messages&q=${encodeURIComponent(r.key)}`;
      return {
        domainId: domain.id,
        adapterId: domain.adapterId,
        entityType: "message_key",
        entityId: r.key,
        fieldKey: r.key,
        groupKey: domain.groupKey,
        contentClass: domain.contentClass,
        displayLabel: r.key,
        health: h.health,
        integrityFlags: h.integrityFlags,
        localeSummary: `ES: ${(r.es ?? "").trim() ? "✓" : "—"}`,
        updatedAt: null,
        adminHref,
        inlineEdit: buildTranslationUnitInlineEdit({ domain, open_full_editor_url: adminHref }),
      };
    });

    return {
      units,
      hasMore: filtered.length > params.offset + TC_TABLE_PAGE_SIZE,
      loadError: null,
    };
  },
};
