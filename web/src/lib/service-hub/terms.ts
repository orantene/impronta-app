/**
 * TUL-1368 · Service hub terms card (pure, no DB).
 *
 * A workspace (agency, network, studio, rental studio, collective, any trade) proposes
 * terms to a talent; the talent accepts or declines. Every change is a new version. The
 * latest ACCEPTED version stays in force until the talent accepts a newer one (rule 20 of
 * the Service hub flows). Storage: public.workspace_talent_terms (held migration
 * 20261231419200_workspace_talent_terms_tul1368.sql).
 */
import { createTranslator } from "@/i18n/messages";

export const WORK_MODELS = [
  "coordinator_agency",
  "open_network",
  "team_studio",
  "rental_studio",
  "friends_collective",
] as const;
export type WorkModel = (typeof WORK_MODELS)[number];

export type ShareKind = "percent" | "fixed" | "per_hour" | "margin" | "rent";
export type ClientPriceMode = "talent_price" | "talent_plus_margin" | "fixed" | "from";
export type ShowIdentity = "name" | "portfolio" | "hidden";
export type ClientContact = "workspace" | "talent";
export type TermsStatus = "pending" | "accepted" | "declined" | "superseded" | "revoked";

export type ProposedTerms = {
  workModel: WorkModel;
  shareKind: ShareKind;
  shareBps: number | null;
  shareAmountCents: number | null;
  shareCurrency: string | null;
  clientPriceMode: ClientPriceMode;
  showIdentity: ShowIdentity;
  showContact: boolean;
  clientContact: ClientContact;
  exclusive: boolean;
  noPoaching: boolean;
};

export type WorkspaceTalentTermsRow = ProposedTerms & {
  id: string;
  tenantId: string;
  talentProfileId: string;
  version: number;
  status: TermsStatus;
  proposedAt: string;
};

/** Coordinator models: the workspace talks to the client and the talent must not go around it. */
const COORDINATOR_MODELS: ReadonlySet<WorkModel> = new Set(["coordinator_agency", "friends_collective"]);

/** Highest share or margin a workspace may take (Oran to confirm whether 100% should be allowed). */
export const MAX_SHARE_BPS = 9000;

/**
 * Model presets (preset first; the owner may change any field). Rental studios get no
 * default rent (PM): the owner must enter the amount; the currency defaults to the one
 * passed in (talent's or workspace's).
 */
export function defaultTermsForModel(model: WorkModel, currency: string | null = null): ProposedTerms {
  const coordinator = COORDINATOR_MODELS.has(model);
  const workspaceTalks = coordinator || model === "team_studio";
  return {
    workModel: model,
    shareKind: model === "rental_studio" ? "rent" : coordinator ? "margin" : "percent",
    shareBps: model === "rental_studio" ? null : 2000,
    shareAmountCents: null,
    shareCurrency: model === "rental_studio" ? currency : null,
    clientPriceMode: coordinator ? "talent_plus_margin" : "talent_price",
    showIdentity: coordinator ? "portfolio" : "name",
    showContact: !workspaceTalks,
    clientContact: workspaceTalks ? "workspace" : "talent",
    exclusive: false,
    noPoaching: coordinator,
  };
}

export type TermsValidation = { ok: true } | { ok: false; reason: string };

export function validateProposedTerms(t: ProposedTerms): TermsValidation {
  if (!WORK_MODELS.includes(t.workModel)) return { ok: false, reason: "work_model" };
  if (t.shareKind === "percent" || t.shareKind === "margin") {
    if (t.shareBps == null || !Number.isInteger(t.shareBps) || t.shareBps < 0 || t.shareBps > MAX_SHARE_BPS) {
      return { ok: false, reason: "share_bps" };
    }
  } else {
    if (t.shareAmountCents == null || !Number.isInteger(t.shareAmountCents) || t.shareAmountCents <= 0 || t.shareAmountCents > 1e12) {
      return { ok: false, reason: "share_amount" };
    }
    if (!t.shareCurrency || !/^[A-Z]{3}$/.test(t.shareCurrency)) return { ok: false, reason: "share_currency" };
  }
  return { ok: true };
}

export type TalentTermsState = {
  inForce: WorkspaceTalentTermsRow | null;
  pending: WorkspaceTalentTermsRow | null;
};

