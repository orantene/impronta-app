/**
 * Sentence keys for Package 2 refusals. The UI session reads these; the
 * engine returns the reason word only.
 */
export const SCHEDULING_ENGINE_REFUSAL_CODES = [
  "overlapping_room",
  "no_instructor",
  "past",
  "sold_out",
  "already_cancelled",
  "paid_seats_need_refund",
  "not_cancellable",
  "not_reschedulable",
  "slot_taken",
  "policy_keeps",
  "token_invalid",
  "talent_unavailable",
  "already_started",
  "not_draft",
  "not_archivable",
  "not_reopenable",
  "cycle",
  "overlap",
  "over_limit",
  "already_decided",
  "not_manager",
  "conflict",
  "not_found",
  "wrong_tenant",
  "invalid",
  "not_allowed",
  "unavailable",
] as const;

export type SchedulingEngineRefusal = (typeof SCHEDULING_ENGINE_REFUSAL_CODES)[number];

export const SCHEDULING_ENGINE_REFUSALS: Readonly<Record<SchedulingEngineRefusal, string>> = {
  overlapping_room: "dashboard.scheduling.engine.refusal.overlapping_room",
  no_instructor: "dashboard.scheduling.engine.refusal.no_instructor",
  past: "dashboard.scheduling.engine.refusal.past",
  sold_out: "dashboard.scheduling.engine.refusal.sold_out",
  already_cancelled: "dashboard.scheduling.engine.refusal.already_cancelled",
  paid_seats_need_refund: "dashboard.scheduling.engine.refusal.paid_seats_need_refund",
  not_cancellable: "dashboard.scheduling.engine.refusal.not_cancellable",
  not_reschedulable: "dashboard.scheduling.engine.refusal.not_reschedulable",
  slot_taken: "dashboard.scheduling.engine.refusal.slot_taken",
  policy_keeps: "dashboard.scheduling.engine.refusal.policy_keeps",
  token_invalid: "dashboard.scheduling.engine.refusal.token_invalid",
  talent_unavailable: "dashboard.scheduling.engine.refusal.talent_unavailable",
  already_started: "dashboard.scheduling.engine.refusal.already_started",
  not_draft: "dashboard.scheduling.engine.refusal.not_draft",
  not_archivable: "dashboard.scheduling.engine.refusal.not_archivable",
  not_reopenable: "dashboard.scheduling.engine.refusal.not_reopenable",
  cycle: "dashboard.scheduling.engine.refusal.cycle",
  overlap: "dashboard.scheduling.engine.refusal.overlap",
  over_limit: "dashboard.scheduling.engine.refusal.over_limit",
  already_decided: "dashboard.scheduling.engine.refusal.already_decided",
  not_manager: "dashboard.scheduling.engine.refusal.not_manager",
  conflict: "dashboard.scheduling.engine.refusal.conflict",
  not_found: "dashboard.scheduling.engine.refusal.not_found",
  wrong_tenant: "dashboard.scheduling.engine.refusal.wrong_tenant",
  invalid: "dashboard.scheduling.engine.refusal.invalid",
  not_allowed: "dashboard.scheduling.engine.refusal.not_allowed",
  unavailable: "dashboard.scheduling.engine.refusal.unavailable",
};

/** Every refusal sentence, translated once on the server and handed to a client component. */
export type SchedulingEngineSentences = Readonly<Record<SchedulingEngineRefusal, string>>;

export function schedulingEngineSentences(tr: (key: string) => string): SchedulingEngineSentences {
  return {
    overlapping_room: tr(SCHEDULING_ENGINE_REFUSALS.overlapping_room),
    no_instructor: tr(SCHEDULING_ENGINE_REFUSALS.no_instructor),
    past: tr(SCHEDULING_ENGINE_REFUSALS.past),
    sold_out: tr(SCHEDULING_ENGINE_REFUSALS.sold_out),
    already_cancelled: tr(SCHEDULING_ENGINE_REFUSALS.already_cancelled),
    paid_seats_need_refund: tr(SCHEDULING_ENGINE_REFUSALS.paid_seats_need_refund),
    not_cancellable: tr(SCHEDULING_ENGINE_REFUSALS.not_cancellable),
    not_reschedulable: tr(SCHEDULING_ENGINE_REFUSALS.not_reschedulable),
    slot_taken: tr(SCHEDULING_ENGINE_REFUSALS.slot_taken),
    policy_keeps: tr(SCHEDULING_ENGINE_REFUSALS.policy_keeps),
    token_invalid: tr(SCHEDULING_ENGINE_REFUSALS.token_invalid),
    talent_unavailable: tr(SCHEDULING_ENGINE_REFUSALS.talent_unavailable),
    already_started: tr(SCHEDULING_ENGINE_REFUSALS.already_started),
    not_draft: tr(SCHEDULING_ENGINE_REFUSALS.not_draft),
    not_archivable: tr(SCHEDULING_ENGINE_REFUSALS.not_archivable),
    not_reopenable: tr(SCHEDULING_ENGINE_REFUSALS.not_reopenable),
    cycle: tr(SCHEDULING_ENGINE_REFUSALS.cycle),
    overlap: tr(SCHEDULING_ENGINE_REFUSALS.overlap),
    over_limit: tr(SCHEDULING_ENGINE_REFUSALS.over_limit),
    already_decided: tr(SCHEDULING_ENGINE_REFUSALS.already_decided),
    not_manager: tr(SCHEDULING_ENGINE_REFUSALS.not_manager),
    conflict: tr(SCHEDULING_ENGINE_REFUSALS.conflict),
    not_found: tr(SCHEDULING_ENGINE_REFUSALS.not_found),
    wrong_tenant: tr(SCHEDULING_ENGINE_REFUSALS.wrong_tenant),
    invalid: tr(SCHEDULING_ENGINE_REFUSALS.invalid),
    not_allowed: tr(SCHEDULING_ENGINE_REFUSALS.not_allowed),
    unavailable: tr(SCHEDULING_ENGINE_REFUSALS.unavailable),
  };
}

function isSchedulingEngineRefusal(reason: string): reason is SchedulingEngineRefusal {
  return (SCHEDULING_ENGINE_REFUSAL_CODES as readonly string[]).includes(reason);
}

/**
 * The sentence for a reason the engine returned. A reason outside the
 * contract (a new code the engine grew before the copy did) reads as
 * `unavailable`, never as the bare code.
 */
export function schedulingEngineSentence(reason: string, sentences: SchedulingEngineSentences): string {
  return isSchedulingEngineRefusal(reason) ? sentences[reason] : sentences.unavailable;
}
