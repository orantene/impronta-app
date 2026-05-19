"use client";

import React from "react";
import { useAdminShell, FONTS, COLORS, MY_TALENT_PROFILE, TRANSITION, type InquiryRecord } from "../../state";
import { Avatar } from "../../primitives";
import { currentTalentId } from "../messages-shared";
import { CoordRoleBadge, PresenceDot } from "./inbox-identity-1";
import { disabledBtn } from "./machinery-13";
import { AdminParticipantsActions } from "./machinery-4";
import type { DetailsPov } from "./machinery-6";
import { InquiryComposer, PageTopCollection, PageTopThread } from "./machinery-8";
import type { Offer } from "./machinery-9";


/**
 * Pov-shaped detail rendering. Same Inquiry record, four different
 * emotional registers:
 *
 *   client       — calm reassurance: "your project, your contact, your dates"
 *   talent       — personal job card: "your role, your dates, your contact"
 *   talent_coord — talent + coordinator extras (lineup, group)
 *   admin        — operational console: full participants + source + controls
 *
 * The structure shares one model but the *voice* and *density* differ. We
 * never let the canonical schema leak into the visible UI — labels are
 * human, sections are role-relevant, admin chrome stays out of client/talent.
 */
export function DetailsPanel({ inquiry, pov }: { inquiry: InquiryRecord; pov: DetailsPov }) {
  if (pov === "client")       return <ClientDetailsView inquiry={inquiry} />;
  if (pov === "talent")       return <TalentDetailsView inquiry={inquiry} isCoordinator={false} />;
  if (pov === "talent_coord") return <TalentDetailsView inquiry={inquiry} isCoordinator={true} />;
  return <AdminDetailsView inquiry={inquiry} />;
}

// ── CLIENT view — short, warm, reassurance-shaped ──
export function ClientDetailsView({ inquiry }: { inquiry: InquiryRecord }) {
  const { toast } = useAdminShell();
  const coord = inquiry.coordinators[0];
  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, fontFamily: FONTS.body }}>
      {/* Your project */}
      <DetailSection title="Your project">
        <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink, lineHeight: 1.4 }}>{inquiry.title}</div>
        {inquiry.brief.summary && inquiry.brief.summary !== inquiry.title && (
          <div style={{ fontSize: 12.5, color: COLORS.inkMuted, marginTop: 4, lineHeight: 1.5 }}>{inquiry.brief.summary}</div>
        )}
      </DetailSection>

      {/* Your contact — single coordinator, not "Participants" */}
      {coord && (
        <DetailSection title="Your contact">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Avatar size={36} tone="auto" hashSeed={coord.name} initials={coord.initials} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink }}>{coord.name}</div>
              <div style={{ fontSize: 11.5, color: COLORS.inkMuted }}>Your coordinator</div>
            </div>
            <button type="button" disabled title="Use the Messages tab to contact this coordinator." style={disabledBtn({
              padding: "6px 12px", borderRadius: 999, fontSize: 11.5, fontWeight: 600,
              border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.ink, cursor: "pointer",
            })}>Message</button>
          </div>
        </DetailSection>
      )}

      {/* Your talent — the people the client commissioned. Filters to
          accepted/booked roles only when the inquiry has progressed past
          coordination, so the client doesn't see backstage decline data
          or talent who didn't make the lineup. The "Talent group" tab
          stays locked (private to coordinator + talent). This is where
          the client sees WHO they're hiring. */}
      {inquiry.talent.length > 0 && (
        <DetailSection title="Your talent">
          {inquiry.talent
            .filter(t => {
              const s = (t.state ?? "").toLowerCase();
              // While coordinating, hide pending/declined — only show
              // confirmed talent. After offer: show all approved rows.
              if (inquiry.status === "submitted" || inquiry.status === "coordinating") {
                return s === "accepted" || s === "confirmed" || s === "booked";
              }
              return s !== "declined" && s !== "rejected" && s !== "withdrew";
            })
            .map(t => (
              <ClientTalentCard key={t.talentId} talent={t} stagePast={inquiry.status === "wrapped"} canEdit={inquiry.status !== "wrapped" && inquiry.status !== "cancelled"} />
            ))
          }
          {/* Lineup editing — clients (and coordinators) can suggest
              swaps, request additional talent, or pull in someone they
              already worked with. Hidden once the project is wrapped /
              cancelled — no edits past that point. */}
          {inquiry.status !== "wrapped" && inquiry.status !== "cancelled" && (
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => toast("Message your coordinator to request additional talent — they handle adds from their workspace.")}
                title="Tap to learn how to request talent"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "5px 10px", borderRadius: 999,
                  border: `1px dashed ${COLORS.border}`, background: "transparent",
                  color: COLORS.ink, cursor: "pointer",
                  fontSize: 11.5, fontWeight: 600, fontFamily: FONTS.body,
                }}
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Request talent
              </button>
              <button
                type="button"
                onClick={() => toast("Message your coordinator to swap a talent — they handle replacements from their workspace.")}
                title="Tap to learn how to swap a talent"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "5px 10px", borderRadius: 999,
                  border: "none", background: "transparent",
                  color: COLORS.inkMuted, cursor: "pointer",
                  fontSize: 11.5, fontWeight: 500, fontFamily: FONTS.body,
                }}
              >
                Request a swap
              </button>
            </div>
          )}
        </DetailSection>
      )}

      {/* When + where, combined into one calm card */}
      <DetailSection title="When & where">
        <div style={{ fontSize: 13, color: COLORS.ink, fontWeight: 500 }}>
          {inquiry.schedule.start}
          {inquiry.schedule.end && ` → ${inquiry.schedule.end}`}
        </div>
        {(inquiry.location.city || inquiry.location.venue) && (
          <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 4 }}>
            {[inquiry.location.venue, inquiry.location.city].filter(Boolean).join(" · ")}
          </div>
        )}
        {inquiry.location.mode === "tbc" && (
          <div style={{ fontSize: 12, color: COLORS.inkDim, marginTop: 4, fontStyle: "italic" }}>Location TBC</div>
        )}
      </DetailSection>
    </div>
  );
}

