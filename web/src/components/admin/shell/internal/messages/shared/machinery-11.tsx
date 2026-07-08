"use client";

import React, { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { loadInquiryLineup, removeInquiryLineupParticipant, addInquiryLineupTalent, reorderInquiryLineup, saveOfferDraft, loadOfferDraft, createOfferAction, type InquiryParticipant, type OfferDraftSnapshot } from "@/app/(workspace)/[tenantSlug]/admin/_pipeline-actions";
import { useAdminShell, FONTS, COLORS, RADIUS } from "../../state";
import { Avatar } from "../../primitives";
import { initialsOf } from "./inbox-identity-1";
import { OfferTab } from "./machinery-12";
import { OfferTermsComposer } from "./offer-terms-ui";
import { PanelSkeleton, ghostBtn, primaryBtn } from "./machinery-13";
import type { Offer } from "./machinery-9";
import { LineServicePicker } from "./line-service-picker";
import type { ServicePricingType } from "@/lib/talent/services-menu-types";


/**
 * LiveLineupPanel — DB-backed roster manager for an inquiry. Lists active
 * `inquiry_participants.role='talent'` rows and exposes an inline Remove
 * for each (wraps `rosterRemoveParticipant`). An "Add talent by id" input
 * accepts a roster talent UUID and calls `rosterAddTalent` — full picker
 * UI is deferred but this unblocks staff-side workflow today.
 *
 * Renders nothing while loading or when no live lineup exists (mock UI
 * still renders the demo lineup chips).
 */
export function LiveLineupPanel({
  inquiryId,
  defaultExpanded = false,
}: {
  inquiryId: string;
  defaultExpanded?: boolean;
}) {
  const { toast, effectiveRoster, effectiveTenant } = useAdminShell();
  const t = useT();
  // Latest-`t` ref so async callbacks (reload) can resolve the current-locale
  // translator without listing `t` (a fresh closure each render) as an effect
  // dep — which would re-run the effect on every render.
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);
  // Discriminant->label map: keep switching on the raw participant status
  // union elsewhere; resolve the human label here via t(). Falls back to
  // the raw value for any unmapped status.
  const statusLabel = (status: string): string => {
    const keys: Record<string, string> = {
      active: "dashboard.adminTabs.lineup.statusActive",
      invited: "dashboard.adminTabs.lineup.statusInvited",
      declined: "dashboard.adminTabs.lineup.statusDeclined",
      removed: "dashboard.adminTabs.lineup.statusRemoved",
    };
    const key = keys[status];
    return key ? t(key) : status;
  };
  const [lineup, setLineup] = useState<InquiryParticipant[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  // Slice 1 (Messages consolidation): collapsed-by-default. The fat
  // vertical list ate ~200px of vertical real estate above the tab bar
  // even on inquiries with two participants. We now render a compact
  // 32px avatar-stack strip and reveal the manage UI only on demand.
  // Existing data loading + add/remove/reorder logic is preserved.
  const [expanded, setExpanded] = useState(defaultExpanded);

  // Skip the DB roundtrip entirely for synthetic mock inquiry ids — the
  // demo conversations use "RI-XXX" / "c1" style ids that won't resolve.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inquiryId);

  const reload = React.useCallback(() => {
    if (!isUuid) { setLoading(false); return; }
    setLoading(true);
    loadInquiryLineup(effectiveTenant.slug, inquiryId)
      .then((r) => {
        if (r.ok) setLineup(r.data ?? []);
        else toast(interpolate(tRef.current("dashboard.adminTabs.lineup.loadFailed"), { error: r.error }));
      })
      .finally(() => setLoading(false));
  }, [inquiryId, isUuid, effectiveTenant.slug, toast]);

  useEffect(() => { reload(); }, [reload]);

  if (!isUuid) return null;
  // C9 — loading skeleton on lineup hydrate.
  if (loading || lineup == null) {
    return (
      <div data-live-lineup-loading style={{ padding: 14, fontFamily: FONTS.body }}>
        <PanelSkeleton lines={3} />
      </div>
    );
  }

  const onLineupTalentIds = new Set(lineup.map((p) => p.talentProfileId).filter((x): x is string => !!x));
  // Roster talent ids are real UUIDs (synthetic mock roster won't match
  // anything in DB — those rows are filtered out so the picker only
  // surfaces real talent the action will accept).
  const pickerCandidates = effectiveRoster.filter((p) => {
    const id = p.id;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return false;
    if (onLineupTalentIds.has(id)) return false;
    if (!pickerSearch.trim()) return true;
    const q = pickerSearch.trim().toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.city ?? "").toLowerCase().includes(q);
  });

  const remove = (participantId: string, name: string | null) => {
    if (!confirm(interpolate(t("dashboard.adminTabs.lineup.removeConfirm"), { name: name ?? t("dashboard.adminTabs.lineup.thisTalent") }))) return;
    startTransition(async () => {
      const r = await removeInquiryLineupParticipant(effectiveTenant.slug, inquiryId, participantId);
      if (!r.ok) toast(interpolate(t("dashboard.adminTabs.lineup.removeFailed"), { error: r.error }));
      else { toast(t("dashboard.adminTabs.lineup.removedFromLineup")); reload(); }
    });
  };

  const add = (talentProfileId: string, name: string) => {
    startTransition(async () => {
      const r = await addInquiryLineupTalent(effectiveTenant.slug, inquiryId, talentProfileId);
      if (!r.ok) toast(interpolate(t("dashboard.adminTabs.lineup.addFailed"), { error: r.error }));
      else {
        toast(interpolate(t("dashboard.adminTabs.lineup.addedToLineup"), { name }));
        setPickerOpen(false);
        setPickerSearch("");
        reload();
      }
    });
  };

  // Initials from a display name. Falls back to "·" when missing — keeps
  // the avatar strip visually consistent even on legacy participant rows.
  const initialsOf = (name: string | null): string => {
    if (!name) return "·";
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "·";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const MAX_AVATARS = 5;
  const visibleAvatars = lineup.slice(0, MAX_AVATARS);
  const overflowCount = Math.max(0, lineup.length - MAX_AVATARS);
  const activeCount = lineup.filter((p) => p.status === "active").length;
  const invitedCount = lineup.filter((p) => p.status === "invited").length;
  const declinedCount = lineup.filter((p) => p.status === "declined").length;

  return (
    <div style={{ border: `1px solid ${COLORS.borderSoft}`, padding: expanded ? 12 : "6px 10px", marginBottom: 10, fontFamily: FONTS.body, fontSize: 12, transition: "padding 0.12s ease" }} className="bg-admin-surface-alt rounded-admin-md">
      {/* Compact strip — always visible. Clickable to expand the panel. */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-controls={`lineup-panel-${inquiryId}`}
        style={{
          width: "100%",
          background: "transparent", border: "none", padding: 0, margin: 0,
          display: "flex", alignItems: "center", gap: 10,
          cursor: "pointer", textAlign: "left",
          fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink,
        }}
      >
        <span style={{ fontWeight: 700, whiteSpace: "nowrap" }} className="text-admin-ink">
          {t("dashboard.adminTabs.lineup.title")}
        </span>
        {/* Overlapping avatar stack */}
        {lineup.length === 0 ? (
          <span style={{ fontSize: 11, fontStyle: "italic" }} className="text-admin-ink-muted">
            {t("dashboard.adminTabs.lineup.emptyStrip")}
          </span>
        ) : (
          <span
            style={{
              display: "inline-flex", alignItems: "center",
              paddingLeft: 0,
            }}
          >
            {visibleAvatars.map((p, idx) => (
              <span
                key={p.id}
                style={{
                  marginLeft: idx === 0 ? 0 : -6,
                  border: `1.5px solid ${COLORS.surfaceAlt}`,
                  borderRadius: "50%",
                  display: "inline-flex",
                  // Subtle dim on declined/removed so the user sees state at a glance.
                  opacity: p.status === "declined" || p.status === "removed" ? 0.4 : 1,
                }}
                title={`${p.talentDisplayName ?? t("dashboard.adminTabs.lineup.unnamed")} · ${statusLabel(p.status)}`}
              >
                <Avatar
                  size={22}
                  photoUrl={p.talentPhotoUrl ?? undefined}
                  initials={initialsOf(p.talentDisplayName)}
                  tone="auto"
                  hashSeed={p.talentDisplayName ?? p.id}
                />
              </span>
            ))}
            {overflowCount > 0 && (
              <span style={{ marginLeft: -6, width: 22, height: 22, borderRadius: "50%", border: `1.5px solid ${COLORS.surfaceAlt}`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, }}
                title={`+${overflowCount} more`}
              >+{overflowCount}</span>
            )}
            <span style={{
              marginLeft: 8, fontSize: 11, color: COLORS.inkMuted, fontWeight: 600, }} className="bg-admin-surface-alt text-admin-ink-muted">
              {interpolate(t(lineup.length === 1 ? "dashboard.adminTabs.lineup.talentCountOne" : "dashboard.adminTabs.lineup.talentCountMany"), { count: lineup.length })}
            </span>
          </span>
        )}
        <span style={{ flex: 1 }} />
        {lineup.length > 0 && (
          <span className="text-admin-ink-muted text-admin-11">
            {declinedCount > 0
              ? interpolate(t("dashboard.adminTabs.lineup.statusSummaryDeclined"), { active: activeCount, invited: invitedCount, declined: declinedCount })
              : interpolate(t("dashboard.adminTabs.lineup.statusSummary"), { active: activeCount, invited: invitedCount })}
          </span>
        )}
        <span
          aria-hidden
          style={{
            color: COLORS.inkMuted, fontSize: 11,
            transition: "transform 0.12s ease",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            display: "inline-block", width: 12,
          }}
        >▸</span>
        <span className="text-admin-ink-muted text-admin-11">
          {expanded ? t("dashboard.adminTabs.lineup.hide") : t("dashboard.adminTabs.lineup.manage")}
        </span>
      </button>

      {/* Expanded: full management UI (existing list + picker). Only
          mounts when the user opens the panel. */}
      {expanded && (
        <div id={`lineup-panel-${inquiryId}`} style={{ marginTop: 10 }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-admin-ink-muted text-admin-11">
              {t("dashboard.adminTabs.lineup.dragHint")}
            </span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              disabled={pending}
              onClick={() => setPickerOpen((o) => !o)}
              style={primaryBtn(COLORS.accent)}
            >
              {pickerOpen ? t("dashboard.adminTabs.lineup.closePicker") : t("dashboard.adminTabs.lineup.addTalent")}
            </button>
          </div>
          {lineup.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
          {lineup.map((p, idx) => (
            <div
              key={p.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/x-participant-id", p.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
              onDrop={(e) => {
                e.preventDefault();
                const fromId = e.dataTransfer.getData("text/x-participant-id");
                if (!fromId || fromId === p.id) return;
                const fromIdx = lineup.findIndex((x) => x.id === fromId);
                if (fromIdx < 0) return;
                const next = [...lineup];
                const [moved] = next.splice(fromIdx, 1);
                next.splice(idx, 0, moved);
                // Optimistic update + persist.
                setLineup(next);
                startTransition(async () => {
                  const r = await reorderInquiryLineup(effectiveTenant.slug, inquiryId, next.map((x) => x.id));
                  if (!r.ok) { toast(interpolate(t("dashboard.adminTabs.lineup.reorderFailed"), { error: r.error })); reload(); }
                });
              }}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "6px 10px", background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`, borderRadius: 8,
                cursor: "grab",
              }}
            >
              <span aria-hidden style={{
                color: COLORS.inkDim, fontSize: 12, fontWeight: 700,
                cursor: "grab", userSelect: "none",
              }}>⋮⋮</span>
              <Avatar
                size={32}
                photoUrl={p.talentPhotoUrl ?? undefined}
                initials={initialsOf(p.talentDisplayName)}
                tone="auto"
                hashSeed={p.talentDisplayName ?? p.id}
              />
              <div className="flex-1 min-w-0">
                <div style={{ fontWeight: 600 }} className="text-admin-ink">
                  {p.talentDisplayName ?? t("dashboard.adminTabs.lineup.unnamedTalent")}
                </div>
                {p.talentHeadline && (
                  <div className="text-admin-ink-muted text-admin-11">
                    {p.talentHeadline}
                  </div>
                )}
                <div className="text-admin-ink-muted text-admin-11" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "1px 6px",
                      borderRadius: 999,
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: 0.3,
                      background:
                        p.status === "active" ? COLORS.successSoft
                        : p.status === "declined" ? COLORS.coralSoft
                        : "rgba(245,158,11,0.12)",
                      color:
                        p.status === "active" ? COLORS.successDeep
                        : p.status === "declined" ? COLORS.coralDeep
                        : COLORS.amberDeep,
                    }}
                  >
                    {p.status === "active" ? t("dashboard.adminTabs.lineup.statusActive") : p.status === "declined" ? t("dashboard.adminTabs.lineup.statusDeclined") : t("dashboard.adminTabs.lineup.statusInvited")}
                  </span>
                  {p.invitedAt ? interpolate(t("dashboard.adminTabs.lineup.invitedOn"), { date: new Date(p.invitedAt).toLocaleDateString() }) : t("dashboard.adminTabs.lineup.addedToInquiry")}
                </div>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => remove(p.id, p.talentDisplayName)}
                style={{
                  padding: "4px 8px", borderRadius: 6,
                  background: "transparent", border: `1px solid ${COLORS.border}`,
                  color: COLORS.coralDeep, cursor: pending ? "wait" : "pointer",
                  fontSize: 11, fontWeight: 600,
                }}
              >{t("dashboard.adminTabs.lineup.remove")}</button>
            </div>
          ))}
        </div>
      )}
      {pickerOpen && (
        <div style={{
          background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 8, padding: 8,
          display: "flex", flexDirection: "column", gap: 6,
        }}>
          <input
            type="text"
            value={pickerSearch}
            onChange={(e) => setPickerSearch(e.target.value)}
            placeholder={t("dashboard.adminTabs.lineup.searchRoster")}
            autoFocus
            style={{
              padding: "6px 10px",
              border: `1px solid ${COLORS.border}`, borderRadius: 6,
              fontSize: 12, fontFamily: FONTS.body,
            }}
          />
          <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {pickerCandidates.length === 0 && (
              <div style={{ fontSize: 11, padding: "6px 4px" }} className="text-admin-ink-muted">
                {pickerSearch.trim() ? t("dashboard.adminTabs.lineup.noMatches") : t("dashboard.adminTabs.lineup.allOnLineup")}
              </div>
            )}
            {pickerCandidates.slice(0, 50).map((cand) => (
              <button
                key={cand.id}
                type="button"
                disabled={pending}
                onClick={() => add(cand.id, cand.name)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 8px", textAlign: "left",
                  background: "transparent",
                  border: `1px solid ${COLORS.borderSoft}`, borderRadius: 6,
                  cursor: pending ? "wait" : "pointer",
                  fontSize: 12, fontFamily: FONTS.body, color: COLORS.ink,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = COLORS.surfaceAlt; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
              >
                <span style={{ flex: 1, fontWeight: 600 }}>{cand.name}</span>
                <span className="text-admin-ink-muted text-admin-11">{cand.city ?? ""}</span>
              </button>
            ))}
          </div>
        </div>
      )}
        </div>
      )}
    </div>
  );
}

/**
 * OfferDraftEditor — coordinator UI for adding/editing/removing offer
 * line items + setting the offer total/fee. Renders only when:
 *   • the inquiry has a real offer (offerId is a UUID)
 *   • the offer is in "draft" status
 *   • the actor is an admin
 *
 * Saves via `saveOfferDraft` which delegates to the engine
 * `updateOfferDraft`. Each save replaces the line items wholesale —
 * matches the engine contract.
 */
export function OfferDraftEditor({ inquiryId, offerId, canEdit }: { inquiryId: string; offerId: string; canEdit: boolean }) {
  const { toast, effectiveRoster, effectiveTenant } = useAdminShell();
  const t = useT();
  // Latest-`t` ref for async callbacks (see LiveLineupPanel note).
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);
  const [snapshot, setSnapshot] = useState<OfferDraftSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [collapsed, setCollapsed] = useState(true);
  // Item #11 wiring: which talent_profile_ids on this inquiry are
  // ALSO coordinators? Drives the inline "+coord" badge in the offer
  // line-item rows. Loaded once on mount; falls back to empty Set so
  // mock inquiries (no DB lineup) don't break the drafter.
  const [coordTalentIds, setCoordTalentIds] = useState<Set<string>>(new Set());

  const reload = React.useCallback(() => {
    setLoading(true);
    loadOfferDraft(effectiveTenant.slug, offerId)
      .then((r) => {
        if (r.ok && r.data) setSnapshot(r.data);
        else if (!r.ok) toast(interpolate(tRef.current("dashboard.adminTabs.lineup.loadDraftFailed"), { error: r.error }));
      })
      .finally(() => setLoading(false));
  }, [offerId, effectiveTenant.slug, toast]);

  // Load coordinator participant talent ids once for this inquiry.
  useEffect(() => {
    let cancelled = false;
    loadInquiryLineup(effectiveTenant.slug, inquiryId).then((r) => {
      if (cancelled) return;
      if (!r.ok || !r.data) return;
      const ids = new Set<string>();
      for (const p of r.data) {
        if (p.role === "coordinator" && p.talentProfileId) {
          ids.add(p.talentProfileId);
        }
      }
      setCoordTalentIds(ids);
    });
    return () => { cancelled = true; };
  }, [inquiryId, effectiveTenant.slug]);

  useEffect(() => { reload(); }, [reload]);

  if (!canEdit) return null;
  // C9 — loading skeleton (was a blank flash before).
  if (loading) {
    return (
      <div data-offer-draft-loading style={{
        padding: 14, fontFamily: FONTS.body, color: COLORS.inkMuted, fontSize: 12,
      }}>
        <PanelSkeleton lines={4} />
      </div>
    );
  }
  if (!snapshot) return null;

  // #3 alignment: the offer Total is the SUM of the priced line items — never
  // hand-typed — so the client sees and is charged exactly the same number
  // (convert already books the line-item sum). This removes the shown≠charged
  // drift that was the third structural root cause of the workflow audit.
  const computedTotal = snapshot.lineItems.reduce(
    (sum, li) => sum + (Number(li.totalPrice) || 0),
    0,
  );

  const addLineItem = () => {
    setSnapshot((s) => s == null ? s : {
      ...s,
      lineItems: [
        ...s.lineItems,
        {
          id: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          talentProfileId: null,
          talentDisplayName: null,
          label: "Talent",
          pricingUnit: "day",
          units: 1,
          unitPrice: 0,
          totalPrice: 0,
          talentCost: 0,
          notes: null,
          sortOrder: s.lineItems.length,
          sourceServiceId: null,
        },
      ],
    });
  };

  const updateLine = (id: string, patch: Partial<OfferDraftSnapshot["lineItems"][number]>) => {
    setSnapshot((s) => s == null ? s : {
      ...s,
      lineItems: s.lineItems.map((li) => {
        if (li.id !== id) return li;
        const next = { ...li, ...patch };
        // Auto-recompute total when units / unit_price change.
        if (patch.units !== undefined || patch.unitPrice !== undefined) {
          next.totalPrice = next.units * next.unitPrice;
        }
        return next;
      }),
    });
  };

  const removeLine = (id: string) => {
    setSnapshot((s) => s == null ? s : { ...s, lineItems: s.lineItems.filter((li) => li.id !== id) });
  };

  const save = () => {
    if (!snapshot) return;
    startTransition(async () => {
      const lineItems = snapshot.lineItems.map((li, idx) => ({
        talent_profile_id: li.talentProfileId,
        label: li.label,
        pricing_unit: li.pricingUnit,
        units: li.units,
        unit_price: li.unitPrice,
        total_price: li.totalPrice,
        talent_cost: li.talentCost,
        notes: li.notes,
        sort_order: idx,
        source_service_id: li.sourceServiceId,
      }));
      const r = await saveOfferDraft(effectiveTenant.slug, offerId, {
        inquiryExpectedVersion: snapshot.inquiryVersion,
        offerExpectedVersion: snapshot.offerVersion,
        totalClientPrice: computedTotal,
        coordinatorFee: snapshot.coordinatorFee,
        currencyCode: snapshot.currencyCode,
        notes: snapshot.notes,
        lineItems,
      });
      if (!r.ok) toast(interpolate(t("dashboard.adminTabs.lineup.saveFailed"), { error: r.error }));
      else { toast(t("dashboard.adminTabs.lineup.draftSaved")); reload(); }
    });
  };

  // Roster talent options for the per-line dropdown — only real UUIDs
  // (synthetic mock roster won't resolve at the DB).
  const rosterOptions = effectiveRoster.filter((p) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.id),
  );


  if (collapsed) {
    return (
      <div style={{ border: `1px solid ${COLORS.borderSoft}`, padding: "8px 12px", display: "flex", alignItems: "center", gap: 10, fontFamily: FONTS.body, fontSize: 12 }} className="bg-admin-surface-alt rounded-admin-md">
        <span style={{ fontWeight: 700 }} className="text-admin-ink">{t("dashboard.adminTabs.lineup.draftEditor")}</span>
        <span className="text-admin-ink-muted">
          {interpolate(t(snapshot.lineItems.length === 1 ? "dashboard.adminTabs.lineup.lineItemCountOne" : "dashboard.adminTabs.lineup.lineItemCountMany"), { count: snapshot.lineItems.length })}
          {" · "}
          {interpolate(t("dashboard.adminTabs.lineup.totalPrefix"), { amount: new Intl.NumberFormat("en-US", { style: "currency", currency: snapshot.currencyCode, maximumFractionDigits: 0 }).format(computedTotal) })}
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => setCollapsed(false)} style={ghostBtn()}>{t("dashboard.adminTabs.lineup.edit")}</button>
      </div>
    );
  }

  return (
    <div style={{
      background: COLORS.surfaceAlt, border: `1px solid ${COLORS.borderSoft}`,
      borderRadius: RADIUS.md, padding: 12,
      display: "flex", flexDirection: "column", gap: 8,
      fontFamily: FONTS.body, fontSize: 12,
    }}>
      <div className="flex items-center gap-2">
        <span style={{ fontWeight: 700 }} className="text-admin-ink">{t("dashboard.adminTabs.lineup.draftEditor")}</span>
        <span className="text-admin-ink-muted text-admin-11">inquiry_offer_line_items</span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => setCollapsed(true)} style={ghostBtn()}>{t("dashboard.adminTabs.lineup.collapse")}</button>
      </div>
      <div className="flex flex-col gap-1.5">
        {snapshot.lineItems.map((li) => (
          <div key={li.id} style={{
            background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 8, padding: "8px 10px",
            display: "grid", gridTemplateColumns: "1.6fr 0.8fr 0.6fr 0.8fr 0.8fr 28px",
            gap: 6, alignItems: "center",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
              <select
                value={li.talentProfileId ?? ""}
                onChange={(e) => {
                  const id = e.target.value || null;
                  const match = rosterOptions.find((p) => p.id === id);
                  // Changing the talent invalidates any prior service prefill
                  // (the service belonged to the previous talent) — clear the stamp.
                  updateLine(li.id, { talentProfileId: id, talentDisplayName: match?.name ?? null, label: match?.name ?? li.label, sourceServiceId: null });
                }}
                style={{ padding: "5px 6px", fontSize: 11, fontFamily: FONTS.body, border: `1px solid ${COLORS.border}`, borderRadius: 4, flex: 1, minWidth: 0 }}
              >
                <option value="">{t("dashboard.adminTabs.lineup.chooseTalent")}</option>
                {rosterOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {/* Item #11 final: live coord badge. Renders "+coord"
                  inline when the selected talent is a coordinator on
                  this inquiry. Engine commission snapshot pays both
                  lanes (talent payout + workspace fee share per
                  coordinator_pct, plan §7.4). */}
              {li.talentProfileId && coordTalentIds.has(li.talentProfileId) && (
                <span
                  title={t("dashboard.adminTabs.lineup.coordBadgeTitle")}
                  style={{
                    padding: "1px 6px",
                    borderRadius: 999,
                    background: "rgba(43,63,163,0.10)",
                    color: "#2B3FA3",
                    fontSize: 9.5, fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  {t("dashboard.adminTabs.lineup.coordBadge")}
                </span>
              )}
            </div>
            <select
              value={li.pricingUnit}
              onChange={(e) => updateLine(li.id, { pricingUnit: e.target.value as ServicePricingType })}
              style={{ padding: "5px 6px", fontSize: 11, fontFamily: FONTS.body, border: `1px solid ${COLORS.border}`, borderRadius: 4 }}
            >
              <option value="hour">{t("dashboard.adminTabs.lineup.unitHour")}</option>
              <option value="day">{t("dashboard.adminTabs.lineup.unitDay")}</option>
              <option value="week">{t("dashboard.adminTabs.lineup.unitWeek")}</option>
              <option value="half_day">{t("dashboard.adminTabs.lineup.unitHalfDay")}</option>
              <option value="event">{t("dashboard.adminTabs.lineup.unitEvent")}</option>
              <option value="per_person">{t("dashboard.adminTabs.lineup.unitPerson")}</option>
              <option value="per_contact">{t("dashboard.adminTabs.lineup.unitSession")}</option>
              <option value="flat_package">{t("dashboard.adminTabs.lineup.unitFlat")}</option>
              <option value="custom">{t("dashboard.adminTabs.lineup.unitCustom")}</option>
            </select>
            <input type="number" min={0} step="0.5" value={li.units}
              onChange={(e) => updateLine(li.id, { units: parseFloat(e.target.value) || 0 })}
              style={{ padding: "5px 6px", fontSize: 11, fontFamily: FONTS.body, border: `1px solid ${COLORS.border}`, borderRadius: 4 }}
              placeholder={t("dashboard.adminTabs.lineup.unitsPlaceholder")}
            />
            <input type="number" min={0} step="100" value={li.unitPrice}
              onChange={(e) => updateLine(li.id, { unitPrice: parseFloat(e.target.value) || 0 })}
              style={{ padding: "5px 6px", fontSize: 11, fontFamily: FONTS.body, border: `1px solid ${COLORS.border}`, borderRadius: 4 }}
              placeholder={t("dashboard.adminTabs.lineup.ratePlaceholder")}
            />
            <input type="number" min={0} step="100" value={li.talentCost}
              onChange={(e) => updateLine(li.id, { talentCost: parseFloat(e.target.value) || 0 })}
              style={{ padding: "5px 6px", fontSize: 11, fontFamily: FONTS.body, border: `1px solid ${COLORS.border}`, borderRadius: 4 }}
              placeholder={t("dashboard.adminTabs.lineup.talentCostPlaceholder")}
            />
            <button type="button" onClick={() => removeLine(li.id)} style={{
              background: "transparent", border: "none",
              color: COLORS.coralDeep, cursor: "pointer", fontSize: 14, lineHeight: 1,
            }}>×</button>
            {/* S14/S15 — prefill this line from the talent's services menu.
                col-span-full keeps it off the no-new-inline-style ratchet. */}
            {li.talentProfileId ? (
              <div className="col-span-full">
                <LineServicePicker
                  talentProfileId={li.talentProfileId}
                  onPick={(svc) =>
                    updateLine(li.id, {
                      label: svc.name,
                      pricingUnit: svc.pricingType,
                      unitPrice: svc.amountCents != null ? svc.amountCents / 100 : li.unitPrice,
                      sourceServiceId: svc.id, // S18 — audit stamp
                    })
                  }
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" disabled={pending} onClick={addLineItem} style={ghostBtn()}>{t("dashboard.adminTabs.lineup.addLineItem")}</button>
        <span style={{ flex: 1 }} />
        <label className="text-admin-ink-muted text-admin-11">{t("dashboard.adminTabs.lineup.total")}</label>
        <span
          title={t("dashboard.adminTabs.lineup.totalTitle")}
          style={{ minWidth: 90, padding: "5px 6px", fontSize: 13, fontWeight: 700, textAlign: "right", whiteSpace: "nowrap", fontFamily: FONTS.body }}
          className="text-admin-ink"
        >
          {new Intl.NumberFormat("en-US", { style: "currency", currency: snapshot.currencyCode, maximumFractionDigits: 0 }).format(computedTotal)}
        </span>
        <label className="text-admin-ink-muted text-admin-11">{t("dashboard.adminTabs.lineup.fee")}</label>
        <input type="number" min={0} step="100" value={snapshot.coordinatorFee}
          onChange={(e) => setSnapshot((s) => s == null ? s : { ...s, coordinatorFee: parseFloat(e.target.value) || 0 })}
          style={{ width: 80, padding: "5px 6px", fontSize: 11, fontFamily: FONTS.body, border: `1px solid ${COLORS.border}`, borderRadius: 4 }}
        />
        <button type="button" disabled={pending} onClick={save} style={primaryBtn(COLORS.accent)}>
          {pending ? t("dashboard.adminTabs.lineup.saving") : t("dashboard.adminTabs.lineup.saveDraft")}
        </button>
      </div>

      {/* W6a — negotiated booking terms (deposit / balance method / refund
          policy), pre-filled from the offer's saved terms (loadOfferDraft) and
          persisted through saveOfferDraft alongside the current line items.
          deposit_amount_cents is derived server-side. Display + snapshot only —
          nothing charges the deposit this wave. */}
      <OfferTermsComposer
        totalUnits={computedTotal}
        currencyCode={snapshot.currencyCode}
        initial={{
          depositPct: snapshot.terms.depositPct,
          balanceMethod: snapshot.terms.balanceMethod,
          refundPolicy: snapshot.terms.refundPolicy,
        }}
        onSave={async (terms) => {
          const r = await saveOfferDraft(effectiveTenant.slug, offerId, {
            inquiryExpectedVersion: snapshot.inquiryVersion,
            offerExpectedVersion: snapshot.offerVersion,
            totalClientPrice: computedTotal,
            coordinatorFee: snapshot.coordinatorFee,
            currencyCode: snapshot.currencyCode,
            notes: snapshot.notes,
            lineItems: snapshot.lineItems.map((li, idx) => ({
              talent_profile_id: li.talentProfileId,
              label: li.label,
              pricing_unit: li.pricingUnit,
              units: li.units,
              unit_price: li.unitPrice,
              total_price: li.totalPrice,
              talent_cost: li.talentCost,
              notes: li.notes,
              sort_order: idx,
              source_service_id: li.sourceServiceId,
            })),
            terms,
          });
          if (r.ok) reload();
          return r;
        }}
      />
    </div>
  );
}

/**
 * "Start drafting offer" button shown in the OfferTab empty state. Calls
 * the real createOffer engine action and refreshes router state.
 */
export function CreateOfferButton({ inquiryId }: { inquiryId: string }) {
  const { toast, effectiveTenant } = useAdminShell();
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => {
          const r = await createOfferAction(effectiveTenant.slug, inquiryId);
          if (!r.ok) toast(interpolate(t("dashboard.adminTabs.lineup.startOfferFailed"), { error: r.error }));
          else { toast(t("dashboard.adminTabs.lineup.offerCreated")); router.refresh(); }
        })}
        style={primaryBtn(COLORS.accent)}
      >
        {pending ? t("dashboard.adminTabs.lineup.starting") : t("dashboard.adminTabs.lineup.startDrafting")}
      </button>
    </div>
  );
}
