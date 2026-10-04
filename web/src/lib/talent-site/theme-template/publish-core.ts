/**
 * TEMPLATE FACTORY: "Publish as vN+1", the pure half. Every check that
 * decides whether an editor draft may become a new Design version lives here
 * and runs over injected ports, so the order (rev, preflight, base, code,
 * diff) is testable without a database. `publish.server.ts` binds the ports.
 *
 * Version rule (same as the built-in sync): H = highest version the design
 * has EVER had (catalog row, snapshots, release to-versions), L = the newest
 * payload on record. The draft must have been opened from L (else someone
 * published meanwhile: "design moved to vX, reopen"), and no code-authored
 * release-notes module may already claim H+1 (the sync would mint the same
 * version from code).
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { DesignPayload } from "../theme-catalog/types";
import { DESIGN_ALLOWED_NODE_KINDS, validateDesign } from "../theme-catalog/validate";
import { canonicalPalettes } from "../theme-catalog/palettes-canonical";
import { diffDesignPayloads, type CandidateItem } from "../theme-releases/diff-payload";
import {
  contentPaths,
  designLeaves,
  flattenProps,
  hashString,
  kidsOf,
  propsOf,
  stableStringify,
  stampDesignOrigin,
  stripDesignOrigin,
} from "../theme-releases/origin";
import { autoNotes, type AutoNotes } from "../theme-releases/release-notes/auto-notes";
import { indexTree } from "../theme-releases/classify";
import type { ReleaseItem, ReleaseNotes } from "../theme-releases/types";
import { designKeyIssues, ensureDesignKeys, freezeDesignKeys } from "./publish-placeholders";
import type { ThemeDraft } from "./types";

// ── Results ──────────────────────────────────────────────────────────────────

export type PublishFailCode = "not_found" | "stale_rev" | "invalid" | "forbidden" | "conflict" | "error";

export interface PublishFail {
  ok: false;
  code: PublishFailCode;
  /** English message (admin surface default). */
  error: string;
  /** Spanish message. */
  errorEs: string;
  /** Preflight problems, one per line (code `invalid`). */
  issues?: string[];
}

export type PublishResult<T> = { ok: true; value: T } | PublishFail;

const fail = (code: PublishFailCode, en: string, es: string, issues?: string[]): PublishFail => ({
  ok: false,
  code,
  error: en,
  errorEs: es,
  ...(issues && issues.length > 0 ? { issues } : {}),
});

// ── Canonical payload ────────────────────────────────────────────────────────

