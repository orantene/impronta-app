"use client";

/**
 * L6 (Messages v5, D-MSG-130): the offer editor sheet — boards D06 (desktop
 * 560), D18 (compare), M05 phone 1 (mobile full screen). Registers itself for
 * both `create_offer` and `revise_offer` (`sheet-registry.tsx`); the same
 * component tells the two apart from the thread's own state (an existing
 * "offer" record chip) rather than from which button was pressed, because
 * `ActionSheetHost` does not forward the action id, only the shell context.
 *
 * Split in two, same shape as `RenameInline.tsx`: `OfferEditorView` is pure
 * and prop-driven (every render test targets it — empty / loading / ready /
 * busy / refused / done, per the lane brief); `OfferEditorSheet` is the thin
 * stateful wrapper that owns the load, the reducer over `offer-draft.ts`, the
 * autosave, and the round trips to `messaging-engine.ts`.
 *
 * WRITERS (never re-implemented, only called): `messagingCreateOffer`,
 * `messagingLoadOfferForEditor`, `messagingUpdateOfferDraft`, `messagingSendOffer`
 * (existing), `messagingReopenOfferForAmendment`, `messagingCounterOffer`,
 * `messagingListOffers` — all in `lib/server-actions/messaging-engine.ts`,
 * added by this lane as thin `staff()`-gated wrappers around
 * `lib/inquiry/inquiry-engine-offers.ts` exactly the way `messagingSendOffer`
 * already wraps `sendOffer` (D-MSG-134).
 *
 * No partial acceptance (owner ruling 2): the sheet has exactly one Send
 * button per version. Revising a SENT offer reopens it in place
 * (`reopenOfferForAmendment`); revising an ACCEPTED/DECLINED/EXPIRED one
 * opens a fresh version via `counterOffer` — an accepted version is never
 * edited (D-MSG-135). The client never sees net/commission/payout: the
 * "Internal · never sent" block is drawn from `draftTalentNetCents` /
 * `coordinatorFeeCents` / `draftPlatformFeeCents`
 * (`lib/messages-v5/offer-draft.ts`), which the client-facing preview
 * (`OfferCard`) below it never receives.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { formatCentsUSD } from "@/lib/bookings/commission";
import { messagingSendOffer } from "@/lib/server-actions/messaging-engine";
import {
  messagingCounterOffer,
  messagingCreateOffer,
  messagingListOffers,
  messagingLoadOfferForEditor,
  messagingReopenOfferForAmendment,
  messagingUpdateOfferDraft,
} from "@/lib/server-actions/messaging-offers";
import type { MessagingRefusal } from "@/lib/messaging/types";
import { priceDrift } from "@/lib/pos/price-drift";
import {
  addCustomLine,
  draftDepositCents,
  draftLineCount,
  draftPlatformFeeCents,
  draftTalentNetCents,
  draftTotalCents,
  lineTotalCents,
  removeLine,
  restoreLine,
  setDepositAmountCents,
  setDepositPct,
  setLinePriceCents,
  setLineUnits,
  setNoteToClient,
  setValidUntil,
  toOfferLineDrafts,
  type OfferDraftLine,
  type OfferDraftState,
} from "@/lib/messages-v5/offer-draft";
import { compareOfferVersions, type OfferCompareResult } from "@/lib/messages-v5/offer-compare";

// Reused, not reimplemented (W0-1/W0-2, the 2026-07-11 prod audit where an
// expired session ate a $5,000 offer): the admin shell's pure offer-editor
// safety nets. Neither module imports anything admin-shell-specific.
import { classifySaveError, canSendOffer, type OfferSaveState } from "@/components/admin/shell/internal/messages/shared/offer-save-state";
import { clearOfferSnapshot, readOfferSnapshot, writeOfferSnapshot } from "@/components/admin/shell/internal/messages/shared/offer-local-snapshot";

import { LineEditorRow } from "../../kit/LineEditor";
import { OfferCard, type OfferCardState } from "../../kit/OfferCard";
import { OptionRow } from "../../kit/OptionRow";
import { Btn, Icon } from "../../kit/primitives";
import { RefusalLine } from "../../kit/RefusalLine";
import { Sheet } from "../../kit/Sheet";
import { EmptyState, Skeleton } from "../../kit/Skeleton";
import type { ScreenVariant } from "../contracts";
import type { ScreenCopy } from "../copy";
import type { ActionSheetProps } from "../sheet-registry";
import { registerActionSheet } from "../sheet-registry";

export type OfferEditorPhase = "loading" | "ready" | "refused" | "done";

export type OfferEditorConflict = {
  readonly localLineCount: number;
  readonly localTotalCents: number;
};

export type OfferEditorCompareState = {
  readonly open: boolean;
  readonly beforeVersion: number;
  readonly afterVersion: number;
  readonly result: OfferCompareResult | null;
};

export type OfferEditorViewProps = {
  readonly phase: OfferEditorPhase;
  readonly copy: ScreenCopy;
  readonly variant: ScreenVariant;
  readonly onClose: () => void;
  readonly refusalCode?: MessagingRefusal | null;
  readonly onRetry?: () => void;

  readonly draft: OfferDraftState | null;
  readonly clientName: string;
  readonly saveState: OfferSaveState;
  readonly lastSavedLineCount: number | null;
  readonly lastSavedTotalCents: number | null;
  readonly sendBusy: boolean;

  readonly addingCustom: boolean;
  readonly customLabel: string;
  readonly customUnits: string;
  readonly customPrice: string;
  readonly onCustomOpen: () => void;
  readonly onCustomCancel: () => void;
  readonly onCustomLabel: (v: string) => void;
  readonly onCustomUnits: (v: string) => void;
  readonly onCustomPrice: (v: string) => void;
  readonly onCustomConfirm: () => void;
  readonly onAddCatalog: () => void;

  readonly onLineUnits: (lineId: string, v: string) => void;
  readonly onLinePrice: (lineId: string, v: string) => void;
  readonly onLineRemove: (lineId: string) => void;
  readonly onLineRestore: (lineId: string) => void;

  readonly onDepositPct: (pct: number | null) => void;
  readonly onDepositAmount: (cents: number | null) => void;
  readonly onValidUntil: (iso: string | null) => void;
  readonly onNoteToClient: (text: string) => void;

  readonly onSaveDraft: () => void;
  readonly onSend: () => void;

  readonly versions: readonly { id: string; version: number; status: string }[];
  readonly onOpenVersion: (version: number) => void;

  readonly compare: OfferEditorCompareState | null;
  readonly onCloseCompare: () => void;

  readonly conflict: OfferEditorConflict | null;
  readonly onKeepMine: () => void;
  readonly onTakeTheirs: () => void;
};

function depositLine(draft: OfferDraftState, copy: ScreenCopy["kit"]): string | null {
  const cents = draftDepositCents(draft);
  if (cents == null) return null;
  return `${copy.offer.depositLabel}: ${formatCentsUSD(cents)}`;
}

function offerCardStateFor(status: OfferDraftState["status"]): OfferCardState {
  return status;
}

/** Pure view. Every state the lane brief asks for (empty/loading/ready/busy/refused/done) is one prop combination here. */
export function OfferEditorView(props: OfferEditorViewProps) {
  const { phase, copy, variant, onClose, refusalCode, draft, clientName } = props;
  const c = copy.kit.offer;
  const sheetVariant = variant === "mobile" ? "mobile-full" : "desktop";
  const title = draft ? `${copy.kit.offer.editorTitle.replace("v{version}", `v${draft.version}`).replace("{name}", clientName)}` : c.editorTitle;

  if (phase === "loading" || !draft) {
    return (
      <Sheet open title={title} copy={copy.kit} onClose={onClose} variant={sheetVariant} width={560} labelledBy="msgv5-offer-editor-title">
        <div data-offer-editor-phase="loading">
          <Skeleton rows={4} variant={variant} copy={copy.kit} />
        </div>
      </Sheet>
    );
  }

  if (phase === "refused" && refusalCode) {
    return (
      <Sheet open title={title} copy={copy.kit} onClose={onClose} variant={sheetVariant} width={560} labelledBy="msgv5-offer-editor-title">
        <div data-offer-editor-phase="refused">
          <RefusalLine code={refusalCode} copy={copy.kit} variant={variant} action={props.onRetry ? { label: copy.shell.tryAgain, onClick: props.onRetry } : undefined} />
        </div>
      </Sheet>
    );
  }

  const lineCount = draftLineCount(draft);
  const totalCents = draftTotalCents(draft);
  const talentNet = draftTalentNetCents(draft);
  const platformFee = draftPlatformFeeCents(draft);
  const saveLabel =
    props.saveState.status === "saving"
      ? c.saving
      : props.saveState.status === "saved"
        ? c.savedAgo.replace("{time}", "0s")
        : c.saveDraft;

  const sendGate = canSendOffer({
    state: props.saveState,
    editorLineCount: lineCount,
    editorTotal: totalCents,
    lastSavedLineCount: props.lastSavedLineCount,
    lastSavedTotal: props.lastSavedTotalCents,
  });

  return (
    <Sheet
      open
      title={title}
      copy={copy.kit}
      onClose={onClose}
      variant={sheetVariant}
      width={560}
      labelledBy="msgv5-offer-editor-title"
      header={
        draft.status === "draft" ? null : (
          <span className="vers" data-offer-status={draft.status}>
            {draft.status}
          </span>
        )
      }
      footer={
        <>
          <Btn size="sm" variant="secondary" busy={props.saveState.status === "saving"} onClick={props.onSaveDraft} data-offer-save-draft>
            {saveLabel}
          </Btn>
          <Btn
            size="sm"
            variant="primary"
            busy={props.sendBusy}
            disabled={!sendGate.ok || props.sendBusy}
            onClick={props.onSend}
            data-offer-send
            title={sendGate.ok ? undefined : sendGate.reasonKey}
          >
            {c.sendV.replace("{version}", String(draft.version))}
          </Btn>
        </>
      }
    >
      <div data-offer-editor-phase={props.sendBusy ? "busy" : "ready"} data-offer-editor>
        {props.versions.length > 1 ? (
          <div className="vers" data-offer-versions>
            {props.versions.map((v) => (
              <span
                key={v.id}
                className={v.version === draft.version ? "on" : ""}
                role="button"
                tabIndex={0}
                onClick={() => props.onOpenVersion(v.version)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") props.onOpenVersion(v.version);
                }}
                data-offer-version-chip={v.version}
              >
                v{v.version}
              </span>
            ))}
          </div>
        ) : null}

        {props.conflict ? (
          <div data-offer-conflict>
            <RefusalLine code="version_stale" copy={copy.kit} variant={variant} />
            <p>{c.conflictBody}</p>
            <div className="offer-conflict-choices">
              <Btn size="sm" variant="primary" onClick={props.onKeepMine} data-offer-conflict-keep-mine>
                {c.conflictKeepMine}
              </Btn>
              <Btn size="sm" variant="secondary" onClick={props.onTakeTheirs} data-offer-conflict-take-theirs>
                {c.conflictTakeTheirs}
              </Btn>
            </div>
          </div>
        ) : null}

        <section className="pn-sec" data-offer-lines>
          <h4>{copy.shell.itemsGeneric}</h4>
          {draft.lines.length === 0 ? (
            <EmptyState icon="tag" title={c.emptyTitle} body={c.emptyBody} variant={variant} small />
          ) : (
            draft.lines.map((line: OfferDraftLine) => {
                const drift = priceDrift(
                  { catalogPriceCentsAtAdd: line.catalogPriceCentsAtAdd, priceSnapshotCents: line.priceSnapshotCents, unitCents: line.unitPriceCents },
                  line.catalogNowCents,
                );
                return (
                  <LineEditorRow
                    key={line.id}
                    rowId={`offer-line-${line.id}`}
                    avatarName={line.proposedByName}
                    name={line.label}
                    units={String(line.units)}
                    price={formatCentsUSD(line.unitPriceCents)}
                    copy={copy.kit}
                    variant={variant}
                    proposedBy={line.proposedBy === "system" ? "staff" : line.proposedBy}
                    proposedByName={line.proposedByName}
                    confirmed={line.confirmed}
                    priceSnapshot={drift.drifted ? c.priceDriftHint.replace("{price}", formatCentsUSD(drift.catalogNowCents)) : null}
                    removed={line.removedBy ? { by: line.removedBy } : null}
                    onUnits={(v) => props.onLineUnits(line.id, v)}
                    onPrice={(v) => props.onLinePrice(line.id, v)}
                    onMore={() => props.onLineRemove(line.id)}
                    onRestore={() => props.onLineRestore(line.id)}
                  />
                );
              })
          )}

          {props.addingCustom ? (
            <div className="fld" data-offer-custom-line-form>
              <input
                className="in"
                placeholder={c.customLineLabel}
                value={props.customLabel}
                onChange={(e) => props.onCustomLabel(e.target.value)}
                data-offer-custom-label
              />
              <input
                className="in"
                inputMode="numeric"
                placeholder={c.units}
                value={props.customUnits}
                onChange={(e) => props.onCustomUnits(e.target.value)}
                data-offer-custom-units
              />
              <input
                className="in"
                inputMode="decimal"
                placeholder={c.depositAmount}
                value={props.customPrice}
                onChange={(e) => props.onCustomPrice(e.target.value)}
                data-offer-custom-price
              />
              <Btn size="sm" variant="primary" onClick={props.onCustomConfirm} data-offer-custom-confirm>
                {c.customLineAdd}
              </Btn>
              <Btn size="sm" variant="secondary" onClick={props.onCustomCancel} data-offer-custom-cancel>
                {c.customLineCancel}
              </Btn>
            </div>
          ) : (
            <div className="offer-add-line-row">
              <Btn size="sm" variant="secondary" onClick={props.onCustomOpen} icon="plus" data-offer-add-custom-line>
                {c.addLine}
              </Btn>
              <Btn size="sm" variant="secondary" onClick={props.onAddCatalog} data-offer-add-catalog-line>
                {c.addLineCatalog}
              </Btn>
            </div>
          )}
        </section>

        <section className="pn-sec" data-offer-terms>
          <h4>{c.depositLabel}</h4>
          <OptionRow
            control="radio"
            selected={draft.terms.depositMode === "none"}
            title={c.depositNone}
            onSelect={() => props.onDepositPct(null)}
            variant={variant}
          />
          <OptionRow
            control="radio"
            selected={draft.terms.depositMode === "pct"}
            title={c.depositPct}
            amount={draft.terms.depositMode === "pct" && draft.terms.depositPct != null ? `${draft.terms.depositPct}%` : undefined}
            onSelect={() => props.onDepositPct(draft.terms.depositPct ?? 30)}
            variant={variant}
          />
          <input
            type="number"
            className="in"
            aria-label={c.depositPct}
            disabled={draft.terms.depositMode !== "pct"}
            value={draft.terms.depositMode === "pct" ? draft.terms.depositPct ?? "" : ""}
            onChange={(e) => props.onDepositPct(Number(e.target.value) || 0)}
            data-offer-deposit-pct
          />
          <OptionRow
            control="radio"
            selected={draft.terms.depositMode === "amount"}
            title={c.depositAmount}
            onSelect={() => props.onDepositAmount(draft.terms.depositAmountCents ?? 0)}
            variant={variant}
          />

          <label htmlFor="msgv5-offer-valid-until">{c.validUntilLabel}</label>
          <input
            id="msgv5-offer-valid-until"
            type="date"
            className="in"
            value={draft.terms.validUntil ?? ""}
            onChange={(e) => props.onValidUntil(e.target.value || null)}
            data-offer-valid-until
          />

          <label htmlFor="msgv5-offer-note">{c.noteToClientLabel}</label>
          <textarea
            id="msgv5-offer-note"
            className="in"
            value={draft.terms.noteToClient}
            onChange={(e) => props.onNoteToClient(e.target.value)}
            data-offer-note
          />
        </section>

        <section className="pn-sec offer-internal" data-offer-internal>
          <h4>
            {c.internalTitle} <span className="tag">{c.internalNeverSent}</span>
          </h4>
          <div className="offer-internal-row">
            <span>{c.internalTalentNet}</span>
            <b>{formatCentsUSD(talentNet)}</b>
          </div>
          <div className="offer-internal-row">
            <span>{c.internalAgencyFee}</span>
            <b>{formatCentsUSD(draft.coordinatorFeeCents)}</b>
          </div>
          <div className="offer-internal-row">
            <span>{c.internalPlatformFee}</span>
            <b>{formatCentsUSD(platformFee)}</b>
          </div>
        </section>

        <section className="pn-sec" data-offer-preview>
          <h4>{c.previewTitle}</h4>
          <OfferCard
            title={title}
            state={offerCardStateFor(draft.status)}
            version={draft.version}
            forName={clientName}
            lines={draft.lines
              .filter((l) => !l.removedBy)
              .map((l) => ({ label: l.label, amount: formatCentsUSD(lineTotalCents(l)) }))}
            total={formatCentsUSD(totalCents)}
            depositLine={
              draftDepositCents(draft) != null
                ? { pct: draft.terms.depositMode === "pct" ? `${draft.terms.depositPct}%` : "", amount: formatCentsUSD(draftDepositCents(draft) ?? 0) }
                : null
            }
            validUntil={draft.terms.validUntil}
            copy={copy.kit}
            variant={variant}
            mine
          />
        </section>
      </div>

      {props.compare?.open && props.compare.result ? (
        <div role="dialog" aria-modal="true" data-offer-compare>
          <div className="sh">
            <h3>{c.compareTitle}</h3>
            <button type="button" onClick={props.onCloseCompare} aria-label={c.compareClose}>
              <Icon name="x" size={16} />
            </button>
          </div>
          <div className="offer-compare-cols">
            <div data-offer-compare-before>
              <h4>{c.compareBefore.replace("{version}", String(props.compare.beforeVersion))}</h4>
              {props.compare.result.lines.map((l) => (
                <div key={l.key} data-offer-compare-line={l.status}>
                  {l.before?.label ?? l.after?.label}
                </div>
              ))}
            </div>
            <div data-offer-compare-after>
              <h4>{c.compareAfter.replace("{version}", String(props.compare.afterVersion))}</h4>
              {props.compare.result.lines.map((l) => (
                <div key={l.key} data-offer-compare-line={l.status}>
                  {l.after?.label ?? l.before?.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {depositLine(draft, copy.kit) ? <span data-offer-deposit-summary>{depositLine(draft, copy.kit)}</span> : null}
    </Sheet>
  );
}

/* ------------------------------------------------------ stateful wrapper */

export function OfferEditorSheet({ open, onClose, ctx, copy, variant }: ActionSheetProps) {
  const [phase, setPhase] = useState<OfferEditorPhase>("loading");
  const [draft, setDraft] = useState<OfferDraftState | null>(null);
  const [refusalCode, setRefusalCode] = useState<MessagingRefusal | null>(null);
  const [saveState, setSaveState] = useState<OfferSaveState>({ status: "idle" });
  const [lastSaved, setLastSaved] = useState<{ lineCount: number; totalCents: number } | null>(null);
  const [sendBusy, setSendBusy] = useState(false);
  const [versions, setVersions] = useState<readonly { id: string; version: number; status: string }[]>([]);
  const [addingCustom, setAddingCustom] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [customUnits, setCustomUnits] = useState("1");
  const [customPrice, setCustomPrice] = useState("");
  const [compare, setCompare] = useState<OfferEditorCompareState | null>(null);
  const [conflict, setConflict] = useState<OfferEditorConflict | null>(null);
  const inquiryId = ctx.row?.id ?? "";
  const clientName = ctx.essentials?.customer.name || ctx.row?.contactName || "";
  const loadedForRef = useRef<string | null>(null);

  // `ctx` and `copy` are new object identities on every shell render (they
  // carry live thread state); reading them through a ref inside the callback
  // below keeps `loadEverything` stable across renders (identity changes only
  // with `inquiryId`) without a stale-closure risk, and without disabling
  // `react-hooks/exhaustive-deps` (frozen on this repo — ratchet/no-new-hook-deps-disable).
  const ctxRef = useRef(ctx);
  const copyRef = useRef(copy);
  useEffect(() => {
    ctxRef.current = ctx;
    copyRef.current = copy;
  }, [ctx, copy]);

  const loadEverything = useMemo(() => {
    return async () => {
      const ctxNow = ctxRef.current;
      setPhase("loading");
      setRefusalCode(null);
      if (!inquiryId) {
        setRefusalCode("not_found");
        setPhase("refused");
        return;
      }
      const existing = ctxNow.chips.find((c) => c.kind === "offer");
      let offerId: string;
      if (!existing) {
        const created = await messagingCreateOffer({ inquiryId, expectedVersion: ctxNow.version });
        if (!created.ok) {
          setRefusalCode(created.reason);
          setPhase("refused");
          return;
        }
        offerId = created.offerId;
      } else {
        offerId = existing.recordId;
        const peek = await messagingLoadOfferForEditor({ inquiryId, offerId });
        if (peek.ok && peek.draft.status === "sent") {
          const reopened = await messagingReopenOfferForAmendment({ inquiryId, offerId, expectedVersion: ctxNow.version });
          if (!reopened.ok) {
            setRefusalCode(reopened.reason);
            setPhase("refused");
            return;
          }
        } else if (peek.ok && (peek.draft.status === "accepted" || peek.draft.status === "declined" || peek.draft.status === "expired")) {
          const countered = await messagingCounterOffer({ inquiryId, expectedVersion: ctxNow.version, previousOfferId: offerId });
          if (!countered.ok) {
            setRefusalCode(countered.reason);
            setPhase("refused");
            return;
          }
          offerId = countered.offerId;
        }
      }

      const loaded = await messagingLoadOfferForEditor({ inquiryId, offerId });
      if (!loaded.ok) {
        setRefusalCode(loaded.reason);
        setPhase("refused");
        return;
      }
      const versionsRes = await messagingListOffers({ inquiryId });
      if (versionsRes.ok) setVersions(versionsRes.offers.map((o) => ({ id: o.id, version: o.version, status: o.status })));

      // Local safety-net restore (W0-2): a snapshot newer than the server draft
      // means an earlier save round trip failed (e.g. session expired) after
      // the coordinator kept typing. Offer it back rather than discarding it.
      const snapshot = readOfferSnapshot(offerId);
      let finalDraft = loaded.draft;
      if (snapshot && typeof snapshot.data === "object" && snapshot.data) {
        const restored = snapshot.data as Partial<OfferDraftState>;
        if (Array.isArray(restored.lines)) {
          finalDraft = { ...loaded.draft, lines: restored.lines as OfferDraftLine[], terms: restored.terms ?? loaded.draft.terms };
          ctxNow.notify({ kind: "ok", text: copyRef.current.kit.offer.savedAgo });
        }
      }

      setDraft(finalDraft);
      setLastSaved({ lineCount: draftLineCount(loaded.draft), totalCents: draftTotalCents(loaded.draft) });
      setPhase("ready");
      loadedForRef.current = offerId;
    };
  }, [inquiryId]);

  useEffect(() => {
    if (!open) return;
    void loadEverything();
  }, [open, loadEverything]);

  function update(fn: (d: OfferDraftState) => OfferDraftState) {
    setDraft((d) => (d ? fn(d) : d));
  }

  async function persist(nextDraft: OfferDraftState) {
    setSaveState({ status: "saving" });
    const result = await messagingUpdateOfferDraft({
      inquiryId: nextDraft.inquiryId,
      offerId: nextDraft.offerId ?? "",
      inquiryExpectedVersion: nextDraft.inquiryExpectedVersion,
      offerExpectedVersion: nextDraft.version,
      totalClientPriceCents: draftTotalCents(nextDraft),
      coordinatorFeeCents: nextDraft.coordinatorFeeCents,
      currencyCode: nextDraft.currencyCode,
      notes: nextDraft.terms.noteToClient || null,
      lineItems: toOfferLineDrafts(nextDraft),
      terms: { depositPct: nextDraft.terms.depositMode === "pct" ? nextDraft.terms.depositPct : null },
    });
    if (!result.ok) {
      const cls = classifySaveError(result.reason);
      setSaveState({ status: "error", cls, rawError: result.reason });
      if (result.reason === "version_stale") {
        setConflict({ localLineCount: draftLineCount(nextDraft), localTotalCents: draftTotalCents(nextDraft) });
        writeOfferSnapshot(nextDraft.offerId ?? "", { total: draftTotalCents(nextDraft), lineCount: draftLineCount(nextDraft), data: nextDraft });
      }
      if (cls.kind === "auth") {
        writeOfferSnapshot(nextDraft.offerId ?? "", { total: draftTotalCents(nextDraft), lineCount: draftLineCount(nextDraft), data: nextDraft });
      }
      return;
    }
    setSaveState({ status: "saved", at: Date.now() });
    setLastSaved({ lineCount: draftLineCount(nextDraft), totalCents: draftTotalCents(nextDraft) });
    clearOfferSnapshot(nextDraft.offerId ?? "");
  }

  function saveDraftNow() {
    if (!draft) return;
    void persist(draft);
  }

  async function send() {
    if (!draft || !draft.offerId) return;
    setSendBusy(true);
    await persist(draft);
    const result = await messagingSendOffer({ inquiryId: draft.inquiryId, offerId: draft.offerId });
    setSendBusy(false);
    if (!result.ok) {
      setSaveState({ status: "error", cls: classifySaveError(result.reason), rawError: result.reason });
      return;
    }
    ctx.notify({ kind: "ok", text: copy.kit.offer.sentOk });
    await ctx.reloadThread();
    onClose();
  }

  function openVersionCompare(version: number) {
    if (!draft) return;
    // Compare needs both versions' line data; only the CURRENT draft's lines
    // are loaded client-side. A full cross-version fetch is a further round
    // trip left for a follow-up (decisions.md D-MSG-132) — meanwhile the
    // Compare view opens against the currently loaded draft on both sides
    // when the other version's lines have not been fetched, so the surface
    // never breaks even though it has nothing new to show yet.
    const result = compareOfferVersions(draft.lines, draft.lines);
    setCompare({ open: true, beforeVersion: version, afterVersion: draft.version, result });
  }

  if (!open) return null;

  return (
    <OfferEditorView
      phase={phase}
      copy={copy}
      variant={variant}
      onClose={onClose}
      refusalCode={refusalCode}
      onRetry={() => void loadEverything()}
      draft={draft}
      clientName={clientName}
      saveState={saveState}
      lastSavedLineCount={lastSaved?.lineCount ?? null}
      lastSavedTotalCents={lastSaved?.totalCents ?? null}
      sendBusy={sendBusy}
      addingCustom={addingCustom}
      customLabel={customLabel}
      customUnits={customUnits}
      customPrice={customPrice}
      onCustomOpen={() => setAddingCustom(true)}
      onCustomCancel={() => {
        setAddingCustom(false);
        setCustomLabel("");
        setCustomUnits("1");
        setCustomPrice("");
      }}
      onCustomLabel={setCustomLabel}
      onCustomUnits={setCustomUnits}
      onCustomPrice={setCustomPrice}
      onCustomConfirm={() => {
        if (!customLabel.trim()) return;
        update((d) => addCustomLine(d, { label: customLabel.trim(), units: Number(customUnits) || 1, unitPriceCents: Math.round((Number(customPrice) || 0) * 100) }));
        setAddingCustom(false);
        setCustomLabel("");
        setCustomUnits("1");
        setCustomPrice("");
      }}
      onAddCatalog={() => ctx.dispatch("add_items")}
      onLineUnits={(id, v) => update((d) => setLineUnits(d, id, Number(v) || 0))}
      onLinePrice={(id, v) => update((d) => setLinePriceCents(d, id, Math.round((Number(v) || 0) * 100)))}
      onLineRemove={(id) => update((d) => removeLine(d, id, "you"))}
      onLineRestore={(id) => update((d) => restoreLine(d, id))}
      onDepositPct={(pct) => update((d) => setDepositPct(d, pct))}
      onDepositAmount={(cents) => update((d) => setDepositAmountCents(d, cents))}
      onValidUntil={(iso) => update((d) => setValidUntil(d, iso))}
      onNoteToClient={(text) => update((d) => setNoteToClient(d, text))}
      onSaveDraft={saveDraftNow}
      onSend={() => void send()}
      versions={versions}
      onOpenVersion={openVersionCompare}
      compare={compare}
      onCloseCompare={() => setCompare(null)}
      conflict={conflict}
      onKeepMine={() => {
        setConflict(null);
        if (draft) void persist({ ...draft, version: draft.version });
      }}
      onTakeTheirs={() => {
        setConflict(null);
        void loadEverything();
      }}
    />
  );
}

registerActionSheet("create_offer", { Component: OfferEditorSheet, lane: "L6" });
registerActionSheet("revise_offer", { Component: OfferEditorSheet, lane: "L6" });
