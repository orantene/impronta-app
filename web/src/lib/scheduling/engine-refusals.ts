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
  unavailable: "dashboard.scheduling.engine.refusal.unavailable",
};