// ── ClientTalentCard — how a client sees the talent they commissioned.
// Avatar + name + role/status + view-profile + (when editable) a swap
// affordance. Coordinator-side editing happens in the Offer tab; this
// is the client-facing view of the same lineup. ──
export function ClientTalentCard({
  talent, stagePast, canEdit, onSwap,
}: {
  talent: { talentId: string; name: string; initials: string; state: string; photoUrl?: string };
  stagePast?: boolean;
  canEdit?: boolean;
  // When provided, the swap button calls this instead of staying disabled —
  // lets the parent open a real picker drawer (add/swap/remove).
  onSwap?: () => void;
}) {
  const stateMeta = (() => {
    const s = (talent.state || "").toLowerCase();
    if (s === "accepted" || s === "confirmed" || s === "booked") {
      return { label: stagePast ? "Worked together" : "Confirmed", bg: COLORS.successSoft, fg: COLORS.success };
    }
    if (s === "pending" || s === "invited") {
      return { label: "Pending acceptance", bg: `${COLORS.amber}18`, fg: COLORS.amber };
    }
    return { label: "Standby", bg: "rgba(11,11,13,0.05)", fg: COLORS.inkMuted };
  })();
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 10px", marginBottom: 6,
      background: "#fff",
      border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10,
      fontFamily: FONTS.body,
    }}>
      <Avatar size={36} tone="auto" hashSeed={talent.name} initials={talent.initials} photoUrl={talent.photoUrl} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 700, color: COLORS.ink,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{talent.name}</div>
        <div style={{
          marginTop: 3,
          display: "inline-flex", alignItems: "center", gap: 5,
          fontSize: 10, fontWeight: 700,
          padding: "2px 7px", borderRadius: 999,
          background: stateMeta.bg, color: stateMeta.fg,
          textTransform: "uppercase", letterSpacing: 0.4,
        }}>{stateMeta.label}</div>
      </div>
      {/* C1 dead-chrome sweep: removed disabled "View" button — public
          talent profile linkout needs profile_code which isn't threaded
          to this surface. Clients can find talent in Discover instead. */}
      {canEdit && !stagePast && (
        <button
          type="button"
          onClick={onSwap}
          disabled={!onSwap}
          title={onSwap ? undefined : "Swap requests need a live coordinator workflow."}
          aria-label={`Swap ${talent.name}`}
          style={onSwap ? {
          flexShrink: 0,
          width: 28, height: 28, borderRadius: 8,
          border: "none", background: "transparent",
          color: COLORS.inkMuted, cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        } : disabledBtn({
          flexShrink: 0,
          width: 28, height: 28, borderRadius: 8,
          border: "none", background: "transparent",
          color: COLORS.inkMuted, cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        })}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M2 4h8l-2-2M12 10H4l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
    </div>
  );
}

