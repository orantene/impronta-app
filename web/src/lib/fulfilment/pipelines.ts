/**
 * pipelines.ts — the operator's fulfilment board, as data.
 *
 * A pizza maker's board reads New / Preparing / Ready / Served. A print shop's
 * reads Received / Proof sent / Approved / Printing / Ready / Collected. Same
 * code, same columns, different words and different count — which is the whole
 * point: a fixed nine-value enum cannot describe both, and hardcoding a second
 * enum per vertical is how you end up with six boards.
 *
 * STORED AS JSONB AT `agencies.settings.fulfilment_pipeline`, NO MIGRATION.
 * This follows the shipped precedent of `settings.words` and
 * `settings.appointments`: an operator-editable bundle with a product default
 * is settings, not schema. It also means shipping this cannot collide with
 * another manager's migration timestamp.
 *
 * Pure. No I/O, no `server-only`, no client directive, so one module serves a
 * server render, a client settings table and a test lane.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MONEY RULE, and the reason `kind` exists at all.
 *
 * `booking_fulfillment.status` is the payout-release signal: reaching one of
 * HANDED_OFF_STATES stamps `shipped_at`, and `isProductPayoutDeferred` holds a
 * product's payout until it does. If stages were free text, an operator could
 * rename or delete the stage that releases money and silently strand every
 * payout — a settings edit with no error, discovered on a payout report.
 *
 * So a stage carries a `kind`, and only `kind: "done"` maps to a handed-off
 * status. The operator names the stage; they never unhook the payout. Every
 * pipeline is required to contain exactly one `start` and at least one `done`,
 * enforced by `validatePipeline`, so a saved pipeline cannot be un-completable.
 */

export type StageKind = "start" | "work" | "ready" | "done";

export type StageLabel = { en: string; es: string };

export type FulfilmentStage = {
  /** Stable identity. Renaming a label must not orphan rows keyed by this. */
  key: string;
  label: StageLabel;
  kind: StageKind;
  /** Board column tint. A token name, never a hex value. */
  color: string;
  /** Tell the customer when the order reaches this stage. */
  notifyCustomer: boolean;
  /** Minutes after entering this stage before the card reads as late. Null = never. */
  lateAfterMin: number | null;
};

export type FulfilmentPipeline = {
  name: string;
  stages: FulfilmentStage[];
};

/** Presets keyed by industry. `industry_preset` already selects the words bundle. */
export type PipelinePresetId =
  | "restaurant"
  | "cafe"
  | "pickup"
  | "bakery"
  | "print_shop"
  | "retail";

function stage(
  key: string,
  en: string,
  es: string,
  kind: StageKind,
  color: string,
  opts: { notify?: boolean; lateAfterMin?: number | null } = {},
): FulfilmentStage {
  return {
    key,
    label: { en, es },
    kind,
    color,
    notifyCustomer: opts.notify ?? false,
    lateAfterMin: opts.lateAfterMin ?? null,
  };
}

/**
 * The product defaults. Six verticals, and the shapes genuinely differ — a
 * bakery pre-order waits days between "taken" and "baking", a print shop needs
 * a customer approval step in the middle, and a retail sale has no middle at
 * all. That difference is why this is data.
 *
 * `notifyCustomer` is true only where a person would actually want the message:
 * "your order is ready" earns a notification, "we started cooking" does not.
 */
export const PIPELINE_PRESETS: Record<PipelinePresetId, FulfilmentPipeline> = {
  restaurant: {
    name: "Kitchen",
    stages: [
      stage("new", "New", "Nuevo", "start", "slate", { lateAfterMin: 5 }),
      stage("preparing", "Preparing", "Preparando", "work", "amber", { lateAfterMin: 25 }),
      stage("ready", "Ready", "Listo", "ready", "green", { notify: true, lateAfterMin: 10 }),
      stage("served", "Served", "Servido", "done", "slate"),
    ],
  },
  cafe: {
    name: "Counter",
    stages: [
      stage("new", "New", "Nuevo", "start", "slate", { lateAfterMin: 3 }),
      stage("making", "Making", "Preparando", "work", "amber", { lateAfterMin: 10 }),
      stage("ready", "Ready", "Listo", "ready", "green", { notify: true, lateAfterMin: 5 }),
      stage("collected", "Collected", "Recogido", "done", "slate"),
    ],
  },
  pickup: {
    name: "Pickup",
    stages: [
      stage("new", "New", "Nuevo", "start", "slate"),
      stage("packing", "Packing", "Empacando", "work", "amber", { lateAfterMin: 30 }),
      stage("ready", "Ready for pickup", "Listo para recoger", "ready", "green", {
        notify: true,
      }),
      stage("collected", "Collected", "Recogido", "done", "slate"),
    ],
  },
  bakery: {
    // Pre-orders sit for days between taken and baking, so no late timer until
    // the day of. A late badge on a cake ordered for Saturday is noise.
    name: "Pre-orders",
    stages: [
      stage("taken", "Taken", "Tomado", "start", "slate"),
      stage("baking", "Baking", "Horneando", "work", "amber", { lateAfterMin: 120 }),
      stage("ready", "Ready", "Listo", "ready", "green", { notify: true }),
      stage("collected", "Collected", "Recogido", "done", "slate"),
    ],
  },
  print_shop: {
    // The only preset with a customer-blocking middle: nothing prints until the
    // proof is approved, so "Proof sent" carries the notification and no late
    // timer — the clock is on the customer, not the shop.
    name: "Jobs",
    stages: [
      stage("received", "Received", "Recibido", "start", "slate"),
      stage("proof_sent", "Proof sent", "Prueba enviada", "work", "indigo", { notify: true }),
      stage("approved", "Approved", "Aprobado", "work", "indigo"),
      stage("printing", "Printing", "Imprimiendo", "work", "amber", { lateAfterMin: 240 }),
      stage("ready", "Ready", "Listo", "ready", "green", { notify: true }),
      stage("collected", "Collected", "Recogido", "done", "slate"),
    ],
  },
  retail: {
    name: "Orders",
    stages: [
      stage("new", "New", "Nuevo", "start", "slate"),
      stage("ready", "Ready", "Listo", "ready", "green", { notify: true }),
      stage("handed_over", "Handed over", "Entregado", "done", "slate"),
    ],
  },
};

