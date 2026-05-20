"use client";

import React, { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loadInquiryLineup, removeInquiryLineupParticipant, addInquiryLineupTalent, reorderInquiryLineup, saveOfferDraft, loadOfferDraft, createOfferAction, type InquiryParticipant, type OfferDraftSnapshot } from "@/app/(workspace)/[tenantSlug]/admin/_pipeline-actions";
import { useAdminShell, FONTS, COLORS, RADIUS } from "../../state";
import { Avatar } from "../../primitives";
import { initialsOf } from "./inbox-identity-1";
import { OfferTab } from "./machinery-12";
import { PanelSkeleton, ghostBtn, primaryBtn } from "./machinery-13";
import type { Offer } from "./machinery-9";


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
export function LiveLineupPanel({ inquiryId }: { inquiryId: string }) {
  const { toast, effectiveRoster, effectiveTenant } = useAdminShell();
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
  const [expanded, setExpanded] = useState(false);

  // Skip the DB roundtrip entirely for synthetic mock inquiry ids — the
  // demo conversations use "RI-XXX" / "c1" style ids that won't resolve.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inquiryId);

  const reload = React.useCallback(() => {
    if (!isUuid) { setLoading(false); return; }
    setLoading(true);
    loadInquiryLineup(effectiveTenant.slug, inquiryId)
      .then((r) => {
        if (r.ok) setLineup(r.data ?? []);
        else toast(`Couldn't load lineup: ${r.error}`);
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
    if (!confirm(`Remove ${name ?? "this talent"} from the lineup?`)) return;
    startTransition(async () => {
      const r = await removeInquiryLineupParticipant(effectiveTenant.slug, inquiryId, participantId);
      if (!r.ok) toast(`Remove failed: ${r.error}`);
      else { toast("Removed from lineup"); reload(); }
    });
  };

  const add = (talentProfileId: string, name: string) => {
    startTransition(async () => {
      const r = await addInquiryLineupTalent(effectiveTenant.slug, inquiryId, talentProfileId);
      if (!r.ok) toast(`Add failed: ${r.error}`);
      else {
        toast(`${name} added to lineup`);
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
          Lineup
        </span>
        {/* Overlapping avatar stack */}
        {lineup.length === 0 ? (
          <span style={{ fontSize: 11, fontStyle: "italic" }} className="text-admin-ink-muted">
            empty — add talent to start
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
                title={`${p.talentDisplayName ?? "Unnamed"} · ${p.status}`}
              >
                <Avatar
                  size={22}
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
              {lineup.length} talent{lineup.length === 1 ? "" : "s"}
            </span>
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span
          aria-hidden
          style={{
            color: COLORS.inkMuted, fontSize: 11,
            transition: "transform 0.12s ease",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            display: "inline-block", width: 12,
          }}
        >▸</span>
        <span style={{ fontSize: 11 }} className="text-admin-ink-muted">
          {expanded ? "Hide" : "Manage"}
        </span>
      </button>

      {/* Expanded: full management UI (existing list + picker). Only
          mounts when the user opens the panel. */}
      {expanded && (
        <div id={`lineup-panel-${inquiryId}`} style={{ marginTop: 10 }}>
          <div className="flex items-center gap-2 mb-2">
            <span style={{ fontSize: 11 }} className="text-admin-ink-muted">
              inquiry_participants · drag to reorder
            </span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              disabled={pending}
              onClick={() => setPickerOpen((o) => !o)}
              style={primaryBtn(COLORS.accent)}
            >
              {pickerOpen ? "Close picker" : "Add talent"}
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
                  if (!r.ok) { toast(`Reorder failed: ${r.error}`); reload(); }
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
              <div className="flex-1 min-w-0">
                <div style={{ fontWeight: 600 }} className="text-admin-ink">
                  {p.talentDisplayName ?? "(unnamed talent)"}
                </div>
                <div style={{ fontSize: 11 }} className="text-admin-ink-muted">
                  {p.status}{p.invitedAt ? ` · invited ${new Date(p.invitedAt).toLocaleDateString()}` : ""}
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
              >Remove</button>
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
            placeholder="Search roster…"
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
                {pickerSearch.trim() ? "No matches in roster." : "All roster talent are already on this lineup."}
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
                <span style={{ fontSize: 11 }} className="text-admin-ink-muted">{cand.city ?? ""}</span>
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
export function OfferDraftEditor({ inquiryId, offerId, isAdmin }: { inquiryId: string; offerId: string; isAdmin: boolean }) {
  const { toast, effectiveRoster, effectiveTenant } = useAdminShell();
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
        else if (!r.ok) toast(`Couldn't load offer draft: ${r.error}`);
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

  if (!isAdmin) return null;
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
      }));
      const r = await saveOfferDraft(effectiveTenant.slug, offerId, {
        inquiryExpectedVersion: snapshot.inquiryVersion,
        offerExpectedVersion: snapshot.offerVersion,
        totalClientPrice: snapshot.totalClientPrice,
        coordinatorFee: snapshot.coordinatorFee,
        currencyCode: snapshot.currencyCode,
        notes: snapshot.notes,
        lineItems,
      });
      if (!r.ok) toast(`Save failed: ${r.error}`);
      else { toast("Offer draft saved"); reload(); }
    });
  };

  // Roster talent options for the per-line dropdown — only real UUIDs
  // (synthetic mock roster won't resolve at the DB).
  const rosterOptions = effectiveRoster.filter((p) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.id),
  );

  void inquiryId; // referenced for potential future use (revalidate scoping)

  if (collapsed) {
    return (
      <div style={{ border: `1px solid ${COLORS.borderSoft}`, padding: "8px 12px", display: "flex", alignItems: "center", gap: 10, fontFamily: FONTS.body, fontSize: 12 }} className="bg-admin-surface-alt rounded-admin-md">
        <span style={{ fontWeight: 700 }} className="text-admin-ink">Draft editor</span>
        <span className="text-admin-ink-muted">
          {snapshot.lineItems.length} line item{snapshot.lineItems.length === 1 ? "" : "s"}
          {" · "}
          total {new Intl.NumberFormat("en-US", { style: "currency", currency: snapshot.currencyCode, maximumFractionDigits: 0 }).format(snapshot.totalClientPrice)}
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => setCollapsed(false)} style={ghostBtn()}>Edit</button>
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
        <span style={{ fontWeight: 700 }} className="text-admin-ink">Draft editor</span>
        <span style={{ fontSize: 11 }} className="text-admin-ink-muted">inquiry_offer_line_items</span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => setCollapsed(true)} style={ghostBtn()}>Collapse</button>
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
                  updateLine(li.id, { talentProfileId: id, talentDisplayName: match?.name ?? null, label: match?.name ?? li.label });
                }}
                style={{ padding: "5px 6px", fontSize: 11, fontFamily: FONTS.body, border: `1px solid ${COLORS.border}`, borderRadius: 4, flex: 1, minWidth: 0 }}
              >
                <option value="">— choose talent —</option>
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
                  title="Also coordinates — earns both talent payout + coord commission"
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
                  +coord
                </span>
              )}
            </div>
            <select
              value={li.pricingUnit}
              onChange={(e) => updateLine(li.id, { pricingUnit: e.target.value as "hour" | "day" | "week" | "event" })}
              style={{ padding: "5px 6px", fontSize: 11, fontFamily: FONTS.body, border: `1px solid ${COLORS.border}`, borderRadius: 4 }}
            >
              <option value="hour">/hr</option>
              <option value="day">/day</option>
              <option value="week">/wk</option>
              <option value="event">flat</option>
            </select>
            <input type="number" min={0} step="0.5" value={li.units}
              onChange={(e) => updateLine(li.id, { units: parseFloat(e.target.value) || 0 })}
              style={{ padding: "5px 6px", fontSize: 11, fontFamily: FONTS.body, border: `1px solid ${COLORS.border}`, borderRadius: 4 }}
              placeholder="units"
            />
            <input type="number" min={0} step="100" value={li.unitPrice}
              onChange={(e) => updateLine(li.id, { unitPrice: parseFloat(e.target.value) || 0 })}
              style={{ padding: "5px 6px", fontSize: 11, fontFamily: FONTS.body, border: `1px solid ${COLORS.border}`, borderRadius: 4 }}
              placeholder="rate"
            />
            <input type="number" min={0} step="100" value={li.talentCost}
              onChange={(e) => updateLine(li.id, { talentCost: parseFloat(e.target.value) || 0 })}
              style={{ padding: "5px 6px", fontSize: 11, fontFamily: FONTS.body, border: `1px solid ${COLORS.border}`, borderRadius: 4 }}
              placeholder="talent cost"
            />
            <button type="button" onClick={() => removeLine(li.id)} style={{
              background: "transparent", border: "none",
              color: COLORS.coralDeep, cursor: "pointer", fontSize: 14, lineHeight: 1,
            }}>×</button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" disabled={pending} onClick={addLineItem} style={ghostBtn()}>+ Add line item</button>
        <span style={{ flex: 1 }} />
        <label style={{ fontSize: 11 }} className="text-admin-ink-muted">Total</label>
        <input type="number" min={0} step="100" value={snapshot.totalClientPrice}
          onChange={(e) => setSnapshot((s) => s == null ? s : { ...s, totalClientPrice: parseFloat(e.target.value) || 0 })}
          style={{ width: 90, padding: "5px 6px", fontSize: 11, fontFamily: FONTS.body, border: `1px solid ${COLORS.border}`, borderRadius: 4 }}
        />
        <label style={{ fontSize: 11 }} className="text-admin-ink-muted">Fee</label>
        <input type="number" min={0} step="100" value={snapshot.coordinatorFee}
          onChange={(e) => setSnapshot((s) => s == null ? s : { ...s, coordinatorFee: parseFloat(e.target.value) || 0 })}
          style={{ width: 80, padding: "5px 6px", fontSize: 11, fontFamily: FONTS.body, border: `1px solid ${COLORS.border}`, borderRadius: 4 }}
        />
        <button type="button" disabled={pending} onClick={save} style={primaryBtn(COLORS.accent)}>
          {pending ? "Saving…" : "Save draft"}
        </button>
      </div>
    </div>
  );
}

/**
 * "Start drafting offer" button shown in the OfferTab empty state. Calls
 * the real createOffer engine action and refreshes router state.
 */
export function CreateOfferButton({ inquiryId }: { inquiryId: string }) {
  const { toast, effectiveTenant } = useAdminShell();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => {
          const r = await createOfferAction(effectiveTenant.slug, inquiryId);
          if (!r.ok) toast(`Couldn't start offer: ${r.error}`);
          else { toast("Offer draft created"); router.refresh(); }
        })}
        style={primaryBtn(COLORS.accent)}
      >
        {pending ? "Starting…" : "Start drafting offer"}
      </button>
    </div>
  );
}
