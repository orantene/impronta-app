"use client";

import Link from "next/link";
import { MY_AGENCIES, useAdminShell } from "@/components/admin/shell/internal/state";
import { COLORS, FONTS } from "@/components/admin/shell/internal/state";
import { PrimaryButton } from "@/components/admin/shell/internal/primitives";
import { SectionHeader } from "@/components/admin/shell/internal/talent/shared/today-2";
import { agencyRosterProfileUrl } from "@/lib/talent/agency-roster-profile-url";
import { formatMoneyCents } from "@/lib/talent/earnings-view";
import { useResolvedTalentEarnings } from "./use-resolved-talent-earnings";

function planLabel(plan: string): string {
  if (plan === "agency") return "Agency";
  if (plan === "studio") return "Studio";
  return "Free";
}

function exclusivityLabel(status: string): string {
  if (status === "exclusive") return "Exclusive";
  if (status === "non-exclusive" || status === "non_exclusive") return "Non-exclusive";
  if (status === "ended") return "Ended";
  if (status === "pending") return "Pending";
  return "Active";
}

function MetaChip({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "accent" }) {
  const bg = tone === "accent" ? COLORS.accentSoft : "rgba(11,11,13,0.05)";
  const fg = tone === "accent" ? COLORS.accentDeep : COLORS.inkMuted;
  return (
    <span
      style={{
        padding: "2px 8px",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        color: fg,
        background: bg,
        borderRadius: 999,
        fontFamily: FONTS.body,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

export function MoneyAgencyCards() {
  const { openDrawer, bridgeTalentAgencies, bridgeTalentSelfProfile } = useAdminShell();
  const earnings = useResolvedTalentEarnings();
  const currency = earnings.totals.currency;

  const agencies =
    bridgeTalentAgencies !== null
      ? bridgeTalentAgencies.map((agency) => {
          const stats = earnings.perAgency.find(
            (row) => row.slug === agency.agencySlug || row.tenantId === agency.id,
          );
          return {
            id: agency.id,
            name: agency.agencyName,
            slug: agency.agencySlug,
            plan: agency.plan,
            rosterStatus: agency.rosterStatus,
            isPrimary: agency.isPrimary,
            ytdNetCents: stats?.ytdNetCents ?? 0,
            bookingsCount: stats?.bookingsCount ?? 0,
            commissionBps: stats?.commissionBps ?? 0,
          };
        })
      : MY_AGENCIES.map((agency) => ({
          id: agency.id,
          name: agency.name,
          slug: agency.slug,
          plan: agency.planTier,
          rosterStatus: agency.status,
          isPrimary: agency.isPrimary,
          ytdNetCents: 0,
          bookingsCount: agency.bookingsYTD,
          commissionBps: Math.round(agency.commissionRate * 10000),
        }));

  const profileCode = bridgeTalentSelfProfile?.profileCode ?? null;

  return (
    <section>
      <SectionHeader
        icon="team"
        iconTone="accent"
        title={`Your agencies${agencies.length > 0 ? ` · ${agencies.length}` : ""}`}
        subtitle="Earnings, commission and roster status, per workspace."
      />

      {agencies.length === 0 ? (
        <div
          style={{
            background: COLORS.surfaceAlt,
            border: `1px dashed ${COLORS.borderSoft}`,
            borderRadius: 12,
            padding: "22px 18px",
            textAlign: "center",
            fontFamily: FONTS.body,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>No agencies yet</div>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.5 }}>
            Agencies invite talent, keep your profile up to date so the right ones find you.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 12,
          }}
        >
          {agencies.map((agency) => {
            const rosterUrl = agencyRosterProfileUrl(agency.slug, profileCode);
            const commissionPct =
              agency.commissionBps > 0 ? `${(agency.commissionBps / 100).toFixed(1)}%` : "-";

            return (
              <article
                key={agency.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  background: "#fff",
                  border: `1px solid ${COLORS.borderSoft}`,
                  borderRadius: 14,
                  padding: "16px 18px",
                  fontFamily: FONTS.body,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <span
                    aria-hidden
                    style={{
                      flexShrink: 0,
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: COLORS.accentSoft,
                      color: COLORS.accentDeep,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: FONTS.display,
                      fontSize: 16,
                      fontWeight: 600,
                    }}
                  >
                    {agency.name.charAt(0).toUpperCase()}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: COLORS.ink,
                          letterSpacing: -0.05,
                        }}
                      >
                        {agency.name}
                      </span>
                      {agency.isPrimary && <MetaChip label="Primary" tone="accent" />}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                      <MetaChip label={planLabel(agency.plan)} />
                      <MetaChip label={exclusivityLabel(agency.rosterStatus)} />
                    </div>
                  </div>
                </div>

                <dl
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 8,
                    margin: 0,
                    padding: "10px 4px",
                    background: COLORS.surfaceAlt,
                    borderRadius: 10,
                    textAlign: "center",
                  }}
                >
                  <div>
                    <dt
                      style={{
                        fontSize: 9.5,
                        fontWeight: 700,
                        letterSpacing: 0.5,
                        textTransform: "uppercase",
                        color: COLORS.inkMuted,
                      }}
                    >
                      YTD net
                    </dt>
                    <dd
                      style={{
                        margin: "3px 0 0",
                        fontSize: 13,
                        fontWeight: 600,
                        color: COLORS.ink,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatMoneyCents(agency.ytdNetCents, currency)}
                    </dd>
                  </div>
                  <div>
                    <dt
                      style={{
                        fontSize: 9.5,
                        fontWeight: 700,
                        letterSpacing: 0.5,
                        textTransform: "uppercase",
                        color: COLORS.inkMuted,
                      }}
                    >
                      Bookings
                    </dt>
                    <dd
                      style={{
                        margin: "3px 0 0",
                        fontSize: 13,
                        fontWeight: 600,
                        color: COLORS.ink,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {agency.bookingsCount}
                    </dd>
                  </div>
                  <div>
                    <dt
                      style={{
                        fontSize: 9.5,
                        fontWeight: 700,
                        letterSpacing: 0.5,
                        textTransform: "uppercase",
                        color: COLORS.inkMuted,
                      }}
                    >
                      Commission
                    </dt>
                    <dd
                      style={{
                        margin: "3px 0 0",
                        fontSize: 13,
                        fontWeight: 600,
                        color: COLORS.ink,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {commissionPct}
                    </dd>
                  </div>
                </dl>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {rosterUrl ? (
                    <Link
                      href={rosterUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        flex: "1 1 130px",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "7px 12px",
                        fontSize: 12,
                        fontWeight: 600,
                        background: "#fff",
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: 8,
                        color: COLORS.ink,
                        textDecoration: "none",
                        fontFamily: FONTS.body,
                        whiteSpace: "nowrap",
                      }}
                    >
                      View roster profile
                    </Link>
                  ) : (
                    <span
                      style={{
                        flex: "1 1 130px",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "7px 12px",
                        fontSize: 11.5,
                        background: COLORS.surfaceAlt,
                        border: `1px dashed ${COLORS.borderSoft}`,
                        borderRadius: 8,
                        color: COLORS.inkMuted,
                        fontFamily: FONTS.body,
                      }}
                    >
                      Profile code pending
                    </span>
                  )}
                  <div style={{ flex: "1 1 130px" }}>
                    <PrimaryButton
                      size="sm"
                      onClick={() => openDrawer("talent-agency-relationship", { agencyId: agency.id })}
                    >
                      Manage relationship
                    </PrimaryButton>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div
        style={{
          marginTop: 12,
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          padding: "14px 16px",
          background: `linear-gradient(135deg, ${COLORS.accentSoft} 0%, ${COLORS.surfaceAlt} 100%)`,
          border: `1px solid rgba(15,79,62,0.16)`,
          borderRadius: 12,
          fontFamily: FONTS.body,
        }}
      >
        <p
          style={{
            margin: 0,
            flex: "1 1 280px",
            minWidth: 0,
            fontSize: 12.5,
            color: COLORS.ink,
            lineHeight: 1.5,
          }}
        >
          On Tulala, agencies invite talent, not the other way around. Share your public profile and they can request you onto their roster.
        </p>
        <PrimaryButton size="sm" onClick={() => openDrawer("talent-agency-relationship", { mode: "add" })}>
          Share my profile →
        </PrimaryButton>
      </div>
    </section>
  );
}