// ── TALENT view — personal job card; coordinators see the lineup too ──
export function TalentDetailsView({ inquiry }: { inquiry: InquiryRecord; isCoordinator: boolean }) {
  const coord = inquiry.coordinators[0];
  const { toast } = useAdminShell();
  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, fontFamily: FONTS.body }}>
      {/* The job */}
      <DetailSection title="The job">
        <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink, lineHeight: 1.4 }}>{inquiry.title}</div>
        {inquiry.client.name && (
          <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 3 }}>For {inquiry.client.name}</div>
        )}
      </DetailSection>

      {/* Brief — surfaces the client's actual ask. The summary lives on
          inquiry.brief.summary; notes captures wardrobe / usage / mood
          context. Skip the section if nothing meaningful was provided. */}
      {(inquiry.brief.summary && inquiry.brief.summary !== inquiry.title) || inquiry.brief.notes ? (
        <DetailSection title="Brief">
          {inquiry.brief.summary && inquiry.brief.summary !== inquiry.title && (
            <div style={{ fontSize: 12.5, color: COLORS.ink, lineHeight: 1.55 }}>{inquiry.brief.summary}</div>
          )}
          {inquiry.brief.notes && (
            <div style={{
              fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.55,
              marginTop: inquiry.brief.summary ? 8 : 0,
              padding: "8px 10px", background: COLORS.surfaceAlt,
              borderRadius: 8, border: `1px solid ${COLORS.borderSoft}`,
            }}>{inquiry.brief.notes}</div>
          )}
        </DetailSection>
      ) : null}

      {/* Schedule — talent's most-asked question */}
      <DetailSection title="Schedule">
        <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink }}>
          {inquiry.schedule.start}
          {inquiry.schedule.end && ` → ${inquiry.schedule.end}`}
        </div>
        {inquiry.schedule.callTime && (
          <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 3 }}>Call time: {inquiry.schedule.callTime}</div>
        )}
      </DetailSection>

      {/* Location — upgraded to a static-map tile so talent gets a real
          spatial signal at-a-glance, not just an "Open in Maps" link. */}
      {(inquiry.location.city || inquiry.location.venue || inquiry.location.address) && (
        <DetailSection title="Location">
          <LocationMapTile
            venue={inquiry.location.venue}
            address={inquiry.location.address}
            city={inquiry.location.city}
            onOpenMaps={() => toast("Open map")}
          />
        </DetailSection>
      )}

      {/* Coordinator card */}
      {coord && (
        <DetailSection title="Your coordinator">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
              <Avatar size={32} tone="auto" hashSeed={coord.name} initials={coord.initials} />
              <PresenceDot name={coord.name} size={8} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 600, color: COLORS.ink,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {coord.name}
                </span>
                <CoordRoleBadge role={coord.role} />
              </div>
              <div style={{ fontSize: 11, color: COLORS.inkMuted }}>{coord.role === "owner" ? "Workspace owner" : "Coordinator"}</div>
            </div>
            <button type="button" onClick={() => toast(`Messaging ${coord.name}…`)} style={{
              padding: "5px 11px", borderRadius: 999, fontSize: 11, fontWeight: 600,
              border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.ink, cursor: "pointer",
            }}>Message</button>
          </div>
        </DetailSection>
      )}

      {/* Who's on this job — visible to ALL talent (was previously gated
          to coordinator-talent, which left non-coord talent in the dark
          about their teammates). Status badges (Accepted / Pending /
          Declined) ride next to each name so the lineup health is
          visible without opening the workspace drawer.

          Hidden when there's only one talent (e.g. c9 Lyra solo
          hostess) — the section reads as redundant chrome there. */}
      {inquiry.talent.length > 1 && (
        <DetailSection title="Who's on this job">
          {inquiry.talent.map(t => (
            <RosterMemberRow
              key={t.talentId}
              talent={t}
              isMe={t.talentId === currentTalentId() || t.name === MY_TALENT_PROFILE.name}
              stagePast={inquiry.status === "wrapped" || inquiry.status === "cancelled"}
            />
          ))}
        </DetailSection>
      )}
    </div>
  );
}