function sortedRecord(r: Readonly<Record<string, string>> | undefined): Record<string, string> | undefined {
  if (!r) return undefined;
  return Object.fromEntries(Object.entries(r).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function canonicalTree(tree: ReadonlyArray<BuilderNode> | undefined): BuilderNode[] {
  return freezeDesignKeys(ensureDesignKeys(stripDesignOrigin(tree ?? [])));
}

/** Un-hydrated payload with no stamps, frozen keys, sorted token defaults, no `undefined`. */
export function canonicalDesign(payload: DesignPayload): DesignPayload {
  const out: DesignPayload = {
    shellTree: canonicalTree(payload.shellTree),
    homeTree: canonicalTree(payload.homeTree),
    ...(payload.optionalBlocks ? { optionalBlocks: canonicalTree(payload.optionalBlocks) } : {}),
    ...(payload.tokenDefaults ? { tokenDefaults: sortedRecord(payload.tokenDefaults) } : {}),
    ...(canonicalPalettes(payload.palettes) ? { palettes: canonicalPalettes(payload.palettes) } : {}),
  };
  return JSON.parse(JSON.stringify(out)) as DesignPayload;
}

export function payloadHash(payload: DesignPayload): string {
  return hashString(stableStringify(payload));
}

// ── Preflight ────────────────────────────────────────────────────────────────

/**
 * Placeholders `hydrateTalentTree` resolves (default-talent-tree.ts `flat`).
 * Anything else hydrates to "" on a talent site, so it is refused here.
 * plus `year` (the shell copyright, `resolveYearToken` in theme-apply-core).
 * `publish-core.test.ts` proves every name below really resolves.
 */
export const KNOWN_PLACEHOLDERS: ReadonlySet<string> = new Set([
  "year",
  "displayName",
  "primaryTypeLabel",
  "secondaryType1",
  "secondaryType2",
  "secondaryType3",
  "disciplinesLine",
  "tagline",
  "bio",
  "richBio",
  "locationLine",
  "heroEyebrow",
  "headline",
  "menuSubtitle",
  "proofLine",
  "languagesLine",
  "headshotUrl",
  "profilePath",
  "inquireHref",
  "whatsappHref",
  "emailHref",
  "callHref",
  "contactCopy",
  "service1",
  "service2",
  "service3",
  "gallery0",
  "gallery1",
  "gallery2",
  "gallery3",
  "gallery4",
  "gallery5",
  "maxSiteUrl",
  // Maison v2 rich footer LIVE lines (also carry liveText; tokens keep canvas hydrate + publish preflight aligned).
  "footerIntro",
  "footerWhere",
  "footerHours",
  "footerContact",
]);

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

function walkNodes(nodes: ReadonlyArray<BuilderNode>, visit: (n: BuilderNode, path: string) => void, path: string): void {
  nodes.forEach((n, i) => {
    const here = `${path}[${i}]`;
    visit(n, here);
    walkNodes(kidsOf(n), visit, `${here}.children`);
  });
}

function stringsIn(value: unknown, out: string[]): void {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) stringsIn(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) stringsIn(v, out);
}

const TREES = [
  ["shellTree", "shell"],
  ["homeTree", "home"],
  ["optionalBlocks", "optional"],
] as const;

/** Node kinds outside the Design allow-list, and placeholders nothing hydrates. */
export function templateIssues(payload: DesignPayload): string[] {
  const issues: string[] = [];
  for (const [field, label] of TREES) {
    const tree = payload[field];
    if (!tree) continue;
    walkNodes(
      tree,
      (n, path) => {
        if (!DESIGN_ALLOWED_NODE_KINDS.has(n.kind)) issues.push(`${label}${path}: "${n.kind}" is not allowed in a design.`);
        const strings: string[] = [];
        stringsIn(n.props, strings);
        for (const s of strings) {
          for (const m of s.matchAll(PLACEHOLDER_RE)) {
            if (!KNOWN_PLACEHOLDERS.has(m[1]!)) issues.push(`${label}${path}: unknown placeholder {{${m[1]}}}.`);
          }
        }
      },
      "",
    );
  }
  return [...new Set(issues)];
}

/**
 * A literal the admin changed on a node that already ships a Spanish variant
 * (`props.i18n.es[prop]` in the base) must still carry a non-empty Spanish
 * variant, or Spanish sites would keep showing the OLD Spanish text.
 */
export function spanishIssues(base: DesignPayload, next: DesignPayload, design: string): string[] {
  const issues: string[] = [];
  for (const [field, label] of [
    ["shellTree", "shell"],
    ["homeTree", "home"],
  ] as const) {
    const a = indexTree(stampDesignOrigin(base[field], { design, version: 0 })).byKey;
    const b = indexTree(stampDesignOrigin(next[field], { design, version: 0 })).byKey;
    for (const [key, nb] of b) {
      const na = a.get(key);
      if (!na) continue;
      const pa = propsOf(na.node);
      const pb = propsOf(nb.node);
      const esA = ((pa.i18n as Record<string, Record<string, unknown>> | undefined)?.es ?? {}) as Record<string, unknown>;
      const esB = ((pb.i18n as Record<string, Record<string, unknown>> | undefined)?.es ?? {}) as Record<string, unknown>;
      for (const prop of Object.keys(esA)) {
        if (pa[prop] === pb[prop]) continue;
        const v = esB[prop];
        if (typeof v !== "string" || !v.trim()) {
          issues.push(`${label}:${key}: "${prop}" changed but its Spanish text is missing.`);
        } else if (v === esA[prop] && typeof pb[prop] === "string") {
          issues.push(`${label}:${key}: "${prop}" changed but its Spanish text did not.`);
        }
      }
    }
  }
  return issues;
}

export function preflight(base: DesignPayload, next: DesignPayload, design: string): string[] {
  const v = validateDesign(next);
  return [
    ...(v.ok ? [] : v.errors),
    ...templateIssues(next),
    ...designKeyIssues(next),
    ...spanishIssues(base, next, design),
  ];
}

// ── Content-only changes ─────────────────────────────────────────────────────

/**
 * Changes that only reach NEW sites: content-owned leaves (a `{{token}}`
 * value, which an update never writes; binding or unbinding one) and the
 * optional blocks list (never diffed into a release).
 */
export function contentOnlyChanges(base: DesignPayload, next: DesignPayload, design: string): string[] {
  const out: string[] = [];
  for (const [field, label] of [
    ["shellTree", "shell"],
    ["homeTree", "home"],
  ] as const) {
    const a = indexTree(stampDesignOrigin(base[field], { design, version: 0 })).byKey;
    const b = indexTree(stampDesignOrigin(next[field], { design, version: 0 })).byKey;
    for (const [key, nb] of b) {
      const na = a.get(key);
      if (!na) continue;
      const pa = propsOf(na.node);
      const pb = propsOf(nb.node);
      const cp = [...new Set([...contentPaths(pa), ...contentPaths(pb)])];
      const da = designLeaves(pa, cp);
      const db = designLeaves(pb, cp);
      const fa = flattenProps(pa);
      const fb = flattenProps(pb);
      for (const path of [...new Set([...fa.keys(), ...fb.keys()])].sort()) {
        if (da.has(path) || db.has(path)) continue;
        if (stableStringify(fa.get(path)) !== stableStringify(fb.get(path))) out.push(`${label}:${key} ${path}`);
      }
    }
  }
  if (stableStringify(base.optionalBlocks ?? []) !== stableStringify(next.optionalBlocks ?? [])) {
    out.push("optional blocks");
  }
  return out;
}

// ── Version history ──────────────────────────────────────────────────────────

export interface DesignHistoryView {
  title: string;
  catalog: { version: number; payload: DesignPayload } | null;
  snapshots: ReadonlyArray<{ version: number; payload: DesignPayload }>;
  releaseToVersions: ReadonlyArray<number>;
}

/** H = highest version ever, L = newest payload on record (catalog wins a tie). */
export function versionState(h: DesignHistoryView): { highest: number; latest: { version: number; payload: DesignPayload } } | null {
  let latest = h.catalog;
  for (const s of h.snapshots) if (!latest || s.version > latest.version) latest = s;
  if (!latest) return null;
  let highest = latest.version;
  for (const s of h.snapshots) highest = Math.max(highest, s.version);
  for (const v of h.releaseToVersions) highest = Math.max(highest, v);
  if (h.catalog) highest = Math.max(highest, h.catalog.version);
  return { highest, latest };
}

// ── Plan ─────────────────────────────────────────────────────────────────────

export interface PublishPlan {
  design: string;
  draftId: string;
  expectedRev: number;
  baseVersion: number;
  nextVersion: number;
  payload: DesignPayload;
  basePayload: DesignPayload;
  items: ReleaseItem[];
  notes: ReleaseNotes;
  auto: AutoNotes;
  contentOnly: string[];
  meta: { code_hash: string | null; draft_id: string; base_version: number; payload_hash: string };
}

export interface PlanPorts {
  loadDraft: (design: string) => Promise<PublishResult<ThemeDraft>>;
  loadHistory: (design: string) => Promise<DesignHistoryView | null>;
  /** True when a code-authored release-notes module already claims (design, version). */
  codeClaims: (design: string, version: number) => boolean;
  /** Hash of the built-in (code) payload for the design, or null when it is not a built-in. */
  codeHash: (design: string) => string | null;
}

/** Top-level `layerLabel` per bare design key (for talent-facing notes). */
function sectionLabels(payload: DesignPayload): Record<string, string> {
  const out: Record<string, string> = {};
  for (const tree of [payload.shellTree, payload.homeTree]) {
    for (const n of tree) {
      const p = propsOf(n);
      const key = typeof p.slotKey === "string" && p.slotKey ? p.slotKey : typeof p.originRole === "string" ? p.originRole : null;
      if (key && typeof p.layerLabel === "string" && p.layerLabel.trim()) out[key] = p.layerLabel.trim();
    }
  }
  return out;
}

/**
 * Everything short of the write. `expectedRev` null = preview (no rev check).
 */
export async function planPublish(
  ports: PlanPorts,
  input: { design: string; expectedRev: number | null },
): Promise<PublishResult<PublishPlan>> {
  const d = await ports.loadDraft(input.design);
  if (!d.ok) return d;
  const draft = d.value;
  if (draft.status !== "open") {
    return fail("conflict", "This draft is already closed. Reopen the design.", "Este borrador ya está cerrado. Vuelve a abrir el diseño.");
  }
  if (input.expectedRev !== null && draft.rev !== input.expectedRev) {
    return fail(
      "stale_rev",
      "The draft changed in another tab. Reload before publishing.",
      "El borrador cambió en otra pestaña. Recarga antes de publicar.",
    );
  }

  const history = await ports.loadHistory(input.design);
  const state = history ? versionState(history) : null;
  if (!history || !state) return fail("not_found", "Design not found in the catalog.", "El diseño no está en el catálogo.");
  const L = state.latest;
  const base = canonicalDesign(L.payload);
  const next = canonicalDesign(draft.payload);

  const issues = preflight(base, next, input.design);
  if (issues.length > 0) {
    return fail(
      "invalid",
      `The design has ${issues.length} problem${issues.length === 1 ? "" : "s"} to fix before publishing.`,
      `El diseño tiene ${issues.length} problema${issues.length === 1 ? "" : "s"} que corregir antes de publicar.`,
      issues.slice(0, 40),
    );
  }

  if (draft.baseVersion !== L.version) {
    return fail(
      "conflict",
      `The design moved to v${L.version} while you edited. Reopen it to continue.`,
      `El diseño pasó a la v${L.version} mientras editabas. Vuelve a abrirlo para seguir.`,
    );
  }

  const nextVersion = state.highest + 1;
  if (ports.codeClaims(input.design, nextVersion)) {
    return fail(
      "conflict",
      `v${nextVersion} is already reserved by a release written in code. Ship that release first.`,
      `La v${nextVersion} ya está reservada por una versión escrita en código. Publica esa versión primero.`,
    );
  }

  const candidates: CandidateItem[] = diffDesignPayloads(
    input.design,
    { payload: base, version: L.version },
    { payload: next, version: nextVersion },
  );
  const contentOnly = contentOnlyChanges(base, next, input.design);
  if (candidates.length === 0) {
    return fail(
      "invalid",
      contentOnly.length > 0
        ? "No changes for existing sites. The edits only reach new sites, so there is nothing to release."
        : "No changes to publish.",
      contentOnly.length > 0
        ? "No hay cambios para los sitios existentes. Las ediciones solo llegan a sitios nuevos, así que no hay nada que publicar."
        : "No hay cambios que publicar.",
      contentOnly,
    );
  }

  const auto = autoNotes({ designTitle: history.title, items: candidates, sectionLabels: sectionLabels(next) });
  return {
    ok: true,
    value: {
      design: input.design,
      draftId: draft.id,
      expectedRev: draft.rev,
      baseVersion: L.version,
      nextVersion,
      payload: next,
      basePayload: base,
      items: auto.items,
      notes: { en: auto.notes.en, es: auto.notes.es, source: "auto" },
      auto,
      contentOnly,
      meta: {
        code_hash: ports.codeHash(input.design),
        draft_id: draft.id,
        base_version: L.version,
        payload_hash: payloadHash(next),
      },
    },
  };
}

// ── RPC ──────────────────────────────────────────────────────────────────────

export interface PublishRpcArgs {
  p_draft_id: string;
  p_expected_rev: number;
  p_design: string;
  p_version: number;
  p_payload: DesignPayload;
  p_meta: PublishPlan["meta"];
  p_release: {
    from_version: number;
    to_version: number;
    items: ReleaseItem[];
    notes: ReleaseNotes;
    base_payload: DesignPayload;
  };
  p_actor: string | null;
}

export function rpcArgs(plan: PublishPlan, actorId: string | null): PublishRpcArgs {
  return {
    p_draft_id: plan.draftId,
    p_expected_rev: plan.expectedRev,
    p_design: plan.design,
    p_version: plan.nextVersion,
    p_payload: plan.payload,
    p_meta: plan.meta,
    p_release: {
      from_version: plan.baseVersion,
      to_version: plan.nextVersion,
      items: plan.items,
      notes: plan.notes,
      base_payload: plan.basePayload,
    },
    p_actor: actorId,
  };
}

export interface PublishedVersion {
  version: number;
  releaseId: string;
}

/** Map `publish_theme_template_draft` output ({ok, version, release_id} | {ok:false, code}). */
export function mapPublishRpc(
  data: unknown,
  error: { message?: string; code?: string } | null,
): PublishResult<PublishedVersion> {
  if (error) return fail("error", `Publish failed: ${error.message ?? "database error"}.`, `No se pudo publicar: ${error.message ?? "error de base de datos"}.`);
  const r = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  if (!r) return fail("error", "Publish failed: empty answer from the database.", "No se pudo publicar: la base de datos no respondió.");
  if (r.ok === true) {
    const version = typeof r.version === "number" ? r.version : Number(r.version);
    const releaseId = typeof r.release_id === "string" ? r.release_id : "";
    if (!Number.isFinite(version) || !releaseId) {
      return fail("error", "Publish failed: the answer had no version or release.", "No se pudo publicar: la respuesta no trajo versión ni entrega.");
    }
    return { ok: true, value: { version, releaseId } };
  }
  if (r.code === "stale_rev") {
    return fail("stale_rev", "The draft changed in another tab. Reload before publishing.", "El borrador cambió en otra pestaña. Recarga antes de publicar.");
  }
  if (r.code === "conflict") {
    return fail(
      "conflict",
      "Someone published this design meanwhile. Reopen it to continue.",
      "Alguien publicó este diseño mientras tanto. Vuelve a abrirlo para seguir.",
    );
  }
  const msg = typeof r.error === "string" ? r.error : String(r.code ?? "unknown");
  return fail("error", `Publish failed: ${msg}.`, `No se pudo publicar: ${msg}.`);
}

export interface PublishPorts extends PlanPorts {
  rpc: (args: PublishRpcArgs) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
}

export async function publishWithPorts(
  ports: PublishPorts,
  input: { design: string; expectedRev: number; actorId: string | null },
): Promise<PublishResult<PublishedVersion & { items: number }>> {
  const plan = await planPublish(ports, { design: input.design, expectedRev: input.expectedRev });
  if (!plan.ok) return plan;
  let res: { data: unknown; error: { message?: string; code?: string } | null };
  try {
    res = await ports.rpc(rpcArgs(plan.value, input.actorId));
  } catch (err) {
    res = { data: null, error: { message: err instanceof Error ? err.message : "rpc threw" } };
  }
  const mapped = mapPublishRpc(res.data, res.error);
  return mapped.ok ? { ok: true, value: { ...mapped.value, items: plan.value.items.length } } : mapped;
}