/** For one (workspace, talent) pair: the version in force and the version waiting for an answer. */
export function resolveTalentTermsState(rows: readonly WorkspaceTalentTermsRow[]): TalentTermsState {
  let inForce: WorkspaceTalentTermsRow | null = null;
  let pending: WorkspaceTalentTermsRow | null = null;
  for (const r of rows) {
    if (r.status === "accepted" && (!inForce || r.version > inForce.version)) inForce = r;
    if (r.status === "pending" && (!pending || r.version > pending.version)) pending = r;
  }
  if (pending && inForce && pending.version <= inForce.version) pending = null;
  return { inForce, pending };
}

export type TermsCardLine = { key: string; label: string; value: string };

function formatMoney(cents: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale === "es" ? "es-MX" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function formatPercent(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2).replace(/0+$/, "")}%`;
}

/** The lines the terms card shows, already translated. No-poaching only where it applies. */
export function buildTermsCardLines(t: ProposedTerms, locale: string): TermsCardLine[] {
  const tr = createTranslator(locale);
  const k = (key: string) => tr(`dashboard.serviceHubTerms.${key}`);
  const shareAmount =
    t.shareKind === "percent" || t.shareKind === "margin"
      ? formatPercent(t.shareBps ?? 0)
      : t.shareCurrency
        ? formatMoney(t.shareAmountCents ?? 0, t.shareCurrency, locale)
        : // No currency stored (the DB forbids it): show the bare number, never guess a currency.
          ((t.shareAmountCents ?? 0) / 100).toFixed(2);
  const lines: TermsCardLine[] = [
    { key: "model", label: k("labelModel"), value: k(`model_${t.workModel}`) },
    { key: "share", label: k("labelShare"), value: `${shareAmount} ${k(`share_${t.shareKind}`)}` },
    { key: "clientPrice", label: k("labelClientPrice"), value: k(`price_${t.clientPriceMode}`) },
    { key: "identity", label: k("labelIdentity"), value: k(`identity_${t.showIdentity}`) },
    { key: "contact", label: k("labelContact"), value: k(t.showContact ? "contactShown" : "contactHidden") },
    { key: "clientContact", label: k("labelClientContact"), value: k(`talks_${t.clientContact}`) },
    { key: "exclusive", label: k("labelExclusive"), value: k(t.exclusive ? "exclusiveYes" : "exclusiveNo") },
  ];
  if (t.noPoaching) lines.push({ key: "noPoaching", label: k("labelNoPoaching"), value: k("noPoachingLine") });
  return lines;
}

/** Map a DB row (snake_case) to the typed row. Returns null (fail closed) on a bad row. */
export function parseTermsRow(raw: Record<string, unknown>): WorkspaceTalentTermsRow | null {
  const model = raw.work_model as WorkModel;
  if (!WORK_MODELS.includes(model) || typeof raw.id !== "string") {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[service-hub/terms] skipped bad workspace_talent_terms row", raw.id, "work_model", raw.work_model);
    }
    return null;
  }
  return {
    id: raw.id,
    tenantId: String(raw.tenant_id),
    talentProfileId: String(raw.talent_profile_id),
    version: Number(raw.version),
    workModel: model,
    shareKind: raw.share_kind as ShareKind,
    shareBps: raw.share_bps == null ? null : Number(raw.share_bps),
    shareAmountCents: raw.share_amount_cents == null ? null : Number(raw.share_amount_cents),
    shareCurrency: (raw.share_currency as string | null) ?? null,
    clientPriceMode: raw.client_price_mode as ClientPriceMode,
    showIdentity: raw.show_identity as ShowIdentity,
    showContact: Boolean(raw.show_contact),
    clientContact: raw.client_contact as ClientContact,
    exclusive: Boolean(raw.exclusive),
    noPoaching: Boolean(raw.no_poaching),
    status: raw.status as TermsStatus,
    proposedAt: String(raw.proposed_at ?? ""),
  };
}

/** Plain line shown before Accept when the terms make this workspace the talent's exclusive one. */
export function exclusiveNotice(t: ProposedTerms, locale: string): string | null {
  return t.exclusive ? createTranslator(locale)("dashboard.serviceHubTerms.exclusiveNotice") : null;
}