// ── Roster member row — avatar + name + state pill, used in the
// Details rail's "Who's on this job" card. Premium decision: show ALL
// teammates with state, not just the user's own row. The lineup is the
// most-asked question after "where + when?". ──
export function RosterMemberRow({ talent, isMe, stagePast }: { talent: { talentId: string; name: string; initials: string; state: string; photoUrl?: string }; isMe?: boolean; stagePast?: boolean }) {
  const stateMeta = (() => {
    const s = (talent.state || "").toLowerCase();
    if (s === "accepted" || s === "confirmed" || s === "booked") {
      return { label: "Accepted", bg: COLORS.successSoft, fg: COLORS.success };
    }
    if (s === "declined" || s === "rejected" || s === "withdrew") {
      return { label: "Declined", bg: "rgba(11,11,13,0.05)", fg: COLORS.inkMuted };
    }
    return { label: "Pending", bg: `${COLORS.amber}18`, fg: COLORS.amber };
  })();
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "5px 0",
      // Subtle background for "you" row so the user spots themselves
      // at-a-glance — no chevron noise, just a tinted strip.
      ...(isMe ? {
        margin: "1px -8px",
        padding: "5px 8px",
        background: "rgba(91,107,160,0.06)",
        borderRadius: 8,
      } : {}),
    }}>
      <Avatar size={26} tone="auto" hashSeed={talent.name} initials={talent.initials} photoUrl={talent.photoUrl} />
      <span style={{ flex: 1, fontSize: 12.5, fontWeight: isMe ? 700 : 500, color: COLORS.ink, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {talent.name}
        {isMe && (
          <span style={{
            marginLeft: 6, fontSize: 9.5, fontWeight: 700,
            padding: "1px 6px", borderRadius: 999,
            background: COLORS.indigoDeep, color: "#fff",
            letterSpacing: 0.3, textTransform: "uppercase",
            verticalAlign: "middle",
          }}>You</span>
        )}
      </span>
      {/* Past stage: drop the live-pipeline state pills (Pending / etc.
          stop being relevant once the job is wrapped) and surface a
          neutral "Worked together" cue instead. */}
      {stagePast ? (
        <span style={{
          fontSize: 9.5, fontWeight: 600, padding: "2px 7px", borderRadius: 999,
          background: "rgba(11,11,13,0.04)", color: COLORS.inkMuted,
          textTransform: "uppercase", letterSpacing: 0.4, flexShrink: 0,
        }}>Worked together</span>
      ) : (
        <span style={{
          fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
          background: stateMeta.bg, color: stateMeta.fg,
          textTransform: "uppercase", letterSpacing: 0.4, flexShrink: 0,
        }}>{stateMeta.label}</span>
      )}
    </div>
  );
}

