/**
 * TUL-1476 · The owner proposes terms when a talent joins (pure, no DB).
 *
 * Three join paths, one step: an invite, approving a Discover join request, and adding a
 * talent directly. The step starts from the default terms for the workspace's model
 * (TUL-1442 "how you work with people", same five ids as the TUL-1368 terms card), the
 * owner may edit the share, the model and exclusivity, then sends. Sending creates a
 * PENDING terms version (propose_workspace_talent_terms, #4158); the talent accepts it
 * through #4158's card. Nothing is sold under it until then: a listing can only be
 * accepted against, and is only sellable under, an ACCEPTED version (TUL-1367).
 */
import { defaultTermsForModel, MAX_SHARE_BPS, validateProposedTerms, WORK_MODELS, type ProposedTerms, type WorkModel } from "./terms";

export const JOIN_PATHS = ["invite", "discover_join", "direct_add"] as const;
export type JoinPath = (typeof JOIN_PATHS)[number];

/** Currencies the step offers for amount-based shares (rent, fixed). None is preselected. */
export const JOIN_TERMS_CURRENCIES = ["MXN", "USD", "EUR"] as const;

/** The currency choices: the workspace's own first (when set), then the usual ones, no repeats. */
export function joinTermsCurrencyOptions(workspaceCurrency: string | null): string[] {
  return Array.from(new Set([...(workspaceCurrency ? [workspaceCurrency] : []), ...JOIN_TERMS_CURRENCIES]));
}

/** What the owner's step sends. Strings so a form and a client component share one shape. */
export type JoinTermsInput = {
  /** False when the owner chose to skip terms for now. */
  send: boolean;
  /** Empty = the workspace's model. */
  model: string;
  /** Percent as typed ("20", "12.5"), for percent and margin shares. */
  sharePercent: string;
  /** Amount as typed ("1500"), for rent, fixed and per-hour shares. */
  shareAmount: string;
  currency: string;
  exclusive: boolean;
};

export type JoinTermsDecision =
  | { kind: "skip" }
  | { kind: "send"; terms: ProposedTerms }
  | { kind: "invalid"; reason: string };

/** Result of the terms step, reported next to the join result. Joining never fails on it. */
export type JoinTermsOutcome = "sent" | "skipped" | "not_allowed" | "unavailable" | "invalid" | "failed";

export function isWorkModel(v: unknown): v is WorkModel {
  return typeof v === "string" && (WORK_MODELS as readonly string[]).includes(v);
}

/** The workspace's model, or the coordinator model when the workspace has not chosen yet. */
export function joinTermsDefaultModel(choice: string | null | undefined): WorkModel {
  return isWorkModel(choice) ? choice : "coordinator_agency";
}

function percentText(bps: number | null): string {
  return bps == null ? "" : String(bps / 100);
}

/**
 * The step's starting values: the model's defaults, sent unless the owner skips.
 * `currency` is the workspace's EXPLICIT display currency or null: never a guessed one.
 * With none, the currency starts empty and the owner must pick it before rent can be sent.
 */
export function joinTermsInputFor(model: WorkModel, currency: string | null = null): JoinTermsInput {
  const d = defaultTermsForModel(model);
  return {
    send: true,
    model,
    sharePercent: percentText(d.shareBps),
    shareAmount: "",
    currency: currency ?? "",
    exclusive: d.exclusive,
  };
}

/** "20" -> 2000, "12.5" -> 1250. Null on anything that is not a plain number. */
export function parsePercentToBps(raw: string): number | null {
  const s = String(raw ?? "").trim().replace(",", ".").replace(/%$/, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/** "1500" -> 150000, "99.50" -> 9950. Null on anything that is not a plain positive number. */
export function parseAmountToCents(raw: string): number | null {
  const s = String(raw ?? "").trim().replace(/[\s,]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return cents > 0 ? cents : null;
}

/**
 * Turn the owner's step into terms. Starts from the model's defaults, applies only the
 * fields the step lets the owner edit, then runs the same validation the RPC mirrors.
 */
export function readJoinTerms(input: JoinTermsInput | null | undefined, fallbackModel: WorkModel): JoinTermsDecision {
  if (!input || input.send !== true) return { kind: "skip" };
  const model = input.model === "" || input.model == null ? fallbackModel : input.model;
  if (!isWorkModel(model)) return { kind: "invalid", reason: "work_model" };
  const currency = String(input.currency ?? "").trim().toUpperCase();
  const terms = defaultTermsForModel(model, currency || null);
  if (terms.shareKind === "percent" || terms.shareKind === "margin") {
    const bps = parsePercentToBps(input.sharePercent);
    if (bps == null || bps > MAX_SHARE_BPS) return { kind: "invalid", reason: "share_bps" };
    terms.shareBps = bps;
    terms.shareAmountCents = null;
    terms.shareCurrency = null;
  } else {
    const cents = parseAmountToCents(input.shareAmount);
    if (cents == null) return { kind: "invalid", reason: "share_amount" };
    terms.shareBps = null;
    terms.shareAmountCents = cents;
    terms.shareCurrency = currency || null;
  }
  terms.exclusive = input.exclusive === true;
  const v = validateProposedTerms(terms);
  return v.ok ? { kind: "send", terms } : { kind: "invalid", reason: v.reason };
}

/** Read the step from a submitted form (direct add). Field names are `terms_*`. */
export function joinTermsFromFormData(fd: { get(name: string): unknown }): JoinTermsInput | null {
  const send = fd.get("terms_send");
  if (send == null) return null; // the form had no terms step: nothing to send
  return {
    send: String(send) === "1",
    model: String(fd.get("terms_model") ?? ""),
    sharePercent: String(fd.get("terms_share_percent") ?? ""),
    shareAmount: String(fd.get("terms_share_amount") ?? ""),
    currency: String(fd.get("terms_currency") ?? ""),
    exclusive: String(fd.get("terms_exclusive") ?? "") === "1",
  };
}

/** Terms-send results that happen AFTER the talent was saved (shown on the next page). */
const AFTER_SAVE_PROBLEMS: readonly JoinTermsOutcome[] = ["not_allowed", "unavailable", "failed"];

/** Query flag value for a redirect after direct add, or null when there is nothing to tell. */
export function joinTermsRedirectFlag(outcome: JoinTermsOutcome): JoinTermsOutcome | null {
  return AFTER_SAVE_PROBLEMS.includes(outcome) ? outcome : null;
}

/** Read the `joinTerms` query flag back. Anything unknown is ignored. */
export function parseJoinTermsFlag(raw: unknown): JoinTermsOutcome | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === "string" && (AFTER_SAVE_PROBLEMS as readonly string[]).includes(v) ? (v as JoinTermsOutcome) : null;
}

/** Proposing terms is a money setting: active owner or admin only (same rule as the RPC). */
export function canProposeJoinTerms(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/** Which share field the step shows for a model. */
export function shareFieldFor(model: WorkModel): "percent" | "amount" {
  const k = defaultTermsForModel(model).shareKind;
  return k === "percent" || k === "margin" ? "percent" : "amount";
}

/** TUL-1690 · What the owner's terms step is doing. Anything but "loading" is a settled answer. */
export type JoinTermsLoadState = "loading" | "ready" | "owner_only" | "off";

/**
 * Approve on a join request needs the terms step open and its load finished, so a fast or
 * double click can never approve before the proposed terms exist. "owner_only" and "off"
 * are settled (no terms apply), so Approve works there without terms.
 */
export function canApproveJoinRequest(termsStepOpen: boolean, load: JoinTermsLoadState): boolean {
  return termsStepOpen && load !== "loading";
}
