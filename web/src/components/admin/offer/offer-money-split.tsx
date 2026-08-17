"use client";

/**
 * Offer editor — column headers + the "where this money goes" panel.
 *
 * Lives OUTSIDE `components/admin/shell` on purpose: that tree is frozen
 * against new inline styles by the design-token ratchet, and this surface is
 * new work, so it is written with admin token classes from the start.
 *
 * Why this exists at all: the offer line-item editor labelled its numeric
 * columns only through `placeholder`, which the browser hides as soon as a
 * field has a value. A saved row therefore rendered as a run of anonymous
 * numbers, and the most consequential of them — what the TALENT is paid — was
 * indistinguishable from the client rate. A workspace owner who left it at 0
 * would have sent an offer that pays the talent nothing, with no warning.
 *
 * The panel states only the figures we can compute exactly here. The platform
 * fee is deliberately described in words instead of a number: the real split is
 * produced by the commission engine at booking time, and hard-coding its
 * percentages in the editor would drift silently the moment they are tuned.
 */

export type OfferSplitLine = {
  talentProfileId: string | null;
  units: number;
  talentCost: number;
};

/** Column headings aligned to the line-item grid. */
export function OfferColumnHeaders({ t }: { t: (key: string) => string }) {
  const cells = ["colTalent", "colUnit", "colQty", "colClientRate", "colTalentGets"].map((k) =>
    t(`dashboard.adminTabs.lineup.${k}`),
  );
  return (
    <div className="grid grid-cols-[1.6fr_0.8fr_0.6fr_0.8fr_0.8fr_28px] gap-1.5 px-2.5 text-admin-ink-muted">
      {cells.map((label) => (
        <span key={label} className="text-[9.5px] font-bold uppercase tracking-[0.5px]">
          {label}
        </span>
      ))}
      <span />
    </div>
  );
}

export function OfferMoneySplit({
  lineItems,
  clientTotal,
  coordinatorFee,
  currencyCode,
  t,
}: {
  lineItems: OfferSplitLine[];
  clientTotal: number;
  coordinatorFee: number;
  currencyCode: string;
  t: (key: string) => string;
}) {
  const copy = {
    heading: t("dashboard.adminTabs.lineup.splitHeading"),
    clientList: t("dashboard.adminTabs.lineup.splitClientList"),
    talentGets: t("dashboard.adminTabs.lineup.splitTalentGets"),
    agencyKeeps: t("dashboard.adminTabs.lineup.splitAgencyKeeps"),
    agencyNote: t("dashboard.adminTabs.lineup.splitAgencyNote"),
    platformNote: t("dashboard.adminTabs.lineup.splitPlatformNote"),
    talentUnpaid: t("dashboard.adminTabs.lineup.splitTalentUnpaid"),
  };
  const money = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode }).format(n);

  const talentFull = lineItems.reduce(
    (sum, li) => sum + (Number(li.units) || 0) * (Number(li.talentCost) || 0),
    0,
  );
  // The workspace's take is the markup over the talent's quote, plus any flat
  // agency fee. The platform's share is later carved out of this, never out of
  // the talent's protected quote.
  const agencyKeeps = clientTotal - talentFull + (Number(coordinatorFee) || 0);
  const unpaidTalent = lineItems.some(
    (li) => li.talentProfileId && (Number(li.talentCost) || 0) <= 0,
  );

  const rows: Array<{ label: string; value: string; note?: string; strong?: boolean }> = [
    { label: copy.clientList, value: money(clientTotal) },
    { label: copy.talentGets, value: money(talentFull) },
    { label: copy.agencyKeeps, value: money(agencyKeeps), note: copy.agencyNote, strong: true },
  ];

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-admin-border bg-white px-3 py-2.5">
      <div className="text-[9.5px] font-bold uppercase tracking-[0.5px] text-admin-ink-muted">
        {copy.heading}
      </div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-[11.5px]">
          <span className="text-admin-ink-muted">{r.label}</span>
          {r.note ? <span className="text-[10px] text-admin-ink-muted">({r.note})</span> : null}
          <span className="flex-1" />
          <span className={r.strong ? "font-bold text-admin-ink" : "text-admin-ink"}>{r.value}</span>
        </div>
      ))}
      {unpaidTalent ? (
        <div role="alert" className="text-[10.5px] leading-snug text-admin-coral">
          {copy.talentUnpaid}
        </div>
      ) : null}
      <div className="text-[10px] leading-snug text-admin-ink-muted">{copy.platformNote}</div>
    </div>
  );
}

/**
 * Editor footer: add-line, the auto-summed client total, the flat agency fee,
 * and Save. Extracted from the shell tree so it can carry token classes, and
 * because the host file sits at its max-lines ratchet.
 *
 * The fee input was previously labelled just "Fee", which read as a platform
 * charge. It is the WORKSPACE's own coordination fee, added on top of the line
 * items — so it is now named and carries an explanation on hover.
 */
export function OfferEditorFooter({
  t, pending, savePending, total, currencyCode, coordinatorFee,
  onAddLine, onFeeChange, onSave,
}: {
  t: (key: string) => string;
  pending: boolean;
  savePending: boolean;
  total: number;
  currencyCode: string;
  coordinatorFee: number;
  onAddLine: () => void;
  onFeeChange: (value: number) => void;
  onSave: () => void;
}) {
  const k = (s: string) => t(`dashboard.adminTabs.lineup.${s}`);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={onAddLine}
        className="rounded border border-admin-border bg-white px-2 py-1 text-[11px] text-admin-ink disabled:opacity-50"
      >
        {k("addLineItem")}
      </button>
      <span className="flex-1" />
      <label className="text-admin-11 text-admin-ink-muted">{k("total")}</label>
      <span title={k("totalTitle")} className="min-w-[90px] whitespace-nowrap px-1.5 py-1 text-right text-[13px] font-bold text-admin-ink">
        {new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode, maximumFractionDigits: 0 }).format(total)}
      </span>
      <label htmlFor="offer-agency-fee" title={k("feeTitle")} className="text-admin-11 text-admin-ink-muted">
        {k("feeExtra")}
      </label>
      <input
        id="offer-agency-fee"
        type="number"
        min={0}
        step="100"
        value={coordinatorFee}
        title={k("feeTitle")}
        onChange={(e) => onFeeChange(parseFloat(e.target.value) || 0)}
        className="w-20 rounded border border-admin-border px-1.5 py-1 text-[11px] text-admin-ink"
      />
      <button
        type="button"
        disabled={savePending}
        onClick={onSave}
        className="rounded bg-admin-accent px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
      >
        {savePending ? k("saving") : k("saveDraft")}
      </button>
    </div>
  );
}