export const DEFAULT_PRESET_ID: PipelinePresetId = "pickup";

const STAGE_KINDS: ReadonlySet<string> = new Set<StageKind>([
  "start",
  "work",
  "ready",
  "done",
]);

export const MAX_STAGES = 12;
export const MAX_STAGE_LABEL = 40;

export type PipelineProblem =
  | "no_stages"
  | "too_many_stages"
  | "no_start"
  | "many_starts"
  | "no_done"
  | "duplicate_key"
  | "bad_key"
  | "bad_kind"
  | "empty_label"
  | "label_too_long";

/**
 * A pipeline an operator may save.
 *
 * `no_done` and `no_start` are money and workflow rules, not tidiness: a board
 * with no done stage can never release a product payout, and one with no start
 * has nowhere to put a new order.
 */
export function validatePipeline(p: FulfilmentPipeline): PipelineProblem[] {
  const problems: PipelineProblem[] = [];
  const stages = p.stages ?? [];

  if (stages.length === 0) problems.push("no_stages");
  if (stages.length > MAX_STAGES) problems.push("too_many_stages");

  const starts = stages.filter((s) => s.kind === "start").length;
  if (stages.length > 0 && starts === 0) problems.push("no_start");
  if (starts > 1) problems.push("many_starts");
  if (stages.length > 0 && !stages.some((s) => s.kind === "done")) problems.push("no_done");

  const seen = new Set<string>();
  for (const s of stages) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(s.key ?? "")) problems.push("bad_key");
    else if (seen.has(s.key)) problems.push("duplicate_key");
    else seen.add(s.key);

    if (!STAGE_KINDS.has(s.kind)) problems.push("bad_kind");

    for (const locale of ["en", "es"] as const) {
      const text = s.label?.[locale] ?? "";
      if (!text.trim()) problems.push("empty_label");
      else if (text.length > MAX_STAGE_LABEL) problems.push("label_too_long");
    }
  }

  return [...new Set(problems)];
}

/**
 * Resolve the pipeline for a tenant from its raw `agencies.settings`.
 *
 * DEGRADES TO A PRESET, NEVER TO NOTHING. A malformed or half-written override
 * returns the preset rather than an empty board: an operator looking at a board
 * with no columns cannot tell a broken save from an empty day, and a kitchen
 * with no columns cannot work at all.
 */
export function resolvePipeline(
  settings: unknown,
  presetId: string | null | undefined,
): { pipeline: FulfilmentPipeline; source: "override" | "preset" } {
  const preset =
    presetId && presetId in PIPELINE_PRESETS
      ? PIPELINE_PRESETS[presetId as PipelinePresetId]
      : PIPELINE_PRESETS[DEFAULT_PRESET_ID];

  const raw =
    settings && typeof settings === "object"
      ? (settings as Record<string, unknown>).fulfilment_pipeline
      : null;

  if (!raw || typeof raw !== "object") return { pipeline: preset, source: "preset" };

  const candidate = raw as Partial<FulfilmentPipeline>;
  const stages = Array.isArray(candidate.stages) ? candidate.stages : [];
  const shaped: FulfilmentPipeline = {
    name: typeof candidate.name === "string" && candidate.name.trim() ? candidate.name : preset.name,
    stages: stages.map((s) => ({
      key: typeof s?.key === "string" ? s.key : "",
      label: {
        en: typeof s?.label?.en === "string" ? s.label.en : "",
        es: typeof s?.label?.es === "string" ? s.label.es : "",
      },
      kind: (STAGE_KINDS.has(s?.kind as string) ? s.kind : "work") as StageKind,
      color: typeof s?.color === "string" && s.color ? s.color : "slate",
      notifyCustomer: s?.notifyCustomer === true,
      lateAfterMin:
        typeof s?.lateAfterMin === "number" && Number.isFinite(s.lateAfterMin) && s.lateAfterMin > 0
          ? Math.round(s.lateAfterMin)
          : null,
    })),
  };

  if (validatePipeline(shaped).length > 0) return { pipeline: preset, source: "preset" };
  return { pipeline: shaped, source: "override" };
}

/** The stage a new order lands in. Guaranteed by `validatePipeline`. */
export function startStage(p: FulfilmentPipeline): FulfilmentStage | null {
  return p.stages.find((s) => s.kind === "start") ?? p.stages[0] ?? null;
}

/**
 * Does reaching this stage hand the order to the customer, and therefore
 * release a deferred product payout?
 *
 * Keyed on `kind`, never on the key or the label, so renaming "Served" to
 * "Entregado" or to "Out the door" cannot unhook the payout.
 */
export function releasesPayout(stage: FulfilmentStage): boolean {
  return stage.kind === "done";
}

/** Board column order. Stages render in author order; this is the read the board uses. */
export function boardColumns(p: FulfilmentPipeline): FulfilmentStage[] {
  return p.stages;
}
