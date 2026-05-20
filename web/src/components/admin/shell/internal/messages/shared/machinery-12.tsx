"use client";

import { useTransition, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PayoutNudgeCard } from "@/components/talent-payouts/PayoutNudgeCard";
import { loadCurrentTalentPayoutSnapshot, type TalentPayoutSnapshot } from "@/lib/server-actions/talent-self";
import { submitMyCounterRate, submitMyRateForInquiry } from "@/lib/server-actions/talent-pipeline";
import { clientApproveCurrentOffer, clientRejectCurrentOffer } from "@/lib/server-actions/client-pipeline";
import { sendOfferAction, approveOfferAction, rejectOfferAction, counterOfferAction } from "@/app/(workspace)/[tenantSlug]/admin/_pipeline-actions";
import { useAdminShell, COLORS, FONTS } from "../../state";
import { type Conversation } from "../../talent";
import { applyRowOverrides, setRowOverride, useRowOverrideSubscription } from "../conversation-stash";
import { STAGE_LABEL, fmtMoney, getOffer, nextActionFor, rowSubtotal } from "./machinery-10";
import type { OfferPov } from "./machinery-10";
import { CreateOfferButton, OfferDraftEditor } from "./machinery-11";
import { DealSummaryCard, LineupRowCard, ParticipantRow, TimelineRow, dashedBtn, disabledBtn, ghostBtn, primaryBtn } from "./machinery-13";
import { SubmitRateSheet } from "./machinery-14";
import type { Offer } from "./machinery-9";

/**
 * Live status banner shown above the (mock) OfferTab body when a real
 * inquiry_offers row exists for this inquiry. Hosts the truly-wired CTAs
 * (Send · Approve · Reject) that mutate the DB via engine actions.
 *
 * Shows nothing when there's no real offer (e.g. demo / pure-mock convs).
 */
export function LiveOfferPanel({ inquiryId, pov }: { inquiryId: string; pov: OfferPov }) {
  const { toast, effectiveMessagesInquiries, effectiveTenant } = useAdminShell();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const real = effectiveMessagesInquiries.find((r) => r.id === inquiryId);
  const offer = real?.offer ?? null;
  const offerId = offer?.id;
  const isAdmin = pov.kind === "admin";

  // Render nothing for synthetic mock-only inquiries — keeps demo data clean.
  if (!offer || !offerId || offerId.endsWith("-offer")) return null;

  const status = offer.status;

  const run = (label: string, fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        toast(`${label} failed: ${r.error ?? "Unknown error"}`);
      } else {
        toast(`${label} ✓`);
        router.refresh();
      }
    });

  return (
    <div style={{ border: `1px solid ${COLORS.borderSoft}`, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontFamily: FONTS.body, fontSize: 12 }} className="bg-admin-surface-alt rounded-admin-md">
      <span style={{ fontWeight: 700 }} className="text-admin-ink">Live · DB-backed</span>
      <span className="text-admin-ink-muted">Offer status: <strong>{status}</strong></span>
      <span style={{ fontSize: 11 }} className="text-admin-ink-muted">{offerId.slice(0, 8)}…</span>
      <span style={{ flex: 1 }} />
      {isAdmin && status === "draft" && (
        <button type="button" disabled={pending}
          onClick={() => run("Send offer", () => sendOfferAction(effectiveTenant.slug, inquiryId, offerId))}
          style={primaryBtn(COLORS.accent)}
        >Send to client</button>
      )}
      {isAdmin && status === "sent" && (
        <>
          <button type="button" disabled={pending}
            onClick={() => run("Approve offer", () => approveOfferAction(effectiveTenant.slug, inquiryId, offerId))}
            style={primaryBtn(COLORS.success)}
          >Approve (as client)</button>
          <button type="button" disabled={pending}
            onClick={() => run("Reject offer", () => rejectOfferAction(effectiveTenant.slug, inquiryId, offerId, null))}
            style={ghostBtn()}
          >Reject</button>
        </>
      )}
      {isAdmin && status === "rejected" && (
        <button type="button" disabled={pending}
          onClick={() => run("Counter offer", () => counterOfferAction(effectiveTenant.slug, inquiryId, offerId))}
          style={primaryBtn(COLORS.accent)}
        >Counter offer</button>
      )}
      {/* Inline draft editor — only when the offer is editable. */}
      {status === "draft" && (
        <div style={{ flexBasis: "100%", marginTop: 8 }}>
          <OfferDraftEditor inquiryId={inquiryId} offerId={offerId} isAdmin={isAdmin} />
        </div>
      )}
    </div>
  );
}