// ── LocationMapTile — premium upgrade from "Open in Maps →" link to a
// static-map preview. Uses a CSS-rendered abstract map (clean sans-serif
// grid + accent pin) that reads as a place without needing a Mapbox key
// in the prototype. Click forwards to whatever the host wires up. ──
export function LocationMapTile({
  venue, address, city, onOpenMaps,
}: { venue?: string; address?: string; city?: string; onOpenMaps: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpenMaps}
      aria-label="Open in Maps"
      style={{
        position: "relative", width: "100%",
        padding: 0, border: `1px solid ${COLORS.borderSoft}`,
        background: "#fff", borderRadius: 10, overflow: "hidden",
        cursor: "pointer", textAlign: "left",
        transition: `border-color ${TRANSITION.micro}, box-shadow ${TRANSITION.micro}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = COLORS.border;
        e.currentTarget.style.boxShadow = "0 1px 0 rgba(11,11,13,0.04), 0 6px 16px -8px rgba(11,11,13,0.10)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = COLORS.borderSoft;
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* Abstract map — soft grid + accent pin. Replace with a real
          static-map render (Mapbox / Google Static) when geo lat/lng
          ships in the inquiry record. */}
      <div aria-hidden style={{
        position: "relative", height: 110,
        background: `
          linear-gradient(135deg, ${COLORS.surfaceAlt} 0%, ${COLORS.surface ?? "#FAFAFA"} 100%),
          radial-gradient(circle at 35% 60%, rgba(91,107,160,0.10) 0%, transparent 60%)
        `,
        backgroundBlendMode: "multiply",
        overflow: "hidden",
      }}>
        {/* grid */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `
            linear-gradient(to right, rgba(11,11,13,0.04) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(11,11,13,0.04) 1px, transparent 1px)
          `,
          backgroundSize: "20px 20px",
          maskImage: "radial-gradient(ellipse at center, #000 50%, transparent 95%)",
        }} />
        {/* pseudo road */}
        <div style={{
          position: "absolute", left: "10%", right: "12%", top: "62%",
          height: 3, background: "rgba(11,11,13,0.10)", borderRadius: 2,
          transform: "rotate(-6deg)",
        }} />
        <div style={{
          position: "absolute", left: "30%", top: "20%", bottom: "20%",
          width: 3, background: "rgba(11,11,13,0.08)", borderRadius: 2,
          transform: "rotate(8deg)",
        }} />
        {/* pin */}
        <div style={{
          position: "absolute", left: "50%", top: "50%",
          transform: "translate(-50%, -100%)",
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: COLORS.accent, border: "3px solid #fff",
            boxShadow: "0 4px 10px rgba(11,11,13,0.20), 0 0 0 4px rgba(91,107,160,0.18)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff",
          }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5c0 3.4 4.5 8.5 4.5 8.5s4.5-5.1 4.5-8.5A4.5 4.5 0 0 0 8 1.5zm0 6a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>
            </svg>
          </div>
        </div>
      </div>
      {/* address block */}
      <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {venue && (
            <div style={{
              fontSize: 13, fontWeight: 600, color: COLORS.ink,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>{venue}</div>
          )}
          {(address || city) && (
            <div style={{
              fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>{[address, city].filter(Boolean).join(", ")}</div>
          )}
        </div>
        <span style={{
          flexShrink: 0, fontSize: 11, fontWeight: 600, color: COLORS.accent,
          display: "inline-flex", alignItems: "center", gap: 3,
        }}>
          Maps
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      </div>
    </button>
  );
}

// ── ADMIN view — operations console: full participants, source, controls ──
export function AdminDetailsView({ inquiry }: { inquiry: InquiryRecord }) {
  const { toast } = useAdminShell();
  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, fontFamily: FONTS.body }}>
      <DetailSection title="Brief">
        <DetailField label="Project" value={inquiry.title} />
        {inquiry.client.name && <DetailField label="Client" value={inquiry.client.name} />}
        {inquiry.brief.summary && inquiry.brief.summary !== inquiry.title && <DetailField label="Summary" value={inquiry.brief.summary} multiline />}
        {inquiry.brief.notes && <DetailField label="Notes" value={inquiry.brief.notes} multiline />}
      </DetailSection>

      <DetailSection title="Schedule">
        <DetailField label="Start" value={inquiry.schedule.start} />
        {inquiry.schedule.end && <DetailField label="End" value={inquiry.schedule.end} />}
        {inquiry.schedule.callTime && <DetailField label="Call time" value={inquiry.schedule.callTime} />}
      </DetailSection>

      <DetailSection title="Location">
        <DetailField label="Mode" value={inquiry.location.mode === "tbc" ? "TBC" : inquiry.location.mode.replace("_", " ")} />
        {inquiry.location.city && <DetailField label="City" value={inquiry.location.city} />}
        {inquiry.location.venue && <DetailField label="Venue" value={inquiry.location.venue} />}
      </DetailSection>

      <DetailSection title="Participants">
        {inquiry.coordinators.map(c => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
            <Avatar size={28} tone="auto" hashSeed={c.name} initials={c.initials} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{c.name}</div>
              <div style={{ fontSize: 11, color: COLORS.inkMuted }}>
                {c.role === "owner" ? "Workspace owner · Coordinator" : "Coordinator"}
                {c.alsoTalentId && " · Also booked as talent"}
              </div>
            </div>
          </div>
        ))}
        {inquiry.talent.length > 0 && (
          <>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: COLORS.inkDim, marginTop: 8, marginBottom: 4 }}>
              Talent
            </div>
            {inquiry.talent.map(t => (
              <div key={t.talentId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
                <Avatar size={26} tone="auto" hashSeed={t.name} initials={t.initials} />
                <span style={{ flex: 1, fontSize: 12.5, color: COLORS.ink }}>{t.name}</span>
                <span style={{
                  fontSize: 9.5, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                  background:
                      t.state === "confirmed" ? COLORS.successSoft
                    : t.state === "hold"      ? COLORS.amberSoft
                    : t.state === "declined"  ? COLORS.coralSoft
                    : "rgba(11,11,13,0.05)",
                  color:
                      t.state === "confirmed" ? COLORS.successDeep
                    : t.state === "hold"      ? COLORS.amberDeep
                    : t.state === "declined"  ? COLORS.coralDeep
                    : COLORS.inkMuted,
                                  }}>{t.state}</span>
              </div>
            ))}
          </>
        )}
        <AdminParticipantsActions inquiry={inquiry} />
      </DetailSection>

      <DetailSection title="Source">
        <DetailField label="Channel" value={inquiry.source.kind.replace("_", " ")} />
        <DetailField label="Created" value={inquiry.createdAt} />
        <DetailField label="By" value={inquiry.createdBy.name} />
      </DetailSection>
    </div>
  );
}

export function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{
      padding: "12px 14px", borderRadius: 10,
      border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
    }}>
      <h3 style={{
        margin: "0 0 8px", fontFamily: FONTS.display,
        fontSize: 12, fontWeight: 700,         color: COLORS.inkMuted,
      }}>{title}</h3>
      {children}
    </section>
  );
}
export function DetailField({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div style={{
      display: multiline ? "block" : "flex",
      gap: 12,
      padding: "5px 0",
      borderBottom: `1px dashed ${COLORS.borderSoft}`,
    }}>
      <div style={{ fontSize: 11, color: COLORS.inkMuted, minWidth: 80, flexShrink: 0 }}>{label}</div>
      <div style={{ fontSize: 12.5, color: COLORS.ink, lineHeight: 1.5, flex: 1 }}>{value}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// InquiryComposer — unified entry point that replaces the two parallel
// drawers (client-send-inquiry + workspace new-inquiry). Different modes
// only toggle defaults + visibility; the output is one InquiryRecord.
//
// Modes:
//   - client : the requester locks to themselves, budget strongly suggested
//   - admin  : full control, can pick any client; coord defaults to current admin
//   - hub    : client picks coordinator (or app does); rest like client
//
// Sections: Client → Schedule → Location → Talent → Brief → Budget
// Mobile: each section is a collapsible card; sticky bottom Send.
// ════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════
// MOBILE PAGE HEADER SYSTEM — three reusable variants. Replaces the
// stacked eyebrow/title/subtitle pattern that was eating ~140px of
// vertical space on mobile before any content. On desktop these still
// render as compact chrome. The principle: header = navigation/context,
// not a hero section. The shell is the hero.
//
//   <PageTopUtility>     simple back-row pages (Calendar, Files, Search)
//   <PageTopCollection>  list pages (My jobs, Messages, Projects)
//   <PageTopThread>      thread/record pages (one inquiry, one booking)
//
// All three are mobile-first: compact, single-row where possible,
// collapse aggressively on small screens.
// ════════════════════════════════════════════════════════════════════

export function PageTopUtility({
  back, title, meta, action,
}: {
  back?: { label: string; onClick: () => void };
  title: string;
  meta?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <header style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 0 10px",
      fontFamily: FONTS.body,
    }}>
      {back && (
        <button type="button" onClick={back.onClick} style={{
          background: "transparent", border: "none", cursor: "pointer", padding: 0,
          color: COLORS.inkMuted, fontSize: 13, fontWeight: 500,
          display: "inline-flex", alignItems: "center", gap: 3,
        }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {back.label}
        </button>
      )}
      {!back && (
        <h1 style={{
          margin: 0, flex: 1, minWidth: 0,
          fontFamily: FONTS.display, fontSize: 18, fontWeight: 700,
          color: COLORS.ink, letterSpacing: -0.2,
        }}>{title}</h1>
      )}
      {back && (
        <span style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.ink, flex: 1, minWidth: 0 }}>
          {title}
        </span>
      )}
      {meta && (
        <span style={{ fontSize: 11.5, color: COLORS.inkMuted, fontWeight: 500 }}>{meta}</span>
      )}
      {action && (
        <button type="button" onClick={action.onClick} style={{
          padding: "5px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 600,
          border: `1px solid ${COLORS.border}`, background: "transparent",
          color: COLORS.ink, cursor: "pointer",
        }}>{action.label}</button>
      )}
    </header>
  );
}