export function OfferTab({ conv, pov }: { conv: Conversation; pov: OfferPov }) {
  const { toast, effectiveTenant } = useAdminShell();
  const router = useRouter();
  // B7 — talent counter-rate handler. Sends a tagged [Counter request]
  // message via the engine. Coordinator-side picks it up from the
  // conversation thread and re-drafts the offer.
  const [, startCounterTransition] = useTransition();
  const realInquiryId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conv.id) ? conv.id : null;
  const onCounterRateForOwnRow = (pov.kind === "talent" && realInquiryId) ? () => {
    const raw = window.prompt("Proposed counter rate (what you'd want instead):");
    if (raw == null) return;
    const num = parseFloat(raw.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(num) || num < 0) { toast("Invalid rate"); return; }
    const note = window.prompt("Optional note for the coordinator:") ?? "";
    startCounterTransition(async () => {
      const r = await submitMyCounterRate(realInquiryId, num, note.trim() || null);
      if (!r.ok) toast(`Counter failed: ${r.error}`);
      else { toast("Counter sent to coordinator"); router.refresh(); }
    });
  } : undefined;
  // Item #7 wiring: live talent payout snapshot drives PayoutNudgeCard
  // visibility. Loads on mount for talent / talent-coord povs; admin /
  // client viewers don't need it. Snapshot.hasProfile=false hides the
  // nudge entirely (the viewer isn't a talent).
  const [talentPayout, setTalentPayout] = useState<TalentPayoutSnapshot | null>(null);
  useEffect(() => {
    if (pov.kind !== "talent") return;
    let cancelled = false;
    loadCurrentTalentPayoutSnapshot().then((s) => {
      if (!cancelled) setTalentPayout(s);
    });
    return () => { cancelled = true; };
  }, [pov.kind]);
  const [, startClientOfferTransition] = useTransition();
  const baseOffer = getOffer(conv.id);
  const isClient = pov.kind === "client";
  const isAdmin = pov.kind === "admin";
  const isTalent = pov.kind === "talent";
  const canSeeFullCommerce = isAdmin || (isTalent && pov.isCoordinator);
  // Submit-rate sheet state — opens from any of:
  //   • the empty-state CTA (no offer at all yet)
  //   • the sticky-bar "Submit my rate" CTA when stage = awaiting_talent
  //   • the per-row "Submit my rate" / "Edit rate" button on the talent's lineup card
  const [rateSheetOpen, setRateSheetOpen] = useState(false);
  const [rateSheetMode, setRateSheetMode] = useState<"submit" | "edit">("submit");
  // Subscribe to module-level row-override changes so this tab
  // re-renders when the talent submits a rate from anywhere else
  // (and so the offer tab itself reflects new overrides immediately).
  useRowOverrideSubscription();
  // Effective offer = seed offer with module-level row-overrides
  // merged on top. After a talent submits their rate, their row reads
  // as submitted with the entered numbers — and that survives tab
  // switches, conv switches (until cleared), refresh kills it.
  const offer = baseOffer ? applyRowOverrides(conv.id, baseOffer) : undefined;

  if (!offer) {
    if (isTalent) {
      return (
        <div style={{ padding: 18, fontFamily: FONTS.body, display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Item #7 wiring: payout nudge surfaces when the talent's
              Stripe Connect Express account isn't enabled yet. Snapshot
              status data is mock here; real talent OfferTab will pass
              status from server-loaded talent_profiles snapshot. */}
          {/* Item #7 final: live snapshot drives status. PayoutNudgeCard
              hides on enabled / when hasProfile=false. */}
          {talentPayout && talentPayout.hasProfile && (
            <PayoutNudgeCard
              tenantSlug={effectiveTenant?.slug ?? "impronta"}
              status={talentPayout.status}
              pendingPayouts={talentPayout.pendingPayouts}
            />
          )}
          <div style={{ background: "#fff", border: `1px solid ${COLORS.borderSoft}`, padding: 16, display: "flex", flexDirection: "column", gap: 10 }} className="rounded-admin-md">
            <div style={{ fontSize: 13.5, fontWeight: 700 }} className="text-admin-ink">Submit your rate</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5 }} className="text-admin-ink-muted">
              The coordinator is waiting on your number. You&apos;ll see the agency
              fee + platform fee deducted before take-home — quote what you
              actually need to walk out with, plus a small margin for usage.
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled
                title="Rate requests need a live coordinator workflow."
                style={disabledBtn(primaryBtn(COLORS.accent))}
              >
                Ask coordinator
              </button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div style={{ padding: 24, textAlign: "center", fontFamily: FONTS.body, fontSize: 13 }} className="text-admin-ink-dim">
        No offer yet for this inquiry.
        {isAdmin && <CreateOfferButton inquiryId={conv.id} />}
      </div>
    );
  }

  // Privacy: non-coordinator talent sees ONLY their own row.
  const visibleRows = isTalent && !pov.isCoordinator
    ? offer.rows.filter(r => r.talentId === pov.talentId)
    : offer.rows;

  const totalCost = offer.rows.reduce((s, r) => s + rowSubtotal(r, "cost"), 0);
  const totalRevenue = offer.rows.reduce((s, r) => s + rowSubtotal(r, "client"), 0) + offer.agencyFee;
  const totalMargin = totalRevenue - totalCost;
  const stage = STAGE_LABEL[offer.stage];
  const stageLabel = isClient && stage.clientLabel ? stage.clientLabel : stage.label;
  const next = nextActionFor(offer, pov);
  const currency = offer.clientBudget?.currency ?? "EUR";
  const isRealUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conv.id);
  const canRunStickyPrimary = !!next.cta && (
    (isTalent && (next.cta === "Submit my rate" || next.cta === "Review counter"))
    || (isClient && isRealUuid && (next.cta === "Approve" || next.cta === "Reject" || next.cta === "Decline"))
  );
  const stickyPrimaryTitle = canRunStickyPrimary
    ? undefined
    : next.cta
      ? `${next.cta} needs a live workflow before it can run here.`
      : undefined;

  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14, fontFamily: FONTS.body }}>
      <LiveOfferPanel inquiryId={conv.id} pov={pov} />
      {/* ── Sticky action bar — "what do I do now" ──────────────── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 4,
        margin: "-14px -14px 0", padding: "10px 14px",
        background: "#fff", borderBottom: `1px solid ${COLORS.borderSoft}`,
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      }}>
        <span style={{
          fontSize: 10.5, fontWeight: 700,           padding: "3px 9px", borderRadius: 999, background: stage.bg, color: stage.tone, flexShrink: 0,
        }}>{stageLabel}</span>
        {offer.expiresInHours !== undefined && offer.stage !== "accepted" && offer.stage !== "rejected" && offer.stage !== "expired" && (
          <span style={{ fontSize: 11, fontWeight: 600 }} className="text-admin-coral">
            ⏱ {offer.expiresInHours}h
          </span>
        )}
        <span style={{ fontSize: 12, color: next.subtle ? COLORS.inkMuted : COLORS.ink, flex: 1, minWidth: 140 }}>
          {next.label}
        </span>
        {next.secondary && (
          <button
            type="button"
            disabled
            title={`${next.secondary} needs a live workflow before it can run here.`}
            style={disabledBtn(ghostBtn())}
          >
            {next.secondary}
          </button>
        )}
        {next.cta && (
          <button
            type="button"
            disabled={!canRunStickyPrimary}
            title={stickyPrimaryTitle}
            onClick={() => {
              // Talent rate-related CTAs open the real sheet instead
              // of toasting. Unsupported CTAs are disabled in the UI.
              if (isTalent && (next.cta === "Submit my rate" || next.cta === "Review counter")) {
                setRateSheetMode(next.cta === "Review counter" ? "edit" : "submit");
                setRateSheetOpen(true);
                return;
              }
              // Client-side: route Approve / Reject / Decline through the
              // engine for real-UUID inquiries. Mock conv ids are disabled.
              if (isClient && isRealUuid && next.cta === "Approve") {
                startClientOfferTransition(async () => {
                  const r = await clientApproveCurrentOffer(conv.id);
                  if (!r.ok) toast(`Approve failed: ${r.error}`);
                  else { toast("Offer approved"); router.refresh(); }
                });
                return;
              }
              if (isClient && isRealUuid && (next.cta === "Reject" || next.cta === "Decline")) {
                startClientOfferTransition(async () => {
                  const r = await clientRejectCurrentOffer(conv.id);
                  if (!r.ok) toast(`Reject failed: ${r.error}`);
                  else { toast("Offer declined"); router.refresh(); }
                });
                return;
              }
            }}
            style={canRunStickyPrimary
              ? primaryBtn(next.ctaTone === "success" ? COLORS.success : COLORS.accent)
              : disabledBtn(primaryBtn(next.ctaTone === "success" ? COLORS.success : COLORS.accent))}
          >
            {next.cta}
          </button>
        )}
      </div>

      {/* ── A. Deal summary — single hero card per POV ───────────
            Was three disconnected tiles ("Client budget · Offer total ·
            Your take-home") with no clear narrative. Replaced with one
            hero card that leads with the number that matters most for
            the viewer (take-home for talent, total for admin/client),
            then a labeled-row context strip beneath that fills in the
            other numbers. Single card, single story per role. */}
      <DealSummaryCard
        offer={offer}
        pov={pov}
        totalCost={totalCost}
        totalRevenue={totalRevenue}
        totalMargin={totalMargin}
        currency={currency}
      />

      {/* ── B. Participants ──────────────────────────────────── */}
      <SectionHeader title="Who's running this" subtitle={isClient ? "Your point of contact." : `${offer.coordinators.length} coordinator${offer.coordinators.length === 1 ? "" : "s"} · ${offer.rows.length} talent${offer.rows.length === 1 ? "" : "s"}`} />
      <div className="flex flex-col gap-2">
        {offer.coordinators.map(c => (
          <ParticipantRow
            key={c.id}
            initials={c.initials}
            name={c.name}
            role="Coordinator"
            tone="royal"
            note={c.alsoTalentId ? "Also booked as talent" : undefined}
          />
        ))}
        {isAdmin && offer.coordinators.length < 2 && (
          <button
            type="button"
            disabled
            title="Coordinator assignment needs the live offer workflow."
            style={disabledBtn(dashedBtn("Add coordinator (max 2)"))}
          >
            + Add coordinator
          </button>
        )}
      </div>

      {/* ── C. Lineup & rates — privacy-aware ─────────────────── */}
      <SectionHeader
        title="Lineup &amp; rates"
        subtitle={
          isClient
            ? "Talent we're proposing for your booking."
            : isTalent && !pov.isCoordinator
              ? "Your private rate. Other talent rates are not visible to you."
              : "Per-talent rates. Each talent sets their own — only coordinators see the full lineup."
        }
      />
      <div className="flex flex-col gap-2.5">
        {visibleRows.map(r => (
          <LineupRowCard
            key={r.id} row={r} offer={offer} pov={pov}
            showCost={canSeeFullCommerce}
            showRevenue={canSeeFullCommerce || isClient}
            showMargin={isAdmin}
            onOpenRateSheet={(mode) => {
              setRateSheetMode(mode);
              setRateSheetOpen(true);
            }}
            onCounterRate={
              pov.kind === "talent" && pov.talentId === r.talentId
                ? onCounterRateForOwnRow
                : undefined
            }
          />
        ))}
        {isAdmin && (
          <button
            type="button"
            disabled
            title="Invite talent needs the live offer workflow."
            style={disabledBtn(dashedBtn("Invite talent"))}
          >
            + Invite talent
          </button>
        )}
      </div>

      {/* ── Agency fee — admin/coordinator only ──────────────── */}
      {canSeeFullCommerce && (
        <div style={{ padding: "12px 14px", borderRadius: 10, fontSize: 12.5 }} className="bg-admin-surface-alt">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span className="text-admin-ink-muted">Agency fee</span>
            <span style={{ fontWeight: 600 }} className="text-admin-ink">{fmtMoney(offer.agencyFee, currency)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="text-admin-ink-muted">Coordinator share ({offer.coordinatorPct}% of fee)</span>
            <span style={{ fontWeight: 600 }} className="text-admin-ink">{fmtMoney(offer.agencyFee * offer.coordinatorPct / 100, currency)}</span>
          </div>
        </div>
      )}

      {/* #20 — Pricing transparency for client. Premium feel: when an
          offer is on the table, client sees a clean breakdown of what
          they're paying for. Talent rates collapse to a single line
          (privacy intact) but the rest is itemized. Builds trust. */}
      {isClient && offer.stage !== "no_offer" && offer.stage !== "client_budget" && (
        <>
          <SectionHeader title="What you're paying for" subtitle="Transparent breakdown — no surprises." />
          <div style={{
            background: "#fff", borderRadius: 12,
            border: `1px solid ${COLORS.borderSoft}`,
            padding: "14px 16px", fontFamily: FONTS.body, fontSize: 13,
            display: "flex", flexDirection: "column", gap: 8,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="text-admin-ink-muted">Talent fees ({offer.rows.length} {offer.rows.length === 1 ? "talent" : "talent"})</span>
              <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }} className="text-admin-ink">
                {fmtMoney(offer.rows.reduce((s, r) => s + rowSubtotal(r, "client"), 0), currency)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="text-admin-ink-muted">Agency service fee</span>
              <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }} className="text-admin-ink">
                {fmtMoney(offer.agencyFee, currency)}
              </span>
            </div>
            <div style={{ height: 1, background: COLORS.borderSoft, margin: "2px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 600 }} className="text-admin-ink">Total</span>
              <span style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" }} className="text-admin-accent">
                {fmtMoney(totalRevenue, currency)}
              </span>
            </div>
            <div style={{ fontSize: 11, marginTop: 4, lineHeight: 1.5 }} className="text-admin-ink-dim">
              Includes coordination, scheduling, contract handling, and post-shoot support. Tax/VAT shown on final invoice.
            </div>
          </div>
        </>
      )}

      {/* ── D. Activity timeline ─────────────────────────────── */}
      <SectionHeader title="Activity" subtitle="Same events surface in the chat thread." />
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {offer.timeline.map((e, i) => (
          <TimelineRow key={e.id} event={e} last={i === offer.timeline.length - 1} />
        ))}
      </div>

      {/* Privacy footer for non-coordinator talent */}
      {isTalent && !pov.isCoordinator && (
        <div style={{ padding: "10px 12px", borderRadius: 8, fontSize: 11.5, lineHeight: 1.5, display: "flex", gap: 8, alignItems: "flex-start" }} className="bg-admin-indigo-soft text-admin-indigo-deep">
          <span aria-hidden style={{ flexShrink: 0, marginTop: 1 }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <rect x="3" y="6.5" width="8" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M5 6.5V5a2 2 0 014 0v1.5" stroke="currentColor" strokeWidth="1.4"/>
            </svg>
          </span>
          You only see your own offer. Other talents&apos; rates and the agency&apos;s commercial breakdown are private.
        </div>
      )}

      {/* Submit-rate sheet — bottom-up sheet on mobile, centered modal
          on desktop. Pre-fills from the client's budget unit + amount,
          shows live take-home calculation, submits → writes into the
          local row-override store so the row immediately reads as
          "Submitted" in the lineup + the sticky bar copy advances
          from "Submit my rate" to "Rate received · finalizing". */}
      {isTalent && (
        <SubmitRateSheet
          open={rateSheetOpen}
          onClose={() => setRateSheetOpen(false)}
          conv={conv}
          offer={offer}
          mode={rateSheetMode}
          onSubmit={(data) => {
            // Write to the module-level override store so the rate
            // shows up everywhere — header pill, inbox row, Today
            // tile, and the offer tab itself. Survives tab switches
            // and acts as optimistic UI while the DB write resolves.
            const myRow = offer.rows.find(r => r.talentId === pov.talentId);
            if (myRow) {
              setRowOverride(conv.id, myRow.id, {
                costRate: data.amount,
                units: data.units,
                unitType: data.unitType,
                notes: data.notes || myRow.notes,
                status: "submitted",
              });
            }
            // F-pass — when the conv id is a real inquiry UUID, also
            // hit the DB. submitMyRateForInquiry resolves the offer +
            // line item internally, so the local-only mock UI doesn't
            // need to know either id.
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conv.id)) {
              void submitMyRateForInquiry(conv.id, data.amount).then((r) => {
                if (!r.ok) toast(`Rate not saved: ${r.error}`);
              });
            }
          }}
        />
      )}
    </div>
  );
}

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mt-1">
      <h3 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 14.5, fontWeight: 700, color: COLORS.ink }}
        dangerouslySetInnerHTML={{ __html: title }}
      />
      {subtitle && (
        <p style={{ margin: "2px 0 0", fontSize: 11.5, color: COLORS.inkMuted, lineHeight: 1.5 }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
